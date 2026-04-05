// SPDX-License-Identifier: AGPL-3.0-only
// HTTP client for Twitter/X API — ported from nitter/src/apiutils.nim

import { SessionKind, RateLimitError, BadClientError, InternalError, NoSessionsError } from "../types";
import type { Session, ApiReq, ApiUrl } from "../types";
import {
  bearerToken,
  bearerToken2,
  genParams,
} from "./consts";
import { getSession, getSessionAsync, release, invalidate, setLimited, setRateLimit } from "../sessions/pool";
import { getProxy, reportResult, formatProxyUrl } from "../proxy/pool";

// --- Config ---
let apiProxy = "";
let maxRetries = 3;
let retryDelayMs = 1500;
let disableTid = false; // TID generation enabled (uses bearerToken natively mapping Web ID hash validations)

export function setApiProxy(url: string) {
  apiProxy = "";
  if (url) {
    apiProxy = url.replace(/\/+$/, "") + "/";
    if (!apiProxy.includes("http")) {
      apiProxy = "http://" + apiProxy;
    }
  }
}

export function setMaxRetries(n: number) { maxRetries = n; }
export function setRetryDelayMs(ms: number) { retryDelayMs = ms; }
export function setDisableTid(v: boolean) { disableTid = v; }

// --- URL building ---

function toUrl(req: ApiReq, sessionKind: SessionKind): string {
  const apiUrl = sessionKind === SessionKind.OAuth ? req.oauth : req.cookie;
  let base =
    sessionKind === SessionKind.OAuth
      ? "https://api.x.com/graphql"
      : "https://x.com/i/api/graphql";

  let path = apiUrl.endpoint;
  if (apiUrl.endpoint.startsWith("1.1/")) {
    base = "https://api.x.com";
  }

  const url = new URL(`${base}/${path}`);
  for (const [key, value] of apiUrl.params) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

// --- Header generation (mimics official X web client) ---

/**
 * Generate a x-client-transaction-id (TID).
 * The official web client sends a base64-encoded transaction ID with every request.
 * Requests without TID receive lower rate limits.
 */
function generateTid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Base64url encode — matches the format the official client uses
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Build an enhanced cookie string that mimics a real browser session.
 * Twitter checks for these cookies to verify the request is from the official web client.
 */
function getCookieHeader(authToken: string, ct0: string): string {
  // Generate stable-looking IDs derived from ct0 to avoid randomness per request
  const hash = ct0.slice(0, 16);
  const personalizationId = `"v1_${hash}=="`;
  const guestId = `v1%3A${Date.now().toString().slice(0, 13)}`;
  // twid is the user ID encoded — use a plausible format  
  return [
    `auth_token=${authToken}`,
    `ct0=${ct0}`,
    `personalization_id=${personalizationId}`,
    `guest_id=${guestId}`,
    `d_prefs=MjoxLGNvbnNlbnRfdmVyc2lvbjoyLHRleHRfdmVyc2lvbjoxMDAw`,
    `dnt=1`,
  ].join("; ");
}

function genHeaders(session: Session, url: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "*/*",
    "accept-encoding": "gzip, deflate, br, zstd",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    "cache-control": "no-cache",
    dnt: "1",
    origin: "https://x.com",
    pragma: "no-cache",
    priority: "u=1, i",
    referer: "https://x.com/",
    "user-agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    "x-twitter-active-user": "yes",
    "x-twitter-client-language": "en",
  };

  if (session.kind === SessionKind.Cookie) {
    // Always use the web bearer token — the official X web client uses this exclusively.
    // bearerToken2 is the mobile/android token which fragments the fingerprint.
    headers["authorization"] = bearerToken;
    headers["x-twitter-auth-type"] = "OAuth2Session";
    headers["x-csrf-token"] = session.ct0;
    headers["cookie"] = getCookieHeader(session.authToken, session.ct0);

    // Transaction ID — critical for elevated rate limits
    if (!disableTid) {
      headers["x-client-transaction-id"] = generateTid();
    }

    // Modern Chrome 133 client hints
    headers["sec-ch-ua"] = `"Chromium";v="133", "Not(A:Brand";v="99", "Google Chrome";v="133"`;
    headers["sec-ch-ua-mobile"] = "?0";
    headers["sec-ch-ua-platform"] = `"Linux"`;
    headers["sec-fetch-dest"] = "empty";
    headers["sec-fetch-mode"] = "cors";
    headers["sec-fetch-site"] = "same-origin";
  }

  return headers;
}

// --- Error handling ---

const errorsToSkip = new Set([0, 34, 144, 29, 37, 214]);

interface TwitterErrors {
  errors?: Array<{ code: number; message: string }>;
}

function checkErrors(body: string, url: string, session: Session, apiKey: string): void {
  if (!body.startsWith('{"errors')) return;

  try {
    const parsed: TwitterErrors = JSON.parse(body);
    if (!parsed.errors || parsed.errors.length === 0) return;

    const code = parsed.errors[0]!.code;
    if (errorsToSkip.has(code)) return;

    console.error(`Fetch error, API: ${url}, errors:`, parsed.errors);

    if ([89, 239, 326].includes(code)) {
      invalidate(session);
      throw new RateLimitError("Token expired or invalid");
    }

    if (code === 88) {
      // Per-API rate limit is already tracked via x-rate-limit-* headers (setRateLimit).
      // Don't globally limit the session — that would block ALL other endpoints too.
      throw new RateLimitError("Rate limited (code 88)");
    }
  } catch (e) {
    if (e instanceof RateLimitError) throw e;
  }
}

// --- In-flight request deduplication ---
const _inflightReqs = new Map<string, Promise<unknown>>();

async function fetchWithRetry(
  req: ApiReq,
  parse: (body: string) => unknown
): Promise<unknown> {
  const apiKey = req.cookie.endpoint;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let session: Session | null = null;

    try {
      session = await getSessionAsync(apiKey);
      const url = toUrl(req, session.kind);
      const headers = genHeaders(session, url);

      // Dynamic proxies disabled for authenticated API — most proxies can't
      // forward HTTPS to x.com correctly (400/405 from proxy nginx).
      // Proxies are still used for the unauthenticated syndication API below.
      let proxyStr: string | undefined = undefined;
      // const proxy = getProxy();
      // if (proxy) proxyStr = formatProxyUrl(proxy);
      
      const fetchUrl = apiProxy ? url.replace("https://", apiProxy) : url;
      const fetchOpts: RequestInit & { proxy?: string } = { 
        method: req.method || "GET", 
        headers,
        ...(req.body ? { body: req.body } : {})
      };
      // if (!apiProxy && proxyStr) fetchOpts.proxy = proxyStr;

      const resp = await fetch(fetchUrl, fetchOpts);
      
      // Basic check for proxy failures to penalize bad proxies
      if (!apiProxy && proxyStr) {
        if (!resp.ok && (resp.status >= 500 || [403, 407, 429].includes(resp.status))) {
          reportResult(proxyStr, false);
        } else if (resp.ok) {
          reportResult(proxyStr, true);
        }
      }

      // Extract rate limit headers
      const rlRemaining = resp.headers.get("x-rate-limit-remaining");
      const rlReset = resp.headers.get("x-rate-limit-reset");
      const rlLimit = resp.headers.get("x-rate-limit-limit");
      if (rlRemaining && rlReset && rlLimit) {
        setRateLimit(session!, apiKey, parseInt(rlRemaining), parseInt(rlReset), parseInt(rlLimit));
      }

      // Extract new ct0 if present in cookies
      const setCookie = resp.headers.get("set-cookie");
      if (setCookie && setCookie.includes("ct0=") && session?.kind === SessionKind.Cookie) {
        const match = setCookie.match(/ct0=([^;]+)/);
        if (match && match[1]) {
          session.ct0 = match[1];
          // Note: we'd ideally save this back to sessions.jsonl too
        }
      }

      // Read body once
      const body = await resp.text();

      // Check for standard error codes
      if (!resp.ok) {
        console.warn(`[client] API error ${resp.status} for ${apiKey}: ${body.slice(0, 200)}`);
        if (resp.status === 401 || resp.status === 403) {
          throw new BadClientError("503 Bad Client");
        }
      }

      if (resp.status === 503) throw new BadClientError("503 Bad Client");

      if (resp.status === 404 && !body) {
        console.warn(`[sessions] transient 404, retrying: ${apiKey}`);
        throw new RateLimitError("Transient 404");
      }

      if (body.startsWith("429 Too Many Requests")) {
        console.warn(`[sessions] 429 error, API: ${apiKey}`);
        throw new RateLimitError("429 Too Many Requests");
      }

      checkErrors(body, apiKey, session, apiKey);

      if (resp.status === 400) {
        console.error(`ERROR 400, ${apiKey}: ${body.slice(0, 200)}`);
        throw new InternalError(`400 error from ${apiKey}`);
      }

      return parse(body);
    } catch (e) {
      if (e instanceof InternalError || e instanceof BadClientError) throw e;
      if (e instanceof NoSessionsError) throw e; // let caller handle session exhaustion

      if (e instanceof RateLimitError) {
        const backoff = retryDelayMs * Math.pow(2, attempt);
        console.log(`[sessions] Rate limited, retrying ${apiKey} (${attempt + 1}/${maxRetries}) after ${backoff}ms...`);
        if (backoff > 0) await new Promise(r => setTimeout(r, backoff));
        continue;
      }

      console.error(`[client] error fetching ${apiKey}:`, e);
      throw new RateLimitError("Unexpected error");
    } finally {
      if (session) release(session);
    }
  }

  throw new RateLimitError(`Failed after ${maxRetries} retries: ${apiKey}`);
}

/**
 * Fetch and parse as JSON
 */
export async function fetchJson(req: ApiReq): Promise<any> {
  // Deduplicate in-flight requests for the same URL
  const dedupeKey = `json:${req.cookie.endpoint}:${JSON.stringify(req.cookie)}`;
  const inflight = _inflightReqs.get(dedupeKey);
  if (inflight) return inflight;

  const promise = fetchWithRetry(req, (body) => {
    if (body.startsWith("{") || body.startsWith("[")) return JSON.parse(body);
    console.warn(`[client] non-JSON response for ${req.cookie.endpoint}: ${body.slice(0, 100)}`);
    return null;
  }).finally(() => _inflightReqs.delete(dedupeKey));

  _inflightReqs.set(dedupeKey, promise);
  return promise;
}

/**
 * Fetch raw text body
 */
export async function fetchRaw(req: ApiReq): Promise<string> {
  return fetchWithRetry(req, (body) => {
    if (body.startsWith("{") || body.startsWith("[")) return body;
    console.warn(`[client] non-JSON response for ${req.cookie.endpoint}: ${body.slice(0, 100)}`);
    return "";
  }) as Promise<string>;
}

// --- Syndication API (no auth required) ---

const SYNDICATION_URL = "https://cdn.syndication.twimg.com";

function getSyndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI)
    .toString(6 ** 2)
    .replace(/(0+|\.)/g, "");
}

export async function fetchSyndicationJson(tweetId: string): Promise<any> {
  const url = new URL(`${SYNDICATION_URL}/tweet-result`);
  url.searchParams.set("id", tweetId);
  url.searchParams.set("lang", "en");
  url.searchParams.set(
    "features",
    [
      "tfw_timeline_list:",
      "tfw_follower_count_sunset:true",
      "tfw_tweet_edit_backend:on",
      "tfw_refsrc_session:on",
      "tfw_fosnr_soft_interventions_enabled:on",
      "tfw_show_birdwatch_pivots_enabled:on",
      "tfw_show_business_verified_badge:on",
      "tfw_duplicate_scribes_to_settings:on",
      "tfw_use_profile_image_shape_enabled:on",
      "tfw_show_blue_verified_badge:on",
      "tfw_legacy_timeline_sunset:true",
      "tfw_show_gov_verified_badge:on",
      "tfw_show_business_affiliate_badge:on",
      "tfw_tweet_edit_frontend:on",
    ].join(";")
  );
  url.searchParams.set("token", getSyndicationToken(tweetId));

  const fetchUrl = apiProxy ? url.toString().replace("https://", apiProxy) : url.toString();
  
  // Syndication API proxy integration
  let proxyStr: string | undefined = undefined;
  const proxy = getProxy();
  if (proxy) proxyStr = formatProxyUrl(proxy);
  const fetchOpts: RequestInit & { proxy?: string } = {};
  if (!apiProxy && proxyStr) fetchOpts.proxy = proxyStr;

  const res = await fetch(fetchUrl, fetchOpts);
  
  if (!apiProxy && proxyStr) {
    if (!res.ok && (res.status >= 500 || res.status === 403 || res.status === 407)) {
      reportResult(proxyStr, false);
    } else if (res.ok) {
      reportResult(proxyStr, true);
    }
  }
  
  const isJson = res.headers.get("content-type")?.includes("application/json");
  if (!isJson || !res.ok) return null;
  const data = await res.json();
  if (!data || Object.keys(data).length === 0) return null;
  if (data?.__typename === "TweetTombstone") return null;
  return data;
}

// --- API URL Builder Helpers ---

export function apiUrl(endpoint: string, variables: string, fieldToggles = "", customFeatures?: string): ApiUrl {
  return { endpoint, params: genParams(variables, fieldToggles, customFeatures) };
}

export function apiReq(endpoint: string, variables: string, fieldToggles = "", customFeatures?: string): ApiReq {
  const url = apiUrl(endpoint, variables, fieldToggles, customFeatures);
  return { cookie: url, oauth: url };
}

export function apiMutation(endpoint: string, queryId: string, variables: Record<string, any>): ApiReq & { method: string; body: string } {
  const url = apiUrl(endpoint, JSON.stringify(variables));
  return { cookie: url, oauth: url, method: "POST", body: JSON.stringify({ variables, queryId }) };
}
