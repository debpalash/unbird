// SPDX-License-Identifier: AGPL-3.0-only
// Session manager — auto-login on startup, health checks, reload

import { readFile, appendFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { initSessionPool, getSessionPoolHealth, getSessionPoolSize, requestSessionCtx } from "./pool";
import { loginWithCredentials, type LoginResult } from "./login";

const SESSION_FILE = process.env.SESSION_FILE_PATH ?? "session/sessions.jsonl";
const ACC_FILE = process.env.ACC_FILE_PATH ?? "session/acc.txt";
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let checkTimer: ReturnType<typeof setInterval> | null = null;

// --- Credential parsing ---

interface Credentials {
  username: string;
  password: string;
  totp?: string;
}

function parseAccFile(content: string): Credentials[] {
  const lines = content.trim().split("\n").filter(Boolean);
  const creds: Partial<Credentials> = {};
  let totp: string | undefined;

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("otpauth://") || (/^[A-Z2-7]+=*$/.test(t) && t.length >= 16)) {
      totp = t;
    } else if (t.startsWith("username:")) {
      creds.username = t.slice("username:".length).trim();
    } else if (t.startsWith("pass:")) {
      creds.password = t.slice("pass:".length).trim();
    }
  }

  if (creds.username && creds.password) {
    return [{ username: creds.username, password: creds.password, totp }];
  }

  return [];
}

async function loadCredentials(): Promise<Credentials[]> {
  const accounts: Credentials[] = [];

  // From acc.txt
  if (existsSync(ACC_FILE)) {
    const content = await readFile(ACC_FILE, "utf8");
    accounts.push(...parseAccFile(content));
  }

  // From env vars
  const u = process.env.X_USERNAME;
  const p = process.env.X_PASSWORD;
  if (u && p) {
    accounts.push({
      username: u,
      password: p,
      totp: process.env.X_TOTP_SECRET ?? process.env.X_TOTP_URI,
    });
  }

  return accounts;
}

// --- Session management ---

async function saveSession(session: LoginResult): Promise<void> {
  await mkdir(dirname(SESSION_FILE), { recursive: true });
  await appendFile(SESSION_FILE, JSON.stringify(session) + "\n", "utf8");
}

async function autoLogin(): Promise<void> {
  const creds = await loadCredentials();
  if (creds.length === 0) {
    console.warn("[session-mgr] no credentials in acc.txt or env vars — cannot auto-login");
    console.warn("[session-mgr] manually add sessions: POST /api/sessions/add { auth_token, ct0, username }");
    return;
  }

  for (const c of creds) {
    try {
      const session = await loginWithCredentials(c.username, c.password, c.totp);
      await saveSession(session);
      console.log(`[session-mgr] ✅ auto-logged in as @${c.username}`);
    } catch (e: any) {
      console.error(`[session-mgr] ❌ auto-login failed for @${c.username}: ${e.message}`);
    }
  }

  // Reload pool from file
  if (existsSync(SESSION_FILE)) {
    await initSessionPool(SESSION_FILE);
  }
}

function checkHealth(): void {
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

// --- Public API ---

export async function startSessionManager(): Promise<void> {
  console.log("[session-mgr] starting...");

  // Load existing sessions first
  if (existsSync(SESSION_FILE)) {
    await initSessionPool(SESSION_FILE);
    const size = getSessionPoolSize();
    console.log(`[session-mgr] loaded ${size} existing session(s)`);
  }

  // If no sessions, auto-login from credentials
  if (getSessionPoolSize() === 0) {
    await autoLogin();
  }

  const finalSize = getSessionPoolSize();
  console.log(`[session-mgr] ready with ${finalSize} session(s)`);

  // Periodic health checks
  checkTimer = setInterval(checkHealth, CHECK_INTERVAL_MS);
}

export async function addSessionFromCookies(
  authToken: string,
  ct0: string,
  username: string,
  id?: string,
): Promise<void> {
  const session: LoginResult = { kind: "cookie", username, id: id ?? null, auth_token: authToken, ct0 };
  await saveSession(session);
  if (existsSync(SESSION_FILE)) await initSessionPool(SESSION_FILE);
  console.log(`[session-mgr] ✅ added session for @${username}`);
}

export async function reloadSessions(): Promise<void> {
  if (existsSync(SESSION_FILE)) await initSessionPool(SESSION_FILE);
  console.log(`[session-mgr] reloaded: ${getSessionPoolSize()} session(s)`);
}

export function stopSessionManager(): void {
  if (checkTimer) { clearInterval(checkTimer); checkTimer = null; }
  console.log("[session-mgr] stopped");
}

/** Returns the id + username of the currently active session (prioritizing isolated Ghost Mode). */
export async function getSessionAccountInfo(strict: boolean = false): Promise<{ id: string; username: string } | null> {
  // 1. Check isolated Ghost Mode context first
  const ctxSession = requestSessionCtx.getStore();
  if (ctxSession && ctxSession.username) {
    return { id: String(ctxSession.id || ""), username: ctxSession.username };
  }

  if (strict) return null;

  // 2. Fall back to global sessions.jsonl
  if (!existsSync(SESSION_FILE)) return null;
  const lines = (await readFile(SESSION_FILE, "utf8")).trim().split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      const s = JSON.parse(line) as { id?: string; username?: string };
      if (s.id && s.username) return { id: s.id, username: s.username };
    } catch { /* skip malformed */ }
  }
  return null;
}
