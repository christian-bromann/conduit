# @conduit/whatsapp

WhatsApp connector for [Conduit](../../README.md). Receives messages via the [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/) webhooks and replies through the same API.

## Installation

```bash
bun add @conduit/whatsapp
```

## Usage

**Single connector** — point `http.app` directly at the package:

```json
{
  "graphs": { "agent": "./agent.ts:agent" },
  "http": { "app": "./node_modules/@conduit/whatsapp:app" }
}
```

**With other connectors** — use `createConduitApp()`:

```ts
import { createConduitApp } from '@conduit/core';
import { app as whatsapp } from '@conduit/whatsapp';

export const app = createConduitApp({ whatsapp });
```

## Environment variables

| Variable                   | Description                                                 |
| -------------------------- | ----------------------------------------------------------- |
| `WHATSAPP_ACCESS_TOKEN`    | Meta permanent access token for the WhatsApp Business API   |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Business phone number ID                           |
| `WHATSAPP_VERIFY_TOKEN`    | Custom string used to verify the webhook endpoint with Meta |
| `META_APP_SECRET`          | Meta app secret for webhook signature verification          |

## Endpoints

| Method | Path                | Description                                                          |
| ------ | ------------------- | -------------------------------------------------------------------- |
| `GET`  | `/whatsapp/webhook` | Meta webhook verification challenge                                  |
| `POST` | `/whatsapp/webhook` | Incoming message webhook                                             |
| `GET`  | `/whatsapp/health`  | Health check — returns `{ "status": "ok", "connector": "whatsapp" }` |

## WhatsApp app setup

See the [example tutorial](../../example/README.md#connecting-whatsapp) for a detailed walkthrough with troubleshooting. The short version:

1. Create an app at https://developers.facebook.com/apps/ (type: **Business**)
2. Add the **WhatsApp** product to your app
3. In **WhatsApp > API Setup**, note your **Phone Number ID** and **Access Token**
4. In **WhatsApp > Configuration**, set the webhook **Callback URL** to `https://<your-server>/whatsapp/webhook`
5. Set the **Verify Token** to match `WHATSAPP_VERIFY_TOKEN` in your `.env`
6. Subscribe to the **messages** webhook field
7. Copy your **App Secret** from **App Settings > Basic** into `.env` as `META_APP_SECRET`

For production, replace the temporary access token with a permanent System User token from [Meta Business Suite](https://business.facebook.com/settings/system-users).

### Security

All incoming webhook requests are verified using HMAC-SHA256 signature validation against `META_APP_SECRET`. The `x-hub-signature-256` header must be present and valid for any `POST /whatsapp/webhook` request to be processed.

## Exports

- **`app`** — pre-configured Hono app, ready for `langgraph.json`
- **`createWhatsAppRoutes()`** — factory function if you need custom configuration
