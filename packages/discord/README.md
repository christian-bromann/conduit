# @conduit/discord

Discord connector for [Conduit](../../README.md). Receives slash command interactions via Discord's [Interactions Endpoint](https://docs.discord.com/developers/interactions/receiving-and-responding) and replies by editing the deferred response. No persistent Gateway WebSocket connection required.

## Installation

```bash
bun add @conduit/discord
```

## Usage

**Single connector** — point `http.app` directly at the package:

```json
{
  "graphs": { "agent": "./agent.ts:agent" },
  "http": { "app": "./node_modules/@conduit/discord:app" }
}
```

**With other connectors** — use `createConduitApp()`:

```ts
import { createConduitApp } from '@conduit/core';
import { app as discord } from '@conduit/discord';

export const app = createConduitApp({ discord });
```

## Environment variables

| Variable                 | Description                                               |
| ------------------------ | --------------------------------------------------------- |
| `DISCORD_APPLICATION_ID` | Discord application ID                                    |
| `DISCORD_PUBLIC_KEY`     | Application public key for Ed25519 signature verification |

## Endpoints

| Method | Path                    | Description                                                          |
| ------ | ----------------------- | -------------------------------------------------------------------- |
| `POST` | `/discord/interactions` | Discord Interactions Endpoint (handles PING and APPLICATION_COMMAND) |
| `GET`  | `/discord/health`       | Health check — returns `{ "status": "ok", "connector": "discord" }`  |

## How it works

Discord interactions work differently from Slack/WhatsApp webhooks:

1. A user types `/ask Hello!` in Discord
2. Discord POSTs the interaction to `/discord/interactions`
3. The connector verifies the Ed25519 signature and responds with a **deferred response** (type 5) — the user sees a "thinking..." indicator
4. The connector asynchronously invokes the LangGraph agent
5. Once the agent responds, the connector edits the deferred message with the response via the Discord API

## Discord app setup

1. Create an application at https://discord.com/developers/applications
2. Copy the **Application ID** and **Public Key** from the General Information page
3. Go to **Bot** and create a bot (if not already created)
4. Under **Installation**, add the `bot` and `applications.commands` scopes
5. After deploying, set the **Interactions Endpoint URL** to `https://<your-server>/discord/interactions`
6. Discord will send a PING to verify — the connector handles this automatically

### Registering the slash command

The connector expects a `/ask` slash command with a `message` option. You can register it programmatically:

```ts
import { registerSlashCommand } from '@conduit/discord';

await registerSlashCommand(process.env.DISCORD_APPLICATION_ID!, process.env.DISCORD_BOT_TOKEN!);
```

Or via curl:

```bash
curl -X POST "https://discord.com/api/v10/applications/$DISCORD_APPLICATION_ID/commands" \
  -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"ask","description":"Ask the AI agent a question","type":1,"options":[{"name":"message","description":"Your message to the agent","type":3,"required":true}]}'
```

## Exports

- **`app`** — pre-configured Hono app, ready for `langgraph.json`
- **`createDiscordRoutes()`** — factory function if you need custom configuration
- **`registerSlashCommand()`** — utility to register the `/ask` command with Discord
