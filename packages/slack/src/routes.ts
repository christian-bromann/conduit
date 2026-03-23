import { Hono } from 'hono';
import { AgentBridge, type IncomingMessage } from '@conduit/core';
import { verifySlackRequest } from './verify.ts';
import { postMessage } from './api.ts';

export function createSlackRoutes(): Hono {
  const app = new Hono();
  const bridge = new AgentBridge();

  const botToken = process.env.SLACK_BOT_TOKEN;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  if (!botToken || !signingSecret) {
    throw new Error('Missing SLACK_BOT_TOKEN or SLACK_SIGNING_SECRET environment variables');
  }

  app.post('/slack/events', async (c) => {
    const rawBody = await c.req.text();
    const timestamp = c.req.header('x-slack-request-timestamp') ?? '';
    const signature = c.req.header('x-slack-signature') ?? '';

    const valid = await verifySlackRequest(signingSecret, signature, timestamp, rawBody);
    if (!valid) {
      return c.json({ error: 'Invalid signature' }, 401);
    }

    const body = JSON.parse(rawBody);

    if (body.type === 'url_verification') {
      return c.json({ challenge: body.challenge });
    }

    if (body.type === 'event_callback' && body.event?.type === 'message') {
      const event = body.event;

      if (event.bot_id || event.subtype) {
        return c.json({ ok: true });
      }

      const incomingMessage: IncomingMessage = {
        platformMessageId: event.client_msg_id ?? event.ts,
        text: event.text ?? '',
        senderId: event.user,
        threadId: event.channel,
        platform: 'slack',
        raw: event,
      };

      processMessage(incomingMessage, event.channel, botToken, bridge, event.ts);

      return c.json({ ok: true });
    }

    return c.json({ ok: true });
  });

  app.get('/slack/health', (c) => {
    return c.json({ status: 'ok', connector: 'slack' });
  });

  return app;
}

async function processMessage(
  message: IncomingMessage,
  channel: string,
  botToken: string,
  bridge: AgentBridge,
  threadTs: string,
): Promise<void> {
  try {
    const responseText = await bridge.invoke(message);
    await postMessage(botToken, channel, responseText, threadTs);
  } catch (error) {
    console.error('[conduit/slack] Error processing message:', error);
    await postMessage(
      botToken,
      channel,
      'Sorry, I encountered an error processing your message.',
      threadTs,
    );
  }
}
