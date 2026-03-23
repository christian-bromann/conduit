# @conduit/core

Shared foundation for Conduit messaging connectors. Provides the LangGraph agent bridge, common message types, and the multi-connector app factory.

## Installation

```bash
bun add @conduit/core
```

## API

### `AgentBridge`

Forwards incoming messages to a LangGraph agent and returns the response.

```ts
import { AgentBridge } from '@conduit/core';

const bridge = new AgentBridge({
  assistantId: 'my-agent', // optional — auto-discovers if omitted
  apiUrl: 'http://localhost:8123', // optional — defaults to LangGraph server
});

const response = await bridge.invoke({
  platformMessageId: 'msg-123',
  text: 'Hello!',
  senderId: 'user-1',
  threadId: 'thread-1',
  platform: 'slack',
  raw: {},
});
```

### `createConduitApp()`

Merges multiple connector Hono apps into a single app for use with `langgraph.json`'s `http.app` entry.

```ts
import { createConduitApp } from '@conduit/core';
import { app as slack } from '@conduit/slack';
import { app as whatsapp } from '@conduit/whatsapp';

export const app = createConduitApp({ slack, whatsapp });
```

The merged app includes a combined health endpoint at `GET /conduit/health`:

```json
{ "status": "ok", "connectors": ["slack", "whatsapp"] }
```

### Types

- **`IncomingMessage`** — normalized message from any platform (`platformMessageId`, `text`, `senderId`, `threadId`, `platform`, `raw`)
- **`OutgoingMessage`** — response to send back (`text`, `threadId`)
- **`ConnectorConfig`** — connector configuration (`name`, optional `assistantId`)
- **`Connector`** — interface for connector implementations (`config`, `sendMessage()`)
