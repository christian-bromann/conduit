# Spec: Conduit POC

## Overview

Build a proof-of-concept that demonstrates the core Conduit value proposition: a developer installs a connector package, adds one line to their `langgraph.json`, and their deployed LangGraph agent becomes reachable through a messaging platform.

The POC focuses on **two connectors (Slack and WhatsApp)** plus the **core package** that all connectors depend on. Both platforms use webhook-based message delivery without polling or persistent WebSocket connections. Having two connectors validates that the shared `@conduit/core` interfaces work across platforms and demonstrates the `createConduitApp()` multi-connector pattern.

## Goals

1. Prove the `langgraph.json` `http.app` integration pattern works for messaging connectors
2. Establish the shared connector interface in `@conduit/core` that all future connectors will implement
3. Ship working Slack and WhatsApp connectors that receive messages and respond via a LangGraph agent
4. Validate the `createConduitApp()` multi-connector pattern (needed since `http.app` is a single entry)
5. Provide a working `example/` directory showing how to wire everything together
6. Validate the monorepo structure and developer experience

## Non-Goals

- Rich media (images, files, voice) — Phase 2
- Multi-agent routing — Phase 2
- Telegram, Discord connectors — MVP but not POC
- Production-grade error handling, rate limiting, or retry logic
- Authentication/authorization beyond what each platform requires
- Persistent storage for conversation history (rely on LangGraph threads)

---

## Architecture

### System Flow

```
User (Slack/WhatsApp) → Platform API → webhook POST → LangGraph Server
                                                          ↓
                                                     Conduit Hono app
                                                          ↓
                                                 @conduit/core bridge
                                                          ↓
                                                LangGraph SDK Client
                                                          ↓
                                                   LangGraph Agent
                                                          ↓
                                                 Agent response text
                                                          ↓
                                                 @conduit/core bridge
                                                          ↓
                                              Platform API POST (reply)
                                                          ↓
                                                    User sees reply
```

### How It Plugs In

The LangGraph CLI (`@langchain/langgraph-cli`) serves a custom HTTP app alongside its default agent endpoints when `http.app` is specified in `langgraph.json`. Conduit connectors are Hono apps that export an `app` object matching this contract.

A user's `langgraph.json`:

```json
{
  "graphs": {
    "my_agent": "./src/agent.ts:agent"
  },
  "http": {
    "app": "./node_modules/@conduit/slack:app"
  }
}
```

The connector's Hono app registers webhook endpoints (e.g. `/slack/events`) that the messaging platform calls. When a message arrives, the connector uses `@conduit/core` to bridge it to the LangGraph agent and send the response back.

### Key Constraint: Single `http.app`

The `langgraph.json` config supports a single `http.app` entry. Since the POC ships two connectors (Slack + WhatsApp), `@conduit/core` provides a `createConduitApp()` factory that merges multiple connector Hono apps into one:

```ts
// User's conduit.ts
import { createConduitApp } from '@conduit/core';
import { slack } from '@conduit/slack';
import { whatsapp } from '@conduit/whatsapp';

export const app = createConduitApp({ slack, whatsapp });
```

```json
{
  "http": {
    "app": "./conduit.ts:app"
  }
}
```

For single-connector use, the user can still point `http.app` directly at the package:

```json
{
  "http": {
    "app": "./node_modules/@conduit/slack:app"
  }
}
```

---

## Package Structure

```
conduit/
├── package.json              # Root workspace config
├── packages/
│   ├── core/
│   │   ├── package.json      # @conduit/core
│   │   └── src/
│   │       ├── index.ts      # Public API exports
│   │       ├── types.ts      # Shared interfaces
│   │       ├── bridge.ts     # LangGraph agent bridge
│   │       └── app.ts        # createConduitApp() factory
│   ├── slack/
│   │   ├── package.json      # @conduit/slack
│   │   └── src/
│   │       ├── index.ts      # Exports `app` (Hono instance)
│   │       ├── routes.ts     # Slack webhook routes
│   │       ├── verify.ts     # Slack request signature verification
│   │       └── api.ts        # Slack Web API client (send messages)
│   └── whatsapp/
│       ├── package.json      # @conduit/whatsapp
│       └── src/
│           ├── index.ts      # Exports `app` (Hono instance)
│           ├── routes.ts     # WhatsApp webhook routes
│           ├── verify.ts     # Meta webhook signature verification
│           └── api.ts        # WhatsApp Cloud API client (send messages)
├── example/
│   ├── package.json          # Example app dependencies
│   ├── langgraph.json        # LangGraph config wiring Conduit
│   ├── conduit.ts            # createConduitApp() with both connectors
│   └── agent.ts              # Minimal LangGraph agent
```

---

## Detailed Design

### 1. `@conduit/core` — Shared Interfaces and Agent Bridge

#### `types.ts` — Connector Interface

```ts
export interface IncomingMessage {
  /** Unique ID from the source platform */
  platformMessageId: string;
  /** Normalized plain-text content */
  text: string;
  /** Platform-specific sender identifier */
  senderId: string;
  /** Conversation/channel identifier used as LangGraph thread ID */
  threadId: string;
  /** Which platform this came from */
  platform: string;
  /** Raw platform payload for connector-specific use */
  raw: unknown;
}

export interface OutgoingMessage {
  /** Plain-text response to send */
  text: string;
  /** Thread to respond in */
  threadId: string;
}

export interface ConnectorConfig {
  /** Human-readable connector name (e.g. "slack") */
  name: string;
  /** LangGraph assistant ID or graph name to invoke */
  assistantId?: string;
}

export interface Connector {
  /** Connector configuration */
  config: ConnectorConfig;
  /** Send a response message back to the platform */
  sendMessage(message: OutgoingMessage): Promise<void>;
}
```

#### `bridge.ts` — LangGraph Agent Bridge

The bridge is responsible for forwarding an `IncomingMessage` to a LangGraph agent and returning the response text. It uses `@langchain/langgraph-sdk` to communicate with the agent running in the same LangGraph server.

```ts
import { Client } from '@langchain/langgraph-sdk';

export interface BridgeConfig {
  /** LangGraph assistant ID / graph name. Defaults to first available assistant. */
  assistantId?: string;
  /** LangGraph API URL. Defaults to http://localhost:8123 (same-server). */
  apiUrl?: string;
}

export class AgentBridge {
  private client: Client;
  private assistantId?: string;

  constructor(config?: BridgeConfig) {
    this.client = new Client({ apiUrl: config?.apiUrl });
    this.assistantId = config?.assistantId;
  }

  async invoke(message: IncomingMessage): Promise<string> {
    // Resolve assistant ID (use configured, or discover first available)
    const assistantId = this.assistantId ?? (await this.resolveAssistant());

    // Use the threadId from the incoming message so LangGraph
    // maintains conversation continuity per channel/DM
    const thread = await this.client.threads.create();

    const response = await this.client.runs.wait(thread.thread_id, assistantId, {
      input: {
        messages: [{ role: 'user', content: message.text }],
      },
    });

    // Extract the last AI message from the response
    const messages = response.values?.messages ?? [];
    const lastAiMessage = messages
      .filter((m: any) => m.type === 'ai' || m.role === 'assistant')
      .pop();

    return lastAiMessage?.content ?? "I couldn't generate a response.";
  }

  private async resolveAssistant(): Promise<string> {
    const assistants = await this.client.assistants.search({ limit: 1 });
    if (assistants.length === 0) {
      throw new Error('No LangGraph assistants found');
    }
    const id = assistants[0].assistant_id;
    this.assistantId = id;
    return id;
  }
}
```

#### `app.ts` — Multi-Connector Factory

Merges multiple connector Hono apps into a single Hono app for use with `langgraph.json`'s single `http.app` entry.

```ts
import { Hono } from 'hono';

export function createConduitApp(connectors: Record<string, Hono>): Hono {
  const app = new Hono();

  for (const [name, connectorApp] of Object.entries(connectors)) {
    app.route('/', connectorApp);
  }

  // Combined health check
  app.get('/conduit/health', (c) => {
    return c.json({
      status: 'ok',
      connectors: Object.keys(connectors),
    });
  });

  return app;
}
```

### 2. `@conduit/slack` — Slack Connector

#### `verify.ts` — Request Signature Verification

Slack signs every webhook request with an HMAC-SHA256 signature. The connector must verify this to ensure requests are authentic.

```ts
export async function verifySlackRequest(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp, 10) < fiveMinutesAgo) {
    return false; // Request too old, possible replay attack
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const key = new TextEncoder().encode(signingSecret);
  const msg = new TextEncoder().encode(sigBasestring);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msg);
  const mySignature = 'v0=' + Buffer.from(sig).toString('hex');

  return mySignature === signature;
}
```

#### `api.ts` — Slack Web API Client

Minimal client for posting messages back to Slack. Uses `fetch` (built into Bun).

```ts
const SLACK_API_BASE = 'https://slack.com/api';

export async function postMessage(
  token: string,
  channel: string,
  text: string,
  threadTs?: string,
): Promise<void> {
  const response = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      text,
      ...(threadTs ? { thread_ts: threadTs } : {}),
    }),
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }
}
```

#### `routes.ts` — Webhook Route Handlers

```ts
import { Hono } from 'hono';
import { AgentBridge, type IncomingMessage } from '@conduit/core';
import { verifySlackRequest } from './verify.ts';
import { postMessage } from './api.ts';

export function createSlackRoutes(): Hono {
  const app = new Hono();
  const bridge = new AgentBridge();

  const botToken = process.env.SLACK_BOT_TOKEN;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  if (!botToken || !signingSecret) {
    throw new Error('Missing SLACK_BOT_TOKEN or SLACK_SIGNING_SECRET environment variables');
  }

  // Slack URL verification challenge (required during app setup)
  // and event handling (message received)
  app.post('/slack/events', async (c) => {
    const rawBody = await c.req.text();
    const timestamp = c.req.header('x-slack-request-timestamp') ?? '';
    const signature = c.req.header('x-slack-signature') ?? '';

    const valid = await verifySlackRequest(signingSecret, signature, timestamp, rawBody);
    if (!valid) {
      return c.json({ error: 'Invalid signature' }, 401);
    }

    const body = JSON.parse(rawBody);

    // Handle Slack URL verification challenge
    if (body.type === 'url_verification') {
      return c.json({ challenge: body.challenge });
    }

    // Handle message events
    if (body.type === 'event_callback' && body.event?.type === 'message') {
      const event = body.event;

      // Ignore bot messages to prevent loops
      if (event.bot_id || event.subtype) {
        return c.json({ ok: true });
      }

      const incomingMessage: IncomingMessage = {
        platformMessageId: event.client_msg_id ?? event.ts,
        text: event.text ?? '',
        senderId: event.user,
        threadId: event.channel,
        platform: 'slack',
        raw: event,
      };

      // Process asynchronously — Slack expects a 200 within 3 seconds
      processMessage(incomingMessage, event.channel, botToken, bridge, event.ts);

      return c.json({ ok: true });
    }

    return c.json({ ok: true });
  });

  // Health check
  app.get('/slack/health', (c) => {
    return c.json({ status: 'ok', connector: 'slack' });
  });

  return app;
}

async function processMessage(
  message: IncomingMessage,
  channel: string,
  botToken: string,
  bridge: AgentBridge,
  threadTs: string,
): Promise<void> {
  try {
    const responseText = await bridge.invoke(message);
    await postMessage(botToken, channel, responseText, threadTs);
  } catch (error) {
    console.error('[conduit/slack] Error processing message:', error);
    await postMessage(
      botToken,
      channel,
      'Sorry, I encountered an error processing your message.',
      threadTs,
    );
  }
}
```

#### `index.ts` — Package Entry Point

```ts
import { createSlackRoutes } from './routes.ts';

// Export the Hono app for use in langgraph.json http.app
export const app = createSlackRoutes();
```

This is what `langgraph.json` references: `"app": "./node_modules/@conduit/slack:app"`.

### 3. `@conduit/whatsapp` — WhatsApp Connector

#### `verify.ts` — Meta Webhook Signature Verification

Meta signs every webhook POST with an `X-Hub-Signature-256` header using the app secret as the HMAC key.

```ts
export async function verifyWebhookSignature(
  appSecret: string,
  signature: string,
  body: string,
): Promise<boolean> {
  const key = new TextEncoder().encode(appSecret);
  const msg = new TextEncoder().encode(body);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msg);
  const expected = 'sha256=' + Buffer.from(sig).toString('hex');

  return expected === signature;
}
```

#### `api.ts` — WhatsApp Cloud API Client

Sends text message replies via the WhatsApp Cloud API.

```ts
const GRAPH_API_VERSION = 'v21.0';

export async function sendMessage(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  text: string,
): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`WhatsApp API error: ${error.error?.message ?? response.statusText}`);
  }
}
```

#### `routes.ts` — Webhook Route Handlers

WhatsApp uses two webhook interactions:

1. **GET `/whatsapp/webhook`** — Meta verification challenge (checks `hub.mode`, `hub.verify_token`, returns `hub.challenge`)
2. **POST `/whatsapp/webhook`** — Incoming message notifications

```ts
import { Hono } from 'hono';
import { AgentBridge, type IncomingMessage } from '@conduit/core';
import { verifyWebhookSignature } from './verify.ts';
import { sendMessage } from './api.ts';

export function createWhatsAppRoutes(): Hono {
  const app = new Hono();
  const bridge = new AgentBridge();

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const appSecret = process.env.META_APP_SECRET;

  if (!accessToken || !phoneNumberId || !verifyToken || !appSecret) {
    throw new Error(
      'Missing required WhatsApp environment variables: ' +
        'WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, ' +
        'WHATSAPP_VERIFY_TOKEN, META_APP_SECRET',
    );
  }

  // Meta webhook verification (GET)
  app.get('/whatsapp/webhook', (c) => {
    const mode = c.req.query('hub.mode');
    const token = c.req.query('hub.verify_token');
    const challenge = c.req.query('hub.challenge');

    if (mode === 'subscribe' && token === verifyToken) {
      return c.text(challenge ?? '', 200);
    }

    return c.text('Forbidden', 403);
  });

  // Incoming message webhook (POST)
  app.post('/whatsapp/webhook', async (c) => {
    const rawBody = await c.req.text();
    const signature = c.req.header('x-hub-signature-256') ?? '';

    const valid = await verifyWebhookSignature(appSecret, signature, rawBody);
    if (!valid) {
      return c.json({ error: 'Invalid signature' }, 401);
    }

    const body = JSON.parse(rawBody);

    // Extract messages from the nested Meta webhook structure
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) {
      return c.json({ ok: true });
    }

    for (const msg of messages) {
      // Only handle text messages for the POC
      if (msg.type !== 'text') continue;

      const incomingMessage: IncomingMessage = {
        platformMessageId: msg.id,
        text: msg.text?.body ?? '',
        senderId: msg.from,
        threadId: msg.from, // Use sender phone as thread ID
        platform: 'whatsapp',
        raw: msg,
      };

      processMessage(incomingMessage, msg.from, accessToken, phoneNumberId, bridge);
    }

    return c.json({ ok: true });
  });

  // Health check
  app.get('/whatsapp/health', (c) => {
    return c.json({ status: 'ok', connector: 'whatsapp' });
  });

  return app;
}

async function processMessage(
  message: IncomingMessage,
  recipientPhone: string,
  accessToken: string,
  phoneNumberId: string,
  bridge: AgentBridge,
): Promise<void> {
  try {
    const responseText = await bridge.invoke(message);
    await sendMessage(accessToken, phoneNumberId, recipientPhone, responseText);
  } catch (error) {
    console.error('[conduit/whatsapp] Error processing message:', error);
    await sendMessage(
      accessToken,
      phoneNumberId,
      recipientPhone,
      'Sorry, I encountered an error processing your message.',
    );
  }
}
```

#### `index.ts` — Package Entry Point

```ts
import { createWhatsAppRoutes } from './routes.ts';

export const app = createWhatsAppRoutes();
export { createWhatsAppRoutes } from './routes.ts';
```

### 4. Example Application

The `example/` directory demonstrates a complete setup using both Slack and WhatsApp connectors with a minimal LangGraph agent.

#### `example/agent.ts`

```ts
import { createAgent } from 'langchain';

export const agent = createAgent({
  model: 'anthropic:claude-haiku-4-5',
});
```

#### `example/conduit.ts`

```ts
import { createConduitApp } from '@conduit/core';
import { slack } from '@conduit/slack';
import { whatsapp } from '@conduit/whatsapp';

export const app = createConduitApp({ slack, whatsapp });
```

#### `example/langgraph.json`

```json
{
  "node_version": "22",
  "graphs": {
    "agent": "./agent.ts:agent"
  },
  "env": ".env",
  "http": {
    "app": "./conduit.ts:app"
  }
}
```

---

## Environment Variables

| Variable                   | Connector | Required | Description                                                 |
| -------------------------- | --------- | -------- | ----------------------------------------------------------- |
| `SLACK_BOT_TOKEN`          | Slack     | Yes      | Slack Bot User OAuth Token (`xoxb-...`)                     |
| `SLACK_SIGNING_SECRET`     | Slack     | Yes      | Slack app signing secret for webhook verification           |
| `WHATSAPP_ACCESS_TOKEN`    | WhatsApp  | Yes      | Meta permanent access token for the WhatsApp Business API   |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp  | Yes      | WhatsApp Business phone number ID                           |
| `WHATSAPP_VERIFY_TOKEN`    | WhatsApp  | Yes      | Custom string used to verify the webhook endpoint with Meta |
| `META_APP_SECRET`          | WhatsApp  | Yes      | Meta app secret for webhook signature verification          |

These are set in the user's `.env` file, which LangGraph loads via the `"env": ".env"` config.

---

## Monorepo Setup

### Root `package.json`

```json
{
  "name": "conduit",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "bun test",
    "lint": "bunx biome check .",
    "lint:fix": "bunx biome check --write ."
  }
}
```

### `packages/core/package.json`

```json
{
  "name": "@conduit/core",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@langchain/langgraph-sdk": "^1.7.5",
    "hono": "^4.12.8"
  },
  "devDependencies": {
    "@types/bun": "latest"
  },
  "peerDependencies": {
    "typescript": "^5"
  }
}
```

### `packages/slack/package.json`

```json
{
  "name": "@conduit/slack",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@conduit/core": "workspace:*",
    "hono": "^4.12.8"
  },
  "devDependencies": {
    "@types/bun": "latest"
  },
  "peerDependencies": {
    "typescript": "^5"
  }
}
```

### `packages/whatsapp/package.json`

```json
{
  "name": "@conduit/whatsapp",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@conduit/core": "workspace:*",
    "hono": "^4.12.8"
  },
  "devDependencies": {
    "@types/bun": "latest"
  },
  "peerDependencies": {
    "typescript": "^5"
  }
}
```

---

## Testing Strategy

### Unit Tests

1. **Slack signature verification** — Test `verifySlackRequest` with known good/bad signatures and expired timestamps
2. **Slack message normalization** — Test that Slack event payloads are correctly mapped to `IncomingMessage`
3. **Slack API client** — Test `postMessage` with mocked fetch responses (success and error cases)
4. **WhatsApp signature verification** — Test `verifyWebhookSignature` with known good/bad signatures
5. **WhatsApp message normalization** — Test that Meta webhook payloads are correctly mapped to `IncomingMessage`
6. **WhatsApp API client** — Test `sendMessage` with mocked fetch responses
7. **Agent bridge** — Test `AgentBridge.invoke` with a mocked LangGraph SDK client
8. **createConduitApp** — Test that multiple connector apps are merged and health endpoint lists all connectors

### Integration Test (Manual)

1. Run the example app with `npx @langchain/langgraph-cli dev` from the `example/` directory
2. Verify health endpoints: `/slack/health`, `/whatsapp/health`, `/conduit/health`
3. Test Slack URL verification challenge and WhatsApp Meta verification challenge
4. Test with real platform apps or mock webhook payloads via curl

---

## Implementation Plan

### Step 1: Monorepo Setup

- Convert root `package.json` to workspace config
- Create `packages/core/`, `packages/slack/`, `packages/whatsapp/` directory structure
- Configure `tsconfig.json` for workspace references
- Install dependencies (`hono`, `@langchain/langgraph-sdk`)

### Step 2: `@conduit/core` Types, Bridge, and App Factory

- Implement `types.ts` with `IncomingMessage`, `OutgoingMessage`, `Connector`, `ConnectorConfig`
- Implement `bridge.ts` with `AgentBridge` class
- Implement `app.ts` with `createConduitApp()` factory
- Export public API from `index.ts`
- Write unit tests for the bridge and app factory

### Step 3: `@conduit/slack` Connector

- Implement `verify.ts` for Slack request signature verification
- Implement `api.ts` for Slack Web API message posting
- Implement `routes.ts` with Hono webhook handler
- Export `app` from `index.ts`
- Write unit tests for verification and message handling

### Step 4: `@conduit/whatsapp` Connector

- Implement `verify.ts` for Meta webhook signature verification
- Implement `api.ts` for WhatsApp Cloud API message sending
- Implement `routes.ts` with Hono webhook handler (GET verification + POST messages)
- Export `app` from `index.ts`
- Write unit tests for verification and message handling

### Step 5: Example Application

- Create `example/` directory with `agent.ts`, `conduit.ts`, `langgraph.json`, `package.json`
- Wire both Slack and WhatsApp connectors via `createConduitApp()`
- Document setup steps in `example/README.md`

### Step 6: End-to-End Validation

- Run the example app locally with `@langchain/langgraph-cli dev`
- Verify all health endpoints are reachable
- Test platform verification challenges via curl
- Run full test suite with `bun test`

---

## Success Criteria

- [ ] `@conduit/core` exports `AgentBridge`, `IncomingMessage`, `OutgoingMessage`, `createConduitApp`, and related types
- [ ] `@conduit/slack` exports a Hono `app` that handles Slack Events API webhooks
- [ ] `@conduit/whatsapp` exports a Hono `app` that handles WhatsApp Cloud API webhooks
- [ ] `createConduitApp()` merges multiple connector apps into a single Hono app with a combined health endpoint
- [ ] Adding `"app": "./conduit.ts:app"` to `langgraph.json` makes all connector endpoints available
- [ ] A Slack message sent to the bot triggers the LangGraph agent and the response appears in Slack
- [ ] A WhatsApp message sent to the business number triggers the LangGraph agent and the response appears in WhatsApp
- [ ] Request signature verification rejects invalid/replayed requests on both platforms
- [ ] The `example/` directory provides a complete, runnable reference setup
- [ ] All unit tests pass via `bun test`
