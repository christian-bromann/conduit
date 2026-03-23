import { test, expect } from 'bun:test';
import { verifySlackRequest } from './verify.ts';

const SIGNING_SECRET = 'test-secret-12345';

async function generateSignature(secret: string, timestamp: string, body: string): Promise<string> {
  const sigBasestring = `v0:${timestamp}:${body}`;
  const key = new TextEncoder().encode(secret);
  const msg = new TextEncoder().encode(sigBasestring);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msg);
  return 'v0=' + Buffer.from(sig).toString('hex');
}

test('returns true for valid signature', async () => {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = '{"type":"url_verification"}';
  const signature = await generateSignature(SIGNING_SECRET, timestamp, body);

  const result = await verifySlackRequest(SIGNING_SECRET, signature, timestamp, body);
  expect(result).toBe(true);
});

test('returns false for invalid signature', async () => {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = '{"type":"url_verification"}';

  const result = await verifySlackRequest(SIGNING_SECRET, 'v0=invalidsignature', timestamp, body);
  expect(result).toBe(false);
});

test('returns false for expired timestamp', async () => {
  const expiredTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
  const body = '{"type":"url_verification"}';
  const signature = await generateSignature(SIGNING_SECRET, expiredTimestamp, body);

  const result = await verifySlackRequest(SIGNING_SECRET, signature, expiredTimestamp, body);
  expect(result).toBe(false);
});

test('returns true for timestamp within 5-minute window', async () => {
  const recentTimestamp = (Math.floor(Date.now() / 1000) - 120).toString();
  const body = '{"text":"hello"}';
  const signature = await generateSignature(SIGNING_SECRET, recentTimestamp, body);

  const result = await verifySlackRequest(SIGNING_SECRET, signature, recentTimestamp, body);
  expect(result).toBe(true);
});
