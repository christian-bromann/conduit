import { test, expect, mock, beforeEach, afterEach } from 'bun:test';

const originalEnv = { ...process.env };

const APP_SECRET = 'app-secret';

const mockInvoke = mock(() => Promise.resolve('Agent response'));

mock.module('@conduit/core', () => ({
  AgentBridge: class {
    invoke = mockInvoke;
  },
}));

import { createWhatsAppRoutes } from './routes.ts';

beforeEach(() => {
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-access-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-123';
  process.env.WHATSAPP_VERIFY_TOKEN = 'my-verify-token';
  process.env.META_APP_SECRET = APP_SECRET;
  mockInvoke.mockClear();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

async function signBody(body: string): Promise<string> {
  const key = new TextEncoder().encode(APP_SECRET);
  const msg = new TextEncoder().encode(body);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msg);
  return 'sha256=' + Buffer.from(sig).toString('hex');
}

async function makePostRequest(body: unknown, validSig = true) {
  const rawBody = JSON.stringify(body);
  const signature = validSig ? await signBody(rawBody) : 'sha256=invalid';
  return new Request('http://localhost/whatsapp/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': signature,
    },
    body: rawBody,
  });
}

test('responds to Meta verification challenge with correct token', async () => {
  const app = createWhatsAppRoutes();
  const res = await app.request(
    '/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=my-verify-token&hub.challenge=challenge-abc',
  );

  expect(res.status).toBe(200);
  expect(await res.text()).toBe('challenge-abc');
});

test('returns 403 for incorrect verify token', async () => {
  const app = createWhatsAppRoutes();
  const res = await app.request(
    '/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=test',
  );

  expect(res.status).toBe(403);
});

test('processes text message events', async () => {
  const app = createWhatsAppRoutes();
  const body = {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: 'wamid.123',
                  from: '16505551234',
                  type: 'text',
                  text: { body: 'Hello agent' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const req = await makePostRequest(body);
  const res = await app.request(req);

  expect(res.status).toBe(200);
  await new Promise((r) => setTimeout(r, 50));
  expect(mockInvoke).toHaveBeenCalledTimes(1);
});

test('skips non-text messages', async () => {
  const app = createWhatsAppRoutes();
  const body = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [{ id: 'wamid.456', from: '16505551234', type: 'image' }],
            },
          },
        ],
      },
    ],
  };

  const req = await makePostRequest(body);
  const res = await app.request(req);

  expect(res.status).toBe(200);
  await new Promise((r) => setTimeout(r, 50));
  expect(mockInvoke).not.toHaveBeenCalled();
});

test('rejects requests with invalid signature', async () => {
  const app = createWhatsAppRoutes();
  const req = await makePostRequest({ entry: [] }, false);
  const res = await app.request(req);

  expect(res.status).toBe(401);
});

test('throws when env vars are missing', () => {
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;

  expect(() => createWhatsAppRoutes()).toThrow('Missing required WhatsApp environment variables');
});

test('returns ok for webhook with no messages', async () => {
  const app = createWhatsAppRoutes();
  const body = { entry: [{ changes: [{ value: {} }] }] };

  const req = await makePostRequest(body);
  const res = await app.request(req);

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

test('health check returns ok', async () => {
  const app = createWhatsAppRoutes();
  const res = await app.request('/whatsapp/health');

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: 'ok', connector: 'whatsapp' });
});
