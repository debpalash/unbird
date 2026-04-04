# Deno Deploy Migration Roadmap

This branch acts as the foundation for **Phase 2** of unbird's deployment strategy: a 100% serverless Edge deployment using Deno Deploy.

Because `unbird` was originally written as a monolithic Node/Bun application utilizing the local filesystem and native TLS Rust bindings (`wreq-js`), it cannot currently run in standard Deno Deploy V8 Isolates.

## Architecture Rewrite Needed:

If you are a contributor looking to help complete this branch, here is what must be done:

### 1. Replacing File System State with Deno KV
- The current session pool reads and writes to `session/sessions.jsonl`. This must be rewritten to interface with the native `Deno.Kv` API.
- Timeline and profile caches (currently in `/cache`) must similarly be migrated to `Deno.Kv`.

### 2. Replacing Background Loops with Deno Cron
- `setInterval` background workers (which validate 500+ proxies and cycle Twitter credentials) are killed instantly on edge computing networks when a request ends. 
- These must be migrated to `Deno.cron`, invoking our validation logic on a set schedule (`"*/5 * * * *"`).

### 3. Handling Native TLS Fingerprinting (`wreq-js`)
- Deno Deploy cannot run native Node/Rust bindings compiled for local CPU targets.
- **Solution:** As with Cloudflare, we must develop a local CLI script (`deno run -A scripts/login.ts`) that the admin runs locally to log into Twitter and push the `ct0` and `auth_token` cookies to the deployed Deno KV instance. 

By completing this roadmap, `unbird` will be capable of hosting across Deno Deploy's global edge network.
