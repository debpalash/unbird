import { Hono } from "hono";
import { getGraphTweetSearch, getGraphUserSearch } from "../twitter/api";

export const shadowban = new Hono();

shadowban.get("/api/shadowban", async (c) => {
  const username = c.req.query("username");
  if (!username) return c.json({ error: "missing username" }, 400);

  try {
    const resSearch = await getGraphTweetSearch(`from:${username}`, "");
    const searchBan = (resSearch.content || []).flat().length === 0;

    const resUser = await getGraphUserSearch(username, "");
    const foundUser = Object.values(resUser.content || {})[0];
    const suggestionBan = !foundUser || foundUser.username?.toLowerCase() !== username.toLowerCase();

    return c.json({ searchBan, suggestionBan });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
