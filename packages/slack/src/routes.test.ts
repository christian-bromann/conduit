import { test, expect, mock, beforeEach, afterEach } from 'bun:test';

const originalEnv = { ...process.env };

const SIGNING_SECRET = 'test-secret';

const mockInvoke = mock(() => Promise.resolve('Agent response'));

mock.module('@conduit/core', () => ({
  AgentBridge: class {
    invoke = mockInvoke;
  },
}));

import { createSlackRoutes } from './routes.ts';

beforeEach(() => {
  process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
  process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;
  mockInvoke.mockClear();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

async function signBody(body: string): Promise<{
  signature: string;
  timestamp: string;
}> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sigBasestring = `v0:${timestamp}:${body}`;
  const key = new TextEncoder().encode(SIGNING_SECRET);
  const msg = new TextEncoder().encode(sigBasestring);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msg);
  return {
    signature: 'v0=' + Buffer.from(sig).toString('hex'),
    timestamp,
  };
}

async function makeRequest(body: unknown, validSig = true) {
  const rawBody = JSON.stringify(body);
  const { signature, timestamp } = validSig
    ? await signBody(rawBody)
    : { signature: 'v0=invalid', timestamp: '0' };
  return new Request('http://localhost/slack/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-slack-request-timestamp': timestamp,
      'x-slack-signature': signature,
    },
    body: rawBody,
  });
}

test('responds to url_verification challenge', async () => {
  const app = createSlackRoutes();
  const req = await makeRequest({
    type: 'url_verification',
    challenge: 'test-challenge-token',
  });
  const res = await app.request(req);

  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toEqual({ challenge: 'test-challenge-token' });
});

test('processes message events', async () => {
  const app = createSlackRoutes();
  const req = await makeRequest({
    type: 'event_callback',
    event: {
      type: 'message',
      text: 'Hello agent',
      user: 'U12345',
      channel: 'C12345',
      ts: '1234567890.123456',
      client_msg_id: 'msg-abc',
    },
  });
  const res = await app.request(req);

  expect(res.status).toBe(200);
  await new Promise((r) => setTimeout(r, 50));
  expect(mockInvoke).toHaveBeenCalledTimes(1);
});

test('ignores bot messages', async () => {
  const app = createSlackRoutes();
  const req = await makeRequest({
    type: 'event_callback',
    event: {
      type: 'message',
      text: 'Bot message',
      bot_id: 'B12345',
      channel: 'C12345',
      ts: '1234567890.123456',
    },
  });
  const res = await app.request(req);

  expect(res.status).toBe(200);
  await new Promise((r) => setTimeout(r, 50));
  expect(mockInvoke).not.toHaveBeenCalled();
});

test('rejects requests with invalid signature', async () => {
  const app = createSlackRoutes();
  const req = await makeRequest({ type: 'event_callback' }, false);
  const res = await app.request(req);

  expect(res.status).toBe(401);
});

test('throws when env vars are missing', () => {
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.SLACK_SIGNING_SECRET;

  expect(() => createSlackRoutes()).toThrow('Missing SLACK_BOT_TOKEN or SLACK_SIGNING_SECRET');
});

test('health check returns ok', async () => {
  const app = createSlackRoutes();
  const res = await app.request('/slack/health');

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: 'ok', connector: 'slack' });
});
