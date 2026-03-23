# Product Roadmap

## Phase 1: MVP

Core connector infrastructure and first four messaging platform integrations.

- **Core package** — shared connector interface, message normalization, LangGraph agent bridging, and configuration utilities
- **Slack connector** — Bot/app integration via Slack Events API and Web API
- **WhatsApp connector** — Integration via WhatsApp Business API / Cloud API
- **Telegram connector** — Bot integration via Telegram Bot API
- **Discord connector** — Bot integration via Discord Gateway and REST API
- **Developer experience** — single-line `langgraph.json` configuration per connector, clear setup guides for each platform's credentials and webhooks

## Phase 2: Post-Launch

- **Rich media support** — handle images, files, voice messages, and other attachments across all connectors (send and receive)
- **Multi-agent routing** — route incoming messages to different LangGraph agents based on conversation context, channel, user, or custom rules
