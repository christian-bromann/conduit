# Tech Stack

## Runtime & Language

- **Runtime:** Bun
- **Language:** TypeScript
- **Package Manager:** Bun (workspaces)

## Architecture

- **Structure:** Monorepo with separate packages per connector
- **HTTP Framework:** Hono (lightweight, runs natively on Bun)
- **Package layout:**
  - `packages/core` — shared interfaces, message normalization, agent bridge
  - `packages/slack` — Slack connector
  - `packages/whatsapp` — WhatsApp connector
  - `packages/telegram` — Telegram connector
  - `packages/discord` — Discord connector

## Testing & Quality

- **Test Framework:** `bun:test`
- **Linting/Formatting:** Biome

## Deployment

- Connectors are published as npm packages under `@conduit/*` scope
- Each connector is a standalone Hono app exported for use in `langgraph.json`'s `http` config
