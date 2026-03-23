import { test, expect, afterAll, beforeAll, describe } from 'bun:test';
import { Hono } from 'hono';
import { createGateway } from './gateway.ts';
import { isInProcessApp } from './gateway.types.ts';
import type { InProcessApp, ExternalApp } from './gateway.types.ts';

// ---------------------------------------------------------------------------
// In-process app tests (no child processes, pure Hono routing)
// ---------------------------------------------------------------------------

describe('createGateway – in-process apps', () => {
  test('mounts a single in-process app at a sub-path', async () => {
    const dashboard = new Hono();
    dashboard.get('/stats', (c) => c.json({ visits: 42 }));

    const { app } = createGateway({
      apps: [{ path: '/dashboard', app: dashboard }],
    });

    const res = await app.request('/dashboard/stats');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ visits: 42 });
  });

  test('mounts multiple in-process apps at different paths', async () => {
    const alpha = new Hono();
    alpha.get('/hello', (c) => c.text('alpha'));

    const beta = new Hono();
    beta.get('/hello', (c) => c.text('beta'));

    const { app } = createGateway({
      apps: [
        { path: '/alpha', app: alpha },
        { path: '/beta', app: beta },
      ],
    });

    const resA = await app.request('/alpha/hello');
    expect(resA.status).toBe(200);
    expect(await resA.text()).toBe('alpha');

    const resB = await app.request('/beta/hello');
    expect(resB.status).toBe(200);
    expect(await resB.text()).toBe('beta');
  });

  test('mounts an in-process app at root path "/"', async () => {
    const root = new Hono();
    root.get('/ping', (c) => c.text('pong'));

    const { app } = createGateway({
      apps: [{ path: '/', app: root }],
    });

    const res = await app.request('/ping');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('pong');
  });

  test('in-process apps coexist with gateway health endpoint', async () => {
    const svc = new Hono();
    svc.get('/ok', (c) => c.text('ok'));

    const { app } = createGateway({
      apps: [{ path: '/svc', app: svc }],
    });

    const healthRes = await app.request('/gateway/health');
    expect(healthRes.status).toBe(200);
    const health = await healthRes.json();
    expect(health.status).toBe('ok');
    expect(health.apps).toHaveLength(1);
    expect(health.apps[0].type).toBe('in-process');

    const svcRes = await app.request('/svc/ok');
    expect(svcRes.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Gateway health endpoint
// ---------------------------------------------------------------------------

describe('createGateway – /gateway/health', () => {
  test('reports both in-process and external apps', async () => {
    const inProc = new Hono();

    const { app } = createGateway({
      apps: [
        { path: '/web', app: inProc },
        { path: '/py', runtime: 'python', command: 'echo noop', port: 19999 },
      ],
    });

    const res = await app.request('/gateway/health');
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      status: string;
      apps: Array<{ path: string; type: string; runtime?: string }>;
    };
    expect(body.status).toBe('ok');
    expect(body.apps).toEqual([
      { path: '/web', type: 'in-process' },
      { path: '/py', type: 'external', runtime: 'python' },
    ]);
  });

  test('works with zero apps', async () => {
    const { app } = createGateway({ apps: [] });

    const res = await app.request('/gateway/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; apps: unknown[] };
    expect(body.apps).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// External app proxy (integration test with a real child server)
// ---------------------------------------------------------------------------

describe('createGateway – external app proxy', () => {
  const externalPort = 19876;
  let externalServer: ReturnType<typeof Bun.serve> | null = null;

  beforeAll(() => {
    externalServer = Bun.serve({
      port: externalPort,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/api/data') {
          return new Response(JSON.stringify({ source: 'external', method: req.method }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.pathname === '/api/echo' && req.method === 'POST') {
          return req.text().then(
            (body) =>
              new Response(JSON.stringify({ echo: body }), {
                headers: { 'Content-Type': 'application/json' },
              }),
          );
        }
        if (url.pathname === '/') {
          return new Response('root');
        }
        return new Response('not found', { status: 404 });
      },
    });
  });

  afterAll(() => {
    externalServer?.stop(true);
  });

  test('proxies GET requests to an external server at a sub-path', async () => {
    const { app } = createGateway({
      apps: [
        {
          path: '/ext',
          runtime: 'node',
          command: 'echo already-running',
          port: externalPort,
        },
      ],
    });

    const res = await app.request('/ext/api/data');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ source: 'external', method: 'GET' });
  });

  test('proxies POST requests with body', async () => {
    const { app } = createGateway({
      apps: [
        {
          path: '/ext',
          runtime: 'node',
          command: 'echo already-running',
          port: externalPort,
        },
      ],
    });

    const res = await app.request('/ext/api/echo', {
      method: 'POST',
      body: 'hello from gateway',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ echo: 'hello from gateway' });
  });

  test('proxies root path of external app', async () => {
    const { app } = createGateway({
      apps: [
        {
          path: '/ext',
          runtime: 'node',
          command: 'echo already-running',
          port: externalPort,
        },
      ],
    });

    const res = await app.request('/ext');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('root');
  });

  test('mixed in-process and external apps', async () => {
    const local = new Hono();
    local.get('/info', (c) => c.json({ type: 'local' }));

    const { app } = createGateway({
      apps: [
        { path: '/local', app: local },
        {
          path: '/remote',
          runtime: 'python',
          command: 'echo already-running',
          port: externalPort,
        },
      ],
    });

    const localRes = await app.request('/local/info');
    expect(localRes.status).toBe(200);
    expect(await localRes.json()).toEqual({ type: 'local' });

    const remoteRes = await app.request('/remote/api/data');
    expect(remoteRes.status).toBe(200);
    expect(await remoteRes.json()).toEqual({ source: 'external', method: 'GET' });
  });
});

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

describe('isInProcessApp', () => {
  test('returns true for in-process entries', () => {
    const entry: InProcessApp = { path: '/x', app: new Hono() };
    expect(isInProcessApp(entry)).toBe(true);
  });

  test('returns false for external entries', () => {
    const entry: ExternalApp = {
      path: '/x',
      runtime: 'python',
      command: 'python app.py',
    };
    expect(isInProcessApp(entry)).toBe(false);
  });
});
