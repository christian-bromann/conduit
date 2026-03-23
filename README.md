# Conduit

Drop-in messaging connectors for [LangGraph](https://docs.langchain.com/oss/javascript/langgraph/overview) agents. Install a package, add one line to your `langgraph.json`, and your agent is reachable on Slack, WhatsApp, Discord, and more.

## How it works

Conduit connectors are [Hono](https://hono.dev/) apps that plug into LangGraph's [`http.app`](https://docs.langchain.com/langsmith/custom-routes) config. Each connector handles platform authentication, webhook verification, message parsing, and response delivery — bridging between the messaging platform and your LangGraph agent via the SDK.

```
User (Slack/WhatsApp/Discord) → Platform webhook → Conduit connector → LangGraph agent → reply
```

## Quick start

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

See the [`example/`](./example) directory for a complete working setup.

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
