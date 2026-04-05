// SPDX-License-Identifier: AGPL-3.0-only
// Raw HTTP login to X/Twitter — uses wreq-js for Chrome TLS impersonation
// No browser, no Python, no Playwright. Runs natively on Bun.

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import wreq from "wreq-js";

const BEARER_TOKEN =
  "AAAAAAAAAAAAAAAAAAAAAFQODgEAAAAAVHTp76lzh3rFzcHbmHVvQxYYpTw%3DckAlMINMjmCwxUcaXbAN4XqJVdgMJaHqNOFgPMK0zN1qLqLQCF";
const BASE_URL = "https://api.x.com/1.1/onboarding/task.json";
const GUEST_URL = "https://api.x.com/1.1/guest/activate.json";

const SUBTASK_VERSIONS: Record<string, number> = {
  action_list: 2, alert_dialog: 1, app_download_cta: 1,
  check_logged_in_account: 2, choice_selection: 3,
  contacts_live_sync_permission_prompt: 0, cta: 7, email_verification: 2,
  end_flow: 1, enter_date: 1, enter_email: 2, enter_password: 5,
  enter_phone: 2, enter_recaptcha: 1, enter_text: 5, generic_urt: 3,
  in_app_notification: 1, interest_picker: 3, js_instrumentation: 1,
  menu_dialog: 1, notifications_permission_prompt: 2, open_account: 2,
  open_home_timeline: 1, open_link: 1, phone_verification: 4,
  privacy_options: 1, security_key: 3, select_avatar: 4,
  select_banner: 2, settings_list: 7, show_code: 1, sign_up: 2,
  sign_up_review: 4, tweet_selection_urt: 1, update_users: 1,
  upload_media: 1, user_recommendations_list: 4,
  user_recommendations_urt: 1, wait_spinner: 3, web_modal: 1,
};

export interface LoginResult {
  kind: "cookie";
  username: string;
  id: string | null;
  auth_token: string;
  ct0: string;
}

// --- TOTP via Web Crypto API (no dependencies needed) ---

async function generateTotp(base32Secret: string): Promise<string> {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = base32Secret.toUpperCase().replace(/=+$/, "");
  let bits = 0, val = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((val >> bits) & 0xff); }
  }

  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBuf = new Uint8Array(8);
  let tmp = counter;
  for (let i = 7; i >= 0; i--) { counterBuf[i] = tmp & 0xff; tmp = Math.floor(tmp / 256); }

  const key = await crypto.subtle.importKey(
    "raw", new Uint8Array(bytes), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBuf));
  const offset = sig[19]! & 0xf;
  const code = ((sig[offset]! & 0x7f) << 24 | sig[offset + 1]! << 16 | sig[offset + 2]! << 8 | sig[offset + 3]!) % 1_000_000;
  return String(code).padStart(6, "0");
}

function parseTotpSecret(raw?: string): string | undefined {
  if (!raw) return undefined;
  if (raw.startsWith("otpauth://")) {
    try { return new URL(raw).searchParams.get("secret") ?? undefined; } catch { return undefined; }
  }
  return raw;
}

function extractUserId(cookies: Record<string, string>): string | null {
  const twid = (cookies.twid ?? "").replace(/^"|"$/g, "");
  for (const prefix of ["u=", "u%3D"]) {
    if (twid.includes(prefix)) {
      return twid.split(prefix)[1]?.split("&")[0]?.replace(/"/g, "") ?? null;
    }
  }
  return null;
}

// --- wreq-js session flow ---

function makeHeaders(guestToken?: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${BEARER_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "*/*",
    "Accept-Language": "en-US",
    "X-Twitter-Client-Language": "en-US",
    Origin: "https://x.com",
    Referer: "https://x.com/",
  };
  if (guestToken) h["X-Guest-Token"] = guestToken;
  return h;
}

async function flowPost(
  session: any,
  url: string,
  body: any,
  headers: Record<string, string>,
  label: string,
): Promise<{ flowToken: string; data: any }> {
  console.log(`[x-login] ${label}...`);
  const res = await session.fetch(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });

  if (res.status >= 400) {
    const text = await res.text();
    throw new Error(`${label} failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json() as any;
  const flowToken = data.flow_token;
  if (!flowToken) throw new Error(`${label}: no flow_token in response`);
  return { flowToken, data };
}

// --- Public API ---

export async function loginWithCredentials(
  username: string,
  password: string,
  totpRaw?: string,
): Promise<LoginResult> {
  const totpSecret = parseTotpSecret(totpRaw);

  // Create a wreq session impersonating Chrome (bypasses Cloudflare TLS checks)
  const session = await wreq.createSession({ browser: "chrome_131" });

  // 1. Get guest token
  console.log("[x-login] getting guest token...");
  const guestRes = await session.fetch(GUEST_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
  });
  const guestData = await guestRes.json() as any;
  const guestToken: string = guestData.guest_token;
  if (!guestToken) throw new Error("Failed to get guest token");
  console.log(`[x-login] guest token: ${guestToken}`);

  const headers = makeHeaders(guestToken);

  // 2. Init login flow
  const { flowToken: ft1 } = await flowPost(
    session,
    `${BASE_URL}?flow_name=login`,
    {
      input_flow_data: {
        flow_context: { debug_overrides: {}, start_location: { location: "manual_link" } },
        subtask_versions: SUBTASK_VERSIONS,
      },
    },
    headers,
    "initializing login flow",
  );

  // 3. JS instrumentation
  const { flowToken: ft2 } = await flowPost(session, BASE_URL, {
    flow_token: ft1,
    subtask_inputs: [{
      subtask_id: "LoginJsInstrumentationSubtask",
      js_instrumentation: {
        response: JSON.stringify({
          rf: {
            a4fc506d24bb4843c48a1966940c2796bf4fb7617a2d515ad3297b7df6b459b6: 121,
            bff66e16f1d7ea28c04653dc32479cf416a9c8b67c80cb8ad533b2a44fee82a3: -1,
            ac4008077a7e6ca03210159dbe2134dea72a616f03832178314bb9931645e4f7: -22,
            c3a8a81a9b2706c6fec42c771da65a9597c537b8e4d9b39e8e58de9fe31ff239: -12,
          },
          s: "ZHYaDA9iXRxOl2J3AZ9cc23iJx-Fg5E82KIBA_fgeZFugZGYzRtf8Bl3EUeeYgsK30gLFD2jTQx9fAMsnYCw0j8ahEy4Pb5siM5zD6n7YgOeWmFFaXoTwaGY4H0o-jQnZi5yWZRAnFi4lVuCVouNz_xd2BO2sobCO7QuyOsOxQn2CWx7bjD8vPAzT5BS1mICqUWyjZDjLnRZJU6cSQG5YFIHEPBa8Kj-v1JFgkdAfAMIdVvP7C80HWoOqYivQR7IBuOAI4xCeLQEdxlGeT-JYStlP9dcU5St7jI6ExyMeQnRicOcxXLXsan8i5Joautk2M8dAJFByzBaG4wtrPhQ3QAAAZEi-_t7",
        }),
        link: "next_link",
      },
    }],
  }, headers, "JS instrumentation");

  // 4. Username
  const { flowToken: ft3, data: usernameData } = await flowPost(session, BASE_URL, {
    flow_token: ft2,
    subtask_inputs: [{
      subtask_id: "LoginEnterUserIdentifierSSO",
      settings_list: {
        setting_responses: [{ key: "user_identifier", response_data: { text_data: { result: username } } }],
        link: "next_link",
      },
    }],
  }, headers, "submitting username");

  // Check for denial CTA
  if (usernameData.subtasks?.[0]?.cta) {
    const msg = usernameData.subtasks[0].cta.primary_text?.text;
    if (msg) throw new Error(`Login denied: ${msg}`);
  }

  // 5. Password
  const { flowToken: ft4, data: pwData } = await flowPost(session, BASE_URL, {
    flow_token: ft3,
    subtask_inputs: [{ subtask_id: "LoginEnterPassword", enter_password: { password, link: "next_link" } }],
  }, headers, "submitting password");

  const needs2fa = (pwData.subtasks ?? []).some((s: any) => s.subtask_id === "LoginTwoFactorAuthChallenge");
  let ft5 = ft4;

  // 6. 2FA (if required)
  if (needs2fa) {
    if (!totpSecret) throw new Error("2FA required but no TOTP secret provided");
    const code = await generateTotp(totpSecret);
    console.log(`[x-login] submitting 2FA code...`);
    const { flowToken: ft6 } = await flowPost(session, BASE_URL, {
      flow_token: ft4,
      subtask_inputs: [{ subtask_id: "LoginTwoFactorAuthChallenge", enter_text: { text: code, link: "next_link" } }],
    }, headers, "2FA verification");
    ft5 = ft6;
  }

  // 7. Complete flow (AccountDuplicationCheck) — may 401, cookies already set
  try {
    const cookiesBeforeFinal = await session.getCookies("https://api.x.com") as Record<string, string>;
    const ct0BeforeFinal = cookiesBeforeFinal.ct0 ?? "";
    await flowPost(session, BASE_URL, {
      flow_token: ft5,
      subtask_inputs: [{ subtask_id: "AccountDuplicationCheck", check_logged_in_account: { link: "AccountDuplicationCheck_false" } }],
    }, { ...headers, "X-Twitter-Auth-Type": "OAuth2Session", "X-Csrf-Token": ct0BeforeFinal }, "completing login flow");
  } catch (e: any) {
    // 401 here is expected — cookies are already set after 2FA step
    if (!e.message.includes("401")) throw e;
  }

  // Extract cookies (getCookies(url) returns Record<string,string>)
  const cookies: Record<string, string> = await session.getCookies("https://api.x.com") ?? {};
  const authToken: string = cookies.auth_token ?? "";
  const ct0: string = cookies.ct0 ?? "";

  if (!authToken || !ct0) {
    throw new Error(`Login failed — no auth cookies received. Got keys: ${Object.keys(cookies).join(", ")}`);
  }

  const result: LoginResult = {
    kind: "cookie",
    username,
    id: extractUserId(cookies),
    auth_token: authToken,
    ct0,
  };

  console.log(`[x-login] ✅ authenticated as @${username} (id: ${result.id})`);
  await session.close();
  return result;
}

export async function loginAndSave(
  username: string,
  password: string,
  totpRaw?: string,
  outputPath = "session/sessions.jsonl",
): Promise<LoginResult> {
  const session = await loginWithCredentials(username, password, totpRaw);
  await mkdir(dirname(outputPath), { recursive: true });
  await appendFile(outputPath, JSON.stringify(session) + "\n", "utf8");
  console.log(`[x-login] session saved to ${outputPath}`);
  return session;
}

// CLI entry point: bun run src/server/sessions/login.ts <user> <pass> [totp] [--append path]
if (import.meta.main) {
  const args = process.argv.slice(2);
  const [username, password, totp] = args;
  const appendIdx = args.indexOf("--append");
  const outputPath = appendIdx >= 0 ? args[appendIdx + 1] : "session/sessions.jsonl";

  if (!username || !password) {
    console.error("Usage: bun run src/server/sessions/login.ts <username> <password> [totp_secret|otpauth_uri] [--append path]");
    process.exit(1);
  }

  loginAndSave(username, password, totp, outputPath)
    .then(() => process.exit(0))
    .catch((err) => { console.error(`[x-login] ❌ ${err.message}`); process.exit(1); });
}
