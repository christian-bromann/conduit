import { Hono } from 'hono';
import { AgentBridge, type IncomingMessage } from '@conduit/core';
import { verifyDiscordRequest } from './verify.ts';
import { editOriginalResponse } from './api.ts';

const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
} as const;

const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
} as const;

export function createDiscordRoutes(): Hono {
  const app = new Hono();
  const bridge = new AgentBridge();

  const applicationId = process.env.DISCORD_APPLICATION_ID;
  const publicKey = process.env.DISCORD_PUBLIC_KEY;

  if (!applicationId || !publicKey) {
    throw new Error('Missing DISCORD_APPLICATION_ID or DISCORD_PUBLIC_KEY environment variables');
  }

  app.post('/discord/interactions', async (c) => {
    const rawBody = await c.req.text();
    const signature = c.req.header('x-signature-ed25519') ?? '';
    const timestamp = c.req.header('x-signature-timestamp') ?? '';

    const valid = await verifyDiscordRequest(publicKey, signature, timestamp, rawBody);
    if (!valid) {
      return c.json({ error: 'Invalid signature' }, 401);
    }

    const body = JSON.parse(rawBody);

    if (body.type === InteractionType.PING) {
      return c.json({ type: InteractionResponseType.PONG });
    }

    if (body.type === InteractionType.APPLICATION_COMMAND) {
      const userMessage = extractMessage(body);

      if (userMessage) {
        const incomingMessage: IncomingMessage = {
          platformMessageId: body.id,
          text: userMessage,
          senderId: body.member?.user?.id ?? body.user?.id ?? 'unknown',
          threadId: body.channel_id ?? body.channel?.id ?? 'unknown',
          platform: 'discord',
          raw: body,
        };

        processInteraction(incomingMessage, applicationId, body.token, bridge);
      }

      return c.json({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      });
    }

    return c.json({ error: 'Unknown interaction type' }, 400);
  });

  app.get('/discord/health', (c) => {
    return c.json({ status: 'ok', connector: 'discord' });
  });

  return app;
}

function extractMessage(interaction: Record<string, unknown>): string | null {
  const data = interaction.data as { options?: Array<{ name: string; value: string }> } | undefined;
  const messageOption = data?.options?.find((opt) => opt.name === 'message');
  return messageOption?.value ?? null;
}

async function processInteraction(
  message: IncomingMessage,
  applicationId: string,
  interactionToken: string,
  bridge: AgentBridge,
): Promise<void> {
  try {
    const responseText = await bridge.invoke(message);
    await editOriginalResponse(applicationId, interactionToken, responseText);
  } catch (error) {
    console.error('[conduit/discord] Error processing interaction:', error);
    try {
      await editOriginalResponse(
        applicationId,
        interactionToken,
        'Sorry, I encountered an error processing your message.',
      );
    } catch {
      // Best-effort — interaction token may have expired
    }
  }
}
