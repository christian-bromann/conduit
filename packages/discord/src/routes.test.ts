import { test, expect, mock, beforeAll, beforeEach, afterEach } from 'bun:test';

const originalEnv = { ...process.env };

const mockInvoke = mock(() => Promise.resolve('Agent response'));

mock.module('@conduit/core', () => ({
  AgentBridge: class {
    invoke = mockInvoke;
  },
}));

import { createDiscordRoutes } from './routes.ts';

let testPublicKeyHex: string;
let testPrivateKey: CryptoKey;

beforeAll(async () => {
  const keyPair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  testPrivateKey = keyPair.privateKey;
  const rawPublicKey = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  testPublicKeyHex = Buffer.from(rawPublicKey).toString('hex');
});

beforeEach(() => {
  process.env.DISCORD_APPLICATION_ID = 'app-123';
  process.env.DISCORD_PUBLIC_KEY = testPublicKeyHex;
  mockInvoke.mockClear();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

async function signBody(timestamp: string, body: string): Promise<string> {
  const message = new TextEncoder().encode(timestamp + body);
  const sig = await crypto.subtle.sign('Ed25519', testPrivateKey, message);
  return Buffer.from(sig).toString('hex');
}

async function makeRequest(body: unknown, validSig = true) {
  const rawBody = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = validSig ? await signBody(timestamp, rawBody) : 'a'.repeat(128);
  return new Request('http://localhost/discord/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature-ed25519': signature,
      'x-signature-timestamp': timestamp,
    },
    body: rawBody,
  });
}

test('responds to PING with PONG', async () => {
  const app = createDiscordRoutes();
  const req = await makeRequest({ type: 1 });
  const res = await app.request(req);

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ type: 1 });
});

test('defers APPLICATION_COMMAND and invokes bridge', async () => {
  const app = createDiscordRoutes();
  const req = await makeRequest({
    type: 2,
    id: 'interaction-123',
    token: 'interaction-token',
    channel_id: 'channel-456',
    member: { user: { id: 'user-789' } },
    data: {
      options: [{ name: 'message', value: 'Hello agent' }],
    },
  });
  const res = await app.request(req);

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ type: 5 });

  await new Promise((r) => setTimeout(r, 50));
  expect(mockInvoke).toHaveBeenCalledTimes(1);
});

test('defers even when no message option is provided', async () => {
  const app = createDiscordRoutes();
  const req = await makeRequest({
    type: 2,
    id: 'interaction-123',
    token: 'interaction-token',
    channel_id: 'channel-456',
    data: { options: [] },
  });
  const res = await app.request(req);

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ type: 5 });

  await new Promise((r) => setTimeout(r, 50));
  expect(mockInvoke).not.toHaveBeenCalled();
});

test('rejects requests with invalid signature', async () => {
  const app = createDiscordRoutes();
  const req = await makeRequest({ type: 1 }, false);
  const res = await app.request(req);

  expect(res.status).toBe(401);
});

test('returns 400 for unknown interaction type', async () => {
  const app = createDiscordRoutes();
  const req = await makeRequest({ type: 99 });
  const res = await app.request(req);

  expect(res.status).toBe(400);
});

test('throws when env vars are missing', () => {
  delete process.env.DISCORD_APPLICATION_ID;
  delete process.env.DISCORD_PUBLIC_KEY;

  expect(() => createDiscordRoutes()).toThrow(
    'Missing DISCORD_APPLICATION_ID or DISCORD_PUBLIC_KEY',
  );
});

test('health check returns ok', async () => {
  const app = createDiscordRoutes();
  const res = await app.request('/discord/health');

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: 'ok', connector: 'discord' });
});
