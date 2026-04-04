// SPDX-License-Identifier: AGPL-3.0-only
// Hono API server — runs on Bun, separate from Vite frontend

import { startServer } from "./server/app";

const { app, cfg } = await startServer();

const server = Bun.serve({
  port: cfg.port,
  idleTimeout: 120, // 120s for long-running feed builds
  fetch: app.fetch,
});

console.log(`🚀 unbird API server running at ${server.url}`);
console.log(`   Health: ${server.url}api/health`);
console.log(`   Sessions: ${server.url}api/sessions`);
