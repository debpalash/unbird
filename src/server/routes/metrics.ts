// Metrics / OSINT route — aggregates open-web data for a Twitter user
import { Hono } from "hono";

export const metrics = new Hono();

// --- 24hr result cache ---
interface MetricsCache {
  data: MetricsResult;
  fetchedAt: number;
}
const cache = new Map<string, MetricsCache>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface MetricsResult {
  username: string;
  account: AccountAnalytics | null;
  socialBlade: SocialBladeData | null;
  bioLinks: ResolvedLink[];
  webArchive: WebArchiveData | null;
  news: NewsArticle[];
  location: LocationData | null;
  trustScore: TrustScore;
  fetchedAt: number;
}

interface LocationData {
  name: string;
  lat: number;
  lon: number;
  bbox: string[];
}

interface AccountAnalytics {
  accountAgeDays: number;
  joinDate: string;
  tweetFrequency: number; // tweets per day
  followerFollowingRatio: number;
  tweetsPerFollower: number;
  avgEngagement: string; // qualitative
  isVerified: boolean;
  verifiedType: string;
  totalTweets: number;
  totalFollowers: number;
  totalFollowing: number;
  totalLikes: number;
  totalMedia: number;
}

interface SocialBladeData {
  grade: string;
  followerRank: string;
  estimatedEarningsMonthly: string;
  estimatedEarningsYearly: string;
  averageLikes: string;
  averageRetweets: string;
  followerGrowth30d: string;
  available: boolean;
}

interface ResolvedLink {
  original: string;
  resolved: string;
  platform: string; // detected platform name
  status: number;
}

interface WebArchiveData {
  totalSnapshots: number;
  firstArchived: string;
  lastArchived: string;
  available: boolean;
}

interface TrustScore {
  score: number; // 0-100
  grade: string; // A+ to F
  factors: TrustFactor[];
}

interface TrustFactor {
  name: string;
  value: string;
  impact: "positive" | "negative" | "neutral";
  points: number;
}

interface NewsArticle {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

// --- Platform detection for bio links ---
const PLATFORM_PATTERNS: [RegExp, string][] = [
  [/onlyfans\.com/i, "OnlyFans"],
  [/patreon\.com/i, "Patreon"],
  [/ko-fi\.com/i, "Ko-fi"],
  [/buymeacoffee\.com/i, "Buy Me a Coffee"],
  [/linktr\.ee/i, "Linktree"],
  [/beacons\.ai/i, "Beacons"],
  [/carrd\.co/i, "Carrd"],
  [/campsite\.bio/i, "Campsite"],
  [/allmylinks\.com/i, "AllMyLinks"],
  [/instagram\.com/i, "Instagram"],
  [/tiktok\.com/i, "TikTok"],
  [/youtube\.com|youtu\.be/i, "YouTube"],
  [/twitch\.tv/i, "Twitch"],
  [/discord\.(gg|com)/i, "Discord"],
  [/t\.me|telegram\.(me|org)/i, "Telegram"],
  [/reddit\.com/i, "Reddit"],
  [/github\.com/i, "GitHub"],
  [/linkedin\.com/i, "LinkedIn"],
  [/snapchat\.com/i, "Snapchat"],
  [/spotify\.com/i, "Spotify"],
  [/soundcloud\.com/i, "SoundCloud"],
  [/cashapp\.me|cash\.app/i, "Cash App"],
  [/venmo\.com/i, "Venmo"],
  [/paypal\.(com|me)/i, "PayPal"],
  [/gumroad\.com/i, "Gumroad"],
  [/etsy\.com/i, "Etsy"],
  [/amazon\.com/i, "Amazon"],
  [/fansly\.com/i, "Fansly"],
  [/fanfix\.io/i, "Fanfix"],
  [/throne\.com/i, "Throne"],
  [/wishlist/i, "Wishlist"],
];

function detectPlatform(url: string): string {
  for (const [pattern, name] of PLATFORM_PATTERNS) {
    if (pattern.test(url)) return name;
  }
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "Unknown";
  }
}

// --- Account Analytics ---
function computeAccountAnalytics(user: any): AccountAnalytics {
  const joinDate = new Date(user.joinDate || user.created_at || 0);
  const now = new Date();
  const ageDays = Math.max(1, Math.floor((now.getTime() - joinDate.getTime()) / (86400000)));
  const tweets = user.tweets || 0;
  const followers = user.followers || 0;
  const following = user.following || 0;
  const tweetFreq = +(tweets / ageDays).toFixed(2);
  const ratio = following > 0 ? +(followers / following).toFixed(2) : followers;
  const tweetsPerFollower = followers > 0 ? +(tweets / followers).toFixed(4) : 0;

  let avgEngagement = "Low";
  if (ratio > 10 && tweetFreq > 1) avgEngagement = "Very High";
  else if (ratio > 5) avgEngagement = "High";
  else if (ratio > 1) avgEngagement = "Medium";

  return {
    accountAgeDays: ageDays,
    joinDate: joinDate.toISOString().split("T")[0]!,
    tweetFrequency: tweetFreq,
    followerFollowingRatio: ratio,
    tweetsPerFollower,
    avgEngagement,
    isVerified: user.verifiedType !== "None" && !!user.verifiedType,
    verifiedType: user.verifiedType || "None",
    totalTweets: tweets,
    totalFollowers: followers,
    totalFollowing: following,
    totalLikes: user.likes || 0,
    totalMedia: user.media || 0,
  };
}

// --- Social Blade Scrape ---
async function fetchSocialBlade(username: string): Promise<SocialBladeData> {
  const empty: SocialBladeData = {
    grade: "N/A", followerRank: "N/A",
    estimatedEarningsMonthly: "N/A", estimatedEarningsYearly: "N/A",
    averageLikes: "N/A", averageRetweets: "N/A",
    followerGrowth30d: "N/A", available: false,
  };

  try {
    const url = `https://socialblade.com/twitter/user/${username}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/133.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!res.ok) return empty;
    const html = await res.text();

    // Extract grade
    const gradeMatch = html.match(/Grade.*?<[^>]*>([A-F][+-]?)<\/[^>]*>/is);
    // Extract follower count
    const followerRankMatch = html.match(/Follower Rank.*?<[^>]*>([\d,]+)<\/[^>]*>/is);
    // Extract estimated earnings  
    const earningsMatch = html.match(/Estimated Earnings.*?(\$[\d,.]+ - \$[\d,.]+)/is);

    return {
      grade: gradeMatch?.[1] || "N/A",
      followerRank: followerRankMatch?.[1] || "N/A",
      estimatedEarningsMonthly: earningsMatch?.[1] || "N/A",
      estimatedEarningsYearly: "N/A",
      averageLikes: "N/A",
      averageRetweets: "N/A",
      followerGrowth30d: "N/A",
      available: !!(gradeMatch || followerRankMatch || earningsMatch),
    };
  } catch (e) {
    console.error(`[metrics] Social Blade error for ${username}:`, (e as Error).message);
    return empty;
  }
}

// --- Bio Link Resolution ---
async function resolveBioLinks(bio: string, website: string): Promise<ResolvedLink[]> {
  const links: ResolvedLink[] = [];
  const urls = new Set<string>();

  // Extract URLs from bio
  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  const bioMatches = bio?.match(urlRegex) || [];
  for (const u of bioMatches) urls.add(u);

  // Add website field
  if (website) {
    const w = website.startsWith("http") ? website : `https://${website}`;
    urls.add(w);
  }

  // Resolve each URL (follow redirects)
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(5000),
      });
      const resolved = res.url || url;
      links.push({
        original: url,
        resolved,
        platform: detectPlatform(resolved),
        status: res.status,
      });

      // If it's a link aggregator (Linktree, Beacons, etc.), try to scrape inner links
      if (/linktr\.ee|beacons\.ai|allmylinks|campsite\.bio|carrd\.co/i.test(resolved)) {
        try {
          const pageRes = await fetch(resolved, {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(5000),
          });
          const html = await pageRes.text();
          const innerLinks = html.match(/https?:\/\/[^\s<>"'\\]+/gi) || [];
          const seen = new Set(urls);
          for (const link of innerLinks) {
            if (!seen.has(link) && !link.includes("linktree") && !link.includes("beacons.ai") && !link.includes("cdn") && !link.includes(".js") && !link.includes(".css")) {
              seen.add(link);
              links.push({
                original: resolved,
                resolved: link,
                platform: detectPlatform(link),
                status: 200,
              });
            }
          }
        } catch { /* ignore inner scrape failures */ }
      }
    } catch {
      links.push({ original: url, resolved: url, platform: detectPlatform(url), status: 0 });
    }
  }

  return links;
}

// --- Web Archive Check ---
async function checkWebArchive(username: string): Promise<WebArchiveData> {
  const empty: WebArchiveData = { totalSnapshots: 0, firstArchived: "", lastArchived: "", available: false };
  try {
    const url = `https://web.archive.org/cdx/search/cdx?url=twitter.com/${username}&output=json&limit=1&fl=timestamp&sort=asc`;
    const firstRes = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!firstRes.ok) return empty;
    const firstData = await firstRes.json();

    const lastUrl = `https://web.archive.org/cdx/search/cdx?url=twitter.com/${username}&output=json&limit=1&fl=timestamp&sort=desc`;
    const lastRes = await fetch(lastUrl, { signal: AbortSignal.timeout(8000) });
    const lastData = await lastRes.json();

    // Count total
    const countUrl = `https://web.archive.org/cdx/search/cdx?url=twitter.com/${username}&output=json&limit=0&showNumPages=true`;
    const countRes = await fetch(countUrl, { signal: AbortSignal.timeout(8000) });
    const countText = await countRes.text();
    const totalPages = parseInt(countText) || 0;

    const formatTs = (ts: string) => {
      if (!ts || ts.length < 8) return "";
      return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
    };

    return {
      totalSnapshots: totalPages,
      firstArchived: firstData?.[1]?.[0] ? formatTs(firstData[1][0]) : "",
      lastArchived: lastData?.[1]?.[0] ? formatTs(lastData[1][0]) : "",
      available: totalPages > 0,
    };
  } catch (e) {
    console.error(`[metrics] Web Archive error for ${username}:`, (e as Error).message);
    return empty;
  }
}

// --- Trust Score ---
function computeTrustScore(account: AccountAnalytics | null, bioLinks: ResolvedLink[], webArchive: WebArchiveData | null): TrustScore {
  const factors: TrustFactor[] = [];
  let score = 50; // start neutral

  if (account) {
    // Account age
    if (account.accountAgeDays > 365 * 3) {
      factors.push({ name: "Account Age", value: `${Math.floor(account.accountAgeDays / 365)} years`, impact: "positive", points: 15 });
      score += 15;
    } else if (account.accountAgeDays > 365) {
      factors.push({ name: "Account Age", value: `${Math.floor(account.accountAgeDays / 365)} years`, impact: "positive", points: 8 });
      score += 8;
    } else if (account.accountAgeDays < 90) {
      factors.push({ name: "Account Age", value: `${account.accountAgeDays} days`, impact: "negative", points: -15 });
      score -= 15;
    } else {
      factors.push({ name: "Account Age", value: `${account.accountAgeDays} days`, impact: "neutral", points: 0 });
    }

    // Verification
    if (account.isVerified) {
      const pts = account.verifiedType === "Business" || account.verifiedType === "Government" ? 15 : 5;
      factors.push({ name: "Verified", value: account.verifiedType, impact: "positive", points: pts });
      score += pts;
    }

    // Follower/Following ratio
    if (account.followerFollowingRatio > 10) {
      factors.push({ name: "Follower Ratio", value: `${account.followerFollowingRatio}:1`, impact: "positive", points: 10 });
      score += 10;
    } else if (account.followerFollowingRatio < 0.1) {
      factors.push({ name: "Follower Ratio", value: `${account.followerFollowingRatio}:1`, impact: "negative", points: -10 });
      score -= 10;
    } else {
      factors.push({ name: "Follower Ratio", value: `${account.followerFollowingRatio}:1`, impact: "neutral", points: 0 });
    }

    // Tweet frequency
    if (account.tweetFrequency > 0.5 && account.tweetFrequency < 50) {
      factors.push({ name: "Activity", value: `${account.tweetFrequency} tweets/day`, impact: "positive", points: 5 });
      score += 5;
    } else if (account.tweetFrequency > 100) {
      factors.push({ name: "Activity", value: `${account.tweetFrequency} tweets/day (suspicious)`, impact: "negative", points: -10 });
      score -= 10;
    }
  }

  // Bio links analysis
  const suspiciousLinks = bioLinks.filter(l => /telegram|discord/i.test(l.platform));
  const monetizationLinks = bioLinks.filter(l => /OnlyFans|Patreon|Fansly|Gumroad|Cash App|PayPal|Venmo/i.test(l.platform));
  const brokenLinks = bioLinks.filter(l => l.status === 0 || l.status >= 400);

  if (monetizationLinks.length > 0) {
    factors.push({ name: "Monetization Links", value: `${monetizationLinks.length} platform(s)`, impact: "neutral", points: 0 });
  }
  if (brokenLinks.length > 0) {
    factors.push({ name: "Broken Links", value: `${brokenLinks.length} dead link(s)`, impact: "negative", points: -5 * brokenLinks.length });
    score -= 5 * brokenLinks.length;
  }

  // Web archive presence
  if (webArchive?.available) {
    if (webArchive.totalSnapshots > 50) {
      factors.push({ name: "Web Archive", value: `${webArchive.totalSnapshots} snapshots`, impact: "positive", points: 10 });
      score += 10;
    } else {
      factors.push({ name: "Web Archive", value: `${webArchive.totalSnapshots} snapshots`, impact: "positive", points: 3 });
      score += 3;
    }
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Grade
  let grade = "F";
  if (score >= 90) grade = "A+";
  else if (score >= 80) grade = "A";
  else if (score >= 70) grade = "B+";
  else if (score >= 60) grade = "B";
  else if (score >= 50) grade = "C";
  else if (score >= 40) grade = "D";
  else if (score >= 30) grade = "D-";

  return { score, grade, factors };
}

// --- Fetch Recent News via Google News RSS ---
function buildNewsQuery(user: any): string {
  const name = user?.fullname || user?.username || "";
  if (!name) return "";

  const terms = new Set<string>();

  if (user?.bio) {
    const bioWords = user.bio.split(/\s+/);
    
    bioWords.forEach((word: string) => {
      if (word.startsWith('@') && word.length > 2) {
        terms.add(word.substring(1).replace(/[^a-zA-Z0-9_]/g, ''));
      }
      if (word.startsWith('#') && word.length > 2) {
        terms.add(word.substring(1).replace(/[^a-zA-Z0-9_]/g, ''));
      }
    });

    const jobTitles = ["CEO", "CTO", "CFO", "Founder", "Co-Founder", "Director", "President", "Engineer", "Developer", "Designer", "Manager", "Writer", "Author", "Journalist", "Artist", "Creator", "Actor", "Musician", "Reporter", "Correspondent", "Host", "Editor"];
    for (const title of jobTitles) {
      if (user.bio.toLowerCase().includes(title.toLowerCase())) {
        terms.add(`"${title}"`);
      }
    }
    
    const capRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    let match;
    while ((match = capRegex.exec(user.bio)) !== null) {
      const phrase = match[1]?.trim();
      if (!phrase) continue;
      if (phrase.length > 3 && !name.includes(phrase) && !["The", "This", "I", "We", "A", "It", "My", "Our", "Your", "And"].includes(phrase)) {
        terms.add(`"${phrase}"`);
      }
    }
  }

  if (user?.location) {
    const locParts = user.location.split(',')[0].trim();
    if (locParts && locParts.length > 2) {
      terms.add(`"${locParts}"`);
    }
  }

  let finalQuery = `"${name}"`;
  const contextTerms = Array.from(terms).slice(0, 3);
  if (contextTerms.length > 0) {
    finalQuery += ` (${contextTerms.join(" OR ")})`;
  }

  return finalQuery;
}

async function fetchGoogleNews(query: string): Promise<NewsArticle[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    const xml = await res.text();
    
    const articles: NewsArticle[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    
    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1];
      if (!itemXml) continue;
      
      const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
      const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
      const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);
      const sourceMatch = itemXml.match(/<source[^>]*><!\[CDATA\[(.*?)\]\]><\/source>|<source[^>]*>(.*?)<\/source>/);
      
      const title = titleMatch ? (titleMatch[1] || titleMatch[2]) : "Unknown Title";
      const link = linkMatch ? linkMatch[1] : "";
      const pubDate = pubDateMatch ? pubDateMatch[1] : new Date().toUTCString();
      const source = sourceMatch ? (sourceMatch[1] || sourceMatch[2]) : "News";
      
      if (title && link) {
        articles.push({ title: String(title), link: String(link), pubDate: String(pubDate), source: String(source) });
      }
      if (articles.length >= 6) break;
    }
    return articles;
  } catch (err) {
    console.error(`Failed to fetch news for ${query}:`, err);
    return [];
  }
}

// --- Fetch Geocoding for Map via Nominatim ---
async function fetchLocationCoordinates(locationStr: string): Promise<LocationData | null> {
  if (!locationStr) return null;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationStr)}&format=json&limit=1`, {
      headers: { "User-Agent": "unbird-osint/1.0" }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.length > 0) {
      return {
        name: data[0].display_name,
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        bbox: data[0].boundingbox
      };
    }
  } catch (err) {
    console.error(`Failed to fetch geocoding for ${locationStr}:`, err);
  }
  return null;
}

// --- Route ---
metrics.get("/api/metrics/:username", async (c) => {
  const username = c.req.param("username").replace(/^@/, "");

  // Check cache
  const cached = cache.get(username.toLowerCase());
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return c.json(cached.data);
  }

  try {
    // 1. Get user profile from Twitter
    const { getGraphUser } = await import("../twitter/api");
    let user: any;
    try {
      user = await getGraphUser(username);
    } catch {
      return c.json({ error: "Could not fetch user profile" }, 404);
    }

    // 2. Compute account analytics
    const account = computeAccountAnalytics(user);

    // 3. All OSINT fetches in parallel
    const [socialBlade, bioLinks, webArchive, newsData, earningsNews, locationData] = await Promise.all([
      fetchSocialBlade(username).catch(() => null as SocialBladeData | null),
      resolveBioLinks(String(user?.bio || ""), String(user?.website || "")).catch(() => [] as ResolvedLink[]),
      checkWebArchive(username).catch(() => null as WebArchiveData | null),
      fetchGoogleNews(buildNewsQuery(user)),
      fetchGoogleNews(`${buildNewsQuery(user)} (earnings OR net worth OR controversy OR scandal)`),
      fetchLocationCoordinates(user?.location || "")
    ]);

    // 4. Compute trust score
    const trustScore = computeTrustScore(account, bioLinks, webArchive);

    // 5. Deduplicate news
    const allNews = [...newsData, ...earningsNews];
    const uniqueNewsMap = new Map<string, NewsArticle>();
    for (const article of allNews) {
      uniqueNewsMap.set(article.link, article);
    }
    const news = Array.from(uniqueNewsMap.values()).slice(0, 10);

    const result: MetricsResult = {
      username,
      account,
      socialBlade: socialBlade || null,
      bioLinks: bioLinks || [],
      webArchive: webArchive || null,
      news,
      location: locationData || null,
      trustScore,
      fetchedAt: Date.now(),
    };

    // Cache result
    cache.set(username.toLowerCase(), { data: result, fetchedAt: Date.now() });

    return c.json(result);
  } catch (e: any) {
    console.error(`[metrics] Error for ${username}:`, e.message);
    return c.json({ error: e.message }, 500);
  }
});
