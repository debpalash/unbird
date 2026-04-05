import type { RawProxy, ValidatedProxy, ProxyPoolConfig } from "./types";

const TARGET_REGIONS = new Set([
  "US", "CA", 
  // Europe
  "GB", "DE", "FR", "NL", "IT", "ES", "SE", "CH", "PL", "BE", "AT", "DK", "NO", "FI", "IE", "PT", "GR", "CZ", "RO", "HU", "EU"
]);

export async function validateProxy(
  raw: RawProxy,
  config: ProxyPoolConfig,
  sourceName: string
): Promise<ValidatedProxy | null> {
  const countryCode = "UNKNOWN"; // Stripped geoip for Cloudflare Edge
  
  // Optionally penalize or reject if not in target regions, but for now we just score lower
  // "we prefer using proxy thats mostly in us, canada, europe"
  let scoreBase = TARGET_REGIONS.has(countryCode) ? 100 : 50;
  
  const proxyStr = `${raw.protocol}://${raw.host}:${raw.port}`;
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.validationTimeoutMs);

  try {
    // Phase 1: Base Latency Ping
    const res = await fetch(config.testUrl, {
      signal: controller.signal,
      proxy: proxyStr,
      headers: { "User-Agent": "unbird-validator/1.0" }
    } as RequestInit & { proxy?: string });
    
    if (!res.ok) {
      clearTimeout(timer);
      return null;
    }
    
    await res.text();
    const latencyMs = Date.now() - start;
    
    // Phase 2: Bandwidth Speed Test
    const startSpeed = Date.now();
    let speedBytesPerSec = 0;
    try {
      const speedRes = await fetch(config.speedTestUrl, {
        signal: controller.signal,
        proxy: proxyStr,
        headers: { "User-Agent": "unbird-validator/1.0" }
      } as RequestInit & { proxy?: string });
      
      if (speedRes.ok) {
        const buffer = await speedRes.arrayBuffer();
        const speedMs = Date.now() - startSpeed;
        speedBytesPerSec = (buffer.byteLength / Math.max(1, speedMs)) * 1000;
      }
    } catch(e) {}

    // Phase 3: Twitter CDN reachability test
    let cdnLatencyMs = -1;
    try {
      const cdnStart = Date.now();
      const cdnRes = await fetch("https://abs.twimg.com/favicons/twitter.3.ico", {
        signal: AbortSignal.timeout(4000),
        proxy: proxyStr,
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
          "Referer": "https://twitter.com/",
          "Origin": "https://twitter.com"
        }
      } as RequestInit & { proxy?: string });
      if (cdnRes.ok || cdnRes.status === 403) {
        // Even 403 means the proxy can reach the CDN (just blocked by WAF)
        cdnLatencyMs = Date.now() - cdnStart;
      }
    } catch(e) {}
    
    clearTimeout(timer);
    
    // Penalize high latency (up to -20 pts)
    const latencyPenalty = latencyMs / 100;
    // Huge bonus for high bandwidth (cap at +50 pts)
    const speedBonus = Math.min(50, speedBytesPerSec / 20000); 
    // Massive bonus if proxy can reach Twitter CDN
    const cdnBonus = cdnLatencyMs >= 0 ? 30 : 0;
    // Extra bonus for fast CDN responses
    const cdnSpeedBonus = cdnLatencyMs > 0 && cdnLatencyMs < 2000 ? Math.max(0, 20 - (cdnLatencyMs / 100)) : 0;

    const score = Math.max(0, scoreBase - latencyPenalty + speedBonus + cdnBonus + cdnSpeedBonus);

    return {
      host: raw.host,
      port: raw.port,
      protocol: raw.protocol,
      country: countryCode,
      countryCode: countryCode,
      latencyMs,
      cdnLatencyMs,
      speed: speedBytesPerSec,
      lastChecked: Date.now(),
      lastSuccess: Date.now(),
      successCount: 1,
      failCount: 0,
      consecutiveFails: 0,
      score,
      source: sourceName
    };
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

export async function validateProxiesConcurrently(
  proxies: (RawProxy & { source: string })[],
  config: ProxyPoolConfig
): Promise<ValidatedProxy[]> {
  const results: ValidatedProxy[] = [];
  const batches: Promise<void>[] = [];
  
  const queue = [...proxies];
  
  // Create worker slots up to validationConcurrency
  for (let i = 0; i < config.validationConcurrency; i++) {
    batches.push((async () => {
      while (queue.length > 0) {
        const raw = queue.pop()!;
        const validated = await validateProxy(raw, config, raw.source);
        if (validated) {
          results.push(validated);
        }
      }
    })());
  }
  
  await Promise.all(batches);
  return results;
}
