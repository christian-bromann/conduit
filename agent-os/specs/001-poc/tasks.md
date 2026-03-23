# Tasks: Conduit POC

## Group 1: Monorepo Setup

### Task 1.1: Convert to Bun workspace monorepo

- [x] Update root `package.json` to add `"workspaces": ["packages/*"]`, set `"private": true`, and add `test`/`lint`/`lint:fix` scripts
- [x] Remove the placeholder `index.ts` entry point (no longer needed at root)
- [x] Create directory structure: `packages/core/src/`, `packages/slack/src/`, `packages/whatsapp/src/`

### Task 1.2: Create `@conduit/core` package scaffolding

- [x] Create `packages/core/package.json` with name `@conduit/core`, type `module`, exports map pointing to `./src/index.ts`
- [x] Add dependencies: `@langchain/langgraph-sdk`, `hono`
- [x] Add devDependency: `@types/bun`
- [x] Create empty `packages/core/src/index.ts` placeholder

### Task 1.3: Create `@conduit/slack` package scaffolding

- [x] Create `packages/slack/package.json` with name `@conduit/slack`, type `module`, exports map pointing to `./src/index.ts`
- [x] Add dependencies: `@conduit/core` (workspace:\*), `hono`
- [x] Add devDependency: `@types/bun`
- [x] Create empty `packages/slack/src/index.ts` placeholder

### Task 1.4: Create `@conduit/whatsapp` package scaffolding

- [x] Create `packages/whatsapp/package.json` with name `@conduit/whatsapp`, type `module`, exports map pointing to `./src/index.ts`
- [x] Add dependencies: `@conduit/core` (workspace:\*), `hono`
- [x] Add devDependency: `@types/bun`
- [x] Create empty `packages/whatsapp/src/index.ts` placeholder

### Task 1.5: Configure TypeScript

- [x] Update root `tsconfig.json` with project references for all packages
- [x] Create `packages/core/tsconfig.json` extending root config
- [x] Create `packages/slack/tsconfig.json` extending root config, with path alias for `@conduit/core`
- [x] Create `packages/whatsapp/tsconfig.json` extending root config, with path alias for `@conduit/core`

### Task 1.6: Install dependencies and verify workspace

- [x] Run `bun install` and verify workspace resolution works
- [x] Verify all packages are linked correctly (core importable from slack and whatsapp)

---

## Group 2: `@conduit/core` — Types, Bridge, and App Factory

### Task 2.1: Implement shared types (`packages/core/src/types.ts`)

- [x] Define `IncomingMessage` interface: `platformMessageId`, `text`, `senderId`, `threadId`, `platform`, `raw`
- [x] Define `OutgoingMessage` interface: `text`, `threadId`
- [x] Define `ConnectorConfig` interface: `name`, optional `assistantId`
- [x] Define `Connector` interface: `config`, `sendMessage()`

### Task 2.2: Implement agent bridge (`packages/core/src/bridge.ts`)

- [x] Define `BridgeConfig` interface: optional `assistantId`, optional `apiUrl`
- [x] Implement `AgentBridge` class with `Client` from `@langchain/langgraph-sdk`
- [x] Implement `invoke(message: IncomingMessage): Promise<string>` that:
  - [x] Resolves assistant ID (configured or auto-discovered)
  - [x] Creates a thread via the SDK
  - [x] Calls `client.runs.wait()` with the user message
  - [x] Extracts and returns the last AI message content
- [x] Implement private `resolveAssistant()` that searches for the first available assistant

### Task 2.3: Implement multi-connector app factory (`packages/core/src/app.ts`)

- [x] Implement `createConduitApp(connectors: Record<string, Hono>): Hono`
- [x] Merge all connector Hono apps into a single Hono app using `app.route("/", connectorApp)`
- [x] Add combined health endpoint at `GET /conduit/health` that lists all registered connectors

### Task 2.4: Create public API exports (`packages/core/src/index.ts`)

- [x] Re-export all types from `types.ts`
- [x] Re-export `AgentBridge` and `BridgeConfig` from `bridge.ts`
- [x] Re-export `createConduitApp` from `app.ts`

### Task 2.5: Write unit tests for `AgentBridge`

- [x] Create `packages/core/src/bridge.test.ts`
- [x] Test `invoke()` with a mocked `Client` — verify it creates a thread, calls `runs.wait()`, and extracts the AI message
- [x] Test `resolveAssistant()` auto-discovery with mocked `assistants.search()`
- [x] Test error case: no assistants found throws an error
- [x] Test configured `assistantId` skips auto-discovery

### Task 2.6: Write unit tests for `createConduitApp`

- [x] Create `packages/core/src/app.test.ts`
- [x] Test that routes from multiple connector apps are accessible through the merged app
- [x] Test that `GET /conduit/health` returns status and list of connector names
- [x] Test with zero connectors (edge case)

---

## Group 3: `@conduit/slack` — Slack Connector

### Task 3.1: Implement request signature verification (`packages/slack/src/verify.ts`)

- [x] Implement `verifySlackRequest(signingSecret, signature, timestamp, body): Promise<boolean>`
- [x] Reject requests older than 5 minutes (replay attack protection)
- [x] Compute HMAC-SHA256 using Web Crypto API (`crypto.subtle`)
- [x] Compare computed signature with Slack's `x-slack-signature` header

### Task 3.2: Write unit tests for signature verification

- [x] Create `packages/slack/src/verify.test.ts`
- [x] Test valid signature returns `true`
- [x] Test invalid signature returns `false`
- [x] Test expired timestamp (>5 minutes old) returns `false`
- [x] Test valid timestamp within window returns `true`

### Task 3.3: Implement Slack Web API client (`packages/slack/src/api.ts`)

- [x] Implement `postMessage(token, channel, text, threadTs?): Promise<void>`
- [x] POST to `https://slack.com/api/chat.postMessage` with Bearer token auth
- [x] Support optional `thread_ts` for threaded replies
- [x] Throw on Slack API errors (`data.ok === false`)

### Task 3.4: Write unit tests for Slack API client

- [x] Create `packages/slack/src/api.test.ts`
- [x] Test successful message post (mock `fetch`)
- [x] Test error response throws with Slack error message
- [x] Test `thread_ts` is included when provided, omitted when not

### Task 3.5: Implement webhook route handler (`packages/slack/src/routes.ts`)

- [x] Implement `createSlackRoutes(): Hono` factory function
- [x] Read `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` from `process.env`, throw if missing
- [x] POST `/slack/events` route:
  - [x] Verify request signature (reject 401 if invalid)
  - [x] Handle `url_verification` challenge (return `{ challenge }`)
  - [x] Handle `event_callback` with `message` event type
  - [x] Ignore bot messages (`bot_id` or `subtype` present)
  - [x] Normalize Slack event to `IncomingMessage`
  - [x] Invoke bridge asynchronously (respond 200 immediately — Slack's 3s timeout)
  - [x] Post agent response back via Slack API
- [x] GET `/slack/health` health check route
- [x] Implement `processMessage()` helper with error handling and fallback error message

### Task 3.6: Write unit tests for webhook routes

- [x] Create `packages/slack/src/routes.test.ts`
- [x] Test URL verification challenge returns correct response
- [x] Test valid message event triggers bridge invocation
- [x] Test bot messages are ignored (no bridge call)
- [x] Test invalid signature returns 401
- [x] Test missing env vars throws on construction

### Task 3.7: Create package entry point (`packages/slack/src/index.ts`)

- [x] Import `createSlackRoutes` from `routes.ts`
- [x] Export `const app = createSlackRoutes()`
- [x] Also export `createSlackRoutes` for users who want custom configuration

---

## Group 4: `@conduit/whatsapp` — WhatsApp Connector

### Task 4.1: Implement Meta webhook signature verification (`packages/whatsapp/src/verify.ts`)

- [x] Implement `verifyWebhookSignature(appSecret, signature, body): Promise<boolean>`
- [x] Compute HMAC-SHA256 using Web Crypto API (`crypto.subtle`) with Meta app secret as key
- [x] Compare computed `sha256=...` string with `X-Hub-Signature-256` header value

### Task 4.2: Write unit tests for signature verification

- [x] Create `packages/whatsapp/src/verify.test.ts`
- [x] Test valid signature returns `true`
- [x] Test invalid signature returns `false`
- [x] Test empty/missing signature returns `false`

### Task 4.3: Implement WhatsApp Cloud API client (`packages/whatsapp/src/api.ts`)

- [x] Implement `sendMessage(accessToken, phoneNumberId, to, text): Promise<void>`
- [x] POST to `https://graph.facebook.com/v21.0/{phoneNumberId}/messages` with Bearer token auth
- [x] Send text message with `messaging_product: "whatsapp"`, `recipient_type: "individual"`
- [x] Throw on non-OK HTTP responses with error message from Meta API

### Task 4.4: Write unit tests for WhatsApp API client

- [x] Create `packages/whatsapp/src/api.test.ts`
- [x] Test successful message send (mock `fetch`)
- [x] Test error response throws with Meta API error message
- [x] Test request body structure matches WhatsApp Cloud API format

### Task 4.5: Implement webhook route handler (`packages/whatsapp/src/routes.ts`)

- [x] Implement `createWhatsAppRoutes(): Hono` factory function
- [x] Read `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET` from `process.env`, throw if missing
- [x] GET `/whatsapp/webhook` route — Meta verification challenge:
  - [x] Check `hub.mode === "subscribe"` and `hub.verify_token` matches configured token
  - [x] Return `hub.challenge` as plain text with 200, or 403 if verification fails
- [x] POST `/whatsapp/webhook` route — incoming messages:
  - [x] Verify `X-Hub-Signature-256` (reject 401 if invalid)
  - [x] Parse nested Meta webhook structure: `entry[].changes[].value.messages[]`
  - [x] Only handle `type: "text"` messages for the POC
  - [x] Normalize to `IncomingMessage` (use sender phone number as `threadId`)
  - [x] Invoke bridge asynchronously, respond 200 immediately
  - [x] Send agent response back via WhatsApp Cloud API
- [x] GET `/whatsapp/health` health check route
- [x] Implement `processMessage()` helper with error handling and fallback error message

### Task 4.6: Write unit tests for webhook routes

- [x] Create `packages/whatsapp/src/routes.test.ts`
- [x] Test Meta verification challenge succeeds with correct verify token
- [x] Test Meta verification challenge returns 403 with wrong token
- [x] Test valid text message event triggers bridge invocation
- [x] Test non-text messages are skipped
- [x] Test invalid signature returns 401
- [x] Test missing env vars throws on construction
- [x] Test webhook with no messages array returns ok

### Task 4.7: Create package entry point (`packages/whatsapp/src/index.ts`)

- [x] Import `createWhatsAppRoutes` from `routes.ts`
- [x] Export `const app = createWhatsAppRoutes()`
- [x] Also export `createWhatsAppRoutes` for users who want custom configuration

---

## Group 5: Example Application

### Task 5.1: Create example directory structure

- [x] Create `example/package.json` with dependencies on `@conduit/core`, `@conduit/slack`, `@conduit/whatsapp`, `@langchain/langgraph`, and `langchain`
- [x] Create `example/agent.ts` with a minimal `createAgent()` using `anthropic:claude-haiku-4-5`
- [x] Create `example/conduit.ts` that imports both connectors and uses `createConduitApp({ slack, whatsapp })`
- [x] Create `example/langgraph.json` with the agent graph and `http.app` pointing to `./conduit.ts:app`

### Task 5.2: Write example README

- [x] Create `example/README.md` documenting:
  - [x] Prerequisites (Slack app, WhatsApp Business account, API keys)
  - [x] Environment variable setup (`.env` file with all required variables)
  - [x] How to run the example (`npx @langchain/langgraph-cli dev`)
  - [x] How to test with curl (verification challenges, mock messages)
  - [x] How to connect real Slack and WhatsApp apps

---

## Group 6: End-to-End Validation

### Task 6.1: Manual integration test with curl

- [x] Verified all health endpoints respond correctly
- [x] Verified Slack URL verification challenge works
- [x] Verified WhatsApp Meta verification challenge works
- [x] Verified invalid signatures return 401 on both connectors

### Task 6.2: Verify all tests pass

- [x] Run `bun test` from root — 35 tests pass across 8 files
- [x] Verify no TypeScript errors with `bunx tsc --noEmit` — 0 errors
