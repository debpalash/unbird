// Keyword Monitor route — aggregates search results for multiple keywords
import { Hono } from "hono";
import { getGraphTweetSearch } from "../twitter/api";
import { getCachedTweets } from "../app";
import Fuse from "fuse.js";

export const monitor = new Hono();

// Per-keyword cache (2 min TTL)
const cache = new Map<string, { tweets: any[]; fetchedAt: number }>();
const CACHE_TTL = 2 * 60 * 1000;

async function searchKeyword(kw: string): Promise<any[]> {
  try {
    const result = await getGraphTweetSearch(kw);
    return (result.content || []).flat().slice(0, 20);
  } catch (e: any) {
    console.warn(`[monitor] GraphQL search failed for "${kw}" (${e.message}), falling back to cache`);
    // Fallback to local cached tweets
    const tweets = await getCachedTweets();
    if (!tweets.length) return [];
    const fuse = new Fuse(tweets, {
      keys: ["text", "user.name", "user.screen_name", "user.username"],
      threshold: 0.3,
      ignoreLocation: true,
    });
    return fuse.search(kw).map(r => r.item).slice(0, 20);
  }
}

monitor.get("/api/monitor/results", async (c) => {
  const kwParam = c.req.query("keywords") || "";
  const keywords = kwParam.split(",").map(k => k.trim()).filter(Boolean).slice(0, 10);
  if (!keywords.length) return c.json({ tweets: [], keywords: [] });

  const allTweets: any[] = [];
  const seen = new Set<string>();

  for (const kw of keywords) {
    // Check cache
    const cached = cache.get(kw);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      for (const t of cached.tweets) {
        const tid = String(t.id ?? "");
        if (tid && !seen.has(tid)) { seen.add(tid); allTweets.push({ ...t, _keyword: kw }); }
      }
      continue;
    }

    try {
      const tweets = await searchKeyword(kw);
      cache.set(kw, { tweets, fetchedAt: Date.now() });
      for (const t of tweets) {
        const tid = String((t as any).id ?? "");
        if (tid && !seen.has(tid)) { seen.add(tid); allTweets.push({ ...(t as any), _keyword: kw }); }
      }
    } catch (e: any) {
      console.error(`[monitor] search error for "${kw}":`, e.message);
    }
  }

  // Sort by time descending
  allTweets.sort((a, b) => {
    const ta = a.time ? new Date(a.time).getTime() : 0;
    const tb = b.time ? new Date(b.time).getTime() : 0;
    return tb - ta;
  });

  return c.json({
    tweets: allTweets.slice(0, 100),
    keywords,
    fetchedAt: Date.now(),
  });
});
