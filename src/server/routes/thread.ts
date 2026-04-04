import { Hono } from "hono";
import { fetchJson, apiReq } from "../twitter/client";
import { getTweetResult } from "../twitter/parser";
import { gqlFeatures } from "../twitter/consts";

export const thread = new Hono();

thread.get("/api/thread/:id", async (c) => {
  const id = c.req.param("id");
  try {
    // xd_EMdYvB9hfZsZ6Idri0w is TweetDetail
    const req = apiReq(
      "xd_EMdYvB9hfZsZ6Idri0w/TweetDetail",
        JSON.stringify({
          focalTweetId: id,
          with_rux_injections: false,
          includePromotedContent: false,
          withCommunity: true,
          withQuickPromoteEligibilityTweetFields: true,
          withBirdwatchNotes: true,
          withVoice: true
        }),
        JSON.stringify({
          withArticleRichContentState: false,
          withArticlePlainText: false,
          withGrokAnalyze: false,
          withDisallowedReplyControls: false
        }),
        gqlFeatures
    );
    const res = await fetchJson(req);

    const entries = res.data?.threaded_conversation_with_injections_v2?.instructions
      ?.filter((x: any) => x.type === "TimelineAddEntries")
      .map((x: any) => x.entries)
      .flat() || [];

    const tweets: any[] = [];
    for (const entry of entries) {
      if (entry.entryId?.startsWith("tweet-")) {
        const item = entry.content?.itemContent?.tweet_results?.result;
        if (item) tweets.push(getTweetResult(item));
      } else if (entry.entryId?.startsWith("conversationthread-")) {
        const items = entry.content?.items || [];
        for (const item of items) {
          if (item.entryId?.startsWith("conversationthread-") && item.item?.itemContent?.tweet_results?.result) {
            tweets.push(getTweetResult(item.item.itemContent.tweet_results.result));
          }
        }
      }
    }

    return c.json({ tweets });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
