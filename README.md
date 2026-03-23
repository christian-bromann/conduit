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

> **Have Python custom routes?** LangGraph's `http.app` only accepts a single app, and it must match your agent's language — a Python deployment uses [Starlette/FastAPI](https://docs.langchain.com/langsmith/custom-routes), while a JS/TS deployment uses Hono. You can't mix a Python `http.app` with Conduit's Hono app in the same config. Use **Standalone mode** below instead: keep your Python custom routes in `http.app`, and run Conduit as a separate service that connects to your agent via the SDK.

See the [`example/`](./example) directory for a complete working setup.

## Quick start — Standalone mode (Python or any agent)

If your agent is written in Python (or any other language), or you already have [custom routes](https://docs.langchain.com/langsmith/custom-routes) in your `http.app` and don't want to replace them, run Conduit as a separate service that connects to your agent via the LangGraph SDK.

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
