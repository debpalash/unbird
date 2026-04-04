import { Hono } from "hono";
import { saveToVault, getAllVaultTweets, deleteFromVault } from "../db";

export const vault = new Hono();

// Get all saved tweets
vault.get("/", (c) => {
  try {
    const records = getAllVaultTweets();
    // Parse the JSON back into objects for the frontend
    const tweets = records.map(r => ({
      id: r.id,
      saved_at: r.saved_at,
      data: JSON.parse(r.json)
    }));
    return c.json({ tweets });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Save a tweet
vault.post("/", async (c) => {
  try {
    const body = await c.req.json();
    if (!body.id || !body.data) {
      return c.json({ error: "Missing id or data in payload" }, 400);
    }
    
    saveToVault(body.id, JSON.stringify(body.data));
    return c.json({ success: true, id: body.id });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Delete a tweet
vault.delete("/:id", (c) => {
  try {
    const id = c.req.param("id");
    deleteFromVault(id);
    return c.json({ success: true, id });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
