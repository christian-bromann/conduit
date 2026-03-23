# Product Mission

## Problem

Agents deployed to LangChain via LangSmith are powerful but isolated — they live behind API endpoints with no direct connection to the messaging apps where users actually communicate. Developers who want their agents to respond on Slack, WhatsApp, Telegram, or Discord must build and maintain custom webhook integrations from scratch, dealing with each platform's unique API, authentication flow, and message format.

## Target Users

Developers and teams deploying LangGraph agents on LangSmith who want their agents to be reachable through popular messaging platforms without building bespoke integrations for each one.

## Solution

Conduit provides drop-in connector packages for messaging apps that plug directly into a LangGraph deployment's `langgraph.json` configuration. Instead of writing custom webhook handlers, a developer adds a single line:

```json
{
  "http": {
    "whatsapp": "./node_modules/@conduit/whatsapp:app"
  }
}
```

Each connector handles platform authentication, message ingestion, response formatting, and delivery — translating between the messaging platform's protocol and LangGraph's agent interface. Conduit's monorepo ships independent packages per platform, so teams install only the connectors they need.
