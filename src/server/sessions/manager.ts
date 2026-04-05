// SPDX-License-Identifier: AGPL-3.0-only
// Session manager — Cloudflare KV adapter 

import { initSessionPool, getSessionPoolHealth, getSessionPoolSize, requestSessionCtx } from "./pool";

export async function saveSessionToKV(env: any, sessionData: any): Promise<void> {
  if (!env?.UNBIRD_SESSIONS) return;
  const existingStr = await env.UNBIRD_SESSIONS.get("sessions.jsonl");
  let newContent = JSON.stringify(sessionData) + "\n";
  if (existingStr) {
    // Avoid duplicates by simple username check
    const existingSessions = existingStr.split("\n").filter(Boolean);
    const existingParsed = existingSessions.map((l: string) => { try { return JSON.parse(l); } catch { return {}; }});
    if (!existingParsed.some((s: any) => s.username === sessionData.username)) {
      newContent = existingStr + "\n" + newContent;
    } else {
      // It exists, omit appending to avoid KV bloat.
      return;
    }
  }
  await env.UNBIRD_SESSIONS.put("sessions.jsonl", newContent);
}

export function checkHealth(): void {
  const size = getSessionPoolSize();
  if (size === 0) {
    console.warn("[session-mgr] ⚠ no sessions available");
    return;
  }
  const health = getSessionPoolHealth();
  const limited = health.sessions.limited;
  if (limited === size) {
    console.warn(`[session-mgr] ⚠ all ${size} sessions are rate-limited`);
  }
}

export async function startSessionManager(env: any): Promise<void> {
  await initSessionPool(env);
}

export async function addSessionFromCookies(
  env: any,
  authToken: string,
  ct0: string,
  username: string,
  id?: string,
): Promise<void> {
  const session = { kind: "cookie", username, id: id ?? null, auth_token: authToken, ct0 };
  await saveSessionToKV(env, session);
  await initSessionPool(env, true); // Force reload pool with new credential
  console.log(`[session-mgr] ✅ added session for @${username} to KV`);
}

export async function getSessionAccountInfo(env?: any, strict: boolean = false): Promise<{ id: string; username: string } | null> {
  const ctxSession = requestSessionCtx.getStore();
  if (ctxSession && ctxSession.username) {
    return { id: String(ctxSession.id || ""), username: ctxSession.username };
  }
  if (strict) return null;

  if (!env?.UNBIRD_SESSIONS) return null;
  const content = await env.UNBIRD_SESSIONS.get("sessions.jsonl");
  if (!content) return null;
  
  const lines = content.trim().split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      const s = JSON.parse(line) as { id?: string; username?: string };
      if (s.id && s.username) return { id: s.id, username: s.username };
    } catch { /* skip malformed */ }
  }
  return null;
}
