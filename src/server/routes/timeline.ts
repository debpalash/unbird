// SPDX-License-Identifier: AGPL-3.0-only
// Timeline route — ported from nitter/src/routes/timeline.nim

import { Hono } from "hono";
import {
  getGraphUser, getGraphUserById,
  getGraphUserTweets, getGraphUserTweetsV2,
  getGraphUserTweetsAndReplies,
  getGraphUserMedia, getGraphPhotoRail,
} from "../twitter/api";
import { NoSessionsError } from "../types";

const timeline = new Hono();

// --- Profile cache (30 min TTL, serves stale when rate-limited) ---
interface CachedProfile {
  data: any;
  fetchedAt: number;
}
const profileCache = new Map<string, CachedProfile>();
const PROFILE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const PROFILE_CACHE_MAX = 200; // max entries to prevent memory bloat

function cacheKey(name: string, tab: string, cursor: string): string {
  return `${name.toLowerCase()}:${tab}:${cursor}`;
}

function getCached(key: string): CachedProfile | null {
  const entry = profileCache.get(key);
  if (!entry) return null;
  return entry;
}

function isFresh(entry: CachedProfile): boolean {
  return Date.now() - entry.fetchedAt < PROFILE_CACHE_TTL_MS;
}

function putCache(key: string, data: any): void {
  // Evict oldest entries if cache is full
  if (profileCache.size >= PROFILE_CACHE_MAX) {
    let oldest = "";
    let oldestTime = Infinity;
    for (const [k, v] of profileCache) {
      if (v.fetchedAt < oldestTime) { oldest = k; oldestTime = v.fetchedAt; }
    }
    if (oldest) profileCache.delete(oldest);
  }
  profileCache.set(key, { data, fetchedAt: Date.now() });
}

// --- User resolver cache (2hr TTL — username rarely changes) ---
const userCache = new Map<string, { user: any, fetchedAt: number }>();
const USER_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

async function resolveUser(name: string) {
  const key = name.toLowerCase();
  const cached = userCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < USER_CACHE_TTL_MS) {
    return cached.user;
  }
  const user = await getGraphUser(name);
  if (user.id) {
    userCache.set(key, { user, fetchedAt: Date.now() });
  }
  return user;
}

// --- V1/V2 endpoint rotation ---
let _useV2Next = false;

function normalizeTab(tab: string): "tweets" | "replies" | "media" {
  if (tab === "with_replies") return "replies";
  if (tab === "media") return "media";
  return "tweets";
}

async function fetchProfileTimeline(name: string, tabParam: string, cursor: string) {
  const key = cacheKey(name, tabParam, cursor);

  // Check cache first
  const cached = getCached(key);
  if (cached && isFresh(cached)) {
    return { ...cached.data, cached: true };
  }

  try {
    const user = await resolveUser(name);
    if (!user.id) {
      return { error: "User not found" as const };
    }

    const tab = normalizeTab(tabParam);
    let timelineData;
    switch (tab) {
      case "replies":
        timelineData = await getGraphUserTweetsAndReplies(user.id, cursor);
        break;
      case "media":
        timelineData = await getGraphUserMedia(user.id, cursor);
        break;
      default:
        // Rotate between V1 and V2 to spread rate limits across both buckets
        {
          const triedV2 = _useV2Next;
          _useV2Next = !_useV2Next; // flip for next call
          try {
            timelineData = triedV2
              ? await getGraphUserTweetsV2(user.id, cursor)
              : await getGraphUserTweets(user.id, cursor);
          } catch (e) {
            if (e instanceof NoSessionsError) {
              // Try the other endpoint (opposite of what was just tried)
              console.log(`[timeline] ${triedV2 ? "V2" : "V1"} rate-limited for ${name}, trying ${triedV2 ? "V1" : "V2"}`);
              timelineData = triedV2
                ? await getGraphUserTweets(user.id, cursor)
                : await getGraphUserTweetsV2(user.id, cursor);
            } else {
              throw e;
            }
          }
        }
    }

    let photoRail = undefined;
    if (!cursor) {
      try {
        photoRail = await getGraphPhotoRail(user.id);
      } catch {
        // Non-critical: timeline can still be served without photo rail.
      }
    }

    const result = {
      user,
      tab,
      cursor,
      tweets: timelineData.tweets,
      pinned: timelineData.pinned,
      photoRail: photoRail ?? timelineData.photoRail,
      topCursor: timelineData.tweets.top,
      bottomCursor: timelineData.tweets.bottom,
    };

    // Cache the successful result
    putCache(key, result);
    return result;

  } catch (e) {
    // If rate-limited but we have stale cache, serve it
    if (e instanceof NoSessionsError && cached) {
      console.log(`[timeline] serving stale cache for ${name} (rate-limited)`);
      return { ...cached.data, cached: true, stale: true };
    }
    throw e;
  }
}

timeline.get("/api/timeline/:name/:tab?", async (c) => {
  const name = c.req.param("name");
  const tab = c.req.param("tab") ?? "tweets";
  const cursor = c.req.query("cursor") ?? "";

  try {
    const data = await fetchProfileTimeline(name, tab, cursor);
    if ("error" in data) {
      return c.json({ error: data.error }, 404);
    }
    return c.json(data);
  } catch (e: any) {
    console.error(`[timeline] Error fetching timeline for ${name}:`, e.message);
    return c.json({ error: e.message ?? "Failed to fetch timeline" }, 500);
  }
});

// Get user profile + tweets
timeline.get("/api/profile/:name", async (c) => {
  const name = c.req.param("name");
  const tab = c.req.query("tab") ?? "tweets";
  const cursor = c.req.query("cursor") ?? "";

  try {
    const data = await fetchProfileTimeline(name, tab, cursor);
    if ("error" in data) {
      return c.json({ error: data.error }, 404);
    }
    return c.json(data);
  } catch (e: any) {
    console.error(`[timeline] Error fetching profile for ${name}:`, e.message);
    return c.json({ error: e.message ?? "Failed to fetch profile" }, 500);
  }
});

// Clear profile cache
timeline.post("/api/profile-cache/clear", (c) => {
  const size = profileCache.size;
  profileCache.clear();
  return c.json({ cleared: size });
});

export { timeline };
