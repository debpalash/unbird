import { Hono } from "hono";
import { fetchJson, apiReq } from "../twitter/client";
import { getSessionAccountInfo } from "../sessions/manager";

export const dms = new Hono();

dms.get("/api/messages", async (c) => {
  try {
    const acct = getSessionAccountInfo(true);
    if (!acct) return c.json({ error: "Unauthorized" }, 200);

    const req = apiReq("1.1/dm/inbox_initial_state.json", "", "", "");
    const res = await fetchJson(req);
    return c.json(res);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

dms.get("/api/messages/:id", async (c) => {
  const convId = c.req.param("id");
  try {
    const acct = getSessionAccountInfo(true);
    if (!acct) return c.json({ error: "Unauthorized" }, 200);

    const req = apiReq(`1.1/dm/conversation/${convId}.json?context=FETCH_USER`, "", "", "");
    const res = await fetchJson(req);
    return c.json(res);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
