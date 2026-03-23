# @conduit/slack

Slack connector for [Conduit](../../README.md). Receives messages via the [Slack Events API](https://api.slack.com/events-api) and replies through the [Slack Web API](https://api.slack.com/web).

## Installation

```bash
bun add @conduit/slack
```

## Usage

**Single connector** — point `http.app` directly at the package:

```json
{
  "graphs": { "agent": "./agent.ts:agent" },
  "http": { "app": "./node_modules/@conduit/slack:app" }
}
```

**With other connectors** — use `createConduitApp()`:

```ts
import { createConduitApp } from '@conduit/core';
import { app as slack } from '@conduit/slack';

export const app = createConduitApp({ slack });
```

## Environment variables

| Variable               | Description                                 |
| ---------------------- | ------------------------------------------- |
| `SLACK_BOT_TOKEN`      | Bot User OAuth Token (`xoxb-...`)           |
| `SLACK_SIGNING_SECRET` | App signing secret for webhook verification |

## Endpoints

| Method | Path            | Description                                                                |
| ------ | --------------- | -------------------------------------------------------------------------- |
| `POST` | `/slack/events` | Slack Events API webhook (handles `url_verification` and `message` events) |
| `GET`  | `/slack/health` | Health check — returns `{ "status": "ok", "connector": "slack" }`          |

## Slack app setup

1. Create a Slack app at https://api.slack.com/apps
2. Go to **Event Subscriptions**, enable events, and set the Request URL to `https://<your-server>/slack/events`
3. Under **Subscribe to bot events**, add `message.im` and `message.channels`
4. Go to **OAuth & Permissions** and install the app to your workspace
5. Copy the **Bot User OAuth Token** and **Signing Secret** into your `.env`

## Exports

- **`app`** — pre-configured Hono app, ready for `langgraph.json`
- **`createSlackRoutes()`** — factory function if you need custom configuration
