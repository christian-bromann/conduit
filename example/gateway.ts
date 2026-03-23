/**
 * Multi-language gateway example.
 *
 * This file demonstrates how to use createGateway() to serve multiple
 * apps — potentially in different runtimes — behind a single port.
 *
 * Usage with LangGraph CLI (embedded mode):
 *   Set "http.app" to "./gateway.ts:app" in langgraph.json
 *
 * Usage standalone:
 *   LANGGRAPH_API_URL=http://localhost:2024 bun run gateway.ts
 */
import { createGateway } from '@conduit/core';
import { app as whatsapp } from '@conduit/whatsapp';
// import { app as slack } from '@conduit/slack';
// import { app as discord } from '@conduit/discord';

const gateway = createGateway({
  apps: [
    { path: '/conduit', app: whatsapp },

    // Uncomment to add a Python dashboard served from the same port:
    // {
    //   path: '/dashboard',
    //   runtime: 'python',
    //   command: 'python extensions/dashboard.py',
    //   env: { LANGGRAPH_API_URL: process.env.LANGGRAPH_API_URL ?? '' },
    // },
  ],
});

export const { app } = gateway;

if (import.meta.main) {
  await gateway.start();

  Bun.serve({
    port: Number(process.env.PORT ?? 3000),
    fetch: app.fetch,
  });

  console.log(`Gateway listening on :${process.env.PORT ?? 3000}`);
  console.log('  /conduit/*       → Conduit connectors (in-process)');
  console.log('  /gateway/health  → gateway health check');
}
