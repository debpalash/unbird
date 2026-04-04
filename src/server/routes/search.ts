// SPDX-License-Identifier: AGPL-3.0-only
// Search route — ported from nitter/src/routes/search.nim

import { Hono } from "hono";
import { getGraphTweetSearch, getGraphUserSearch } from "../twitter/api";
import { genQueryParam, initQuery } from "../twitter/query";
import Fuse from "fuse.js";
import { getCachedTweets } from "../app";

const search = new Hono();

// Search tweets or users
search.get("/api/search", async (c) => {
  const q = c.req.query("q") ?? "";
  const type = c.req.query("f") ?? "tweets"; // "tweets" or "users"
  const cursor = c.req.query("cursor") ?? "";

  if (!q) {
    return c.json({ error: "Query parameter 'q' is required" }, 400);
  }

  try {
    if (type === "users") {
      let result;
      try {
        result = await getGraphUserSearch(q, cursor);
      } catch (e: any) {
        console.warn(`[search] API failed for users "${q}" (${e.message}). Falling back to local cache.`);
        const tweets = await getCachedTweets();
        const users = Array.from(new Map(tweets.filter((t: any) => t?.user?.id).map((t: any) => [t.user.id, t.user])).values());
        const fuse = new Fuse(users, {
          keys: ["name", "screen_name", "description"],
          threshold: 0.3,
          ignoreLocation: true,
        });
        const results = fuse.search(q).map(res => res.item);
        result = {
          content: results.map(u => ({ type: "user", user: u })),
          nextCursor: "",
          fallback: true
        };
      }
      return c.json({ type: "users", ...result });
    } else {
      let result;
      try {
        result = await getGraphTweetSearch(q, cursor);
      } catch (e: any) {
        console.warn(`[search] API failed for "${q}" (${e.message}). Falling back to local cache.`);
        const tweets = await getCachedTweets();
        const fuse = new Fuse(tweets, {
          keys: ["text", "user.name", "user.screen_name"],
          threshold: 0.3,
          ignoreLocation: true,
        });
        const results = fuse.search(q).map(res => res.item);
        result = {
          content: results.map(t => [t]),
          nextCursor: "",
          fallback: true
        };
      }
      return c.json({ type: "tweets", ...result });
    }
  } catch (e: any) {
    console.error(`[search] Error searching for "${q}":`, e.message);
    return c.json({ error: e.message ?? "Search failed" }, 500);
  }
});

// Hashtag search shortcut
search.get("/api/hashtag/:tag", async (c) => {
  const tag = c.req.param("tag");
  const cursor = c.req.query("cursor") ?? "";

  try {
    let result;
    try {
      result = await getGraphTweetSearch(`#${tag}`, cursor);
    } catch (e: any) {
      console.warn(`[search] API failed for hashtag #${tag} (${e.message}). Falling back to local cache.`);
      const tweets = await getCachedTweets();
      const fuse = new Fuse(tweets, {
        keys: ["text"],
        threshold: 0.2,
        ignoreLocation: true,
      });
      const results = fuse.search(`#${tag}`).map(res => res.item);
      result = {
        content: results.map(t => [t]),
        nextCursor: "",
        fallback: true
      };
    }
    return c.json({ type: "tweets", hashtag: tag, ...result });
  } catch (e: any) {
    console.error(`[search] Error searching hashtag #${tag}:`, e.message);
    return c.json({ error: e.message ?? "Search failed" }, 500);
  }
});

export { search };
