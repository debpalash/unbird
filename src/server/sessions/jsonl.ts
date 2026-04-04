import { readFile } from "node:fs/promises";
import type { CookieSession } from "./types";

function parseCookieSession(line: string): CookieSession | null {
  if (!line.trim()) return null;

  const parsed = JSON.parse(line) as Partial<CookieSession> & { kind?: string };
  if (parsed.kind !== "cookie") return null;

  if (!parsed.username || !parsed.auth_token || !parsed.ct0) {
    throw new Error("Invalid cookie session line: missing required fields");
  }

  return {
    kind: "cookie",
    username: parsed.username,
    id: parsed.id ?? null,
    auth_token: parsed.auth_token,
    ct0: parsed.ct0,
  };
}

export async function loadCookieSessions(path: string): Promise<CookieSession[]> {
  let raw = "";

  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read session file ${path}: ${message}`);
  }

  const sessions: CookieSession[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parsed = parseCookieSession(trimmed);
    if (parsed) sessions.push(parsed);
  }

  return sessions;
}

export async function pickCookieSession(path: string): Promise<CookieSession> {
  const sessions = await loadCookieSessions(path);

  if (sessions.length === 0) {
    throw new Error(`No cookie sessions found in ${path}`);
  }

  const index = Math.floor(Math.random() * sessions.length);
  return sessions[index]!;
}
