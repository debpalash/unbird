// SPDX-License-Identifier: AGPL-3.0-only
// Parser — ported from nitter/src/parser.nim + parserutils.nim
// Parses Twitter/X GraphQL responses into typed objects

import type {
  User, Tweet, TweetStats, Video, VideoVariant, Photo, Gif, Media,
  Card, Poll, GalleryPhoto, Chain, Conversation, EditHistory,
  Timeline, Profile, List, Result,
} from "../types";
import {
  VerifiedType, VideoType, MediaKind, CardKind, emptyUser, emptyTweet, emptyQuery,
} from "../types";

// --- JSON traversal helpers (replaces Nim's {..} accessor) ---

function jget(obj: any, ...keys: (string | number)[]): any {
  let current = obj;
  for (const key of keys) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[key];
  }
  return current;
}

function jstr(obj: any, ...keys: (string | number)[]): string {
  return String(jget(obj, ...keys) ?? "");
}

function jint(obj: any, ...keys: (string | number)[]): number {
  const v = jget(obj, ...keys);
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseInt(v, 10) || 0;
  return 0;
}

function jbool(obj: any, ...keys: (string | number)[]): boolean {
  return !!jget(obj, ...keys);
}

function select(...nodes: any[]): any {
  for (const n of nodes) {
    if (n != null && n !== undefined) return n;
  }
  return undefined;
}

function getTypeName(js: any): string {
  return jstr(js, "__typename") || jstr(js, "type");
}

function getEntryId(e: any): string {
  return jstr(e, "entryId") || jstr(e, "entry_id");
}

function getImageStr(val: any): string {
  if (typeof val !== "string") return "";
  return val.replace("https://", "").replace("pbs.twimg.com/", "");
}

function getId(val: any): string {
  if (val == null) return "";
  const s = String(val);
  const dashIdx = s.lastIndexOf("-");
  return dashIdx >= 0 ? s.slice(dashIdx + 1) : s;
}

export function getTweetResult(js: any, root = "content"): any {
  return select(
    jget(js, root, "content", "tweet_results", "result"),
    jget(js, root, "itemContent", "tweet_results", "result"),
    jget(js, root, "content", "tweetResult", "result")
  );
}

function getExpandedUrl(js: any, fallback = ""): string {
  return jstr(js, "expanded_url") || jstr(js, "url") || fallback;
}

function getMp4Resolution(url: string): number {
  const match = url.match(/\/vid\/\d+x(\d+)\//);
  return match ? parseInt(match[1]!, 10) : 0;
}

// --- User parser ---

function parseUser(js: any, id = ""): User {
  if (!js) return emptyUser();
  const user: User = {
    id: id || jstr(js, "id_str"),
    username: jstr(js, "screen_name"),
    fullname: jstr(js, "name"),
    location: jstr(js, "location"),
    website: "",
    bio: jstr(js, "description"),
    userPic: getImageStr(jstr(js, "profile_image_url_https")).replace("_normal", ""),
    banner: getBanner(js),
    pinnedTweet: 0,
    following: jint(js, "friends_count"),
    followers: jint(js, "followers_count"),
    tweets: jint(js, "statuses_count"),
    likes: jint(js, "favourites_count"),
    media: jint(js, "media_count"),
    verifiedType: VerifiedType.None,
    protected: jbool(js, "protected") || jbool(js, "privacy", "protected"),
    suspended: false,
    joinDate: parseTwitterDate(jstr(js, "created_at")),
    isFollowing: jbool(js, "following"),
  };
  if (jbool(js, "is_blue_verified")) user.verifiedType = VerifiedType.Blue;
  const vt = jstr(js, "verified_type");
  if (vt && vt in VerifiedType) user.verifiedType = vt as VerifiedType;
  const website = jget(js, "entities", "url", "urls", 0);
  if (website) user.website = getExpandedUrl(website);
  return user;
}

export function parseGraphUser(result: any): User {
  if (!result) return emptyUser();

  // Handle old nitter-style wrapping
  if (result.user_result?.result) result = result.user_result.result;
  else if (result.user_results?.result) result = result.user_results.result;

  const legacy = jget(result, "legacy") ?? {};
  const core = jget(result, "core") ?? {};  // new schema: name/screen_name here
  const profileBio = jget(result, "profile_bio") ?? {}; // new schema: description here
  const avatar = jget(result, "avatar") ?? {};

  // screen_name: core (new) → legacy (old)
  const screenName = jstr(core, "screen_name") || jstr(legacy, "screen_name");
  const fullname = jstr(core, "name") || jstr(legacy, "name");

  // description: profile_bio (new) → legacy (old)
  const bio = jstr(profileBio, "description") || jstr(legacy, "description");

  // profile picture: avatar.image_url (new) → legacy.profile_image_url_https (old)
  const rawPic = jstr(avatar, "image_url") || jstr(legacy, "profile_image_url_https");
  const userPic = getImageStr(rawPic).replace("_normal", "");

  const user: User = {
    id: jstr(result, "rest_id") || jstr(legacy, "id_str"),
    username: screenName,
    fullname,
    location: jstr(legacy, "location"),
    website: "",
    bio,
    userPic,
    banner: getBanner({ ...legacy, profile_banner_url: jstr(legacy, "profile_banner_url") }),
    pinnedTweet: 0,
    following: jint(legacy, "friends_count"),
    followers: jint(legacy, "followers_count"),
    tweets: jint(legacy, "statuses_count"),
    likes: jint(legacy, "favourites_count"),
    media: jint(legacy, "media_count"),
    verifiedType: VerifiedType.None,
    protected: jbool(legacy, "protected") || jbool(result, "privacy", "protected"),
    suspended: jstr(result, "__typename") === "UserUnavailable",
    joinDate: parseTwitterDate(jstr(core, "created_at") || jstr(legacy, "created_at")),
    isFollowing: jbool(legacy, "following") || jbool(result, "relationship_perspectives", "following"),
  };

  // Verified type
  if (jbool(result, "is_blue_verified") || jbool(result, "verification", "is_blue_verified")) {
    user.verifiedType = VerifiedType.Blue;
  }
  const vt = jstr(legacy, "verified_type");
  if (vt && vt in VerifiedType) user.verifiedType = vt as VerifiedType;

  // Website from entities
  const website = select(
    jget(profileBio, "entities", "urls", 0),
    jget(legacy, "entities", "url", "urls", 0)
  );
  if (website) user.website = getExpandedUrl(website);

  return user;
}


// --- Video parser ---

function parseVideoVariants(variants: any[]): VideoVariant[] {
  if (!Array.isArray(variants)) return [];
  return variants.map((v) => ({
    contentType: (jstr(v, "content_type") || "video/mp4") as VideoType,
    bitrate: jint(v, "bit_rate") || jint(v, "bitrate"),
    url: jstr(v, "url"),
    resolution: jstr(v, "content_type") === VideoType.Mp4 ? getMp4Resolution(jstr(v, "url")) : 0,
  }));
}

function parseVideo(js: any): Video {
  const video: Video = {
    thumb: getImageStr(jstr(js, "media_url_https")),
    available: true,
    title: jstr(js, "ext_alt_text"),
    description: "",
    url: "",
    reason: "",
    durationMs: jint(js, "video_info", "duration_millis"),
    playbackType: VideoType.Mp4,
    variants: parseVideoVariants(jget(js, "video_info", "variants")),
  };
  const status = jstr(js, "ext_media_availability", "status");
  if (status && status.toLowerCase() !== "available") video.available = false;
  const addTitle = jstr(js, "additional_media_info", "title");
  if (addTitle) video.title = addTitle;
  const addDesc = jstr(js, "additional_media_info", "description");
  if (addDesc) video.description = addDesc;
  return video;
}

// --- Card parser ---

function parseCard(js: any, urls: any): Card {
  const vals = jget(js, "binding_values");
  if (!vals) return { kind: CardKind.Unknown, url: "", title: "", dest: "", text: "", image: "" };
  const name = jstr(js, "name");
  const kindStr = name.includes(":") ? name.slice(name.indexOf(":") + 1) : name;
  const kind = (Object.values(CardKind).includes(kindStr as CardKind) ? kindStr : CardKind.Unknown) as CardKind;
  const card: Card = {
    kind,
    url: jstr(vals, "website_url", "string_value") || jstr(js, "url"),
    title: jstr(vals, "title", "string_value"),
    dest: jstr(vals, "vanity_url", "string_value") || jstr(vals, "domain"),
    text: jstr(vals, "description", "string_value"),
    image: "",
  };
  const imageTypes = ["summary_photo_image", "player_image", "promo_image", "photo_image_full_size", "thumbnail_image", "thumbnail", "event_thumbnail", "image"];
  for (const typ of imageTypes) {
    const img = jstr(vals, `${typ}_large`, "image_value", "url");
    if (img) { card.image = getImageStr(img); break; }
  }
  if (Array.isArray(urls)) {
    for (const u of urls) {
      if (jstr(u, "url") === card.url) { card.url = getExpandedUrl(u, card.url); break; }
    }
  }
  return card;
}

// --- Poll parser ---

function parsePoll(js: any): Poll {
  const vals = jget(js, "binding_values");
  const name = jstr(js, "name");
  const numChoices = parseInt(name[4] ?? "2", 10);
  const poll: Poll = { options: [], values: [], votes: 0, leader: 0, status: "" };
  for (let i = 1; i <= numChoices; i++) {
    poll.values.push(parseInt(jstr(vals, `choice${i}_count`, "string_value") || "0", 10));
    poll.options.push(jstr(vals, `choice${i}_label`, "string_value"));
  }
  const endTime = jstr(vals, "end_datetime_utc", "string_value");
  if (endTime) {
    const end = new Date(endTime);
    if (end > new Date()) {
      const diff = end.getTime() - Date.now();
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      poll.status = hours > 0 ? `${hours}h ${mins}m remaining` : `${mins}m remaining`;
    } else {
      poll.status = "Final results";
    }
  }
  poll.votes = poll.values.reduce((a, b) => a + b, 0);
  poll.leader = poll.values.indexOf(Math.max(...poll.values));
  return poll;
}

// --- Tweet parser ---

function parseTweet(js: any, jsCard?: any, replyId = ""): Tweet {
  if (!js) return emptyTweet();
  const timeStr = jstr(js, "created_at");
  const timeMs = jint(js, "created_at_ms");
  const tweet: Tweet = {
    id: getId(jget(js, "id_str")),
    threadId: getId(jget(js, "conversation_id_str")),
    replyId: getId(jget(js, "in_reply_to_status_id_str")) || replyId,
    text: jstr(js, "full_text"),
    time: timeStr ? parseTwitterDate(timeStr) : timeMs ? new Date(timeMs) : new Date(),
    hasThread: !!jget(js, "self_thread"),
    available: true,
    user: { ...emptyUser(), id: jstr(js, "user_id_str") },
    reply: [], pinned: false, tombstone: "", location: "", source: "",
    stats: { replies: jint(js, "reply_count"), retweets: jint(js, "retweet_count"), likes: jint(js, "favorite_count"), views: jint(js, "views_count") },
    mediaTags: [], media: [], history: [], note: "", isAd: false, isAI: false,
  };
  if (tweet.hasThread && !tweet.threadId) tweet.threadId = getId(jget(js, "self_thread", "id_str"));
  if (jget(js, "retweeted_status")) tweet.retweet = emptyTweet();
  else if (jbool(js, "is_quote_status")) tweet.quote = { ...emptyTweet(), id: getId(jget(js, "quoted_status_id_str")) };
  const rtId = jget(js, "retweeted_status_id_str");
  if (rtId) { tweet.retweet = { ...emptyTweet(), id: getId(rtId) }; return tweet; }
  if (jsCard) {
    const cardName = jstr(jsCard, "name");
    if (cardName.includes("poll")) tweet.poll = parsePoll(jsCard);
    else if (cardName !== "amplify") tweet.card = parseCard(jsCard, jget(js, "entities", "urls"));
  }
  const extMedia = jget(js, "extended_entities", "media");
  if (Array.isArray(extMedia)) {
    for (const m of extMedia) {
      const typeName = jstr(m, "type");
      if (typeName === "photo") {
        tweet.media.push({ kind: MediaKind.Photo, photo: { url: getImageStr(jstr(m, "media_url_https")), altText: jstr(m, "ext_alt_text") } });
      } else if (typeName === "video") {
        tweet.media.push({ kind: MediaKind.Video, video: parseVideo(m) });
      } else if (typeName === "animated_gif") {
        tweet.media.push({ kind: MediaKind.Gif, gif: { url: getImageStr(jstr(m, "video_info", "variants", 0, "url")), thumb: getImageStr(jstr(m, "media_url_https")), altText: jstr(m, "ext_alt_text") } });
      }
      const mediaUrl = jstr(m, "url");
      if (mediaUrl && tweet.text.endsWith(mediaUrl)) tweet.text = tweet.text.slice(0, -mediaUrl.length).trim();
    }
  }
  return tweet;
}

function parseGraphTweet(js: any): Tweet {
  if (!js) return emptyTweet();
  const typeName = getTypeName(js);
  if (typeName === "TweetUnavailable") return emptyTweet();
  if (typeName === "TweetTombstone") {
    const text = select(jget(js, "tombstone", "richText", "text"), jget(js, "tombstone", "text", "text"));
    return { ...emptyTweet(), text: String(text ?? "").replace(/ Learn more$/, "") };
  }
  if (typeName === "TweetPreviewDisplay") return { ...emptyTweet(), text: "This tweet is only available to subscribers." };
  if (typeName === "TweetWithVisibilityResults") return parseGraphTweet(jget(js, "tweet"));
  if (!jget(js, "legacy") && !jget(js, "rest_id")) return emptyTweet();

  let jsCard = select(jget(js, "card"), jget(js, "tweet_card"), jget(js, "legacy", "tweet_card"));
  if (jsCard) {
    const legacyCard = jget(jsCard, "legacy");
    if (legacyCard) {
      const bindingArray = jget(legacyCard, "binding_values");
      if (Array.isArray(bindingArray)) {
        const bindingObj: Record<string, any> = {};
        for (const item of bindingArray) bindingObj[jstr(item, "key")] = jget(item, "value");
        jsCard = { name: jget(legacyCard, "name"), url: jget(legacyCard, "url"), binding_values: bindingObj };
      }
    }
  }

  const rtResult = select(jget(js, "retweeted_status_result", "result"), jget(js, "repostedStatusResults", "result"));
  if (rtResult && jget(rtResult, "legacy")) {
    const tweet = parseTweet(jget(js, "legacy"), jsCard);
    tweet.id = getId(jget(js, "rest_id"));
    tweet.user = parseGraphUser(jget(js, "core"));
    tweet.retweet = parseGraphTweet(rtResult);
    return tweet;
  }

  let tweet: Tweet;
  const replyId = getId(jget(js, "reply_to_results", "rest_id"));
  if (jget(js, "details")) {
    tweet = { ...emptyTweet(), id: getId(jget(js, "rest_id")), available: true, text: jstr(js, "details", "full_text"), time: new Date(jint(js, "details", "created_at_ms")), replyId, isAd: jbool(js, "content_disclosure", "advertising_disclosure", "is_paid_promotion"), isAI: jbool(js, "content_disclosure", "ai_generated_disclosure", "has_ai_generated_media"), stats: { replies: jint(js, "counts", "reply_count"), retweets: jint(js, "counts", "retweet_count"), likes: jint(js, "counts", "favorite_count"), views: 0 } };
  } else {
    tweet = parseTweet(jget(js, "legacy"), jsCard, replyId);
    tweet.id = getId(jget(js, "rest_id"));
  }

  tweet.user = parseGraphUser(jget(js, "core"));
  if (tweet.reply.length === 0) {
    const replyToUser = jstr(js, "reply_to_user_results", "result", "core", "screen_name");
    if (replyToUser) tweet.reply = [replyToUser];
  }
  const viewCount = jstr(js, "views", "count");
  if (viewCount) tweet.stats.views = parseInt(viewCount, 10) || 0;
  const noteText = jstr(js, "note_tweet", "note_tweet_results", "result", "text");
  if (noteText) tweet.text = noteText;
  parseMediaEntities(js, tweet);
  const quoted = select(jget(js, "quoted_status_result", "result"), jget(js, "quotedPostResults", "result"));
  if (quoted) tweet.quote = parseGraphTweet(quoted);
  else if (!tweet.quote) {
    const qId = getId(jget(js, "legacy", "quoted_status_id_str"));
    if (qId) tweet.quote = { ...emptyTweet(), id: qId };
  }
  const editIds = jget(js, "edit_control", "edit_control_initial", "edit_tweet_ids");
  if (Array.isArray(editIds)) tweet.history = editIds.map((id: any) => String(id));
  const birdwatch = jget(js, "birdwatch_pivot");
  if (birdwatch) tweet.note = jstr(birdwatch, "subtitle", "text");
  return tweet;
}

// --- Media entities (new format) ---

function parseMediaEntities(js: any, tweet: Tweet): void {
  const mediaEntities = jget(js, "media_entities");
  if (!Array.isArray(mediaEntities) || mediaEntities.length === 0) return;
  const parsed: Media[] = [];
  for (const entity of mediaEntities) {
    const mediaInfo = jget(entity, "media_results", "result", "media_info");
    if (!mediaInfo) continue;
    const typeName = getTypeName(mediaInfo);
    if (typeName === "ApiImage") {
      parsed.push({ kind: MediaKind.Photo, photo: { url: getImageStr(jstr(mediaInfo, "original_img_url")), altText: jstr(mediaInfo, "alt_text") } });
    } else if (typeName === "ApiVideo") {
      const status = jstr(entity, "media_results", "result", "media_availability_v2", "status");
      parsed.push({ kind: MediaKind.Video, video: { available: status === "Available", thumb: getImageStr(jstr(mediaInfo, "preview_image", "original_img_url")), title: jstr(mediaInfo, "alt_text"), description: "", url: "", reason: "", durationMs: jint(mediaInfo, "duration_millis"), playbackType: VideoType.Mp4, variants: parseVideoVariants(jget(mediaInfo, "variants")) } });
    } else if (typeName === "ApiGif") {
      parsed.push({ kind: MediaKind.Gif, gif: { url: getImageStr(jstr(mediaInfo, "variants", 0, "url")), thumb: getImageStr(jstr(mediaInfo, "preview_image", "original_img_url")), altText: jstr(mediaInfo, "alt_text") } });
    }
  }
  if (parsed.length > 0 && parsed.length === mediaEntities.length) tweet.media = parsed;
}

// --- Timeline / Conversation / List parsers ---

function parseGraphThread(js: any): { thread: Chain; self: boolean } {
  const thread: Chain = { content: [], hasMore: false, cursor: "" };
  let isSelf = false;
  const items = jget(js, "content", "items");
  if (!Array.isArray(items)) return { thread, self: isSelf };
  for (const t of items) {
    const entryId = getEntryId(t);
    if (entryId.includes("tweet-") && !entryId.includes("promoted")) {
      const tweetResult = getTweetResult(t, "item");
      if (tweetResult) {
        thread.content.push(parseGraphTweet(tweetResult));
        const displayType = select(jget(t, "item", "content", "tweet_display_type"), jget(t, "item", "itemContent", "tweetDisplayType"));
        if (String(displayType) === "SelfThread") isSelf = true;
      } else {
        thread.content.push({ ...emptyTweet(), id: getId(entryId) });
      }
    } else if (entryId.includes("cursor-showmore")) {
      thread.cursor = jstr(t, "item", "content", "value");
      thread.hasMore = true;
    }
  }
  return { thread, self: isSelf };
}

export function parseGraphTimeline(js: any, after = ""): Profile {
  const profile: Profile = { user: emptyUser(), photoRail: [], tweets: { content: [], top: "", bottom: "", beginning: !after, query: emptyQuery() } };
  const instructions = select(
    jget(js, "data", "list", "timeline_response", "timeline", "instructions"),
    jget(js, "data", "user", "result", "timeline", "timeline", "instructions"),
    jget(js, "data", "user_result", "result", "timeline_response", "timeline", "instructions"),
    jget(js, "data", "communityResults", "result", "community_timeline", "timeline", "instructions"),
    jget(js, "data", "communityResults", "result", "ranked_community_timeline", "timeline", "instructions")
  );
  if (!Array.isArray(instructions)) return profile;

  for (const i of instructions) {
    const moduleItems = jget(i, "moduleItems");
    if (Array.isArray(moduleItems)) {
      for (const item of moduleItems) {
        const tweetResult = getTweetResult(item, "item");
        if (tweetResult) {
          const tweet = parseGraphTweet(tweetResult);
          if (!tweet.available) tweet.id = getId(getEntryId(item));
          profile.tweets.content.push([tweet]);
        }
      }
      continue;
    }
    const entries = jget(i, "entries");
    if (Array.isArray(entries)) {
      for (const e of entries) {
        const entryId = getEntryId(e);
        if (entryId.includes("tweet") || entryId.startsWith("profile-grid")) {
          const tweets = extractTweetsFromEntry(e);
          if (tweets.length > 0) profile.tweets.content.push(tweets);
        } else if (entryId.includes("-conversation-") || entryId.startsWith("homeConversation")) {
          const { thread } = parseGraphThread(e);
          if (thread.content.length > 0) profile.tweets.content.push(thread.content);
        } else if (entryId.startsWith("cursor-bottom")) {
          profile.tweets.bottom = jstr(e, "content", "value");
        }
      }
    }
    if (!after && getTypeName(i) === "TimelinePinEntry") {
      const tweets = extractTweetsFromEntry(jget(i, "entry"));
      if (tweets.length > 0) { tweets[0]!.pinned = true; profile.pinned = tweets[0]; }
    }
  }
  return profile;
}

export function parseGraphConversation(js: any, tweetId: string): Conversation {
  const conv: Conversation = { tweet: emptyTweet(), before: { content: [], hasMore: false, cursor: "" }, after: { content: [], hasMore: false, cursor: "" }, replies: { content: [], top: "", bottom: "", beginning: true, query: emptyQuery() } };
  const instructions = select(
    jget(js, "data", "timelineResponse", "instructions"),
    jget(js, "data", "timeline_response", "instructions"),
    jget(js, "data", "threaded_conversation_with_injections_v2", "instructions")
  );
  if (!Array.isArray(instructions)) return conv;

  for (const i of instructions) {
    if (getTypeName(i) !== "TimelineAddEntries") continue;
    const entries = jget(i, "entries");
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      const entryId = getEntryId(e);
      if (entryId.startsWith("tweet-")) {
        const tweetResult = getTweetResult(e);
        if (tweetResult) {
          const tweet = parseGraphTweet(tweetResult);
          if (!tweet.available) tweet.id = getId(entryId);
          if (entryId.endsWith(tweetId)) conv.tweet = tweet;
          else conv.before.content.push(tweet);
        } else if (!entryId.endsWith(tweetId)) {
          conv.before.content.push({ ...emptyTweet(), id: getId(entryId) });
        }
      } else if (entryId.startsWith("conversationthread")) {
        const { thread, self } = parseGraphThread(e);
        if (self) conv.after = thread;
        else if (thread.content.length > 0) conv.replies.content.push(thread);
      } else if (entryId.startsWith("cursor-bottom")) {
        conv.replies.bottom = select(jstr(e, "content", "value"), jstr(e, "content", "content", "value"), jstr(e, "content", "itemContent", "value")) ?? "";
      }
    }
  }
  return conv;
}

export function parseGraphSearch<T>(js: any, after = ""): Result<any> {
  const result: Result<any> = { content: [], top: "", bottom: "", beginning: !after, query: emptyQuery() };
  const instructions = select(
    jget(js, "data", "search", "timeline_response", "timeline", "instructions"),
    jget(js, "data", "search_by_raw_query", "search_timeline", "timeline", "instructions")
  );
  if (!Array.isArray(instructions)) return result;
  for (const instruction of instructions) {
    const typ = getTypeName(instruction);
    if (typ === "TimelineAddEntries") {
      for (const e of jget(instruction, "entries") ?? []) {
        const entryId = getEntryId(e);
        if (entryId.includes("tweet")) {
          const tweetResult = getTweetResult(e);
          if (tweetResult) {
            const tweet = parseGraphTweet(tweetResult);
            if (!tweet.available) tweet.id = getId(entryId);
            result.content.push([tweet]);
          }
        } else if (entryId.startsWith("user")) {
          const userResult = jget(e, "content", "itemContent");
          if (userResult) result.content.push(parseGraphUser(userResult));
        }
        if (entryId.startsWith("cursor-bottom")) result.bottom = jstr(e, "content", "value");
      }
    } else if (typ === "TimelineReplaceEntry") {
      if (jstr(instruction, "entry_id_to_replace").startsWith("cursor-bottom")) {
        result.bottom = jstr(instruction, "entry", "content", "value");
      }
    }
  }
  return result;
}

export function parseGraphList(js: any): List {
  const list = select(jget(js, "data", "user_by_screen_name", "list"), jget(js, "data", "list"));
  if (!list) return { id: "", name: "", userId: "", username: "", description: "", members: 0, banner: "" };
  return {
    id: jstr(list, "id_str"), name: jstr(list, "name"),
    username: jstr(list, "user_results", "result", "legacy", "screen_name"),
    userId: jstr(list, "user_results", "result", "rest_id"),
    description: jstr(list, "description"), members: jint(list, "member_count"),
    banner: getImageStr(jstr(list, "custom_banner_media", "media_info", "original_img_url")),
  };
}

export function parsePinnedLists(js: any): List[] {
  const lists: List[] = [];
  const pinned = jget(js, "data", "pinned_timelines", "pinned_timelines") ?? [];
  for (const item of pinned) {
    const typename = jstr(item, "__typename");
    if (typename === "CommunityPinnedTimeline") {
      const community = jget(item, "community_results", "result");
      if (community) {
        lists.push({
          id: jstr(community, "id_str"),
          name: jstr(community, "name"),
          username: jstr(community, "admin_results", "result", "legacy", "screen_name") ||
                    jstr(community, "creator_results", "result", "legacy", "screen_name"),
          userId: jstr(community, "admin_results", "result", "rest_id") ||
                  jstr(community, "creator_results", "result", "rest_id"),
          description: jstr(community, "description"),
          members: jint(community, "member_count"),
          banner: getImageStr(jstr(community, "custom_banner_media", "media_info", "original_img_url")),
        });
      }
    } else if (typename === "ListPinnedTimeline") {
      const listObj = jget(item, "list");
      if (listObj) {
        lists.push({
          id: jstr(listObj, "id_str"),
          name: jstr(listObj, "name"),
          username: jstr(listObj, "user_results", "result", "legacy", "screen_name"),
          userId: jstr(listObj, "user_results", "result", "rest_id"),
          description: jstr(listObj, "description"),
          members: jint(listObj, "member_count"),
          banner: getImageStr(jstr(listObj, "custom_banner_media", "media_info", "original_img_url")),
        });
      }
    }
  }
  return lists;
}

export function parseFollowList(js: any): { users: User[]; nextCursor: string } {
  const users: User[] = [];
  let nextCursor = "";

  // The Following/Followers response lives at data.user.result.timeline.timeline
  const timeline = select(
    jget(js, "data", "user", "result", "timeline", "timeline"),
    jget(js, "data", "user1", "result", "timeline", "timeline"),
  );
  if (!timeline) return { users, nextCursor };

  const instructions: any[] = jget(timeline, "instructions") ?? [];
  for (const instruction of instructions) {
    if (jstr(instruction, "__typename") === "TimelineAddEntries" || instruction.entries) {
      for (const entry of (instruction.entries ?? [])) {
        const entryId: string = jstr(entry, "entryId");

        // Cursor entries
        if (entryId.startsWith("cursor-bottom") || entryId.startsWith("cursor-showMoreThreads")) {
          const cursorVal = jstr(entry, "content", "value") || jstr(entry, "content", "itemContent", "value");
          if (cursorVal) nextCursor = cursorVal;
          continue;
        }

        // User entries
        const userResult = select(
          jget(entry, "content", "itemContent", "user_results", "result"),
          jget(entry, "content", "content", "itemContent", "user_results", "result"),
        );
        if (userResult) {
          const user = parseGraphUser(userResult);
          if (user.id) users.push(user);
        }
      }
    }
  }

  return { users, nextCursor };
}


export function parseGraphTweetResult(js: any): Tweet {
  const tweetResult = select(
    jget(js, "data", "tweet_result", "result"),
    jget(js, "data", "tweetResult", "result")
  );
  return tweetResult ? parseGraphTweet(tweetResult) : emptyTweet();
}

/**
 * Parse a tweet from Twitter's syndication/embed API.
 * The syndication response has a simpler flat structure compared to GraphQL.
 */
export function parseSyndicationTweet(js: any): Tweet {
  if (!js || !js.id_str) return emptyTweet();

  const user: User = {
    id: js.user?.id_str ?? "",
    username: js.user?.screen_name ?? "",
    fullname: js.user?.name ?? "",
    location: "",
    website: "",
    bio: "",
    userPic: getImageStr(js.user?.profile_image_url_https ?? "").replace("_normal", ""),
    banner: "",
    pinnedTweet: 0,
    following: 0,
    followers: 0,
    tweets: 0,
    likes: 0,
    media: 0,
    verifiedType: js.user?.is_blue_verified ? VerifiedType.Blue
      : (js.user?.verified_type === "Business" ? VerifiedType.Business : VerifiedType.None),
    protected: false,
    suspended: false,
    joinDate: new Date(0),
  };

  const tweet: Tweet = {
    id: js.id_str ?? "",
    threadId: "",
    replyId: js.in_reply_to_status_id_str ?? "",
    text: js.text ?? "",
    time: js.created_at ? new Date(js.created_at) : new Date(),
    hasThread: false,
    available: true,
    user,
    reply: js.in_reply_to_screen_name ? [js.in_reply_to_screen_name] : [],
    pinned: false,
    tombstone: "",
    location: "",
    source: "",
    stats: {
      replies: js.conversation_count ?? 0,
      retweets: js.retweet_count ?? 0,
      likes: js.favorite_count ?? 0,
      views: 0,
    },
    mediaTags: [],
    media: [],
    history: [],
    note: "",
    isAd: false,
    isAI: false,
  };

  // Parse media from syndication format
  if (Array.isArray(js.mediaDetails)) {
    for (const m of js.mediaDetails) {
      if (m.type === "photo") {
        tweet.media.push({
          kind: MediaKind.Photo,
          photo: { url: getImageStr(m.media_url_https ?? ""), altText: m.ext_alt_text ?? "" },
        });
      } else if (m.type === "video") {
        tweet.media.push({
          kind: MediaKind.Video,
          video: parseVideo(m),
        });
      } else if (m.type === "animated_gif") {
        const gifUrl = m.video_info?.variants?.[0]?.url ?? "";
        tweet.media.push({
          kind: MediaKind.Gif,
          gif: { url: getImageStr(gifUrl), thumb: getImageStr(m.media_url_https ?? ""), altText: m.ext_alt_text ?? "" },
        });
      }
    }
  }

  // Parse quoted tweet
  if (js.quoted_tweet) {
    tweet.quote = parseSyndicationTweet(js.quoted_tweet);
  }

  return tweet;
}

export function parseGraphEditHistory(js: any, tweetId: string): EditHistory {
  const history: EditHistory = { latest: emptyTweet(), history: [] };
  const instructions = jget(js, "data", "tweet_result_by_rest_id", "result", "edit_history_timeline", "timeline", "instructions");
  if (!Array.isArray(instructions)) return history;
  for (const i of instructions) {
    if (getTypeName(i) !== "TimelineAddEntries") continue;
    for (const e of jget(i, "entries") ?? []) {
      const entryId = getEntryId(e);
      if (entryId === "latestTweet") {
        const items = jget(e, "content", "items");
        if (Array.isArray(items) && items[0]) {
          const tweetResult = getTweetResult(items[0], "item");
          if (tweetResult) history.latest = parseGraphTweet(tweetResult);
        }
      } else if (entryId === "staleTweets") {
        for (const item of jget(e, "content", "items") ?? []) {
          const tweetResult = getTweetResult(item, "item");
          if (tweetResult) history.history.push(parseGraphTweet(tweetResult));
        }
      }
    }
  }
  return history;
}

export function parseGraphPhotoRail(js: any): GalleryPhoto[] {
  const result: GalleryPhoto[] = [];
  const instructions = select(
    jget(js, "data", "user", "result", "timeline", "timeline", "instructions"),
    jget(js, "data", "user_result", "result", "timeline_response", "timeline", "instructions")
  );
  if (!Array.isArray(instructions)) return result;
  for (const i of instructions) {
    const moduleItems = jget(i, "moduleItems");
    if (Array.isArray(moduleItems)) {
      for (const item of moduleItems) {
        const tweetResult = getTweetResult(item, "item");
        if (tweetResult) {
          const t = parseGraphTweet(tweetResult);
          const photo = extractGalleryPhoto(t);
          if (photo.url) result.push(photo);
          if (result.length === 16) return result;
        }
      }
      continue;
    }
    if (getTypeName(i) !== "TimelineAddEntries") continue;
    for (const e of jget(i, "entries") ?? []) {
      const entryId = getEntryId(e);
      if (entryId.startsWith("tweet") || entryId.startsWith("profile-grid")) {
        for (const t of extractTweetsFromEntry(e)) {
          const photo = extractGalleryPhoto(t);
          if (photo.url) result.push(photo);
          if (result.length === 16) return result;
        }
      }
    }
  }
  return result;
}

// --- Helpers ---

function extractTweetsFromEntry(e: any): Tweet[] {
  const tweetResult = getTweetResult(e);
  if (tweetResult) {
    const tweet = parseGraphTweet(tweetResult);
    if (!tweet.available) tweet.id = getId(getEntryId(e));
    return [tweet];
  }
  const items = jget(e, "content", "items");
  if (!Array.isArray(items)) return [];
  const tweets: Tweet[] = [];
  for (const item of items) {
    const tr = getTweetResult(item, "item");
    if (tr) {
      const tweet = parseGraphTweet(tr);
      if (!tweet.available) tweet.id = getId(getEntryId(item));
      tweets.push(tweet);
    }
  }
  return tweets;
}

function extractGalleryPhoto(t: Tweet): GalleryPhoto {
  let url = "";
  if (t.media.length > 0) {
    const first = t.media[0]!;
    if (first.kind === MediaKind.Photo) url = first.photo.url;
    else if (first.kind === MediaKind.Video) url = first.video.thumb;
    else if (first.kind === MediaKind.Gif) url = first.gif.thumb;
  } else if (t.card) { url = t.card.image; }
  return { url, tweetId: String(t.id), color: "" };
}

function getBanner(js: any): string {
  const url = getImageStr(jstr(js, "profile_banner_url"));
  if (url) return url + "/1500x500";
  const color = jstr(js, "profile_link_color");
  if (color) return "#" + color;
  return "";
}

/**
 * Parse the HomeLatestTimeline / HomeTimeline GraphQL response.
 * The response lives at data.home.home_timeline_urt.instructions
 */
export function parseHomeTimeline(js: any): { tweets: Tweet[]; nextCursor: string } {
  const tweets: Tweet[] = [];
  let nextCursor = "";

  const instructions: any[] = (
    jget(js, "data", "home", "home_timeline_urt", "instructions") ??
    jget(js, "data", "home_timeline_by_home_id", "timeline", "instructions") ??
    []
  );

  for (const instruction of instructions) {
    const typ = getTypeName(instruction);
    if (typ === "TimelineAddEntries" || instruction.entries) {
      for (const entry of (instruction.entries ?? [])) {
        const entryId: string = jstr(entry, "entryId");

        if (entryId.startsWith("cursor-bottom") || entryId.startsWith("cursor-showMoreThreads")) {
          const val = jstr(entry, "content", "value") || jstr(entry, "content", "itemContent", "value");
          if (val) nextCursor = val;
          continue;
        }

        // Single tweet entry
        if (entryId.includes("tweet-")) {
          const tweetResult = getTweetResult(entry);
          if (tweetResult) {
            const tweet = parseGraphTweet(tweetResult);
            if (tweet.id) tweets.push(tweet);
          }
          continue;
        }

        // Threaded tweet module (e.g. home-conversation-*)
        const items: any[] = jget(entry, "content", "items") ?? [];
        for (const item of items) {
          const tweetResult = getTweetResult(item, "item");
          if (tweetResult) {
            const tweet = parseGraphTweet(tweetResult);
            if (tweet.id) tweets.push(tweet);
          }
        }
      }
    } else if (typ === "TimelineReplaceEntry") {
      const replaceEntryId = jstr(instruction, "entry_id_to_replace");
      if (replaceEntryId.startsWith("cursor-bottom")) {
        nextCursor = jstr(instruction, "entry", "content", "value");
      }
    }
  }

  return { tweets, nextCursor };
}

function parseTwitterDate(str: string): Date {
  if (!str) return new Date(0);
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

// --- Bookmarks Timeline Parser ---

export function parseBookmarksTimeline(js: any): { tweets: Tweet[]; nextCursor: string } {
  const tweets: Tweet[] = [];
  let nextCursor = "";

  const instructions: any[] = (
    jget(js, "data", "bookmark_timeline_v2", "timeline", "instructions") ??
    jget(js, "data", "bookmark_timeline", "timeline", "instructions") ??
    []
  );

  for (const instruction of instructions) {
    const typ = getTypeName(instruction);
    if (typ === "TimelineAddEntries" || instruction.entries) {
      for (const entry of (instruction.entries ?? [])) {
        const entryId: string = jstr(entry, "entryId");

        if (entryId.startsWith("cursor-bottom")) {
          const val = jstr(entry, "content", "value") || jstr(entry, "content", "itemContent", "value");
          if (val) nextCursor = val;
          continue;
        }

        if (entryId.includes("tweet")) {
          const tweetResult = getTweetResult(entry);
          if (tweetResult) {
            const tweet = parseGraphTweet(tweetResult);
            if (tweet.id) tweets.push(tweet);
          }
        }
      }
    }
  }

  return { tweets, nextCursor };
}

// --- Notifications Timeline Parser ---

export interface NotificationEntry {
  type: string; // "like" | "retweet" | "reply" | "mention" | "follow" | "quote" | "other"
  icon: string;
  message: string;
  users: User[];
  tweet: Tweet | null;
  time: Date;
  id: string;
}

export function parseNotificationsTimeline(js: any): { notifications: NotificationEntry[]; nextCursor: string } {
  const notifications: NotificationEntry[] = [];
  let nextCursor = "";

  const instructions: any[] = (
    jget(js, "data", "timeline_by_id", "timeline", "instructions") ??
    jget(js, "data", "timeline", "timeline", "instructions") ??
    []
  );

  // First pass: collect all users from globalObjects or inline user results
  for (const instruction of instructions) {
    const typ = getTypeName(instruction);
    if (typ === "TimelineAddEntries" || instruction.entries) {
      for (const entry of (instruction.entries ?? [])) {
        const entryId: string = jstr(entry, "entryId");

        if (entryId.startsWith("cursor-bottom")) {
          const val = jstr(entry, "content", "value") || jstr(entry, "content", "itemContent", "value");
          if (val) nextCursor = val;
          continue;
        }

        if (entryId.startsWith("notification-")) {
          const content = jget(entry, "content", "itemContent") ?? jget(entry, "content");
          const notifType = jstr(content, "notification_type") || jstr(content, "clientEventInfo", "element") || "other";

          // Extract users from the notification
          const userResults = jget(content, "tweet_results") ?? [];
          const users: User[] = [];
          const fromUsers = jget(content, "from_users") ?? [];
          if (Array.isArray(fromUsers)) {
            for (const fu of fromUsers) {
              const userResult = jget(fu, "user_results", "result");
              if (userResult) users.push(parseGraphUser(userResult));
            }
          }

          // Extract tweet if present
          let tweet: Tweet | null = null;
          const tweetResult = select(
            jget(content, "tweet", "tweet_results", "result"),
            jget(content, "targetObjects", 0, "tweet", "tweet_results", "result"),
            jget(content, "tweet_results", "result")
          );
          if (tweetResult) {
            tweet = parseGraphTweet(tweetResult);
          }

          // Determine notification type
          let type = "other";
          let icon = "🔔";
          const ntLower = notifType.toLowerCase();
          if (ntLower.includes("like") || ntLower.includes("favorite")) { type = "like"; icon = "❤️"; }
          else if (ntLower.includes("retweet")) { type = "retweet"; icon = "🔁"; }
          else if (ntLower.includes("reply")) { type = "reply"; icon = "💬"; }
          else if (ntLower.includes("mention")) { type = "mention"; icon = "📢"; }
          else if (ntLower.includes("follow")) { type = "follow"; icon = "👤"; }
          else if (ntLower.includes("quote")) { type = "quote"; icon = "🗨️"; }

          // Build message
          const userNames = users.slice(0, 3).map(u => u.fullname || u.username).join(", ");
          const extra = users.length > 3 ? ` and ${users.length - 3} others` : "";
          let message = `${userNames}${extra}`;
          if (type === "like") message += " liked your post";
          else if (type === "retweet") message += " reposted your post";
          else if (type === "reply") message += " replied to your post";
          else if (type === "mention") message += " mentioned you";
          else if (type === "follow") message += " followed you";
          else if (type === "quote") message += " quoted your post";
          else message += " interacted with you";

          notifications.push({
            type,
            icon,
            message,
            users,
            tweet,
            time: tweet?.time ?? new Date(),
            id: entryId,
          });
        }
      }
    }
  }

  return { notifications, nextCursor };
}
