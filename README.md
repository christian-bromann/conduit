# Conduit

Drop-in messaging connectors for [LangGraph](https://docs.langchain.com/oss/javascript/langgraph/overview) agents. Install a package, add one line to your `langgraph.json`, and your agent is reachable on Slack, WhatsApp, Discord, and more.

## How it works

Conduit connectors are [Hono](https://hono.dev/) apps that talk to your LangGraph agent through the [LangGraph SDK](https://langchain-ai.github.io/langgraph/cloud/reference/sdk/js_ts_sdk_ref/). Each connector handles platform authentication, webhook verification, message parsing, and response delivery.

Because Conduit communicates with your agent over HTTP (not direct function calls), **your agent can be written in any language** — Python, JavaScript/TypeScript, or anything LangGraph supports.

```
User (Slack/WhatsApp/Discord) → Platform webhook → Conduit connector → LangGraph SDK → Your agent
```

There are two ways to deploy Conduit:

| Mode           | Agent language         | How it works                                                         |
| -------------- | ---------------------- | -------------------------------------------------------------------- |
| **Embedded**   | JS/TS only             | Conduit runs inside the LangGraph deployment via `http.app`          |
| **Standalone** | Any (Python, JS/TS, …) | Conduit runs as a separate service, pointing at your agent's API URL |

## Quick start — Embedded mode (JS/TS agents)

If your agent is JavaScript/TypeScript, Conduit can run inside the same LangGraph deployment using the [`http.app`](https://docs.langchain.com/langsmith/custom-routes) config.

**Single connector** — point `http.app` directly at the package:

```json
{
  "http": {
    "app": "./node_modules/@conduit/slack:app"
  }
}
```

**Multiple connectors** — use `createConduitApp()` to merge them:

```ts
// conduit.ts
import { createConduitApp } from '@conduit/core';
import { app as slack } from '@conduit/slack';
import { app as whatsapp } from '@conduit/whatsapp';

export const app = createConduitApp({ slack, whatsapp });
```

```json
{
  "http": {
    "app": "./conduit.ts:app"
  }
}
```

**Adding your own JS/TS routes** — the app returned by `createConduitApp()` is a standard Hono instance, so you can add routes directly:

```ts
// conduit.ts
import { Hono } from 'hono';
import { createConduitApp } from '@conduit/core';
import { app as slack } from '@conduit/slack';

const conduit = createConduitApp({ slack });

const app = new Hono();
app.get('/api/hello', (c) => c.json({ hello: 'world' }));
app.route('/', conduit);

export { app };
```

See the [`example/`](./example) directory for a complete working setup.

## Multi-language apps (gateway mode)

Need extensions in different languages? `createGateway()` lets you serve multiple apps — **regardless of runtime** — behind a single port. In-process Hono apps are mounted directly; external-runtime apps (Python, Go, etc.) are spawned as child processes and reverse-proxied automatically.

```
┌─────────────────────────────────────────────────────┐
│  Gateway (single port)                              │
│                                                     │
│  /conduit/*   → Conduit Hono app (in-process)       │
│  /dashboard/* → Python dashboard (child process)    │
│  /metrics/*   → Go metrics server (child process)   │
│  /gateway/health → gateway health check             │
└─────────────────────────────────────────────────────┘
```

```ts
// gateway.ts
import { createGateway } from '@conduit/core';
import { app as whatsapp } from '@conduit/whatsapp';

const gateway = createGateway({
  apps: [
    // In-process: Conduit connectors (Hono / JS/TS)
    { path: '/conduit', app: whatsapp },

    // External: Python dashboard served as a child process
    {
      path: '/dashboard',
      runtime: 'python',
      command: 'python extensions/dashboard.py',
    },
  ],
});

export const { app } = gateway;
```

Use the gateway as your `http.app` in `langgraph.json`:

```json
{
  "http": {
    "app": "./gateway.ts:app"
  }
}
```

Or run it standalone:

```ts
await gateway.start(); // spawns external processes

Bun.serve({
  port: 3000,
  fetch: app.fetch,
});
```

The gateway assigns each external app its own internal port (starting at 9100 by default), injects `PORT` and `HOST` into the child process environment, and waits for the process to accept connections before proxying traffic. Request paths are rewritten so the external app sees requests relative to its own root (e.g. a request to `/dashboard/api/status` arrives at the Python app as `/api/status`).

### How external apps work

Any HTTP server that reads `PORT` from the environment works as an external app. Here's a minimal Python example:

```python
# extensions/dashboard.py
import os
from http.server import HTTPServer, BaseHTTPRequestHandler

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'Hello from Python!')

port = int(os.environ.get('PORT', '8001'))
HTTPServer(('127.0.0.1', port), Handler).serve_forever()
```

### Gateway health check

`GET /gateway/health` returns the status of all mounted apps:

```json
{
  "status": "ok",
  "apps": [
    { "path": "/conduit", "type": "in-process" },
    { "path": "/dashboard", "type": "external", "runtime": "python" }
  ]
}
```

### Proposed `langgraph.json` multi-app format

Today, `langgraph.json` accepts a single `http.app` entry point. We propose extending it with an `http.apps` array so that LangGraph deployments can natively declare multiple apps in different runtimes:

```json
{
  "graphs": { "agent": "./agent.ts:agent" },
  "http": {
    "apps": [
      { "path": "/conduit", "app": "./conduit.ts:app", "runtime": "node" },
      { "path": "/dashboard", "app": "./extensions/dashboard.py", "runtime": "python" }
    ]
  }
}
```

Until this format is supported by the LangGraph CLI, use `createGateway()` as the single `http.app` to achieve the same result today.

See [`example/gateway.ts`](./example/gateway.ts) and [`example/extensions/dashboard.py`](./example/extensions/dashboard.py) for a working multi-language setup.

## Quick start — Standalone mode (Python or any agent)

If your agent is written in Python (or any other language), or you already have [custom routes](https://docs.langchain.com/langsmith/custom-routes) in your `http.app` and don't want to replace them, run Conduit as a separate service that connects to your agent via the LangGraph SDK.

> **Tip:** If you want to co-locate Conduit with Python extensions in the _same_ deployment, see [Multi-language apps (gateway mode)](#multi-language-apps-gateway-mode) above.

This works because Conduit never calls your agent directly — it uses the LangGraph SDK over HTTP, so it can run anywhere that can reach your agent's API.

```
┌─────────────────────────┐       ┌──────────────────────────────┐
│  Your LangGraph deploy  │       │  Conduit (separate service)  │
│                         │       │                              │
│  langgraph.json:        │  SDK  │  Receives platform webhooks  │
│    graphs: agent.py     │◄──────│  Forwards to your agent      │
│    http.app: webapp.py  │       │  Delivers replies            │
│    (your Python routes) │       │                              │
└─────────────────────────┘       └──────────────────────────────┘
```

**1. Create the Conduit server:**

```ts
// server.ts
import { createConduitApp } from '@conduit/core';
import { app as slack } from '@conduit/slack';
import { app as whatsapp } from '@conduit/whatsapp';

const app = createConduitApp({ slack, whatsapp });

Bun.serve({
  port: Number(process.env.CONDUIT_PORT ?? 3000),
  fetch: app.fetch,
});

console.log('Conduit listening on :3000');
```

**2. Point Conduit at your agent** by setting `LANGGRAPH_API_URL`:

```bash
# .env
LANGGRAPH_API_URL=https://your-deployment.langsmith.com  # or http://localhost:2024 for local dev

# Connector secrets
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
```

**3. Run it:**

```bash
bun run server.ts
```

Your Python agent's `langgraph.json` stays untouched — keep your FastAPI routes in `http.app` as usual. Conduit receives webhooks on its own port and forwards messages to your agent via the SDK.

## Packages

| Package                                    | Description                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| [`@conduit/core`](./packages/core)         | Shared interfaces, LangGraph agent bridge, and `createConduitApp()` factory |
| [`@conduit/slack`](./packages/slack)       | Slack connector via Events API                                              |
| [`@conduit/whatsapp`](./packages/whatsapp) | WhatsApp connector via Cloud API                                            |
| [`@conduit/discord`](./packages/discord)   | Discord connector via Interactions Endpoint                                 |

## Development

Requires [Bun](https://bun.sh/) v1.0+.

```bash
# Install dependencies
bun install

# Run tests
bun test

# Build all packages
bun run build

# Lint
bun run lint
```

## Project structure

```
conduit/
├── packages/
│   ├── core/          # @conduit/core — shared types, AgentBridge, createConduitApp
│   ├── slack/         # @conduit/slack — Slack Events API connector
│   ├── whatsapp/      # @conduit/whatsapp — WhatsApp Cloud API connector
│   └── discord/       # @conduit/discord — Discord Interactions Endpoint connector
└── example/           # Working example with both connectors
```

## License

MIT
