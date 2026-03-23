export interface IncomingMessage {
  platformMessageId: string;
  text: string;
  senderId: string;
  threadId: string;
  platform: string;
  raw: unknown;
}

export interface OutgoingMessage {
  text: string;
  threadId: string;
}

export interface ConnectorConfig {
  name: string;
  assistantId?: string;
}

export interface Connector {
  config: ConnectorConfig;
  sendMessage(message: OutgoingMessage): Promise<void>;
}
