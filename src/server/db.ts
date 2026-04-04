import { Database } from "bun:sqlite";

export const db = new Database("session/vault.sqlite", { create: true });

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS vault_tweets (
    id TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    saved_at INTEGER NOT NULL
  )
`);

export function saveToVault(tweetId: string, tweetJson: string) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO vault_tweets (id, json, saved_at)
    VALUES (?, ?, ?)
  `);
  stmt.run(tweetId, tweetJson, Date.now());
}

export function getAllVaultTweets() {
  const stmt = db.prepare(`
    SELECT * FROM vault_tweets ORDER BY saved_at DESC
  `);
  return stmt.all() as { id: string; json: string; saved_at: number }[];
}

export function deleteFromVault(tweetId: string) {
  const stmt = db.prepare(`
    DELETE FROM vault_tweets WHERE id = ?
  `);
  stmt.run(tweetId);
}
