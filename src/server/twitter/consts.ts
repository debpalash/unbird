// SPDX-License-Identifier: AGPL-3.0-only
// Ported from nitter/src/consts.nim

// These are standard web constants extracted from active browser sessions
export const consumerKey = "3nVuSoBZnx6U4vzUxf5w";
export const consumerSecret = "Bcs59EFbbsdF5Sl9Ng71smgStWEGwXXKSjYvPVt7qys";
export const bearerToken =
  "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
export const bearerToken2 =
  "Bearer AAAAAAAAAAAAAAAAAAAAAFXzAwAAAAAAMHCxpeSDG1gLNLghVe8d74hl6k4%3DRUMF4xAQLsbeBhTSRrCiQpJtxoGWeyHrDb5te2jpGskWDFW82F";
export const androidHeaderString =
  "Bearer AAAAAAAAAAAAAAAAAAAAAFXzAwAAAAAAMHCxpeSDG1gLNLghVe8d74hl6k4%3DRUMF4xAQLsbeBhTSRrCiQpJtxoGWeyHrDb5te2jpGskWDFW82F";

// --- GraphQL Endpoints ---

export const graphUser = "ck5KkZ8t5cOmoLssopN99Q/UserByScreenName";
export const graphUserV2 = "WEoGnYB0EG1yGwamDCF6zg/UserResultByScreenNameQuery";
export const graphUserById = "VN33vKXrPT7p35DgNR27aw/UserResultByIdQuery";
export const graphUserTweetsV2 = "6QdSuZ5feXxOadEdXa4XZg/UserWithProfileTweetsQueryV2";
export const graphUserTweetsAndRepliesV2 =
  "BDX77Xzqypdt11-mDfgdpQ/UserWithProfileTweetsAndRepliesQueryV2";
export const graphUserTweets = "oRJs8SLCRNRbQzuZG93_oA/UserTweets";
export const graphUserTweetsAndReplies = "kkaJ0Mf34PZVarrxzLihjg/UserTweetsAndReplies";
export const graphUserMedia = "36oKqyQ7E_9CmtONGjJRsA/UserMedia";
export const graphUserMediaV2 = "bp0e_WdXqgNBIwlLukzyYA/MediaTimelineV2";
export const graphTweet = "b4pV7sWOe97RncwHcGESUA/ConversationTimeline";
export const graphTweetDetail = "iFEr5AcP121Og4wx9Yqo3w/TweetDetail";
export const graphTweetResult = "qxWQxcMLiTPcavz9Qy5hwQ/TweetResultByRestId";
export const graphTweetEditHistory = "upS9teTSG45aljmP9oTuXA/TweetEditHistory";
export const graphSearchTimeline = "bshMIjqDk8LTXTq4w91WKw/SearchTimeline";
export const graphModernSearchTimeline = "rkp6b4vtR9u7v3naGoOzUQ/SearchTimeline";
export const graphListById = "cIUpT1UjuGgl_oWiY7Snhg/ListByRestId";
export const graphListBySlug = "K6wihoTiTrzNzSF8y1aeKQ/ListBySlug";
export const graphListMembers = "fuVHh5-gFn8zDBBxb8wOMA/ListMembers";
export const graphListTweets = "VQf8_XQynI3WzH6xopOMMQ/ListTimeline";
export const graphPinnedTimelines = "U3t27PzyhYJkkyOOddrTEg/PinnedTimelines";
export const graphCommunityTweets = "HqlI54tLj-mLXuNIop3mGw/CommunityTweetsTimeline";
export const graphFollowing = "ntIPnH1WMBKW--4Tn1q71A/Following";
export const graphFollowers = "Enf9DNUZYiT037aersI5gg/Followers";
export const graphHomeTimeline = "SFxmNKWfN9ySJcXG_tjX8g/HomeTimeline";
export const graphHomeLatestTimeline = "SFxmNKWfN9ySJcXG_tjX8g/HomeLatestTimeline";

export const graphFavoriteTweet = "lI07N6Otwv1PhnEgXILM7A/FavoriteTweet";
export const queryIdFavoriteTweet = "lI07N6Otwv1PhnEgXILM7A";
export const graphCreateRetweet = "mbRO74GrOvSfRcJnlMapnQ/CreateRetweet";
export const queryIdCreateRetweet = "mbRO74GrOvSfRcJnlMapnQ";

// Bookmarks
export const graphBookmarks = "2neUNDqrrFzbLui8yallcQ/Bookmarks";
export const graphCreateBookmark = "aoDbu3RHznuiSkQ9aNM67Q/CreateBookmark";
export const queryIdCreateBookmark = "aoDbu3RHznuiSkQ9aNM67Q";
export const graphDeleteBookmark = "Wlmlj2-xzyS1GN3a6cj-mQ/DeleteBookmark";
export const queryIdDeleteBookmark = "Wlmlj2-xzyS1GN3a6cj-mQ";

// Likes Timeline
export const graphLikes = "lIDpu_NWL7_VhimGGt0o6A/Likes";

// Notifications
export const graphNotifications = "GquVPn-SKYxKLgLsRPpJ6g/NotificationsTimeline";

// --- GraphQL Features ---

export const gqlFeatures = JSON.stringify({
  rweb_video_screen_enabled: false,
  payments_enabled: false,
  rweb_xchat_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  responsive_web_grok_show_grok_translated_post: false,
  responsive_web_grok_analysis_button_from_backend: true,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_enhance_cards_enabled: false,
  responsive_web_profile_redirect_enabled: false,
  responsive_web_grok_annotations_enabled: false,
  content_disclosure_indicator_enabled: false,
  content_disclosure_ai_generated_indicator_enabled: false,
  responsive_web_grok_community_note_auto_translation_is_enabled: false,
  post_ctas_fetch_enabled: false,
});

export const gqlSearchFeatures = JSON.stringify({
  rweb_video_screen_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: false,
  rweb_tipjar_consumption_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: false,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  content_disclosure_indicator_enabled: false,
  content_disclosure_ai_generated_indicator_enabled: false,
  responsive_web_grok_show_grok_translated_post: false,
  responsive_web_grok_analysis_button_from_backend: true,
  post_ctas_fetch_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: false,
  responsive_web_enhance_cards_enabled: false,
});

export const gqlNitterSearchFeatures = JSON.stringify({
  android_ad_formats_media_component_render_overlay_enabled: false,
  android_graphql_skip_api_media_color_palette: false,
  android_professional_link_spotlight_display_enabled: false,
  articles_api_enabled: false,
  articles_preview_enabled: true,
  blue_business_profile_image_shape_enabled: false,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  commerce_android_shop_module_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  creator_subscriptions_subscription_count_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  grok_android_analyze_trend_fetch_enabled: false,
  grok_translations_community_note_auto_translation_is_enabled: false,
  grok_translations_community_note_translation_is_enabled: false,
  grok_translations_post_auto_translation_is_enabled: false,
  grok_translations_timeline_user_bio_auto_translation_is_enabled: false,
  hidden_profile_likes_enabled: false,
  highlights_tweets_tab_ui_enabled: false,
  immersive_video_status_linkable_timestamps: false,
  interactive_text_enabled: false,
  longform_notetweets_consumption_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  longform_notetweets_richtext_consumption_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  mobile_app_spotlight_module_enabled: false,
  payments_enabled: false,
  post_ctas_fetch_enabled: true,
  premium_content_api_read_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  profile_label_improvements_pcf_label_in_profile_enabled: false,
  responsive_web_edit_tweet_api_enabled: true,
  responsive_web_enhance_cards_enabled: false,
  responsive_web_graphql_exclude_directive_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_grok_analysis_button_from_backend: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: false,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_show_grok_translated_post: false,
  responsive_web_jetfuel_frame: true,
  responsive_web_media_download_video_enabled: false,
  responsive_web_profile_redirect_enabled: false,
  responsive_web_text_conversations_enabled: false,
  responsive_web_twitter_article_notes_tab_enabled: false,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  responsive_web_twitter_blue_verified_badge_is_enabled: true,
  rweb_lists_timeline_redesign_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  rweb_video_screen_enabled: false,
  rweb_video_timestamps_enabled: false,
  spaces_2022_h2_clipping: true,
  spaces_2022_h2_spaces_communities: true,
  standardized_nudges_misinfo: true,
  subscriptions_feature_can_gift_premium: false,
  subscriptions_verification_info_enabled: true,
  subscriptions_verification_info_is_identity_verified_enabled: false,
  subscriptions_verification_info_reason_enabled: true,
  subscriptions_verification_info_verified_since_enabled: true,
  super_follow_badge_privacy_enabled: false,
  super_follow_exclusive_tweet_notifications_enabled: false,
  super_follow_tweet_api_enabled: false,
  super_follow_user_api_enabled: false,
  tweet_awards_web_tipping_enabled: false,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  tweetypie_unmention_optimization_enabled: false,
  unified_cards_ad_metadata_container_dynamic_card_content_query_enabled: false,
  unified_cards_destination_url_params_enabled: false,
  verified_phone_label_enabled: false,
  vibe_api_enabled: false,
  view_counts_everywhere_api_enabled: true,
  hidden_profile_subscriptions_enabled: false
});

export const gqlModernSearchFeatures = JSON.stringify({
  rweb_video_screen_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  verified_phone_label_enabled: true,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: true,
  premium_content_api_read_enabled: true,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: true,
  responsive_web_grok_analyze_post_followups_enabled: true,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: true,
  content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true,
  post_ctas_fetch_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: true,
  responsive_web_enhance_cards_enabled: true
});

export const modernSearchFieldToggles = JSON.stringify({
  withPayments: false,
  withAuxiliaryUserLabels: false,
  withArticleRichContentState: false,
  withArticlePlainText: false,
  withArticleSummaryText: false,
  withArticleVoiceOver: false,
  withGrokAnalyze: false,
  withDisallowedReplyControls: false
});

// --- Variable Templates ---

export const tweetVars = (postId: string, cursor: string) =>
  JSON.stringify({
    postId,
    ...(cursor ? { cursor } : {}),
    includeHasBirdwatchNotes: false,
    includePromotedContent: false,
    withBirdwatchNotes: true,
    withVoice: false,
    withV2Timeline: true,
  });

export const tweetDetailVars = (focalTweetId: string, cursor: string) =>
  JSON.stringify({
    focalTweetId,
    ...(cursor ? { cursor } : {}),
    referrer: "profile",
    with_rux_injections: false,
    includePromotedContent: false,
    withCommunity: true,
    withQuickPromoteEligibilityTweetFields: false,
    withBirdwatchNotes: true,
    withVoice: true,
  });

export const tweetEditHistoryVars = (tweetId: string) =>
  JSON.stringify({
    tweetId,
    withQuickPromoteEligibilityTweetFields: true,
  });

export const tweetResultVars = (tweetId: string) =>
  JSON.stringify({
    tweetId,
    withCommunity: false,
    includePromotedContent: false,
    withVoice: false,
  });

export const restIdVars = (restId: string, cursor: string, count: number) =>
  JSON.stringify({
    rest_id: restId,
    ...(cursor ? { cursor } : {}),
    count,
  });

export const userMediaVars = (userId: string, cursor: string, count: number) =>
  JSON.stringify({
    userId,
    ...(cursor ? { cursor } : {}),
    count,
    includePromotedContent: false,
    withClientEventToken: false,
    withBirdwatchNotes: false,
    withVoice: true,
  });

export const followVars = (userId: string, cursor: string, count = 50) =>
  JSON.stringify({
    userId,
    count,
    ...(cursor ? { cursor } : {}),
    includePromotedContent: false,
  });

export const homeTimelineVars = (cursor = "", count = 40) =>
  JSON.stringify({
    count,
    ...(cursor ? { cursor } : {}),
    includePromotedContent: false,
    latestControlAvailable: true,
    requestContext: "launch",
    withCommunity: true,
    seenTweetIds: [],
  });

export const userTweetsVars = (userId: string, cursor: string) =>
  JSON.stringify({
    userId,
    ...(cursor ? { cursor } : {}),
    count: 20,
    includePromotedContent: false,
    withQuickPromoteEligibilityTweetFields: true,
    withVoice: true,
  });

export const userTweetsAndRepliesVars = (userId: string, cursor: string) =>
  JSON.stringify({
    userId,
    ...(cursor ? { cursor } : {}),
    count: 20,
    includePromotedContent: false,
    withCommunity: true,
    withVoice: true,
  });

export const userFieldToggles = JSON.stringify({
  withPayments: false,
  withAuxiliaryUserLabels: true,
});

export const mobileUserTweetsFeatures = JSON.stringify({
  withArticlePlainText: false,
});

export const pinnedTimelinesFeatures = JSON.stringify({"rweb_video_screen_enabled":true,"profile_label_improvements_pcf_label_in_post_enabled":true,"responsive_web_profile_redirect_enabled":true,"rweb_tipjar_consumption_enabled":true,"verified_phone_label_enabled":true,"creator_subscriptions_tweet_preview_api_enabled":true,"responsive_web_graphql_timeline_navigation_enabled":true,"responsive_web_graphql_skip_user_profile_image_extensions_enabled":false,"premium_content_api_read_enabled":false,"communities_web_enable_tweet_community_results_fetch":true,"c9s_tweet_anatomy_moderator_badge_enabled":true,"responsive_web_grok_analyze_button_fetch_trends_enabled":false,"responsive_web_grok_analyze_post_followups_enabled":true,"responsive_web_jetfuel_frame":false,"responsive_web_grok_share_attachment_enabled":true,"responsive_web_grok_annotations_enabled":false,"articles_preview_enabled":true,"responsive_web_edit_tweet_api_enabled":true,"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"view_counts_everywhere_api_enabled":true,"longform_notetweets_consumption_enabled":true,"responsive_web_twitter_article_tweet_consumption_enabled":false,"tweet_awards_web_tipping_enabled":false,"content_disclosure_indicator_enabled":false,"content_disclosure_ai_generated_indicator_enabled":false,"responsive_web_grok_show_grok_translated_post":false,"responsive_web_grok_analysis_button_from_backend":false,"post_ctas_fetch_enabled":false,"freedom_of_speech_not_reach_fetch_enabled":true,"standardized_nudges_misinfo":true,"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":true,"longform_notetweets_rich_text_read_enabled":true,"longform_notetweets_inline_media_enabled":true,"responsive_web_grok_image_annotation_enabled":false,"responsive_web_grok_imagine_annotation_enabled":false,"responsive_web_grok_community_note_auto_translation_is_enabled":false,"responsive_web_enhance_cards_enabled":false});

export const tweetResultFieldToggles = JSON.stringify({
  withArticleRichContentState: true,
  withArticlePlainText: false,
  withGrokAnalyze: false,
  withDisallowedReplyControls: false,
});

export const tweetDetailFieldToggles = JSON.stringify({
  withArticleRichContentState: true,
  withArticlePlainText: false,
  withGrokAnalyze: false,
  withDisallowedReplyControls: false,
});

export const searchFieldToggles = JSON.stringify({
  withPayments: false,
  withAuxiliaryUserLabels: false,
  withArticleRichContentState: false,
  withArticlePlainText: false,
  withArticleSummaryText: false,
  withArticleVoiceOver: false,
  withGrokAnalyze: false,
  withDisallowedReplyControls: false,
});

// --- URL Helpers ---

export const graphqlBase = "https://x.com/i/api/graphql/";
export const https = "https://";
export const twimg = "pbs.twimg.com/";

export const smallWebp = "?format=webp&name=small";
export const mediumWebp = "?format=webp&name=medium";

export function genParams(variables: string, fieldToggles = "", customFeatures?: string): [string, string][] {
  const params: [string, string][] = [
    ["variables", variables],
    ["features", customFeatures || gqlFeatures],
  ];
  if (fieldToggles) {
    params.push(["fieldToggles", fieldToggles]);
  }
  return params;
}
