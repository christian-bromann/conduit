export async function verifyDiscordRequest(
  publicKey: string,
  signature: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  if (!signature || !timestamp) return false;

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    hexToUint8Array(publicKey),
    'Ed25519',
    false,
    ['verify'],
  );

  const message = new TextEncoder().encode(timestamp + body);

  return crypto.subtle.verify('Ed25519', cryptoKey, hexToUint8Array(signature), message);
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
