import { Hono } from 'hono';
import { AgentBridge, type IncomingMessage } from '@conduit/core';
import { verifyWebhookSignature } from './verify.ts';
import { sendMessage } from './api.ts';

export function createWhatsAppRoutes(): Hono {
  const app = new Hono();
  const bridge = new AgentBridge();

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const appSecret = process.env.META_APP_SECRET;

  if (!accessToken || !phoneNumberId || !verifyToken || !appSecret) {
    throw new Error(
      'Missing required WhatsApp environment variables: ' +
        'WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, ' +
        'WHATSAPP_VERIFY_TOKEN, META_APP_SECRET',
    );
  }

  app.get('/whatsapp/webhook', (c) => {
    const mode = c.req.query('hub.mode');
    const token = c.req.query('hub.verify_token');
    const challenge = c.req.query('hub.challenge');

    if (mode === 'subscribe' && token === verifyToken) {
      return c.text(challenge ?? '', 200);
    }

    return c.text('Forbidden', 403);
  });

  app.post('/whatsapp/webhook', async (c) => {
    const rawBody = await c.req.text();
    const signature = c.req.header('x-hub-signature-256') ?? '';

    const valid = await verifyWebhookSignature(appSecret, signature, rawBody);
    if (!valid) {
      return c.json({ error: 'Invalid signature' }, 401);
    }

    const body = JSON.parse(rawBody);

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) {
      return c.json({ ok: true });
    }

    for (const msg of messages) {
      if (msg.type !== 'text') continue;

      const incomingMessage: IncomingMessage = {
        platformMessageId: msg.id,
        text: msg.text?.body ?? '',
        senderId: msg.from,
        threadId: msg.from,
        platform: 'whatsapp',
        raw: msg,
      };

      processMessage(incomingMessage, msg.from, accessToken, phoneNumberId, bridge);
    }

    return c.json({ ok: true });
  });

  app.get('/whatsapp/health', (c) => {
    return c.json({ status: 'ok', connector: 'whatsapp' });
  });

  return app;
}

async function processMessage(
  message: IncomingMessage,
  recipientPhone: string,
  accessToken: string,
  phoneNumberId: string,
  bridge: AgentBridge,
): Promise<void> {
  try {
    const responseText = await bridge.invoke(message);
    await sendMessage(accessToken, phoneNumberId, recipientPhone, responseText);
  } catch (error) {
    console.error('[conduit/whatsapp] Error processing message:', error);
    await sendMessage(
      accessToken,
      phoneNumberId,
      recipientPhone,
      'Sorry, I encountered an error processing your message.',
    );
  }
}
