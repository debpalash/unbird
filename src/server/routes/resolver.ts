import { Hono } from "hono";

export const resolver = new Hono();

resolver.get("/api/resolver/:username", async (c) => {
  const username = c.req.param("username");
  
  const platforms: Record<string, { exists: boolean; url: string; data?: any }> = {};

  const fetchWithTimeout = async (url: string, timeout = 3000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
      clearTimeout(id);
      return res;
    } catch {
      clearTimeout(id);
      return null;
    }
  };

  // 1. GitHub
  const ghRes = await fetchWithTimeout(`https://api.github.com/users/${username}`);
  if (ghRes && ghRes.ok) {
    const ghData = await ghRes.json();
    platforms.github = { exists: true, url: `https://github.com/${username}`, data: { name: ghData.name, followers: ghData.followers } };
  } else {
    platforms.github = { exists: false, url: `https://github.com/${username}` };
  }

  // 2. Reddit
  const rdRes = await fetchWithTimeout(`https://www.reddit.com/user/${username}/about.json`);
  if (rdRes && rdRes.ok) {
    const rdData = await rdRes.json();
    if (!rdData.error) {
      platforms.reddit = { exists: true, url: `https://reddit.com/user/${username}`, data: { karma: rdData.data?.total_karma } };
    } else {
      platforms.reddit = { exists: false, url: `https://reddit.com/user/${username}` };
    }
  } else {
    platforms.reddit = { exists: false, url: `https://reddit.com/user/${username}` };
  }

  // 3. Hacker News
  const hnRes = await fetchWithTimeout(`https://hacker-news.firebaseio.com/v0/user/${username}.json`);
  if (hnRes && hnRes.ok) {
    const hnData = await hnRes.json();
    if (hnData !== null) {
      platforms.hackernews = { exists: true, url: `https://news.ycombinator.com/user?id=${username}`, data: { karma: hnData.karma } };
    } else {
      platforms.hackernews = { exists: false, url: `https://news.ycombinator.com/user?id=${username}` };
    }
  } else {
    platforms.hackernews = { exists: false, url: `https://news.ycombinator.com/user?id=${username}` };
  }

  return c.json(platforms);
});
