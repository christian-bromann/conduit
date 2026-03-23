const DISCORD_API = 'https://discord.com/api/v10';

export async function editOriginalResponse(
  applicationId: string,
  interactionToken: string,
  content: string,
  fetchFn: (input: string | URL | Request, init?: RequestInit) => Promise<Response> = fetch,
): Promise<void> {
  const url = `${DISCORD_API}/webhooks/${applicationId}/${interactionToken}/messages/@original`;

  const response = await fetchFn(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const error = (await response.json()) as { message?: string };
    throw new Error(`Discord API error: ${error.message ?? response.statusText}`);
  }
}

export async function registerSlashCommand(
  applicationId: string,
  botToken: string,
  commandName = 'ask',
  commandDescription = 'Ask the AI agent a question',
  fetchFn: (input: string | URL | Request, init?: RequestInit) => Promise<Response> = fetch,
): Promise<void> {
  const url = `${DISCORD_API}/applications/${applicationId}/commands`;

  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: commandName,
      description: commandDescription,
      type: 1,
      options: [
        {
          name: 'message',
          description: 'Your message to the agent',
          type: 3,
          required: true,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = (await response.json()) as { message?: string };
    throw new Error(
      `Discord API error registering command: ${error.message ?? response.statusText}`,
    );
  }
}
