// SPDX-License-Identifier: AGPL-3.0-only
// Hono server composition root

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";

import { loadConfig } from "./config";
import { getSessionPoolHealth, getSessionPoolSize, getAvailableLenses, requestSessionCtx } from "./sessions/pool";
import { startSessionManager, addSessionFromCookies, reloadSessions, stopSessionManager, getSessionAccountInfo } from "./sessions/manager";
import { startAggregator, globalPublicFeedCache } from "./aggregator";
import { setApiProxy } from "./twitter/client";
import { NoSessionsError, SessionKind, type Session } from "./types";
import { startProxyPool, getPoolStats } from "./proxy/pool";
import { loginWithCredentials } from "./sessions/login";

// Route modules
import { timeline } from "./routes/timeline";
import { status } from "./routes/status";
import { search } from "./routes/search";
import { list } from "./routes/list";
import { metrics } from "./routes/metrics";
import { notifications } from "./routes/notifications";
import { bookmarks } from "./routes/bookmarks";
import { monitor } from "./routes/monitor";
import { dms } from "./routes/dms";
import { shadowban } from "./routes/shadowban";
import { thread } from "./routes/thread";
import { profiler } from "./routes/profiler";
import { resolver } from "./routes/resolver";
import { download } from "./routes/download";
import { vault } from "./routes/vault";

interface FollowingListCache {
  users: any[];
  builtAt: number;
}

interface FeedCache {
  tweets: any[];
  followingCount: number;
  postsPerUser: number;
  builtAt: number;
}

// --- Following List Cache (per-user, 1hr TTL) ---
const userFollowingCache = new Map<string, FollowingListCache>();
const userFollowingBuilding = new Set<string>();
const FOLLOWING_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getFollowingList(userId: string): Promise<any[]> {
  const now = Date.now();
  const cached = userFollowingCache.get(userId);
  if (cached && now - cached.builtAt < FOLLOWING_TTL_MS) {
    return cached.users;
  }
  if (userFollowingBuilding.has(userId)) {
    // Another fetch is in progress for this user — wait up to 120s
    for (let i = 0; i < 120 && userFollowingBuilding.has(userId); i++) await Bun.sleep(1000);
    return userFollowingCache.get(userId)?.users ?? [];
  }
  userFollowingBuilding.add(userId);
  try {
    const { getGraphFollowing } = await import("./twitter/api");
    const all: any[] = [];
    let cursor = "";
    let pages = 0;
    const MAX_PAGES = 20; // safety cap: 20 pages × ~50 users = 1000 max
    do {
      const page = await getGraphFollowing(userId, cursor);
      const newUsers = (page.users ?? []).filter((u: any) => u.id);
      all.push(...newUsers);
      pages++;
      if (newUsers.length === 0 || page.nextCursor === cursor || pages >= MAX_PAGES) break;
      cursor = page.nextCursor;
    } while (cursor);
    userFollowingCache.set(userId, { users: all, builtAt: Date.now() });
    console.log(`[feed] following list cached for ${userId}: ${all.length} accounts`);
    return all;
  } catch (e: any) {
    console.error(`[feed] following list error for ${userId}:`, e.message);
    return userFollowingCache.get(userId)?.users ?? [];
  } finally {
    userFollowingBuilding.delete(userId);
  }
}

// --- Home Feed Cache (per-user, 15 min TTL) ---
const userFeedCache = new Map<string, FeedCache>();
const userFeedBuilding = new Set<string>();
const feedRateLimitedUntil = new Map<string, number>();
const FEED_TTL_MS = 30 * 60 * 1000;
const FEED_RL_RETRY_MS = 16 * 60 * 1000; // 16 min backoff when rate limited

async function buildFeedCache(postsPerUser = 3) {
  const me = await getSessionAccountInfo();
  if (!me) return;
  const userId = me.id;

  const now = Date.now();
  const cached = userFeedCache.get(userId);
  if (cached && now - cached.builtAt < FEED_TTL_MS && cached.postsPerUser === postsPerUser) return;
  if (userFeedBuilding.has(userId)) return;

  const rlUntil = feedRateLimitedUntil.get(userId) || 0;
  if (now < rlUntil) {
    console.warn(`[feed] skipping build for ${userId} (rate limited until ${new Date(rlUntil).toLocaleTimeString()})`);
    return;
  }

  userFeedBuilding.add(userId);
  console.log(`[feed] starting build for @${me.username} (${postsPerUser} posts/user)...`);
  try {
    const { getGraphHomeLatestTimeline } = await import("./twitter/api");
    if (!userTweetCache.has(userId)) await loadUserCache(userId);

    let allTweets: any[] = [];
    let cursor = "";
    let pages = 0;
    const MAX_PAGES = 5;
    const TARGET_COUNT = 100;

    try {
      do {
        const page = await getGraphHomeLatestTimeline(cursor);
        const newTweets = (page.tweets ?? []).filter((t: any) => t.id);
        allTweets.push(...newTweets);
        pages++;
        if (newTweets.length === 0 || page.nextCursor === cursor || pages >= MAX_PAGES || allTweets.length >= TARGET_COUNT) break;
        cursor = page.nextCursor;
      } while (cursor);
    } catch (e: any) {
      console.warn(`[feed] HomeTimeline unavailable for @${me.username} (${e.message}), fetching following list...`);
      allTweets = [];
    }

    // Fallback: fetch from following list if HomeTimeline failed or is empty
    if (allTweets.length === 0) {
      const following = await getFollowingList(userId);
      
      const CHUNK_SIZE = 5;
      for (let i = 0; i < following.length && allTweets.length < TARGET_COUNT; i += CHUNK_SIZE) {
        const chunk = following.slice(i, i + CHUNK_SIZE);
        const results = await Promise.allSettled(chunk.map(async (f) => {
          // Check per-user cache first
          const uCache = userTweetCache.get(userId) || new Map();
          const uCached = uCache.get(f.username);
          if (uCached && now - uCached.fetchedAt < USER_TWEETS_TTL_MS) return uCached.tweets.slice(0, postsPerUser);

          const { getGraphUserTweets } = await import("./twitter/api");
          const profile = await getGraphUserTweets(f.id, "");
          const tweets = (profile.tweets?.content || []).flat().slice(0, postsPerUser);
          
          if (!userTweetCache.has(userId)) userTweetCache.set(userId, new Map());
          userTweetCache.get(userId)!.set(f.username, { tweets, fetchedAt: Date.now() });
          return tweets;
        }));
        results.forEach(r => { if (r.status === "fulfilled") allTweets.push(...r.value); });
      }
    }

    allTweets.sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime());
    const finalCache: FeedCache = {
      tweets: allTweets,
      followingCount: (userFollowingCache.get(userId)?.users || []).length,
      postsPerUser,
      builtAt: Date.now()
    };
    userFeedCache.set(userId, finalCache);

    await ensureCacheDir();
    await Bun.write(`${CACHE_DIR}/feed_${userId}.json`, JSON.stringify(finalCache));
    await saveUserCache(userId);
    console.log(`[feed] done for @${me.username}: ${allTweets.length} tweets`);
  } catch (e: any) {
    console.error(`[feed] error for @${me.username}:`, e.message);
    if (e.message.includes("Rate limit")) {
      feedRateLimitedUntil.set(userId, Date.now() + FEED_RL_RETRY_MS);
    }
  } finally {
    userFeedBuilding.delete(userId);
  }
}

// --- Per-user tweet cache (to stay well under rate limits during fallback) ---
const USER_TWEETS_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
// Map<userId, Map<username, data>>
const userTweetCache = new Map<string, Map<string, { tweets: any[], fetchedAt: number }>>();

// --- Disk Persistence for Caches ---
const CACHE_DIR = process.env.CACHE_DIR ?? "./cache";

async function ensureCacheDir() {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(CACHE_DIR, { recursive: true });
}

async function saveUserCache(userId: string) {
  const cache = userTweetCache.get(userId);
  if (!cache) return;
  await ensureCacheDir();
  await Bun.write(`${CACHE_DIR}/user_tweets_${userId}.json`, JSON.stringify(Array.from(cache.entries())));
}

async function loadUserCache(userId: string) {
  try {
    const f = Bun.file(`${CACHE_DIR}/user_tweets_${userId}.json`);
    if (await f.exists()) {
      const data = await f.json();
      const map = new Map();
      for (const [id, val] of data) map.set(id, val);
      userTweetCache.set(userId, map);
      console.log(`[cache] loaded ${map.size} user histories for ${userId} from disk`);
    }
  } catch (e) { /* ignore */ }
}

async function loadFeedCacheDisk(userId: string) {
  try {
    const f = Bun.file(`${CACHE_DIR}/feed_${userId}.json`);
    if (await f.exists()) {
      const data: FeedCache = await f.json();
      userFeedCache.set(userId, data);
      console.log(`[cache] restored home feed for ${userId} from disk`);
    }
  } catch (e) { /* ignore */ }
}

// --- End of Cache Logic ---

export async function getCachedTweets(): Promise<any[]> {
  const me = await getSessionAccountInfo();
  if (!me) return [];
  const feed = userFeedCache.get(me.id);
  const uCache = userTweetCache.get(me.id);
  
  const all: any[] = [...(feed?.tweets ?? [])];
  if (uCache) {
    for (const cached of uCache.values()) {
      all.push(...cached.tweets);
    }
  }
  
  const unique = new Map<string, any>();
  for (const t of all) {
    if (t?.id) unique.set(t.id, t);
  }
  return Array.from(unique.values());
}

export function createApp() {
  const app = new Hono();
  const cfg = loadConfig();

  // Middleware — restrict CORS to same-origin in production
  app.use("*", cors({
    origin: process.env.NODE_ENV === 'production'
      ? (origin) => origin  // reflect same-origin only
      : '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-User-Session', 'X-Admin-Key'],
    credentials: true,
  }));
  if (cfg.enableDebug) {
    app.use("*", logger());
  }

  // --- Admin auth middleware for sensitive routes ---
  const requireAdmin = async (c: any, next: any) => {
    const key = c.req.header('X-Admin-Key') || c.req.query('admin_key');
    if (!key || key !== cfg.hmacKey) {
      return c.json({ error: 'Forbidden — admin key required' }, 403);
    }
    await next();
  };

  // --- SSRF protection for proxy endpoints ---
  const ALLOWED_PROXY_HOSTS = new Set([
    'pbs.twimg.com', 'video.twimg.com', 'ton.twimg.com',
    'abs.twimg.com', 'cdn.syndication.twimg.com',
    'cards-ext.twimg.com', 'o.twimg.com',
  ]);
  function isAllowedProxyUrl(raw: string): boolean {
    try {
      const parsed = new URL(raw.startsWith('http') ? raw : 'https://' + raw);
      return ALLOWED_PROXY_HOSTS.has(parsed.hostname)
        || parsed.hostname.endsWith('.twimg.com')
        || parsed.hostname.endsWith('.twitter.com')
        || parsed.hostname.endsWith('.x.com');
    } catch { return false; }
  }

  // Isolated Session Interceptor Middleware
  app.use("/api/*", async (c, next) => {
    const sessionHeader = c.req.header("X-User-Session");
    if (sessionHeader) {
      try {
        const payload = JSON.parse(decodeURIComponent(sessionHeader));
        if (payload && payload.auth_token) {
          const userSession = {
            kind: SessionKind.Cookie,
            id: payload.id ? Number(payload.id) : 0,
            username: payload.username || "isolated_alt",
            pending: 0,
            limited: false,
            limitedAt: 0,
            apis: {},
            authToken: payload.auth_token,
            ct0: payload.ct0 || "",
          } as Session;
          return await requestSessionCtx.run(userSession, next);
        }
      } catch (e) {
        console.warn("[app] Failed to parse X-User-Session header", e);
      }
    }
    await next();
  });

  // --- API Routes ---
  app.route("/", timeline);
  app.route("/", status);
  app.route("/", search);
  app.route("/", list);
  app.route("/", metrics);
  app.route("/", notifications);
  app.route("/", bookmarks);
  app.route("/", monitor);
  app.route("/", dms);
  app.route("/", shadowban);
  app.route("/", thread);
  app.route("/", profiler);
  app.route("/", resolver);
  app.route("/", download);
  app.route("/api/vault", vault);

  // Ghost Mode: list available lenses (admin only — exposes session usernames)
  app.get("/api/lenses", requireAdmin, (c) => {
    return c.json({ lenses: getAvailableLenses() });
  });

  // Likes timeline
  app.get("/api/user/:id/likes", async (c) => {
    try {
      const { getGraphLikes } = await import("./twitter/api");
      const userId = c.req.param("id");
      const cursor = c.req.query("cursor") || "";
      const result = await getGraphLikes(userId, cursor);
      return c.json({
        tweets: (result.tweets?.content || []).flat(),
        nextCursor: result.tweets?.bottom || "",
      });
    } catch (e: any) {
      if (e.message?.includes("403") || e.message?.includes("401")) {
        return c.json({ error: "Session revoked or unauthenticated" }, 401);
      }
      return c.json({ error: e.message }, 500);
    }
  });

  // Health
  app.get("/api/health", (c) =>
    c.json({ status: "ok", timestamp: Date.now(), sessions: getSessionPoolSize(), proxies: getPoolStats() })
  );

  // Session info (admin only — exposes pool internals)
  app.get("/api/sessions", requireAdmin, (c) => {
    try {
      return c.json(getSessionPoolHealth());
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // Image proxy to bypass ORB/PWA caching and enhance privacy (SSRF-safe)
  app.get("/api/image", async (c) => {
    let url = c.req.query("url");
    if (!url) return c.json({ error: "missing url" }, 400);
    if (!url.startsWith("http")) url = "https://" + url;
    if (!isAllowedProxyUrl(url)) return c.json({ error: "URL not allowed — only Twitter media domains accepted" }, 403);
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://twitter.com/" }, redirect: "follow" });
      const newHeaders = new Headers(res.headers);
      newHeaders.set("Access-Control-Allow-Origin", "*");
      newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
      newHeaders.set("Cache-Control", "public, max-age=31536000");
      return new Response(res.body, { status: res.status, headers: newHeaders });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // Video proxy to bypass CORS/ORB and 403s (SSRF-safe)
  app.get("/api/video", async (c) => {
    let url = c.req.query("url");
    if (!url) return c.json({ error: "missing url" }, 400);
    if (!url.startsWith("http")) url = "https://" + url;
    if (!isAllowedProxyUrl(url)) return c.json({ error: "URL not allowed — only Twitter media domains accepted" }, 403);
    const range = c.req.header("range");
    const headers = new Headers();
    if (range) headers.set("Range", range);
    headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    headers.set("Accept", "*/*");
    headers.set("Referer", "https://twitter.com/");

    try {
      const res = await fetch(url, { headers, redirect: "follow" });
      const newHeaders = new Headers(res.headers);
      newHeaders.set("Access-Control-Allow-Origin", "*");
      newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
      const contentLength = res.headers.get("Content-Length");
      if (contentLength) {
        newHeaders.set("Content-Length", contentLength);
      }
      return new Response(res.body, { status: res.status, headers: newHeaders });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // Add session via cookies to the shared pool (admin only)
  app.post("/api/sessions/add", requireAdmin, async (c) => {
    try {
      const body = await c.req.json();
      const { auth_token, ct0, username, id } = body;
      if (!auth_token || !ct0 || !username) {
        return c.json({ error: "auth_token, ct0, and username are required" }, 400);
      }
      await addSessionFromCookies(auth_token, ct0, username, id);
      return c.json({ status: "added", sessions: getSessionPoolSize() });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // Reload sessions from file (admin only)
  app.post("/api/sessions/reload", requireAdmin, async (c) => {
    try {
      await reloadSessions();
      return c.json({ status: "reloaded", sessions: getSessionPoolSize() });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // System Status
  app.get("/api/system/status", (c) => {
    const isSingleTenant = !!process.env.X_USERNAME;
    return c.json({ singleTenant: isSingleTenant, poolSize: getSessionPoolSize() });
  });

  // Isolated Login (Does NOT add to shared pool)
  // Rate-limited: 5 attempts per IP per 15 min to prevent credential brute-forcing
  const loginAttempts = new Map<string, { count: number; resetAt: number }>();
  app.post("/api/auth/login", async (c) => {
    const ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
    const now = Date.now();
    const entry = loginAttempts.get(ip);
    if (entry && now < entry.resetAt && entry.count >= 5) {
      return c.json({ error: "Too many login attempts. Try again later." }, 429);
    }
    if (!entry || now >= entry.resetAt) {
      loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    } else {
      entry.count++;
    }
    try {
      const { username, password, totp } = await c.req.json();
      if (!username || !password) {
        return c.json({ error: "username and password are required" }, 400);
      }
      const loginResult = await loginWithCredentials(username, password, totp);
      return c.json(loginResult);
    } catch (e: any) {
      return c.json({ error: e.message }, 401);
    }
  });

  // Resolve user by ID
  app.get("/api/resolve/user/:id", async (c) => {
    const id = c.req.param("id");
    try {
      const { getGraphUserById } = await import("./twitter/api");
      const user = await getGraphUserById(id);
      if (user.username) {
        return c.json({ username: user.username, id: user.id });
      }
      return c.json({ error: "User not found" }, 404);
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // GET /api/me — session account identity
  app.get("/api/me", async (c) => {
    const info = await getSessionAccountInfo(true);
    if (!info) return c.json({ error: "No session loaded" }, 200);
    return c.json(info);
  });

  // GET /api/me/lists — session pinned lists
  app.get("/api/me/lists", async (c) => {
    try {
      const acct = getSessionAccountInfo(true);
      if (!acct) {
        return c.json({ error: "No strict session loaded" }, 200);
      }
      
      const { getGraphPinnedLists } = await import("./twitter/api");
      const lists = await getGraphPinnedLists();
      return c.json({ lists });
    } catch (e: any) {
      if (e.message?.includes("403") || e.message?.includes("401")) {
        return c.json({ error: "Session revoked or unauthenticated" }, 401);
      }
      return c.json({ error: e.message }, 500);
    }
  });

  // GET /api/list/:id/tweets — community or list tweets
  app.get("/api/list/:id/tweets", async (c) => {
    try {
      const { getGraphCommunityTweets, getGraphListTweets } = await import("./twitter/api");
      const cursor = c.req.query("cursor") || "";
      const id = c.req.param("id");
      
      // Try community timeline first, fall back to list timeline
      try {
        const profileInfo = await getGraphCommunityTweets(id, cursor);
        return c.json({ tweets: (profileInfo.tweets?.content || []).flat(), nextCursor: profileInfo.tweets?.bottom || "" });
      } catch {
        const profileInfo = await getGraphListTweets(id, cursor);
        return c.json({ tweets: (profileInfo.tweets?.content || []).flat(), nextCursor: profileInfo.tweets?.bottom || "" });
      }
    } catch (e: any) {
      if (e.message?.includes("403") || e.message?.includes("401")) {
        return c.json({ error: "Session revoked or unauthenticated" }, 401);
      }
      return c.json({ error: e.message }, 500);
    }
  });

  // GET /api/home-feed?postsPerUser=3
  // Build is triggered lazily on first call, cached for 30 min per user
  app.get("/api/home-feed", async (c) => {
    const me = await getSessionAccountInfo(true);
    if (!me) return c.json({ error: "No strict session" }, 401);
    const userId = me.id;

    const postsPerUser = Math.min(Math.max(parseInt(c.req.query("postsPerUser") ?? "3"), 1), 20);
    const rlUntil = feedRateLimitedUntil.get(userId) || 0;
    const rlActive = rlUntil > Date.now();
    const rlSecsLeft = rlActive ? Math.ceil((rlUntil - Date.now()) / 1000) : 0;
    
    let cache = userFeedCache.get(userId);
    if (!cache) {
      await loadFeedCacheDisk(userId);
      cache = userFeedCache.get(userId);
    }

    const building = userFeedBuilding.has(userId);

    // Trigger build if no cache yet or postsPerUser changed
    if ((!cache || cache.postsPerUser !== postsPerUser) && !building && !rlActive) {
      buildFeedCache(postsPerUser); // fire-and-forget
    }

    if (!cache) {
      const msg = rlActive
        ? `Feed rate limited — retrying in ${Math.ceil(rlSecsLeft / 60)}min`
        : "Feed is loading — check back in ~30s";
      return c.json({
        status: rlActive ? "rate_limited" : "building",
        tweets: [], followingCount: 0, postsPerUser,
        message: msg,
        retryAfterSecs: rlSecsLeft,
      });
    }
    return c.json({ ...cache, building, postsPerUser, rateLimitedUntil: rlUntil });
  });

  // GET /api/public-feed — Globally popular default feed
  app.get("/api/public-feed", async (c) => {
    try {
      const cursor = c.req.query("cursor") || "";
      const PAGE_SIZE = 20;
      
      let tweets = globalPublicFeedCache.tweets;
      let nextCursor = "";
      
      if (cursor) {
        const offset = parseInt(cursor, 10);
        if (!isNaN(offset)) {
          tweets = globalPublicFeedCache.tweets.slice(offset, offset + PAGE_SIZE);
          if (offset + PAGE_SIZE < globalPublicFeedCache.tweets.length) {
            nextCursor = (offset + PAGE_SIZE).toString();
          }
        }
      } else {
        tweets = globalPublicFeedCache.tweets.slice(0, PAGE_SIZE);
        if (PAGE_SIZE < globalPublicFeedCache.tweets.length) {
          nextCursor = PAGE_SIZE.toString();
        }
      }

      return c.json({
        tweets,
        nextCursor
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // POST /api/home-feed/refresh — force rebuild (admin only — prevents DoS)
  app.post("/api/home-feed/refresh", requireAdmin, (c) => {
    const postsPerUser = Math.min(Math.max(parseInt(c.req.query("postsPerUser") ?? "3"), 1), 20);
    buildFeedCache(postsPerUser);
    return c.json({ status: "building" });
  });

  // GET /api/following/:userId?cursor=...
  // Serves from per-user following-list cache (avoids re-hitting rate-limited endpoint)
  app.get("/api/following/:userId", async (c) => {
    const userId = c.req.param("userId");
    const cursor = c.req.query("cursor") ?? "";
    try {
      // Try to serve from the user's cache first
      const cached = userFollowingCache.get(userId);
      if (cached && cached.users.length > 0) {
        const PAGE = 50;
        const offset = cursor ? parseInt(cursor) || 0 : 0;
        const page = cached.users.slice(offset, offset + PAGE);
        const nextOffset = offset + PAGE < cached.users.length ? String(offset + PAGE) : "";
        return c.json({ users: page, nextCursor: nextOffset });
      }
      // Cache miss — fetch live (will populate userFollowingCache)
      const allUsers = await getFollowingList(userId);
      const PAGE = 50;
      const offset = cursor ? parseInt(cursor) || 0 : 0;
      const page = allUsers.slice(offset, offset + PAGE);
      const nextOffset = offset + PAGE < allUsers.length ? String(offset + PAGE) : "";
      return c.json({ users: page, nextCursor: nextOffset });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // GET /api/followers/:userId?cursor=...
  app.get("/api/followers/:userId", async (c) => {
    const userId = c.req.param("userId");
    const cursor = c.req.query("cursor") ?? "";
    try {
      const { getGraphFollowers } = await import("./twitter/api");
      return c.json(await getGraphFollowers(userId, cursor));
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.post("/api/user/:userId/follow", async (c) => {
    const userId = c.req.param("userId");
    try {
      const { followUser } = await import("./twitter/api");
      const success = await followUser(userId);
      if (success) return c.json({ success: true });
      return c.json({ error: "Failed to process follow" }, 500);
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.post("/api/user/:userId/unfollow", async (c) => {
    const userId = c.req.param("userId");
    try {
      const { unfollowUser } = await import("./twitter/api");
      const success = await unfollowUser(userId);
      if (success) return c.json({ success: true });
      return c.json({ error: "Failed to process unfollow" }, 500);
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // --- Static Serving (Production Only) ---
  if (process.env.NODE_ENV === "production") {
    app.use("/*", serveStatic({ root: "./dist" }));
    app.get("*", async (c) => {
      const { readFile } = await import("node:fs/promises");
      try {
        const html = await readFile("./dist/index.html", "utf-8");
        return c.html(html);
      } catch {
        return c.text("Not found", 404);
      }
    });
  }

  return { app, cfg };
}

export async function startServer() {
  const { app, cfg } = createApp();

  // Configure proxy
  if (cfg.proxy) {
    setApiProxy(cfg.proxy);
  }

  // Start session manager (loads from file, health checks)
  await startSessionManager();

  // Start proxy pool background manager
  startProxyPool();

  // Start background aggregator for public feed
  startAggregator();

  // Graceful shutdown
  process.on("SIGINT", () => { stopSessionManager(); process.exit(0); });
  process.on("SIGTERM", () => { stopSessionManager(); process.exit(0); });

  return { app, cfg };
}
