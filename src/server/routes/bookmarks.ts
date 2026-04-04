import { Hono } from "hono";
import { getSessionAccountInfo } from "../sessions/manager";

export const bookmarks = new Hono();

bookmarks.get("/api/bookmarks", async (c) => {
  try {
    const acct = getSessionAccountInfo(true);
    if (!acct) return c.json({ error: "Unauthorized" }, 200);

    const { getGraphBookmarks } = await import("../twitter/api");
    const cursor = c.req.query("cursor") || "";
    const result = await getGraphBookmarks(cursor);
    return c.json({
      tweets: result.tweets,
      nextCursor: result.nextCursor,
    });
  } catch (e: any) {
    console.error("[bookmarks] Error:", e.message);
    if (e.message?.includes("403") || e.message?.includes("401")) {
      return c.json({ error: "Session revoked or unauthenticated" }, 401);
    }
    return c.json({ error: e.message }, 500);
  }
});

bookmarks.post("/api/bookmarks/:tweetId", async (c) => {
  try {
    const acct = getSessionAccountInfo(true);
    if (!acct) return c.json({ error: "Unauthorized" }, 200);

    const { createBookmark } = await import("../twitter/api");
    const tweetId = c.req.param("tweetId");
    const ok = await createBookmark(tweetId);
    return c.json({ success: ok });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

bookmarks.delete("/api/bookmarks/:tweetId", async (c) => {
  try {
    const acct = getSessionAccountInfo(true);
    if (!acct) return c.json({ error: "Unauthorized" }, 200);

    const { deleteBookmark } = await import("../twitter/api");
    const tweetId = c.req.param("tweetId");
    const ok = await deleteBookmark(tweetId);
    return c.json({ success: ok });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
