import { getGraphUser, getGraphUserTweets } from "./twitter/api";
import type { Tweet } from "./types";

export const globalPublicFeedCache: { tweets: Tweet[]; lastUpdated: number } = {
  tweets: [],
  lastUpdated: 0,
};

export async function loadAggregatorCache(env: any) {
  if (!env?.UNBIRD_CACHE) return;
  try {
    const dataStr = await env.UNBIRD_CACHE.get("global_feed_cache.json");
    if (dataStr) {
      const data = JSON.parse(dataStr);
      globalPublicFeedCache.tweets = data.tweets || [];
      globalPublicFeedCache.lastUpdated = data.lastUpdated || 0;
    }
  } catch (e) { /* ignore */ }
}

export async function saveAggregatorCache(env: any) {
  if (!env?.UNBIRD_CACHE) return;
  try {
    await env.UNBIRD_CACHE.put("global_feed_cache.json", JSON.stringify(globalPublicFeedCache));
  } catch (e) { /* ignore */ }
}

const SAFE_TOP_PROFILES = [
  "BBCWorld", "NASA", "SpaceX", "NatGeo", "TheEconomist", "WSJ", "neiltyson", "PopSci", 
  "TechCrunch", "WIRED", "elonmusk", "tim_cook", "satyanadella", "MKBHD", "PopBase", 
  "DiscussingFilm", "IGN", "TheAcademy", "Marvel", "Disney", "MarvelStudios", "StarWars",
  "ESPN", "ChampionsLeague", "NFL", "NBA", "premierleague", "FCBarcelona", "realmadrid",
  "MrBeast", "taylorswift13", "TheRock", "ladygaga", "LeoDiCaprio", "Oprah", "EmmaWatson", "GordonRamsay", "shakira", "BrunoMars",
  "Apple", "Google", "Microsoft", "amazon", "SamsungMobile", "Intel", "Nike", "MercedesBenz", "Porsche", "Sony"
];

let currentIndex = 0;
let isAggregatorRunning = false;

export async function aggregateNextProfile(env: any) {
  const handle = SAFE_TOP_PROFILES[currentIndex];
  if (!handle) return;
  currentIndex = (currentIndex + 1) % SAFE_TOP_PROFILES.length;

  try {
    const user = await getGraphUser(handle);
    if (!user || !user.id) return;

    const profile = await getGraphUserTweets(user.id);
    const tweets = profile.tweets?.content || [];
    const flatTweets = tweets.flat();

    const validTweets = flatTweets.filter(t => !t.retweet && !t.replyId);
    const existingIds = new Set(globalPublicFeedCache.tweets.map(t => t.id));
    
    const uniqueNewTweets = [];
    for (const t of validTweets) {
      if (!existingIds.has(t.id)) {
        existingIds.add(t.id);
        uniqueNewTweets.push(t);
      }
    }

    globalPublicFeedCache.tweets = [...uniqueNewTweets, ...globalPublicFeedCache.tweets]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 200);

    globalPublicFeedCache.lastUpdated = Date.now();
    await saveAggregatorCache(env);
  } catch (e) { }
}

export async function refreshAggregator(env: any) {
  if (isAggregatorRunning) return;
  isAggregatorRunning = true;
  try {
    await loadAggregatorCache(env);
    await aggregateNextProfile(env);
    await aggregateNextProfile(env); 
  } finally {
    isAggregatorRunning = false;
  }
}

export async function startAggregator() {
  throw new Error("startAggregator() is deprecated. Use cron triggers.");
}
