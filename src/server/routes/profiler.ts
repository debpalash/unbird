import { Hono } from "hono";
import { getGraphUser, getGraphUserTweets } from "../twitter/api";

export const profiler = new Hono();

const POSITIVE_WORDS = new Set(["love", "amazing", "great", "awesome", "excellent", "best", "good", "happy", "excited", "beautiful", "perfect", "fantastic", "cool", "nice", "fun", "thanks", "wow", "favorite"]);
const NEGATIVE_WORDS = new Set(["hate", "bad", "terrible", "worst", "stupid", "dumb", "angry", "idiot", "fake", "awful", "bullshit", "fuck", "shit", "sucks", "horrible", "trash", "garbage", "cancel", "loser"]);

profiler.get("/api/profiler/:username", async (c) => {
  const username = c.req.param("username");
  
  try {
    const user = await getGraphUser(username);
    if (!user.id) return c.json({ error: "User not found" }, 404);

    const res = await getGraphUserTweets(user.id, "");
    const tweets = (res.tweets?.content || []).flat();

    if (!tweets.length) return c.json({ error: "No tweets found" }, 404);

    const hourlyDistribution = new Array(24).fill(0);
    let totalPositive = 0;
    let totalNegative = 0;
    let totalWords = 0;

    let totalLikes = 0;
    let totalRetweets = 0;
    let replyCount = 0;

    for (const t of tweets) {
      if (!t.time) continue;
      const d = new Date(t.time);
      const hour = d.getUTCHours();
      hourlyDistribution[hour]++;

      // Sentiment
      const words = t.text.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(" ");
      for (const w of words) {
        if (!w) continue;
        totalWords++;
        if (POSITIVE_WORDS.has(w)) totalPositive++;
        if (NEGATIVE_WORDS.has(w)) totalNegative++;
      }

      totalLikes += t.stats.likes;
      totalRetweets += t.stats.retweets;
      if (t.replyId || t.reply.length > 0) replyCount++;
    }

    const toxicityScore = totalWords > 0 ? (totalNegative / (totalPositive + totalNegative || 1)) * 100 : 0;
    const positivityScore = totalWords > 0 ? (totalPositive / (totalPositive + totalNegative || 1)) * 100 : 0;
    
    // Find sleep window (longest continuous period of low activity)
    let maxSleepWindow = 0;
    let bestSleepStart = 0;
    for (let start = 0; start < 24; start++) {
      let windowSum = 0;
      for (let i = 0; i < 6; i++) { // 6 hour window
        windowSum += hourlyDistribution[(start + i) % 24];
      }
      if (start === 0 || windowSum < maxSleepWindow) {
        maxSleepWindow = windowSum;
        bestSleepStart = start;
      }
    }

    return c.json({
      analyzedTweets: tweets.length,
      hourlyDistribution,
      sleepEstimation: {
        startUTCHour: bestSleepStart,
        endUTCHour: (bestSleepStart + 6) % 24,
      },
      sentiment: {
        totalWords,
        positiveCount: totalPositive,
        negativeCount: totalNegative,
        toxicityScore: Math.round(toxicityScore),
        positivityScore: Math.round(positivityScore)
      },
      engagement: {
        avgLikes: Math.round(totalLikes / tweets.length),
        avgRetweets: Math.round(totalRetweets / tweets.length),
        replyPercentage: Math.round((replyCount / tweets.length) * 100)
      }
    });

  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
