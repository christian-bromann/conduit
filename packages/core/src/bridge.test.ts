import { test, expect, mock, beforeEach } from 'bun:test';
import { AgentBridge } from './bridge.ts';
import type { IncomingMessage } from './types.ts';

const mockMessage: IncomingMessage = {
  platformMessageId: 'msg-123',
  text: 'Hello agent',
  senderId: 'user-1',
  threadId: 'thread-1',
  platform: 'test',
  raw: {},
};

const mockWait = mock(() =>
  Promise.resolve({
    values: {
      messages: [
        { role: 'user', content: 'Hello agent' },
        { type: 'ai', content: 'Hello! How can I help?' },
      ],
    },
  }),
);

const mockThreadsCreate = mock(() => Promise.resolve({ thread_id: 'thread-abc' }));

const mockAssistantsSearch = mock(() => Promise.resolve([{ assistant_id: 'assistant-auto' }]));

mock.module('@langchain/langgraph-sdk', () => ({
  Client: class {
    threads = { create: mockThreadsCreate };
    runs = { wait: mockWait };
    assistants = { search: mockAssistantsSearch };
  },
}));

beforeEach(() => {
  mockWait.mockClear();
  mockThreadsCreate.mockClear();
  mockAssistantsSearch.mockClear();
});

test('invoke creates thread and returns AI response', async () => {
  const bridge = new AgentBridge({ assistantId: 'my-agent' });
  const result = await bridge.invoke(mockMessage);

  expect(result).toBe('Hello! How can I help?');
  expect(mockThreadsCreate).toHaveBeenCalledTimes(1);
  expect(mockWait).toHaveBeenCalledWith('thread-abc', 'my-agent', {
    input: { messages: [{ role: 'user', content: 'Hello agent' }] },
  });
});

test('invoke auto-discovers assistant when none configured', async () => {
  const bridge = new AgentBridge();
  const result = await bridge.invoke(mockMessage);

  expect(result).toBe('Hello! How can I help?');
  expect(mockAssistantsSearch).toHaveBeenCalledWith({ limit: 1 });
  expect(mockWait).toHaveBeenCalledWith('thread-abc', 'assistant-auto', {
    input: { messages: [{ role: 'user', content: 'Hello agent' }] },
  });
});

test('invoke skips auto-discovery when assistantId is configured', async () => {
  const bridge = new AgentBridge({ assistantId: 'configured-agent' });
  await bridge.invoke(mockMessage);

  expect(mockAssistantsSearch).not.toHaveBeenCalled();
});

test('resolveAssistant throws when no assistants found', async () => {
  mockAssistantsSearch.mockImplementationOnce(() => Promise.resolve([]));

  const bridge = new AgentBridge();
  await expect(bridge.invoke(mockMessage)).rejects.toThrow('No LangGraph assistants found');
});

test('invoke returns fallback when no AI message in response', async () => {
  mockWait.mockImplementationOnce(() => Promise.resolve({ values: { messages: [] } }));

  const bridge = new AgentBridge({ assistantId: 'my-agent' });
  const result = await bridge.invoke(mockMessage);

  expect(result).toBe("I couldn't generate a response.");
});
