import { Hono } from "hono";
import { getSessionAccountInfo } from "../sessions/manager";

export const notifications = new Hono();

// In-memory cache (60s TTL)
let cache: { data: any; fetchedAt: number } | null = null;
const CACHE_TTL = 60_000;

notifications.get("/api/notifications", async (c) => {
  // Check cache
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return c.json(cache.data);
  }

  try {
    const acct = getSessionAccountInfo(true);
    if (!acct) return c.json({ error: "Unauthorized" }, 200);

    const { getGraphNotifications } = await import("../twitter/api");
    const cursor = c.req.query("cursor") || "";
    const result = await getGraphNotifications(cursor);
    const response = {
      notifications: result.notifications,
      nextCursor: result.nextCursor,
      fetchedAt: Date.now(),
    };

    // Only cache first page (no cursor)
    if (!cursor) {
      cache = { data: response, fetchedAt: Date.now() };
    }

    return c.json(response);
  } catch (e: any) {
    console.error("[notifications] Error:", e.message);
    if (e.message?.includes("403") || e.message?.includes("401")) {
      return c.json({ error: "Session revoked or unauthenticated" }, 401);
    }
    return c.json({ error: e.message }, 500);
  }
});
