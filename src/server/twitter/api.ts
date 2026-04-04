// SPDX-License-Identifier: AGPL-3.0-only
// Twitter/X API functions — ported from nitter/src/api.nim

import type { Profile, Conversation, EditHistory, User, Result, Tweet, List, GalleryPhoto } from "../types";
import { emptyTweet } from "../types";
import { fetchJson, apiReq, fetchSyndicationJson } from "./client";
import {
  graphUser, graphUserV2, graphUserById,
  graphUserTweets, graphUserTweetsAndReplies, graphUserMedia,
  graphUserTweetsV2, graphUserTweetsAndRepliesV2, graphUserMediaV2,
  graphTweet, graphTweetDetail, graphTweetResult, graphTweetEditHistory,
  graphSearchTimeline,
  graphListById, graphListBySlug, graphListMembers, graphListTweets, graphPinnedTimelines, graphCommunityTweets,
  graphFollowing, graphFollowers,
  graphHomeLatestTimeline,
  graphBookmarks, graphCreateBookmark, queryIdCreateBookmark, graphDeleteBookmark, queryIdDeleteBookmark,
  graphLikes,
  graphNotifications,
  userTweetsVars, userTweetsAndRepliesVars, userMediaVars, followVars, homeTimelineVars,
  tweetVars, tweetDetailVars, tweetResultVars, tweetEditHistoryVars, restIdVars,
  userFieldToggles, tweetDetailFieldToggles, tweetResultFieldToggles, searchFieldToggles, mobileUserTweetsFeatures,
  gqlSearchFeatures, gqlNitterSearchFeatures,
  graphModernSearchTimeline,
  graphFavoriteTweet, queryIdFavoriteTweet,
  graphCreateRetweet, queryIdCreateRetweet,
  pinnedTimelinesFeatures,
} from "./consts";
import {
  parseGraphUser, parseGraphTimeline, parseGraphConversation,
  parseGraphSearch, parseGraphList, parseGraphTweetResult,
  parseGraphEditHistory, parseGraphPhotoRail, parseFollowList,
  parseHomeTimeline, parseSyndicationTweet, parsePinnedLists,
  parseBookmarksTimeline, parseNotificationsTimeline,
} from "./parser";

// --- User API ---

export async function getGraphUser(username: string): Promise<User> {
  const variables = JSON.stringify({ screen_name: username, withSafetyModeUserFields: true });
  const req = apiReq(graphUser, variables, userFieldToggles);
  const js = await fetchJson(req);
  return parseGraphUser(js?.data?.user?.result);
}

export async function getGraphUserById(userId: string): Promise<User> {
  const variables = JSON.stringify({ userId, withSafetyModeUserFields: true });
  const req = apiReq(graphUserById, variables, userFieldToggles);
  const js = await fetchJson(req);
  return parseGraphUser(js?.data?.user?.result);
}

// --- Timeline API ---

export async function getGraphUserTweets(
  userId: string,
  cursor = ""
): Promise<Profile> {
  const variables = userTweetsVars(userId, cursor);
  const req = apiReq(graphUserTweets, variables, mobileUserTweetsFeatures, gqlNitterSearchFeatures);
  const js = await fetchJson(req);
  return parseGraphTimeline(js, cursor);
}

export async function getGraphUserTweetsV2(
  userId: string,
  cursor = ""
): Promise<Profile> {
  const variables = restIdVars(userId, cursor, 20);
  const req = apiReq(graphUserTweetsV2, variables, mobileUserTweetsFeatures, gqlNitterSearchFeatures);
  const js = await fetchJson(req);
  return parseGraphTimeline(js, cursor);
}

export async function getGraphUserTweetsAndReplies(
  userId: string,
  cursor = ""
): Promise<Profile> {
  const variables = userTweetsAndRepliesVars(userId, cursor);
  const req = apiReq(graphUserTweetsAndReplies, variables, mobileUserTweetsFeatures, gqlNitterSearchFeatures);
  const js = await fetchJson(req);
  return parseGraphTimeline(js, cursor);
}

export async function getGraphUserMedia(
  userId: string,
  cursor = ""
): Promise<Profile> {
  const variables = userMediaVars(userId, cursor, 20);
  const req = apiReq(graphUserMedia, variables, mobileUserTweetsFeatures, gqlNitterSearchFeatures);
  const js = await fetchJson(req);
  return parseGraphTimeline(js, cursor);
}

// --- Tweet/Status API ---

export async function getGraphTweet(tweetId: string, cursor = ""): Promise<Conversation> {
  const variables = tweetVars(tweetId, cursor);
  const req = apiReq(graphTweet, variables);
  const js = await fetchJson(req);
  return parseGraphConversation(js, tweetId);
}

export async function getGraphTweetDetail(tweetId: string, cursor = ""): Promise<Conversation> {
  const variables = tweetDetailVars(tweetId, cursor);
  const req = apiReq(graphTweetDetail, variables, tweetDetailFieldToggles);
  const js = await fetchJson(req);
  return parseGraphConversation(js, tweetId);
}

export async function getGraphTweetResult(tweetId: string): Promise<Tweet> {
  const variables = tweetResultVars(tweetId);
  const req = apiReq(graphTweetResult, variables, tweetResultFieldToggles);
  const js = await fetchJson(req);
  return parseGraphTweetResult(js);
}

export async function getGraphTweetViaSyndication(tweetId: string): Promise<Tweet> {
  const js = await fetchSyndicationJson(tweetId);
  if (!js) return emptyTweet();
  console.log(`[api] syndication fallback got tweet ${tweetId}`);
  return parseSyndicationTweet(js);
}

export async function getGraphTweetEditHistory(tweetId: string): Promise<EditHistory> {
  const variables = tweetEditHistoryVars(tweetId);
  const req = apiReq(graphTweetEditHistory, variables);
  const js = await fetchJson(req);
  return parseGraphEditHistory(js, tweetId);
}

// --- Search API ---

export async function getGraphTweetSearch(query: string, cursor = ""): Promise<Result<Tweet[][]>> {
  const variables = JSON.stringify({
    rawQuery: query,
    ...(cursor ? { cursor } : {}),
    count: 20,
    query_source: "typedQuery",
    product: "Latest",
    withDownvotePerspective: false,
    withReactionsMetadata: false,
    withReactionsPerspective: false,
  });
  const req = apiReq(graphSearchTimeline, variables, "", gqlNitterSearchFeatures);
  const js = await fetchJson(req);
  return parseGraphSearch(js, cursor);
}

export async function getGraphUserSearch(query: string, cursor = ""): Promise<Result<User>> {
  const variables = JSON.stringify({
    rawQuery: query,
    ...(cursor ? { cursor } : {}),
    count: 20,
    query_source: "typedQuery",
    product: "People",
    withDownvotePerspective: false,
    withReactionsMetadata: false,
    withReactionsPerspective: false,
  });
  const req = apiReq(graphSearchTimeline, variables, "", gqlNitterSearchFeatures);
  const js = await fetchJson(req);
  return parseGraphSearch(js, cursor);
}

// --- List API ---

export async function getGraphListById(listId: string): Promise<List> {
  const variables = JSON.stringify({ listId });
  const req = apiReq(graphListById, variables);
  const js = await fetchJson(req);
  return parseGraphList(js);
}

export async function getGraphListBySlug(name: string, slug: string): Promise<List> {
  const variables = JSON.stringify({ screenName: name, listSlug: slug });
  const req = apiReq(graphListBySlug, variables);
  const js = await fetchJson(req);
  return parseGraphList(js);
}

export async function getGraphPinnedLists(): Promise<List[]> {
  const req = apiReq(graphPinnedTimelines, JSON.stringify({}), "", pinnedTimelinesFeatures);
  const js = await fetchJson(req);
  return parsePinnedLists(js);
}

export async function getGraphCommunityTweets(communityId: string, cursor = ""): Promise<Profile> {
  const variables = JSON.stringify({
    communityId,
    count: 20,
    ...(cursor ? { cursor } : {}),
    withCommunity: true,
  });
  const req = apiReq(graphCommunityTweets, variables, mobileUserTweetsFeatures, gqlNitterSearchFeatures);
  const js = await fetchJson(req);
  return parseGraphTimeline(js, cursor);
}

export async function getGraphListTweets(listId: string, cursor = ""): Promise<Profile> {
  const variables = restIdVars(listId, cursor, 20);
  const req = apiReq(graphListTweets, variables);
  const js = await fetchJson(req);
  return parseGraphTimeline(js, cursor);
}

export async function getGraphListMembers(listId: string, cursor = ""): Promise<Result<User>> {
  const variables = restIdVars(listId, cursor, 20);
  const req = apiReq(graphListMembers, variables);
  const js = await fetchJson(req);
  return parseGraphSearch(js, cursor);
}

// --- Following / Followers ---

export async function getGraphFollowing(userId: string, cursor = ""): Promise<{ users: User[]; nextCursor: string }> {
  const variables = followVars(userId, cursor);
  const req = apiReq(graphFollowing, variables, userFieldToggles);
  const js = await fetchJson(req);
  return parseFollowList(js);
}

export async function getGraphFollowers(userId: string, cursor = ""): Promise<{ users: User[]; nextCursor: string }> {
  const variables = followVars(userId, cursor);
  const req = apiReq(graphFollowers, variables, userFieldToggles);
  const js = await fetchJson(req);
  return parseFollowList(js);
}

/**
 * Fetch the authenticated user's home timeline.
 * Uses the HomeLatestTimeline endpoint — returns the full following feed in
 * a few cursor-paginated calls instead of one call per followed account.
 */
export async function getGraphHomeLatestTimeline(
  cursor = ""
): Promise<{ tweets: Tweet[]; nextCursor: string }> {
  const variables = homeTimelineVars(cursor);
  const req = apiReq(graphHomeLatestTimeline, variables, mobileUserTweetsFeatures, gqlNitterSearchFeatures);
  const js = await fetchJson(req);
  return parseHomeTimeline(js);
}

export async function getGraphPhotoRail(userId: string): Promise<GalleryPhoto[]> {
  const variables = userMediaVars(userId, "", 20);
  const req = apiReq(graphUserMedia, variables, mobileUserTweetsFeatures, gqlNitterSearchFeatures);
  const js = await fetchJson(req);
  return parseGraphPhotoRail(js);
}

// --- Mutations ---

export async function favoriteTweet(tweetId: string): Promise<boolean> {
  const req = { ...require("./client").apiMutation(graphFavoriteTweet, queryIdFavoriteTweet, { tweet_id: tweetId }) };
  const js = await fetchJson(req);
  return !js?.errors && js?.data?.favorite_tweet === "Done";
}

export async function createRetweet(tweetId: string): Promise<boolean> {
  const req = { ...require("./client").apiMutation(graphCreateRetweet, queryIdCreateRetweet, { tweet_id: tweetId, dark_request: false }) };
  const js = await fetchJson(req);
  return !js?.errors;
}

export async function followUser(userId: string): Promise<boolean> {
  const req = {
    oauth: { endpoint: "1.1/friendships/create.json", params: [["user_id", userId]] } as any,
    cookie: { endpoint: "1.1/friendships/create.json", params: [["user_id", userId]] } as any,
    method: "POST"
  };
  const js = await fetchJson(req);
  return !js?.errors;
}

export async function unfollowUser(userId: string): Promise<boolean> {
  const req = {
    oauth: { endpoint: "1.1/friendships/destroy.json", params: [["user_id", userId]] } as any,
    cookie: { endpoint: "1.1/friendships/destroy.json", params: [["user_id", userId]] } as any,
    method: "POST"
  };
  const js = await fetchJson(req);
  return !js?.errors;
}

// --- Bookmarks ---

export async function getGraphBookmarks(cursor = ""): Promise<{ tweets: Tweet[]; nextCursor: string }> {
  const variables = JSON.stringify({
    count: 20,
    includePromotedContent: false,
    ...(cursor ? { cursor } : {}),
  });
  const req = apiReq(graphBookmarks, variables, "", gqlNitterSearchFeatures);
  const js = await fetchJson(req);
  return parseBookmarksTimeline(js);
}

export async function createBookmark(tweetId: string): Promise<boolean> {
  const req = { ...require("./client").apiMutation(graphCreateBookmark, queryIdCreateBookmark, { tweet_id: tweetId }) };
  const js = await fetchJson(req);
  return !js?.errors;
}

export async function deleteBookmark(tweetId: string): Promise<boolean> {
  const req = { ...require("./client").apiMutation(graphDeleteBookmark, queryIdDeleteBookmark, { tweet_id: tweetId }) };
  const js = await fetchJson(req);
  return !js?.errors;
}

// --- Likes Timeline ---

export async function getGraphLikes(userId: string, cursor = ""): Promise<Profile> {
  const variables = JSON.stringify({
    userId,
    count: 20,
    includePromotedContent: false,
    withClientEventToken: false,
    withBirdwatchNotes: false,
    withVoice: true,
    ...(cursor ? { cursor } : {}),
  });
  const req = apiReq(graphLikes, variables, "", gqlNitterSearchFeatures);
  const js = await fetchJson(req);
  return parseGraphTimeline(js, cursor);
}

// --- Notifications ---

export async function getGraphNotifications(cursor = ""): Promise<{ notifications: any[]; nextCursor: string }> {
  const variables = JSON.stringify({
    timeline_type: "All",
    count: 40,
    ...(cursor ? { cursor } : {}),
  });
  const req = apiReq(graphNotifications, variables, "", gqlNitterSearchFeatures);
  const js = await fetchJson(req);
  return parseNotificationsTimeline(js);
}
