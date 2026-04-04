// SPDX-License-Identifier: AGPL-3.0-only
// Status/Tweet route — ported from nitter/src/routes/status.nim

import { Hono } from "hono";
import { getGraphTweet, getGraphTweetDetail, getGraphTweetEditHistory, getGraphTweetResult, getGraphTweetViaSyndication, favoriteTweet, createRetweet } from "../twitter/api";

const status = new Hono();

// Get tweet detail with conversation
status.get("/api/tweet/:id", async (c) => {
  const id = c.req.param("id");
  const cursor = c.req.query("cursor") ?? "";

  try {
    const conversation = await getGraphTweetDetail(id, cursor);

    if (!conversation.tweet.available && !conversation.tweet.id) {
      // Fallback 1: try fetching just the tweet result
      console.log(`[status] Conversation failed for ${id}, trying single tweet result fallback...`);
      const tweet = await getGraphTweetResult(id);
      if (tweet.id) {
        return c.json({
          tweet,
          threads: [],
          cursor: ""
        });
      }

      // Fallback 2: try syndication/embed API (no auth, works for restricted tweets)
      console.log(`[status] Single tweet result also empty for ${id}, trying syndication fallback...`);
      try {
        const synTweet = await getGraphTweetViaSyndication(id);
        if (synTweet.id) {
          return c.json({
            tweet: synTweet,
            threads: [],
            cursor: ""
          });
        }
      } catch (synErr: any) {
        console.warn(`[status] Syndication fallback failed for ${id}:`, synErr.message);
      }

      return c.json({ error: "Tweet not found" }, 404);
    }

    return c.json(conversation);
  } catch (e: any) {
    console.error(`[status] Error fetching tweet ${id}:`, e.message);
    return c.json({ error: e.message ?? "Failed to fetch tweet" }, 500);
  }
});

// Get tweet edit history
status.get("/api/tweet/:id/history", async (c) => {
  const id = c.req.param("id");

  try {
    const history = await getGraphTweetEditHistory(id);
    return c.json(history);
  } catch (e: any) {
    console.error(`[status] Error fetching edit history for ${id}:`, e.message);
    return c.json({ error: e.message ?? "Failed to fetch edit history" }, 500);
  }
});

// Get just the tweet result (no conversation)
status.get("/api/tweet/:id/result", async (c) => {
  const id = c.req.param("id");

  try {
    const tweet = await getGraphTweetResult(id);
    return c.json(tweet);
  } catch (e: any) {
    return c.json({ error: e.message ?? "Failed to fetch tweet" }, 500);
  }
});

// Live Session Mutations
status.post("/api/like/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const success = await favoriteTweet(id);
    return c.json({ success });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

status.post("/api/retweet/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const success = await createRetweet(id);
    return c.json({ success });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

export { status };
