import { test, expect, mock } from 'bun:test';
import { editOriginalResponse, registerSlashCommand } from './api.ts';

type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function mockFetch(responseBody: unknown, status = 200) {
  return mock<FetchFn>(() =>
    Promise.resolve(
      new Response(JSON.stringify(responseBody), {
        status,
        statusText: status === 500 ? 'Internal Server Error' : 'OK',
      }),
    ),
  );
}

test('editOriginalResponse PATCHes the correct URL', async () => {
  const fakeFetch = mockFetch({ id: 'msg-123' });
  await editOriginalResponse('app-123', 'interaction-token', 'Hello!', fakeFetch);

  expect(fakeFetch).toHaveBeenCalledTimes(1);
  const [url, opts] = fakeFetch.mock.calls[0]!;
  expect(url).toBe(
    'https://discord.com/api/v10/webhooks/app-123/interaction-token/messages/@original',
  );
  expect(opts?.method).toBe('PATCH');

  const body = JSON.parse(opts?.body as string);
  expect(body).toEqual({ content: 'Hello!' });
});

test('editOriginalResponse throws on error', async () => {
  const fakeFetch = mockFetch({ message: 'Unknown Webhook' }, 404);

  await expect(editOriginalResponse('app-123', 'bad-token', 'Hello!', fakeFetch)).rejects.toThrow(
    'Discord API error: Unknown Webhook',
  );
});

test('registerSlashCommand POSTs to the correct URL', async () => {
  const fakeFetch = mockFetch({ id: 'cmd-123' });
  await registerSlashCommand('app-123', 'bot-token', 'ask', 'Ask a question', fakeFetch);

  expect(fakeFetch).toHaveBeenCalledTimes(1);
  const [url, opts] = fakeFetch.mock.calls[0]!;
  expect(url).toBe('https://discord.com/api/v10/applications/app-123/commands');
  expect(opts?.method).toBe('POST');
  expect(opts?.headers).toEqual({
    Authorization: 'Bot bot-token',
    'Content-Type': 'application/json',
  });

  const body = JSON.parse(opts?.body as string);
  expect(body.name).toBe('ask');
  expect(body.type).toBe(1);
  expect(body.options[0].name).toBe('message');
  expect(body.options[0].type).toBe(3);
  expect(body.options[0].required).toBe(true);
});

test('registerSlashCommand throws on error', async () => {
  const fakeFetch = mockFetch({ message: 'Unauthorized' }, 401);

  await expect(
    registerSlashCommand('app-123', 'bad-token', 'ask', 'desc', fakeFetch),
  ).rejects.toThrow('Discord API error registering command: Unauthorized');
});
