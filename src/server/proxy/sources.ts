// Proxy source fetchers — pulls from multiple free proxy list repos
// Each source has its own parser for the specific format

import type { RawProxy, ProxyProtocol } from "./types";

// ── Source definitions ────────────────────────────────────────────────────────

interface ProxySource {
  name: string;
  urls: { url: string; protocol: ProxyProtocol }[];
  parse: (text: string, protocol: ProxyProtocol) => RawProxy[];
}

// Parser: plain `ip:port` per line
function parsePlain(text: string, protocol: ProxyProtocol): RawProxy[] {
  const results: RawProxy[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d{1,5})$/);
    if (match) {
      results.push({ host: match[1]!, port: parseInt(match[2]!, 10), protocol });
    }
  }
  return results;
}

// Parser: `protocol://ip:port` per line (proxifly format)
function parseProtoPrefixed(text: string, _protocol: ProxyProtocol): RawProxy[] {
  const results: RawProxy[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(https?|socks[45]):\/\/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d{1,5})$/);
    if (match) {
      const proto = match[1]!.replace("socks4", "socks4").replace("socks5", "socks5") as ProxyProtocol;
      results.push({ host: match[2]!, port: parseInt(match[3]!, 10), protocol: proto });
    }
  }
  return results;
}

// Parser: `ip:port:Country` per line (hideip.me format)
function parseWithCountry(text: string, protocol: ProxyProtocol): RawProxy[] {
  const results: RawProxy[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(":");
    if (parts.length >= 2) {
      const host = parts[0]!;
      const port = parseInt(parts[1]!, 10);
      const country = parts.slice(2).join(":").trim() || undefined;
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) && port > 0 && port <= 65535) {
        results.push({ host, port, protocol, country });
      }
    }
  }
  return results;
}

const SOURCES: ProxySource[] = [
  {
    name: "TheSpeedX",
    urls: [
      { url: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt", protocol: "http" },
      { url: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt", protocol: "socks4" },
      { url: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt", protocol: "socks5" },
    ],
    parse: parsePlain,
  },
  {
    name: "proxifly",
    urls: [
      { url: "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/all/data.txt", protocol: "http" },
    ],
    parse: parseProtoPrefixed,
  },
  {
    name: "hideip.me",
    urls: [
      { url: "https://raw.githubusercontent.com/zloi-user/hideip.me/main/http.txt", protocol: "http" },
      { url: "https://raw.githubusercontent.com/zloi-user/hideip.me/main/socks4.txt", protocol: "socks4" },
      { url: "https://raw.githubusercontent.com/zloi-user/hideip.me/main/socks5.txt", protocol: "socks5" },
    ],
    parse: parseWithCountry,
  },
  {
    name: "Anonym0usWork1221",
    urls: [
      { url: "https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_files/http_proxies.txt", protocol: "http" },
      { url: "https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_files/socks4_proxies.txt", protocol: "socks4" },
      { url: "https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_files/socks5_proxies.txt", protocol: "socks5" },
    ],
    parse: parsePlain,
  },
  {
    name: "ProxyScraper",
    urls: [
      { url: "https://raw.githubusercontent.com/ProxyScraper/ProxyScraper/main/http.txt", protocol: "http" },
      { url: "https://raw.githubusercontent.com/ProxyScraper/ProxyScraper/main/socks4.txt", protocol: "socks4" },
      { url: "https://raw.githubusercontent.com/ProxyScraper/ProxyScraper/main/socks5.txt", protocol: "socks5" },
    ],
    parse: parsePlain,
  },
  {
    name: "monosans",
    urls: [
      { url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt", protocol: "http" },
      { url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt", protocol: "socks4" },
      { url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt", protocol: "socks5" },
    ],
    parse: parsePlain,
  },
  {
    name: "Zaeem20",
    urls: [
      { url: "https://raw.githubusercontent.com/Zaeem20/FREE_PROXIES_LIST/master/http.txt", protocol: "http" },
      { url: "https://raw.githubusercontent.com/Zaeem20/FREE_PROXIES_LIST/master/socks4.txt", protocol: "socks4" },
      { url: "https://raw.githubusercontent.com/Zaeem20/FREE_PROXIES_LIST/master/socks5.txt", protocol: "socks5" },
    ],
    parse: parsePlain,
  },
  {
    name: "dpangestuw",
    urls: [
      { url: "https://raw.githubusercontent.com/dpangestuw/Free-Proxy/main/http.txt", protocol: "http" },
      { url: "https://raw.githubusercontent.com/dpangestuw/Free-Proxy/main/socks4.txt", protocol: "socks4" },
      { url: "https://raw.githubusercontent.com/dpangestuw/Free-Proxy/main/socks5.txt", protocol: "socks5" },
    ],
    parse: parsePlain,
  },
  {
    name: "vakhov",
    urls: [
      { url: "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/http.txt", protocol: "http" },
      { url: "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/socks4.txt", protocol: "socks4" },
      { url: "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/socks5.txt", protocol: "socks5" },
    ],
    parse: parsePlain,
  },
  {
    name: "jetkai",
    urls: [
      { url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt", protocol: "http" },
      { url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-https.txt", protocol: "https" },
      { url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks4.txt", protocol: "socks4" },
      { url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt", protocol: "socks5" },
    ],
    parse: parsePlain,
  },
  {
    name: "oxylabs",
    urls: [
      { url: "https://raw.githubusercontent.com/oxylabs/free-proxy-list/main/proxies.txt", protocol: "http" },
    ],
    parse: parsePlain,
  },
  {
    name: "elliottophellia",
    urls: [
      { url: "https://raw.githubusercontent.com/elliottophellia/proxylist/master/results/http/global/http_checked.txt", protocol: "http" },
      { url: "https://raw.githubusercontent.com/elliottophellia/proxylist/master/results/socks4/global/socks4_checked.txt", protocol: "socks4" },
      { url: "https://raw.githubusercontent.com/elliottophellia/proxylist/master/results/socks5/global/socks5_checked.txt", protocol: "socks5" },
    ],
    parse: parsePlain,
  },
  {
    name: "Thordata",
    urls: [
      { url: "https://raw.githubusercontent.com/Thordata/awesome-free-proxy-list/main/proxy-list.txt", protocol: "http" }
    ],
    parse: parsePlain,
  },
  {
    name: "F0rc3Run",
    urls: [
      { url: "https://raw.githubusercontent.com/F0rc3Run/F0rc3Run/main/proxies.txt", protocol: "http" }
    ],
    parse: parsePlain,
  },
  {
    name: "gfpcom",
    urls: [
      { url: "https://raw.githubusercontent.com/gfpcom/free-proxy-list/main/proxies.txt", protocol: "http" }
    ],
    parse: parsePlain,
  }
];

// ── Fetch all sources ─────────────────────────────────────────────────────────

export async function fetchAllProxySources(): Promise<{ proxies: RawProxy[]; sourceStats: Record<string, number> }> {
  const allProxies: RawProxy[] = [];
  const sourceStats: Record<string, number> = {};
  const seen = new Set<string>();

  for (const source of SOURCES) {
    let sourceCount = 0;
    const fetches = source.urls.map(async ({ url, protocol }) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!resp.ok) {
          console.warn(`[proxy-src] ${source.name} ${protocol} HTTP ${resp.status}`);
          return [];
        }
        const text = await resp.text();
        return source.parse(text, protocol);
      } catch (e: any) {
        console.warn(`[proxy-src] ${source.name} ${protocol} failed: ${e.message}`);
        return [];
      }
    });

    const results = await Promise.all(fetches);
    for (const proxies of results) {
      for (const p of proxies) {
        const key = `${p.host}:${p.port}`;
        if (!seen.has(key)) {
          seen.add(key);
          allProxies.push({ ...p, source: source.name } as any);
          sourceCount++;
        }
      }
    }
    sourceStats[source.name] = sourceCount;
  }

  console.log(`[proxy-src] fetched ${allProxies.length} unique proxies from ${Object.keys(sourceStats).length} sources`);
  for (const [name, count] of Object.entries(sourceStats)) {
    console.log(`[proxy-src]   ${name}: ${count}`);
  }

  return { proxies: allProxies, sourceStats };
}
