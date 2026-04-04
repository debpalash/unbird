// SPDX-License-Identifier: AGPL-3.0-only
// Bulk media download route — returns a manifest of proxied media URLs

import { Hono } from "hono";
import { MediaKind } from "../types";

export const download = new Hono();

// GET /api/user/:username/download-media?type=all&limit=100
download.get("/api/user/:username/download-media", async (c) => {
  const username = c.req.param("username");
  const type = (c.req.query("type") || "all") as "images" | "videos" | "all";
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "100"), 1), 500);

  try {
    const { getGraphUser, getGraphUserMedia } = await import("../twitter/api");

    // Resolve user
    const user = await getGraphUser(username);
    if (!user?.id) return c.json({ error: "User not found" }, 404);

    // Collect media URLs with pagination
    const mediaUrls: { url: string; filename: string; type: "image" | "video" | "gif" }[] = [];
    let cursor = "";
    let pages = 0;
    const MAX_PAGES = 20;

    while (mediaUrls.length < limit && pages < MAX_PAGES) {
      const result = await getGraphUserMedia(user.id, cursor);
      const tweets = (result.tweets?.content ?? []).flat();
      if (tweets.length === 0) break;

      for (const tweet of tweets) {
        if (mediaUrls.length >= limit) break;
        if (!tweet.media) continue;

        for (const m of tweet.media) {
          if (mediaUrls.length >= limit) break;

          switch (m.kind) {
            case MediaKind.Video: {
              if (type === "images") break;
              const mp4s = (m.video.variants ?? [])
                .filter((v: any) => v.contentType === "video/mp4" || v.url?.includes(".mp4"))
                .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
              if (mp4s.length > 0) {
                mediaUrls.push({
                  url: mp4s[0]?.url ?? "",
                  filename: `${username}_${tweet.id}_video.mp4`,
                  type: "video",
                });
              }
              break;
            }
            case MediaKind.Photo: {
              if (type === "videos") break;
              const imgUrl = m.photo.url;
              if (imgUrl) {
                const ext = imgUrl.includes(".png") ? "png" : "jpg";
                mediaUrls.push({
                  url: imgUrl.startsWith("http") ? imgUrl : `https://pbs.twimg.com/${imgUrl}`,
                  filename: `${username}_${tweet.id}_${mediaUrls.length}.${ext}`,
                  type: "image",
                });
              }
              break;
            }
            case MediaKind.Gif: {
              if (type === "videos") break;
              if (m.gif.url) {
                mediaUrls.push({
                  url: m.gif.url,
                  filename: `${username}_${tweet.id}_gif.mp4`,
                  type: "gif",
                });
              }
              break;
            }
          }
        }
      }

      cursor = result.tweets?.bottom || "";
      if (!cursor) break;
      pages++;
    }

    if (mediaUrls.length === 0) {
      return c.json({ error: "No media found" }, 404);
    }

    // Return manifest for client-side download
    return c.json({
      username,
      displayName: user.fullname,
      total: mediaUrls.length,
      media: mediaUrls.map(m => ({
        url: m.type === "video" || m.type === "gif"
          ? `/api/video?url=${encodeURIComponent(m.url)}`
          : `/api/image?url=${encodeURIComponent(m.url)}`,
        filename: m.filename,
        type: m.type,
      })),
    });
  } catch (e: any) {
    console.error(`[download] error for ${username}:`, e.message);
    return c.json({ error: e.message }, 500);
  }
});
