// SPDX-License-Identifier: AGPL-3.0-only
// Ported from nitter/src/formatters.nim

import type { User, Tweet, Video, Config, Query } from "../types";
import { QueryKind } from "../types";
import { genQueryParam } from "./query";

const twitterBaseUrl = "https://x.com";

// --- URL helpers ---

export function getUrlPrefix(cfg: Config): string {
  return cfg.useHttps ? `https://${cfg.hostname}` : `http://${cfg.hostname}`;
}

export function shorten(text: string, length = 28): string {
  return text.length > length ? text.slice(0, length) + "…" : text;
}

export function shortLink(text: string, length = 28): string {
  return shorten(text.replace(/^https?:\/\/(www\d?\.)?\s*/i, ""), length);
}

export function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

// --- User Picture ---

export function getUserPic(userPic: string, style = ""): string {
  return userPic
    .replace(/_(normal|bigger|mini|200x200|400x400)(\.[A-Za-z]+)$/, "$2")
    .replace(/(\.[A-Za-z]+)$/, `${style}$1`);
}

export function getUserPicFromUser(user: User, style = ""): string {
  return getUserPic(user.userPic, style);
}

// --- Links ---

export function getVideoEmbed(cfg: Config, id: string): string {
  return `${getUrlPrefix(cfg)}/i/videos/${id}`;
}

export function pageTitle(user: User): string {
  return `${user.fullname} (@${user.username})`;
}

export function pageTitleTweet(tweet: Tweet): string {
  return `${pageTitle(tweet.user)}: "${stripHtml(tweet.text)}"`;
}

export function pageDesc(user: User): string {
  return user.bio ? stripHtml(user.bio) : `The latest tweets from ${user.fullname}`;
}

// --- Date Formatting ---

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const shortMonths = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function getJoinDate(user: User): string {
  const d = new Date(user.joinDate);
  return `Joined ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function getJoinDateFull(user: User): string {
  const d = new Date(user.joinDate);
  const hour = d.getUTCHours() % 12 || 12;
  const ampm = d.getUTCHours() >= 12 ? "PM" : "AM";
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hour}:${min} ${ampm} - ${d.getUTCDate()} ${shortMonths[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function getTime(tweet: Tweet): string {
  const d = new Date(tweet.time);
  const hour = d.getUTCHours() % 12 || 12;
  const ampm = d.getUTCHours() >= 12 ? "PM" : "AM";
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${shortMonths[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} · ${hour}:${min} ${ampm} UTC`;
}

export function getShortTime(tweet: Tweet): string {
  const now = new Date();
  const tweetDate = new Date(tweet.time);
  const diffMs = now.getTime() - tweetDate.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (now.getFullYear() !== tweetDate.getFullYear()) {
    return `${tweetDate.getDate()} ${shortMonths[tweetDate.getMonth()]} ${tweetDate.getFullYear()}`;
  }
  if (diffDays >= 1) {
    return `${shortMonths[tweetDate.getMonth()]} ${tweetDate.getDate()}`;
  }
  if (diffHours >= 1) return `${diffHours}h`;
  if (diffMins >= 1) return `${diffMins}m`;
  if (diffSecs > 1) return `${diffSecs}s`;
  return "now";
}

export function getDuration(video: Video): string {
  const sec = Math.round(video.durationMs / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  if (hour > 0) {
    return `${hour}:${String(min % 60).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  }
  return `${min % 60}:${String(sec % 60).padStart(2, "0")}`;
}

// --- Tweet Links ---

export function getLink(tweet: Tweet, focus = true): string {
  if (!tweet.id) return "";
  const username = tweet.user.username || "i";
  return `/${username}/status/${tweet.id}${focus ? "#m" : ""}`;
}

export function getLinkById(id: string, username = "i", focus = true): string {
  return `/${username}/status/${id}${focus ? "#m" : ""}`;
}

export function getTwitterLink(path: string, params: Record<string, string>): string {
  const username = params.name ?? "";
  if (!path.includes("/search") && !username.includes(",")) {
    return `${twitterBaseUrl}${path}`;
  }

  const query: Partial<{ fromUser: string[]; text: string; kind: QueryKind }> = {};
  if (username.includes(",")) {
    query.fromUser = username.split(",");
  }

  const searchParams = new URLSearchParams({
    f: query.kind === QueryKind.Users ? "user" : "live",
    q: genQueryParam({
      kind: QueryKind.Tweets,
      view: "",
      text: params.q ?? "",
      filters: [],
      includes: [],
      excludes: [],
      fromUser: query.fromUser ?? [],
      since: "",
      until: "",
      minLikes: "",
      sep: "",
    }),
    src: "typed_query",
  });

  return `${twitterBaseUrl}/search?${searchParams.toString()}`;
}

// --- Location ---

export function getLocation(entity: { location: string }): [string, string] {
  if (entity.location.includes("://")) return [entity.location, ""];
  const parts = entity.location.split(":");
  const url = parts.length > 1 ? `/search?f=tweets&q=place:${parts[1]}` : "";
  return [parts[0] ?? "", url];
}

export function getSuspended(username: string): string {
  return `User "${username}" has been suspended`;
}

// --- Number Formatting ---

export function insertSep(num: number): string {
  return num.toLocaleString("en-US");
}

export function formatStat(stat: number): string {
  return stat > 0 ? insertSep(stat) : "";
}

// --- Image URL helpers ---

export function getPicUrl(url: string): string {
  if (!url) return "";
  const target = url.startsWith("http") ? url : `https://pbs.twimg.com/${url}`;
  return `/api/image?url=${encodeURIComponent(target)}`;
}

export function getSmallPic(url: string): string {
  if (url.includes("?format=")) return url;
  return `${url}?format=webp&name=small`;
}

export function getMediumPic(url: string): string {
  if (url.includes("?format=")) return url;
  return `${url}?format=webp&name=medium`;
}

export function getOrigPicUrl(url: string): string {
  if (url.includes("?format=")) return url.replace(/name=\w+/, "name=orig");
  return `${url}?format=png&name=orig`;
}

export function getVidUrl(url: string): string {
  return `/vid/${encodeURIComponent(url)}`;
}

// --- Tab Classes ---

export function getTabClass(query: Query, kind: QueryKind): string {
  return query.kind === kind ? "tab-item active" : "tab-item";
}
