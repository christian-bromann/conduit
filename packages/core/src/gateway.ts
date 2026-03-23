import { Hono } from 'hono';
import type { Gateway, GatewayConfig, ExternalApp } from './gateway.types.ts';
import { isInProcessApp } from './gateway.types.ts';
import { ProcessManager } from './process-manager.ts';

function stripTrailingSlash(path: string): string {
  return path === '/' ? '' : path.replace(/\/+$/, '');
}

function createProxyHandler(port: number, pathPrefix: string) {
  const prefix = stripTrailingSlash(pathPrefix);

  return async (c: {
    req: { raw: Request };
    body: (data: ReadableStream | string | null, init?: ResponseInit) => Response;
  }) => {
    const url = new URL(c.req.raw.url);

    let downstream = url.pathname;
    if (prefix && downstream.startsWith(prefix)) {
      downstream = downstream.slice(prefix.length) || '/';
    }

    const target = `http://127.0.0.1:${port}${downstream}${url.search}`;

    const headers = new Headers(c.req.raw.headers);
    headers.set('X-Forwarded-Prefix', prefix || '/');

    const init: RequestInit = {
      method: c.req.raw.method,
      headers,
    };

    if (c.req.raw.method !== 'GET' && c.req.raw.method !== 'HEAD') {
      init.body = c.req.raw.body;
      (init as Record<string, unknown>).duplex = 'half';
    }

    const upstream = await fetch(target, init);

    return c.body(upstream.body, {
      status: upstream.status,
      headers: Object.fromEntries(upstream.headers.entries()),
    });
  };
}

/**
 * Creates a gateway that mounts multiple apps — potentially in
 * different runtimes — behind a single Hono server. In-process
 * Hono apps are mounted directly; external-runtime apps are
 * started as child processes and reverse-proxied.
 *
 * ```ts
 * import { createGateway } from '@conduit/core';
 * import { app as conduit } from './conduit.ts';
 *
 * const gateway = createGateway({
 *   apps: [
 *     { path: '/conduit', app: conduit },
 *     { path: '/dashboard', runtime: 'python', command: 'python -m dashboard' },
 *   ],
 * });
 *
 * export const { app } = gateway;
 * ```
 */
export function createGateway(config: GatewayConfig): Gateway {
  const app = new Hono();
  const manager = new ProcessManager(config.basePort);
  const externalApps: Array<{ entry: ExternalApp; port: number }> = [];

  for (const entry of config.apps) {
    const prefix = stripTrailingSlash(entry.path);

    if (isInProcessApp(entry)) {
      if (prefix) {
        app.route(prefix, entry.app);
      } else {
        app.route('/', entry.app);
      }
    } else {
      const port = manager.allocatePort(entry.port);
      externalApps.push({ entry: { ...entry, port }, port });

      const handler = createProxyHandler(port, entry.path);

      if (prefix) {
        app.all(`${prefix}`, handler);
        app.all(`${prefix}/*`, handler);
      } else {
        app.all('/*', handler);
      }
    }
  }

  app.get('/gateway/health', (c) => {
    return c.json({
      status: 'ok',
      apps: config.apps.map((entry) => ({
        path: entry.path,
        type: isInProcessApp(entry) ? 'in-process' : 'external',
        ...(isInProcessApp(entry) ? {} : { runtime: entry.runtime }),
      })),
    });
  });

  async function start(): Promise<void> {
    const starting = externalApps.map(({ entry }) => manager.startProcess(entry));
    await Promise.all(starting);
  }

  async function stop(): Promise<void> {
    await manager.stopAll();
  }

  return { app, start, stop };
}
