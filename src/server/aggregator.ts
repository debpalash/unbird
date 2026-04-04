import { getGraphUser, getGraphUserTweets } from "./twitter/api";
import type { Tweet } from "./types";

export const globalPublicFeedCache: { tweets: Tweet[]; lastUpdated: number } = {
  tweets: [],
  lastUpdated: 0,
};

// Extremely Safe, SFW top global accounts
const SAFE_TOP_PROFILES = [
  // News & Science
  "BBCWorld", "NASA", "SpaceX", "NatGeo", "TheEconomist", "WSJ", "neiltyson", "PopSci", 
  // Tech & Innovators
  "TechCrunch", "WIRED", "elonmusk", "tim_cook", "satyanadella", "MKBHD", "PopBase", 
  // Entertainment & Gaming
  "DiscussingFilm", "IGN", "TheAcademy", "Marvel", "Disney", "MarvelStudios", "StarWars",
  // Sports
  "ESPN", "ChampionsLeague", "NFL", "NBA", "premierleague", "FCBarcelona", "realmadrid",
  // Popular Celebs & Creators
  "MrBeast", "taylorswift13", "TheRock", "ladygaga", "LeoDiCaprio", "Oprah", "EmmaWatson", "GordonRamsay", "shakira", "BrunoMars",
  // Major Companies & Brands
  "Apple", "Google", "Microsoft", "amazon", "SamsungMobile", "Intel", "Nike", "MercedesBenz", "Porsche", "Sony"
];

let currentIndex = 0;
let isAggregatorRunning = false;

// Aggregation process
async function aggregateNextProfile() {
  const handle = SAFE_TOP_PROFILES[currentIndex];
  if (!handle) return;
  currentIndex = (currentIndex + 1) % SAFE_TOP_PROFILES.length;

  try {
    const user = await getGraphUser(handle);
    if (!user || !user.id) return;

    const profile = await getGraphUserTweets(user.id);
    const tweets = profile.tweets?.content || [];
    const flatTweets = tweets.flat();

    // Only pick tweets with media if possible, or just normal tweets, no retweets
    const validTweets = flatTweets.filter(t => !t.retweet && !t.replyId);

    // Merge into cache, avoid duplicates by ID
    const existingIds = new Set(globalPublicFeedCache.tweets.map(t => t.id));
    
    // Also deduplicate new tweets internally
    const uniqueNewTweets = [];
    for (const t of validTweets) {
      if (!existingIds.has(t.id)) {
        existingIds.add(t.id);
        uniqueNewTweets.push(t);
      }
    }

    globalPublicFeedCache.tweets = [...uniqueNewTweets, ...globalPublicFeedCache.tweets]
      // Sort purely by time descending
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      // Keep only top 200 to prevent memory leak
      .slice(0, 200);

    globalPublicFeedCache.lastUpdated = Date.now();
  } catch (e) {
    // silently fail and retry next time
  }
}

export async function startAggregator() {
  if (isAggregatorRunning) return;
  isAggregatorRunning = true;

  // Initial burst to quickly fill the cache on startup
  for (let i = 0; i < 5; i++) {
    await aggregateNextProfile();
  }

  // Then slow poll every 60 seconds
  setInterval(() => {
    aggregateNextProfile();
  }, 60 * 1000);
}
