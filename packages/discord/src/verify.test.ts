import { test, expect } from 'bun:test';
import { verifyDiscordRequest } from './verify.ts';

let testPublicKeyHex: string;
let testPrivateKey: CryptoKey;

async function setupKeys() {
  const keyPair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  testPrivateKey = keyPair.privateKey;
  const rawPublicKey = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  testPublicKeyHex = Buffer.from(rawPublicKey).toString('hex');
}

async function sign(timestamp: string, body: string): Promise<string> {
  const message = new TextEncoder().encode(timestamp + body);
  const sig = await crypto.subtle.sign('Ed25519', testPrivateKey, message);
  return Buffer.from(sig).toString('hex');
}

test('returns true for valid signature', async () => {
  await setupKeys();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = '{"type":1}';
  const signature = await sign(timestamp, body);

  const result = await verifyDiscordRequest(testPublicKeyHex, signature, timestamp, body);
  expect(result).toBe(true);
});

test('returns false for invalid signature', async () => {
  await setupKeys();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = '{"type":1}';

  const result = await verifyDiscordRequest(testPublicKeyHex, 'a'.repeat(128), timestamp, body);
  expect(result).toBe(false);
});

test('returns false for empty signature', async () => {
  await setupKeys();
  const result = await verifyDiscordRequest(testPublicKeyHex, '', '12345', '{}');
  expect(result).toBe(false);
});

test('returns false for empty timestamp', async () => {
  await setupKeys();
  const body = '{"type":1}';
  const signature = await sign('12345', body);

  const result = await verifyDiscordRequest(testPublicKeyHex, signature, '', body);
  expect(result).toBe(false);
});
