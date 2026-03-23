export async function verifyWebhookSignature(
  appSecret: string,
  signature: string,
  body: string,
): Promise<boolean> {
  if (!signature) return false;

  const key = new TextEncoder().encode(appSecret);
  const msg = new TextEncoder().encode(body);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msg);
  const expected = 'sha256=' + Buffer.from(sig).toString('hex');

  return expected === signature;
}
