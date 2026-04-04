# Serverless Migration Roadmap (Cloudflare Workers)

This branch acts as the foundation for **Phase 2** of unbird's deployment strategy: a 100% serverless, zero-maintenance, zero-cost Edge deployment using Cloudflare Workers.

Because `unbird` was originally written as a monolithic Node/Bun application utilizing the local filesystem and native TLS Rust bindings (`wreq-js`), it cannot currently run in a Cloudflare Worker V8 Isolate.

## Architecture Rewrite Needed:

If you are a contributor looking to help complete this branch, here is what must be done:

### 1. Replacing File System State with Cloudflare KV
- The current session pool reads and writes to `session/sessions.jsonl`. This must be rewritten to interface with a Cloudflare KV namespace binding.
- Timeline and profile caches (currently in `/cache`) must be migrated to the native Cloudflare `Cache API`.

### 2. Replacing Background Loops with Cron Triggers
- `setInterval` background workers (which validate 500+ proxies and cycle Twitter credentials) are killed instantly on Cloudflare when a request ends. 
- These must be migrated to `wrangler.toml` Cron Triggers (`[triggers] crons = ["*/5 * * * *"]`), invoking an exported `scheduled()` event handler in `src/index.ts`.

### 3. Handling Native TLS Fingerprinting (`wreq-js`)
- Cloudflare Workers cannot run native C/Rust binaries. Twitter's bot protection explicitly blocks raw Cloudflare IP fetches during the initial account login phase.
- **Solution:** We must develop a local CLI script (`bun run login`) that the admin runs on their local computer to generate the `.twitter.com` auth cookies, and then automatically pushes those cookies via an authenticated API hit to the Cloudflare Worker's KV store.

### 4. Splitting Static Assets (Cloudflare Pages)
- Currently `bun` serves both the API and the compiled Vite HTML/CSS.
- This codebase will need to be deployed as a **Cloudflare Pages** project, with the `src/server` Hono API extracted into a `functions/api/` directory (or dynamically imported into an advanced Pages setup).

By completing this roadmap, `unbird` will be capable of hosting essentially infinite traffic for free on Cloudflare's Edge network.
