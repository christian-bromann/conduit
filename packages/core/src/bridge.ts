import { Client } from '@langchain/langgraph-sdk';
import type { IncomingMessage } from './types.ts';

export interface BridgeConfig {
  assistantId?: string;
  apiUrl?: string;
}

export class AgentBridge {
  private client: Client;
  private assistantId?: string;

  constructor(config?: BridgeConfig) {
    const apiUrl = config?.apiUrl ?? process.env.LANGGRAPH_API_URL;
    this.client = new Client({ apiUrl });
    this.assistantId = config?.assistantId;
  }

  async invoke(message: IncomingMessage): Promise<string> {
    const assistantId = this.assistantId ?? (await this.resolveAssistant());

    const thread = await this.client.threads.create();

    const response = await this.client.runs.wait(thread.thread_id, assistantId, {
      input: {
        messages: [{ role: 'user', content: message.text }],
      },
    });

    const res = response as Record<string, unknown>;
    const values = (res.values ?? res) as Record<string, unknown>;
    const msgArray = (values.messages as Array<Record<string, unknown>>) ?? [];
    const lastAiMessage = msgArray.filter((m) => m.type === 'ai' || m.role === 'assistant').pop();

    return (lastAiMessage?.content as string) ?? "I couldn't generate a response.";
  }

  private async resolveAssistant(): Promise<string> {
    const assistants = await this.client.assistants.search({ limit: 1 });
    if (assistants.length === 0) {
      throw new Error('No LangGraph assistants found');
    }
    const id = assistants[0]!.assistant_id;
    this.assistantId = id;
    return id;
  }
}
