# Conduit Example

A minimal LangGraph agent with Slack, WhatsApp, and Discord connectors powered by Conduit.

## Prerequisites

- [Bun](https://bun.sh/) runtime installed
- A [Slack app](https://api.slack.com/apps) with Event Subscriptions enabled
- A [WhatsApp Business app](https://developers.facebook.com/apps/) with webhook configured
- A [Discord application](https://discord.com/developers/applications) with Interactions Endpoint configured
- An [Anthropic API key](https://console.anthropic.com/) (or swap the model in `agent.ts`)

## Setup

1. Copy the example env file and fill in your credentials:

```bash
cp .env.example .env
```

2. Install dependencies from the monorepo root:

```bash
cd .. && bun install
```

## Running locally

Start the LangGraph dev server:

```bash
bun run dev
```

The server will start and expose:

| Endpoint                     | Description                          |
| ---------------------------- | ------------------------------------ |
| `GET /slack/health`          | Slack connector health check         |
| `POST /slack/events`         | Slack Events API webhook             |
| `GET /whatsapp/health`       | WhatsApp connector health check      |
| `GET /whatsapp/webhook`      | WhatsApp Meta verification challenge |
| `POST /whatsapp/webhook`     | WhatsApp incoming messages           |
| `POST /discord/interactions` | Discord Interactions Endpoint        |
| `GET /discord/health`        | Discord connector health check       |
| `GET /conduit/health`        | Combined Conduit health check        |

## Testing with curl

### Health checks

```bash
curl http://localhost:2024/conduit/health
# {"status":"ok","connectors":["slack","whatsapp","discord"]}
```

### WhatsApp verification challenge

```bash
curl "http://localhost:2024/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=my-custom-verify-token&hub.challenge=test123"
# test123
```

## Connecting Slack

1. Create a Slack app at https://api.slack.com/apps
2. Enable **Event Subscriptions** and set the Request URL to `https://<your-server>/slack/events`
3. Subscribe to `message.im` and `message.channels` events
4. Install the app to your workspace and copy the **Bot User OAuth Token** (`xoxb-...`)
5. Copy the **Signing Secret** from the app's Basic Information page
6. Add both values to your `.env` file

## Connecting WhatsApp

Conduit connects to WhatsApp through the [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/), Meta's official API for sending and receiving messages. You will need a Meta developer account and a Facebook Business account (both free to create).

### Step 1 — Create a Meta app

1. Go to https://developers.facebook.com/apps/ and click **Create App**
2. Select **Other** as the use case, then click **Next**
3. Select **Business** as the app type, then click **Next**
4. Give the app a name (e.g. "My LangGraph Agent"), connect it to a Business portfolio (create one if prompted), then click **Create App**

### Step 2 — Add the WhatsApp product

1. On the app dashboard, find **WhatsApp** in the product list and click **Set Up**
2. Meta provides a free **test phone number** and up to five test recipient numbers — this is enough to get started without a verified business
3. Under **API Setup**, note down:
   - **Phone number ID** — a numeric ID like `123456789012345`
   - **Temporary access token** — valid for 24 hours (see Step 5 for a permanent token)

### Step 3 — Configure the webhook

Your server must be publicly reachable for Meta to deliver messages. During local development, use a tunnel:

```bash
# Using ngrok (https://ngrok.com)
ngrok http 2024

# Using Cloudflare Tunnel (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
cloudflared tunnel --url http://localhost:2024
```

Then configure the webhook in the Meta dashboard:

1. Navigate to **WhatsApp > Configuration** in the left sidebar
2. Under **Webhook**, click **Edit**
3. Set **Callback URL** to `https://<your-tunnel-domain>/whatsapp/webhook`
4. Set **Verify Token** to the value of `WHATSAPP_VERIFY_TOKEN` in your `.env` (e.g. `my-custom-verify-token`)
5. Click **Verify and Save** — Meta sends a `GET` request with a `hub.challenge` that Conduit responds to automatically
6. Click **Manage** next to Webhook fields, and subscribe to the **messages** field

### Step 4 — Collect your App Secret

1. Go to **App Settings > Basic** in the left sidebar
2. Click **Show** next to **App Secret** and copy the value
3. This secret is used to verify that incoming webhook requests are genuinely from Meta (HMAC-SHA256 signature verification)

### Step 5 — Generate a permanent access token

The temporary token from Step 2 expires after 24 hours. For production use, create a permanent System User token:

1. Go to [Meta Business Suite > Business Settings > Users > System Users](https://business.facebook.com/settings/system-users)
2. Click **Add** to create a new **System User** (role: **Admin**)
3. Click **Add Assets** and assign **both** of these with **Full Control**:
   - **Apps** — select your Meta app
   - **WhatsApp Accounts** — select your WhatsApp Business Account
4. Install the app for the system user. Switch to the **Installed apps** tab (next to "Assigned assets") and verify the app appears there. If it does not, install it via the API — run this command using the temporary access token from Step 2 and your app ID (found at the top of the [App Dashboard](https://developers.facebook.com/apps/)):

```bash
curl -X POST \
  "https://graph.facebook.com/v21.0/SYSTEM_USER_ID/applications" \
  -F "business_app=YOUR_APP_ID" \
  -F "access_token=YOUR_TEMPORARY_ACCESS_TOKEN"
```

5. Back on the System User page, click **Generate New Token**, select your app, set expiration to **Never**, and grant these permissions:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
6. Copy the token — this is your `WHATSAPP_ACCESS_TOKEN`

> **"No permissions available"** — Both the App **and** the WhatsApp Business Account must be assigned as assets (step 3).
>
> **"Assign an app role to the system user"** — The app must be **installed** for the system user (step 4), not just assigned as an asset. Use the API command above to install it.

### Step 6 — Configure your .env

Add all four values to your `.env` file:

```bash
WHATSAPP_ACCESS_TOKEN=EAAx...       # Permanent token from Step 5 (or temporary from Step 2)
WHATSAPP_PHONE_NUMBER_ID=123456...  # From Step 2 (API Setup page)
WHATSAPP_VERIFY_TOKEN=my-custom-verify-token  # Any string you choose — must match the webhook config
META_APP_SECRET=abc123...           # From Step 4
```

### Step 7 — Register test recipients (sandbox only)

While your app is in development mode, only pre-registered numbers can receive messages:

1. Go to **WhatsApp > API Setup**
2. Under **To**, click **Manage phone number list**
3. Add the phone numbers you want to test with (they must verify via SMS)

### Step 8 — Test the integration

Start the server and verify the setup:

```bash
bun run dev
```

Check health:

```bash
curl http://localhost:2024/whatsapp/health
# {"status":"ok","connector":"whatsapp"}
```

Test webhook verification manually:

```bash
curl "http://localhost:2024/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=my-custom-verify-token&hub.challenge=test123"
# test123
```

Send a WhatsApp message to your test number — you should see the agent respond.

### Troubleshooting

| Problem                         | Solution                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Webhook verification fails      | Ensure `WHATSAPP_VERIFY_TOKEN` in `.env` matches exactly what you entered in the Meta dashboard              |
| Messages arrive but get 401     | Check that `META_APP_SECRET` is correct — Conduit verifies the `x-hub-signature-256` header on every request |
| Agent doesn't reply             | Confirm `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are correct; check server logs for errors     |
| "Recipient not in allowed list" | In development mode, add the recipient to your test phone number list (Step 7)                               |
| Token expired                   | Replace the temporary token with a permanent System User token (Step 5)                                      |
| Tunnel URL changed              | Update the webhook Callback URL in the Meta dashboard and re-verify                                          |

## Connecting Discord

Discord uses an [Interactions Endpoint](https://docs.discord.com/developers/interactions/receiving-and-responding) — when a user runs a slash command, Discord POSTs to your server and the connector responds via the Discord API.

### Step 1 — Create a Discord application

1. Go to https://discord.com/developers/applications and click **New Application**
2. On the **General Information** page, copy the **Application ID** and **Public Key**
3. Go to **Bot** in the sidebar and click **Reset Token** to get a **Bot Token**

### Step 2 — Register the slash command

Register the `/ask` command so users can interact with the agent:

```bash
curl -X POST "https://discord.com/api/v10/applications/$DISCORD_APPLICATION_ID/commands" \
  -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"ask","description":"Ask the AI agent a question","type":1,"options":[{"name":"message","description":"Your message to the agent","type":3,"required":true}]}'
```

### Step 3 — Set the Interactions Endpoint URL

1. Go to **General Information** in the Discord developer dashboard
2. Set **Interactions Endpoint URL** to `https://<your-server>/discord/interactions`
3. Discord sends a PING to verify — the connector handles this automatically
4. Click **Save Changes**

### Step 4 — Install the bot to your server

1. Go to **Installation** in the sidebar
2. Under **Default Install Settings**, add the `bot` and `applications.commands` scopes
3. Use the generated install link to add the bot to your Discord server

### Step 5 — Configure your .env

```bash
DISCORD_APPLICATION_ID=123456...  # From Step 1
DISCORD_PUBLIC_KEY=abc123...       # From Step 1
DISCORD_BOT_TOKEN=MTIz...         # From Step 1 (only needed for command registration)
```

### Step 6 — Test the integration

In your Discord server, type `/ask Hello!` — the bot shows a "thinking..." indicator, then replies with the agent's response.

## Deploying to LangSmith

Deploy to LangSmith Cloud using the deploy script:

```bash
bun run deploy
```

Or deploy without waiting for completion:

```bash
bun run deploy:no-wait
```

### Required environment variables

| Variable                       | Description                                        |
| ------------------------------ | -------------------------------------------------- |
| `LANGSMITH_API_KEY`            | LangSmith API key with deployment permissions      |
| `LANGSMITH_WORKSPACE_ID`       | Target workspace ID                                |
| `LANGSMITH_GIT_INTEGRATION_ID` | GitHub integration ID from LangSmith               |
| `GITHUB_REPOSITORY`            | `owner/repo` (set automatically in GitHub Actions) |

### Optional environment variables

| Variable                       | Default                          | Description                  |
| ------------------------------ | -------------------------------- | ---------------------------- |
| `LANGSMITH_DEPLOYMENT_NAME`    | `conduit`                        | Override the deployment name |
| `LANGSMITH_REPO_REF`           | `main`                           | Git ref to deploy            |
| `LANGSMITH_CONTROL_PLANE_HOST` | `https://api.host.langchain.com` | Control plane host           |

All connector secrets (`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `WHATSAPP_ACCESS_TOKEN`, etc.) and `ANTHROPIC_API_KEY` are automatically forwarded as deployment secrets when present in the environment.

## Multi-language gateway

The gateway lets you serve Conduit connectors alongside apps written in other languages (Python, Go, etc.) behind a single port.

See [`gateway.ts`](./gateway.ts) for the TypeScript entry point and [`extensions/dashboard.py`](./extensions/dashboard.py) for a sample Python extension.

To use the gateway as your `http.app`:

```json
{
  "http": {
    "app": "./gateway.ts:app"
  }
}
```

Or run it standalone:

```bash
LANGGRAPH_API_URL=http://localhost:2024 bun run gateway.ts
```

A proposed `langgraph.json` format with native multi-app support is in [`langgraph-multi-app.json`](./langgraph-multi-app.json).

## Single connector usage

If you only need one connector, point `http.app` directly at the package:

```json
{
  "http": {
    "app": "./node_modules/@conduit/slack:app"
  }
}
```

No `conduit.ts` file needed.
