import { test, expect, mock } from 'bun:test';
import { postMessage } from './api.ts';

type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function mockFetch(responseBody: unknown, status = 200) {
  return mock<FetchFn>(() =>
    Promise.resolve(new Response(JSON.stringify(responseBody), { status })),
  );
}

test('sends message with correct parameters', async () => {
  const fakeFetch = mockFetch({ ok: true });
  await postMessage('xoxb-token', 'C12345', 'Hello!', undefined, fakeFetch);

  expect(fakeFetch).toHaveBeenCalledTimes(1);
  const [url, opts] = fakeFetch.mock.calls[0]!;
  expect(url).toBe('https://slack.com/api/chat.postMessage');
  expect(opts?.method).toBe('POST');
  expect(opts?.headers).toEqual({
    Authorization: 'Bearer xoxb-token',
    'Content-Type': 'application/json',
  });

  const body = JSON.parse(opts?.body as string);
  expect(body.channel).toBe('C12345');
  expect(body.text).toBe('Hello!');
  expect(body.thread_ts).toBeUndefined();
});

test('includes thread_ts when provided', async () => {
  const fakeFetch = mockFetch({ ok: true });
  await postMessage('xoxb-token', 'C12345', 'Reply', '1234567890.123456', fakeFetch);

  const [, opts] = fakeFetch.mock.calls[0]!;
  const body = JSON.parse(opts?.body as string);
  expect(body.thread_ts).toBe('1234567890.123456');
});

test('throws on Slack API error', async () => {
  const fakeFetch = mockFetch({ ok: false, error: 'channel_not_found' });

  await expect(
    postMessage('xoxb-token', 'C-invalid', 'Hello!', undefined, fakeFetch),
  ).rejects.toThrow('Slack API error: channel_not_found');
});
