import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { fetchAllProxySources } from "./sources";
import { validateProxiesConcurrently } from "./validator";
import { DEFAULT_POOL_CONFIG } from "./types";
import type { RawProxy, ValidatedProxy, ProxyPoolConfig, PoolStats } from "./types";

let currentPool: ValidatedProxy[] = [];
let lastFetchedAt = 0;
let lastValidatedAt = 0;
let isRefreshing = false;

export async function loadPool(config = DEFAULT_POOL_CONFIG) {
  try {
    const data = await readFile(config.cachePath, "utf8");
    const parsed = JSON.parse(data);
    currentPool = parsed.proxies || [];
    lastFetchedAt = parsed.lastFetchedAt || 0;
    lastValidatedAt = parsed.lastValidatedAt || 0;
    console.log(`[proxy-pool] Loaded ${currentPool.length} proxies from cache`);
  } catch (e) {
    console.log("[proxy-pool] No cache found, starting fresh");
  }
}

export async function savePool(config = DEFAULT_POOL_CONFIG) {
  try {
    await mkdir(dirname(config.cachePath), { recursive: true });
    await writeFile(config.cachePath, JSON.stringify({
      lastFetchedAt, lastValidatedAt, proxies: currentPool
    }, null, 2), "utf8");
  } catch(e) {
    console.warn("[proxy-pool] Failed to save cache cachePath:", config.cachePath);
  }
}

export async function refreshPool(config = DEFAULT_POOL_CONFIG) {
  if (isRefreshing) return;
  isRefreshing = true;
  console.log("[proxy-pool] Starting refresh cycle...");
  try {
    const { proxies } = await fetchAllProxySources();
    lastFetchedAt = Date.now();
    
    console.log(`[proxy-pool] Validating ${proxies.length} proxies...`);
    const validated = await validateProxiesConcurrently(proxies as (RawProxy & { source: string })[], config);
    lastValidatedAt = Date.now();
    
    const alive = validated.filter(p => p.score > 0);
    
    // Sort highest score (best region & lowest latency) first
    currentPool = alive.sort((a, b) => b.score - a.score);
    console.log(`[proxy-pool] Refresh complete. ${currentPool.length} proxies alive.`);
    await savePool(config);
  } catch (e) {
    console.error("[proxy-pool] Failed to refresh pool", e);
  } finally {
    isRefreshing = false;
  }
}

let isPinging = false;
export async function pingTopProxies() {
  if (isPinging || currentPool.length === 0) return;
  isPinging = true;
  try {
    const alive = currentPool.filter(p => p.score > 0 && p.consecutiveFails < DEFAULT_POOL_CONFIG.maxConsecutiveFails);
    alive.sort((a, b) => b.score - a.score || a.latencyMs - b.latencyMs);
    const top = alive.slice(0, 30);
    
    await Promise.allSettled(top.map(async p => {
      const proxyUrl = formatProxyUrl(p);
      // Test API latency
      const start = Date.now();
      try {
        const req = await fetch("https://httpbin.org/status/200", {
          proxy: proxyUrl,
          signal: AbortSignal.timeout(3000)
        } as any);
        if (req.ok) {
          p.latencyMs = Date.now() - start;
          p.score = Math.min(200, p.score + 2);
          p.consecutiveFails = 0;
          p.lastSuccess = Date.now();
        }
      } catch (e) {
        p.score = Math.max(0, p.score - 5);
        p.consecutiveFails++;
      }
      // Test CDN latency
      try {
        const cdnStart = Date.now();
        const cdnReq = await fetch("https://abs.twimg.com/favicons/twitter.3.ico", {
          proxy: proxyUrl,
          signal: AbortSignal.timeout(4000),
          headers: {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
            "Referer": "https://twitter.com/",
            "Origin": "https://twitter.com"
          }
        } as any);
        if (cdnReq.ok || cdnReq.status === 403) {
          p.cdnLatencyMs = Date.now() - cdnStart;
        } else {
          p.cdnLatencyMs = -1;
        }
      } catch (e) {
        p.cdnLatencyMs = -1;
      }
    }));
  } finally {
    isPinging = false;
  }
}

export function startProxyPool(config = DEFAULT_POOL_CONFIG) {
  loadPool(config).then(() => {
    if (currentPool.length === 0 || Date.now() - lastFetchedAt > config.refreshIntervalMs) {
      refreshPool(config);
    }
    setInterval(() => refreshPool(config), config.refreshIntervalMs);
    setInterval(pingTopProxies, 30 * 1000); // Background ping every 30 seconds
  });
}

export function getProxy(strategy: "fastest" | "balanced" | "random" = "random"): ValidatedProxy | null {
  const alive = currentPool.filter(p => p.score > 0 && p.consecutiveFails < DEFAULT_POOL_CONFIG.maxConsecutiveFails);
  if (alive.length === 0) return null;
  
  // Sort dynamically ensuring fastest active are always surfaced
  alive.sort((a, b) => b.score - a.score || a.latencyMs - b.latencyMs);

  if (strategy === "fastest") {
    const topCount = Math.max(1, Math.floor(alive.length * 0.05)); 
    const topProxies = alive.slice(0, topCount);
    topProxies.sort((a, b) => a.latencyMs - b.latencyMs);
    // Pick from absolutely fastest 3 proxies
    return topProxies[Math.floor(Math.random() * Math.min(3, topProxies.length))] || null;
  }
  
  if (strategy === "balanced") {
    // Prefer proxies that have proven CDN reachability, sorted by CDN latency
    const cdnProven = alive.filter(p => (p.cdnLatencyMs ?? -1) >= 0);
    if (cdnProven.length >= 5) {
      cdnProven.sort((a, b) => (a.cdnLatencyMs ?? 9999) - (b.cdnLatencyMs ?? 9999));
      const topCdn = cdnProven.slice(0, 30);
      return topCdn[Math.floor(Math.random() * topCdn.length)] || null;
    }
    // Fallback: top 30 by general score
    const topProxies = alive.slice(0, 30);
    return topProxies[Math.floor(Math.random() * topProxies.length)] || null;
  }
  
  const topCount = Math.max(1, Math.floor(alive.length * 0.2));
  const topProxies = alive.slice(0, topCount);
  
  return topProxies[Math.floor(Math.random() * topProxies.length)] || null;
}

export function formatProxyUrl(p: ValidatedProxy): string {
  return `${p.protocol}://${p.host}:${p.port}`;
}

export function reportResult(proxyUrl: string, success: boolean) {
  const proxy = currentPool.find(p => formatProxyUrl(p) === proxyUrl);
  if (!proxy) return;
  
  if (success) {
    proxy.successCount++;
    proxy.consecutiveFails = 0;
    proxy.lastSuccess = Date.now();
    proxy.score = Math.min(100, proxy.score + 2);
  } else {
    proxy.failCount++;
    proxy.consecutiveFails++;
    proxy.score = Math.max(0, proxy.score - 5);
  }
}

export function getPoolStats(): PoolStats {
  const alive = currentPool.filter(p => p.score > 0 && p.consecutiveFails < DEFAULT_POOL_CONFIG.maxConsecutiveFails);
  const deadCount = currentPool.length - alive.length;
  
  const byProtocol: Record<string, number> = {};
  const byCountry: Record<string, number> = {};
  
  let totalLatency = 0;
  for (const p of alive) {
    byProtocol[p.protocol] = (byProtocol[p.protocol] || 0) + 1;
    byCountry[p.country] = (byCountry[p.country] || 0) + 1;
    totalLatency += p.latencyMs;
  }
  
  const topCountries = Object.entries(byCountry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, count]) => ({ code, count }));
    
  return {
    total: currentPool.length,
    alive: alive.length,
    dead: deadCount,
    byProtocol,
    byCountry,
    avgLatencyMs: alive.length ? totalLatency / alive.length : 0,
    lastFetchedAt,
    lastValidatedAt,
    nextRefreshAt: lastFetchedAt + DEFAULT_POOL_CONFIG.refreshIntervalMs,
    topCountries
  };
}
