// SPDX-License-Identifier: AGPL-3.0-only
// Session management — ported from nitter/src/auth.nim

import type { Session, RateLimit } from "../types";
import { SessionKind, RateLimitError, NoSessionsError } from "../types";
import { AsyncLocalStorage } from "node:async_hooks";

export const requestSessionCtx = new AsyncLocalStorage<Session>();

const HOUR_IN_SECONDS = 60 * 60;

let sessionPool: Session[] = [];
let maxConcurrentReqs = 25;
const _diagLogTimes = new Map<string, number>(); // throttle diagnostic logs

export function setMaxConcurrentReqs(n: number) {
  if (n > 0) maxConcurrentReqs = n;
}

export function getSessionPoolSize(): number {
  return sessionPool.length;
}

// --- Session loading ---

interface RawSession {
  kind: string;
  id?: number;
  username?: string;
  auth_token?: string;
  authToken?: string;
  ct0?: string;
  oauthToken?: string;
  oauthSecret?: string;
}

/**
 * Parse a single JSONL line into a Session object
 */
function parseSession(line: string): Session | null {
  try {
    const raw: RawSession = JSON.parse(line.trim());
    if (raw.kind === "cookie") {
      return {
        kind: SessionKind.Cookie,
        id: raw.id ?? 0,
        username: raw.username ?? "",
        pending: 0,
        limited: false,
        limitedAt: 0,
        apis: {},
        authToken: raw.auth_token ?? raw.authToken ?? "",
        ct0: raw.ct0 ?? "",
      };
    } else if (raw.kind === "oauth") {
      return {
        kind: SessionKind.OAuth,
        id: raw.id ?? 0,
        username: raw.username ?? "",
        pending: 0,
        limited: false,
        limitedAt: 0,
        apis: {},
        oauthToken: raw.oauthToken ?? "",
        oauthSecret: raw.oauthSecret ?? "",
      };
    }
  } catch {
    // skip malformed lines
  }
  return null;
}

/**
 * Initialize the session pool from a JSONL file
 */
export async function initSessionPool(path: string) {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    console.warn(`[sessions] WARNING: ${path} not found. API requests will fail.`);
    return;
  }

  const content = await file.text();
  const lines = content.split("\n").filter((l) => l.trim().length > 0);

  for (const line of lines) {
    const session = parseSession(line);
    if (session) {
      sessionPool.push(session);
    }
  }

  console.log(`[sessions] loaded ${sessionPool.length} sessions from ${path}`);
}

// --- Session selection ---

function endpoint(session: Session, oauthEndpoint: string, cookieEndpoint: string): string {
  return session.kind === SessionKind.OAuth ? oauthEndpoint : cookieEndpoint;
}

function isLimited(session: Session, apiKey: string): boolean {
  if (session.limited && apiKey !== "UserWithProfileTweetsQueryV2") {
    if (Date.now() / 1000 - session.limitedAt > HOUR_IN_SECONDS) {
      session.limited = false;
      return false;
    }
    return true;
  }

  const limit = session.apis[apiKey];
  if (limit) {
    return limit.remaining <= 1 && limit.reset > Date.now() / 1000;
  }
  return false;
}

function isReady(session: Session, apiKey: string): boolean {
  return session.pending <= maxConcurrentReqs && !isLimited(session, apiKey);
}

/**
 * Get a random available session for the given API endpoint
 */
export function getSession(apiKey: string): Session {
  // 1. Check if an isolated session is active for the current request
  const ctxSession = requestSessionCtx.getStore();
  if (ctxSession) {
    ctxSession.pending++;
    return ctxSession;
  }

  // 2. Shuffle through pool looking for a ready session
  for (let attempt = 0; attempt < sessionPool.length * 2; attempt++) {
    const idx = Math.floor(Math.random() * sessionPool.length);
    const session = sessionPool[idx];
    if (session && isReady(session, apiKey)) {
      session.pending++;
      return session;
    }
  }

  // Diagnostic: log why each session is unavailable (throttled to once per 10s per apiKey)
  if (sessionPool.length === 0) {
    throw new NoSessionsError(`No sessions available for API: ${apiKey} (pool is empty)`);
  }
  const now = Date.now();
  const lastLog = _diagLogTimes.get(apiKey) ?? 0;
  if (now - lastLog > 10_000) {
    _diagLogTimes.set(apiKey, now);
    for (const s of sessionPool) {
      const reasons: string[] = [];
      if (s.pending > maxConcurrentReqs) reasons.push(`pending=${s.pending}/${maxConcurrentReqs}`);
      if (isLimited(s, apiKey)) {
        const rl = s.apis[apiKey];
        reasons.push(rl ? `rate-limited(remaining=${rl.remaining}, reset=${new Date(rl.reset * 1000).toLocaleTimeString()})` : "globally-limited");
      }
      if (reasons.length > 0) {
        console.warn(`[sessions] ${s.username || s.id}: unavailable for ${apiKey}: ${reasons.join(", ")}`);
      }
    }
  }

  throw new NoSessionsError(`No sessions available for API: ${apiKey}`);
}

/**
 * Get a session, waiting up to MAX_WAIT_SECS for rate limit reset if needed.
 * Falls back to sync getSession if no wait is worthwhile.
 */
const MAX_WAIT_SECS = 60;

export async function getSessionAsync(apiKey: string): Promise<Session> {
  // Try sync first
  try {
    return getSession(apiKey);
  } catch {
    // Check if any session's rate limit resets within MAX_WAIT_SECS
    let earliestReset = Infinity;
    for (const s of sessionPool) {
      const rl = s.apis[apiKey];
      if (rl && rl.remaining <= 2 && rl.reset > Date.now() / 1000) {
        earliestReset = Math.min(earliestReset, rl.reset);
      }
    }

    const nowSecs = Date.now() / 1000;
    const waitSecs = earliestReset - nowSecs;

    if (waitSecs > 0 && waitSecs <= MAX_WAIT_SECS) {
      console.log(`[sessions] waiting ${Math.ceil(waitSecs)}s for ${apiKey} rate limit reset...`);
      await Bun.sleep((waitSecs + 1) * 1000); // +1s buffer
      return getSession(apiKey); // retry after wait
    }

    throw new NoSessionsError(`No sessions available for API: ${apiKey}`);
  }
}

export function release(session: Session) {
  session.pending = Math.max(0, session.pending - 1);
}

export function invalidate(session: Session) {
  const idx = sessionPool.indexOf(session);
  if (idx > -1) {
    sessionPool.splice(idx, 1);
    console.log(`[sessions] invalidated session: ${session.username || session.id}`);
  }
}

export function setLimited(session: Session, apiKey: string) {
  session.limited = true;
  session.limitedAt = Math.floor(Date.now() / 1000);
  console.log(`[sessions] rate limited by api: ${apiKey}, session: ${session.username || session.id}`);
}

export function setRateLimit(
  session: Session,
  apiKey: string,
  remaining: number,
  reset: number,
  limit: number
) {
  const existing = session.apis[apiKey];
  if (existing) {
    if (existing.reset >= reset && existing.remaining < remaining) return;
    if (existing.reset === reset && existing.remaining >= remaining) {
      session.apis[apiKey]!.remaining = remaining;
      return;
    }
  }
  session.apis[apiKey] = { limit, remaining, reset };
}

/**
 * Get session pool health info (for debug endpoint)
 */
export function getSessionPoolHealth() {
  const now = Math.floor(Date.now() / 1000);
  let totalReqs = 0;
  let limitedCount = 0;
  const reqsPerApi: Record<string, number> = {};

  for (const session of sessionPool) {
    if (session.limited) limitedCount++;

    for (const [api, status] of Object.entries(session.apis)) {
      if (status.reset < now) continue;
      const reqs = status.limit - status.remaining;
      reqsPerApi[api] = (reqsPerApi[api] ?? 0) + reqs;
      totalReqs += reqs;
    }
  }

  return {
    sessions: { total: sessionPool.length, limited: limitedCount },
    requests: { total: totalReqs, apis: reqsPerApi },
  };
}

/**
 * Get a specific session by username (for Ghost Mode / multi-lens)
 */
export function getSpecificSession(username: string): Session | null {
  const session = sessionPool.find(
    (s) => s.username?.toLowerCase() === username.toLowerCase()
  );
  if (session) {
    session.pending++;
    return session;
  }
  return null;
}

/**
 * Get list of all available session usernames (lenses)
 */
export function getAvailableLenses(): string[] {
  return sessionPool
    .filter((s) => s.username && s.username.length > 0)
    .map((s) => s.username!);
}

