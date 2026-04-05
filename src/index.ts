// SPDX-License-Identifier: AGPL-3.0-only
// Hono API server — Cloudflare Workers Entrypoint

import { createApp } from "./server/app";
import { cronProxyPool } from "./server/proxy/pool";
import { refreshAggregator } from "./server/aggregator";

const { app } = createApp();

export default {
  fetch: app.fetch,

  /**
   * Cloudflare Cron Trigger (configured in wrangler.toml)
   * Handles periodic aggregator and proxy pool cycles
   */
  async scheduled(event: any, env: any, ctx: any) {
    console.log(`[cron] Triggered at ${new Date().toISOString()}`);

    // Init session pool for cron (Workers don't persist state across invocations)
    const { startSessionManager } = await import("./server/sessions/manager");
    await startSessionManager(env);

    // Run background tasks concurrently without blocking worker execution
    ctx.waitUntil(cronProxyPool(env));
    ctx.waitUntil(refreshAggregator(env));
  }
};
