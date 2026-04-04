export type TimelineTab = "" | "with_replies" | "media" | "search";

export const graphUserV2 = "WEoGnYB0EG1yGwamDCF6zg/UserResultByScreenNameQuery";
export const graphUserTweetsV2 = "6QdSuZ5feXxOadEdXa4XZg/UserWithProfileTweetsQueryV2";
export const graphUserTweetsAndRepliesV2 = "BDX77Xzqypdt11-mDfgdpQ/UserWithProfileTweetsAndRepliesQueryV2";
export const graphUserMediaV2 = "bp0e_WdXqgNBIwlLukzyYA/MediaTimelineV2";

const gqlFeaturesObject = {
  responsive_web_graphql_exclude_directive_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  rweb_lists_timeline_redesign_enabled: true,
  verified_phone_label_enabled: false,
};

export const gqlFeatures = JSON.stringify(gqlFeaturesObject);

export function userByScreenNameVars(screenName: string): string {
  return JSON.stringify({
    screen_name: screenName,
    withGrokTranslatedBio: false,
  });
}

export function timelineVars(restId: string, cursor = "", count = 20): string {
  const base: Record<string, string | number> = {
    rest_id: restId,
    count,
  };

  if (cursor) base.cursor = cursor;
  return JSON.stringify(base);
}

export function timelineEndpointFromTab(tab: TimelineTab): string {
  if (tab === "with_replies") return graphUserTweetsAndRepliesV2;
  if (tab === "media") return graphUserMediaV2;
  return graphUserTweetsV2;
}
