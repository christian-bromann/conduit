import { test, expect } from 'bun:test';
import { verifyWebhookSignature } from './verify.ts';

const APP_SECRET = 'test-app-secret';

async function generateSignature(secret: string, body: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
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

test('returns true for valid signature', async () => {
  const body = '{"entry":[]}';
  const signature = await generateSignature(APP_SECRET, body);

  const result = await verifyWebhookSignature(APP_SECRET, signature, body);
  expect(result).toBe(true);
});

test('returns false for invalid signature', async () => {
  const body = '{"entry":[]}';

  const result = await verifyWebhookSignature(APP_SECRET, 'sha256=invalidsignature', body);
  expect(result).toBe(false);
});

test('returns false for empty signature', async () => {
  const result = await verifyWebhookSignature(APP_SECRET, '', '{"entry":[]}');
  expect(result).toBe(false);
});
