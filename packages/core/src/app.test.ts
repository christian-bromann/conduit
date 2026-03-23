import { test, expect } from 'bun:test';
import { Hono } from 'hono';
import { createConduitApp } from './app.ts';

test('merges routes from multiple connector apps', async () => {
  const connectorA = new Hono();
  connectorA.get('/a/health', (c) => c.json({ connector: 'a' }));

  const connectorB = new Hono();
  connectorB.get('/b/health', (c) => c.json({ connector: 'b' }));

  const app = createConduitApp({ a: connectorA, b: connectorB });

  const resA = await app.request('/a/health');
  expect(resA.status).toBe(200);
  expect(await resA.json()).toEqual({ connector: 'a' });

  const resB = await app.request('/b/health');
  expect(resB.status).toBe(200);
  expect(await resB.json()).toEqual({ connector: 'b' });
});

test('GET /conduit/health returns status and connector names', async () => {
  const slack = new Hono();
  const whatsapp = new Hono();

  const app = createConduitApp({ slack, whatsapp });

  const res = await app.request('/conduit/health');
  expect(res.status).toBe(200);

  const body = await res.json();
  expect(body).toEqual({
    status: 'ok',
    connectors: ['slack', 'whatsapp'],
  });
});

test('works with zero connectors', async () => {
  const app = createConduitApp({});

  const res = await app.request('/conduit/health');
  expect(res.status).toBe(200);

  const body = await res.json();
  expect(body).toEqual({
    status: 'ok',
    connectors: [],
  });
});
