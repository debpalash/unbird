// SPDX-License-Identifier: AGPL-3.0-only
// List route — ported from nitter/src/routes/list.nim

import { Hono } from "hono";
import { getGraphListById, getGraphListBySlug, getGraphListTweets, getGraphListMembers } from "../twitter/api";

const list = new Hono();

// Get list by ID
list.get("/api/list/:id", async (c) => {
  const id = c.req.param("id");
  const cursor = c.req.query("cursor") ?? "";

  try {
    const [listData, profile] = await Promise.all([
      getGraphListById(id),
      getGraphListTweets(id, cursor),
    ]);

    // profile.tweets.content is Tweet[][] (array of thread arrays), flatten to Tweet[]
    const tweets = (profile.tweets?.content || []).flat();
    const nextCursor = profile.tweets?.bottom || "";

    return c.json({ list: listData, tweets, cursor: nextCursor });
  } catch (e: any) {
    return c.json({ error: e.message ?? "Failed to fetch list" }, 500);
  }
});

// Get list members
list.get("/api/list/:id/members", async (c) => {
  const id = c.req.param("id");
  const cursor = c.req.query("cursor") ?? "";

  try {
    const members = await getGraphListMembers(id, cursor);
    return c.json(members);
  } catch (e: any) {
    return c.json({ error: e.message ?? "Failed to fetch list members" }, 500);
  }
});

export { list };
