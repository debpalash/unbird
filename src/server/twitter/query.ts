// SPDX-License-Identifier: AGPL-3.0-only
// Ported from nitter/src/query.nim

import type { Query } from "../types";
import { QueryKind } from "../types";

export const validFilters = [
  "media",
  "images",
  "twimg",
  "videos",
  "native_video",
  "consumer_video",
  "spaces",
  "links",
  "news",
  "quote",
  "mentions",
  "replies",
  "retweets",
  "nativeretweets",
] as const;

export const emptyQueryParam = "include:nativeretweets";

/**
 * Initialize a Query from URL search params (ported from initQuery)
 */
export function initQuery(
  params: Record<string, string>,
  name = ""
): Query {
  const kind = parseQueryKind(params.f ?? "tweets");
  const query: Query = {
    kind,
    view: params.view ?? "",
    text: params.q ?? "",
    filters: validFilters.filter((f) => `f-${f}` in params),
    excludes: validFilters.filter((f) => `e-${f}` in params),
    includes: [],
    fromUser: name ? name.split(",") : [],
    since: params.since ?? "",
    until: params.until ?? "",
    minLikes: validateNumber(params.min_faves ?? ""),
    sep: "",
  };
  return query;
}

export function getMediaQuery(name: string): Query {
  return {
    kind: QueryKind.Media,
    view: "",
    text: "",
    filters: ["twimg", "native_video"],
    includes: [],
    excludes: [],
    fromUser: [name],
    since: "",
    until: "",
    minLikes: "",
    sep: "OR",
  };
}

export function getReplyQuery(name: string): Query {
  return {
    kind: QueryKind.Replies,
    view: "",
    text: "",
    filters: [],
    includes: [],
    excludes: [],
    fromUser: [name],
    since: "",
    until: "",
    minLikes: "",
    sep: "",
  };
}

/**
 * Generate the raw query parameter for X's search API (ported from genQueryParam)
 */
export function genQueryParam(query: Query, maxId = ""): string {
  if (query.kind === QueryKind.Users) {
    return query.text;
  }

  let param = "";

  // Build from-user clause
  if (query.fromUser.length > 0) {
    param = "(" + query.fromUser.map((u) => `from:${u}`).join(" OR ") + ")";
  }

  if (query.fromUser.length > 0 && (query.kind === QueryKind.Posts || query.kind === QueryKind.Media)) {
    param += " (filter:self_threads OR -filter:replies)";
  }

  if (!query.excludes.includes("nativeretweets")) {
    param += " include:nativeretweets";
  }

  // Build filters
  const filterParts: string[] = [];
  for (const f of query.filters) {
    filterParts.push(`filter:${f}`);
  }
  for (const e of query.excludes) {
    if (e === "nativeretweets") continue;
    filterParts.push(`-filter:${e}`);
  }
  for (const i of query.includes) {
    filterParts.push(`include:${i}`);
  }

  let result: string;
  if (filterParts.length > 0) {
    const sep = query.sep || " ";
    result = `${param} (${filterParts.join(` ${sep} `)})`.trim();
  } else {
    result = param.trim();
  }

  if (query.since) result += ` since:${query.since}`;
  if (query.until && !maxId) result += ` until:${query.until}`;
  if (query.minLikes) result += ` min_faves:${query.minLikes}`;

  if (query.text) {
    result = result ? `${result} ${query.text}` : query.text;
  }

  if (result && maxId) {
    result += ` max_id:${maxId}`;
  }

  return result;
}

/**
 * Generate query URL params for UI navigation (ported from genQueryUrl)
 */
export function genQueryUrl(query: Query): string {
  const params: string[] = [];

  if (query.view) {
    params.push(`view=${encodeURIComponent(query.view)}`);
  }

  if (query.kind === QueryKind.Tweets || query.kind === QueryKind.Users) {
    params.push(`f=${query.kind}`);
    if (query.text) {
      params.push(`q=${encodeURIComponent(query.text)}`);
    }
    for (const f of query.filters) {
      params.push(`f-${f}=on`);
    }
    for (const e of query.excludes) {
      params.push(`e-${e}=on`);
    }
    for (const i of query.includes.filter((x) => x !== "nativeretweets")) {
      params.push(`i-${i}=on`);
    }
    if (query.since) params.push(`since=${query.since}`);
    if (query.until) params.push(`until=${query.until}`);
    if (query.minLikes) params.push(`min_faves=${query.minLikes}`);
  }

  return params.join("&");
}

// --- Helpers ---

function parseQueryKind(s: string): QueryKind {
  const map: Record<string, QueryKind> = {
    posts: QueryKind.Posts,
    replies: QueryKind.Replies,
    media: QueryKind.Media,
    users: QueryKind.Users,
    tweets: QueryKind.Tweets,
    userList: QueryKind.UserList,
  };
  return map[s] ?? QueryKind.Tweets;
}

function validateNumber(s: string): string {
  return /^\d+$/.test(s) ? s : "";
}
