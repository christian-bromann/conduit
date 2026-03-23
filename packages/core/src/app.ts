import { Hono } from 'hono';

export function createConduitApp(connectors: Record<string, Hono>): Hono {
  const app = new Hono();

  for (const [, connectorApp] of Object.entries(connectors)) {
    app.route('/', connectorApp);
  }

  app.get('/conduit/health', (c) => {
    return c.json({
      status: 'ok',
      connectors: Object.keys(connectors),
    });
  });

  return app;
}
