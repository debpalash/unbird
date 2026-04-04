export type CookieSession = {
  kind: "cookie";
  username: string;
  id: string | null;
  auth_token: string;
  ct0: string;
};

export function buildCookieHeader(session: CookieSession): string {
  return `auth_token=${session.auth_token}; ct0=${session.ct0}`;
}
