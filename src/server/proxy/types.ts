// Proxy pool types

export type ProxyProtocol = "http" | "https" | "socks4" | "socks5";

export interface RawProxy {
  host: string;
  port: number;
  protocol: ProxyProtocol;
  country?: string; // from source (e.g. hideip.me)
}

export interface ValidatedProxy {
  host: string;
  port: number;
  protocol: ProxyProtocol;
  country: string;        // ISO 3166-1 alpha-2 or full name
  countryCode: string;    // ISO 3166-1 alpha-2
  latencyMs: number;      // average response time
  cdnLatencyMs: number;   // Twitter CDN specific latency (-1 = not tested)
  speed: number;          // bytes/sec estimate (0 = unknown)
  lastChecked: number;    // epoch ms
  lastSuccess: number;    // epoch ms
  successCount: number;
  failCount: number;
  consecutiveFails: number;
  score: number;          // computed quality score 0-100
  source: string;         // which source list it came from
}

export interface PoolStats {
  total: number;
  alive: number;
  dead: number;
  byProtocol: Record<string, number>;
  byCountry: Record<string, number>;
  avgLatencyMs: number;
  lastFetchedAt: number;
  lastValidatedAt: number;
  nextRefreshAt: number;
  topCountries: { code: string; count: number }[];
}

export interface ProxyPoolConfig {
  refreshIntervalMs: number;   // default 6h
  validationConcurrency: number; // default 50
  validationTimeoutMs: number;  // default 5000
  maxConsecutiveFails: number;   // evict after this many
  testUrl: string;              // URL to test proxies against
  speedTestUrl: string;         // URL to test proxy bandwidth
  cachePath: string;            // disk persistence path
}

export const DEFAULT_POOL_CONFIG: ProxyPoolConfig = {
  refreshIntervalMs: 6 * 60 * 60 * 1000,
  validationConcurrency: 50,
  validationTimeoutMs: 5000,
  maxConsecutiveFails: 5,
  testUrl: "http://httpbin.org/ip",
  speedTestUrl: "https://speed.cloudflare.com/__down?bytes=100000", // 100KB test
  cachePath: process.env.PROXY_CACHE_PATH ?? "./cache/proxies.json",
};
