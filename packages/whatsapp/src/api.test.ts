import { test, expect, mock } from 'bun:test';
import { sendMessage } from './api.ts';

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

test('sends message with correct parameters', async () => {
  const fakeFetch = mockFetch({ messages: [{ id: 'wamid.123' }] });
  await sendMessage('access-token', 'phone-123', '16505551234', 'Hello!', fakeFetch);

  expect(fakeFetch).toHaveBeenCalledTimes(1);
  const [url, opts] = fakeFetch.mock.calls[0]!;
  expect(url).toBe('https://graph.facebook.com/v21.0/phone-123/messages');
  expect(opts?.method).toBe('POST');
  expect(opts?.headers).toEqual({
    Authorization: 'Bearer access-token',
    'Content-Type': 'application/json',
  });

  const body = JSON.parse(opts?.body as string);
  expect(body).toEqual({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '16505551234',
    type: 'text',
    text: { body: 'Hello!' },
  });
});

test('throws on non-OK response with API error message', async () => {
  const fakeFetch = mockFetch({ error: { message: 'Invalid access token' } }, 401);

  await expect(
    sendMessage('bad-token', 'phone-123', '16505551234', 'Hello!', fakeFetch),
  ).rejects.toThrow('WhatsApp API error: Invalid access token');
});

test('throws with statusText when no error message in response', async () => {
  const fakeFetch = mockFetch({}, 500);

  await expect(
    sendMessage('token', 'phone-123', '16505551234', 'Hello!', fakeFetch),
  ).rejects.toThrow('WhatsApp API error: Internal Server Error');
});
