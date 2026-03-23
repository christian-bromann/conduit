import { test, expect, describe } from 'bun:test';
import { ProcessManager } from './process-manager.ts';

describe('ProcessManager', () => {
  test('allocatePort returns requested port when provided', () => {
    const pm = new ProcessManager(9100);
    expect(pm.allocatePort(5000)).toBe(5000);
  });

  test('allocatePort auto-increments from basePort', () => {
    const pm = new ProcessManager(9200);
    expect(pm.allocatePort()).toBe(9200);
    expect(pm.allocatePort()).toBe(9201);
    expect(pm.allocatePort()).toBe(9202);
  });

  test('stopAll is safe to call with no processes', async () => {
    const pm = new ProcessManager();
    await pm.stopAll();
  });

  test('starts and stops a child process', async () => {
    const pm = new ProcessManager(19500);
    const fixtureDir = import.meta.dir + '/__fixtures__';

    const port = await pm.startProcess({
      path: '/test',
      runtime: 'node',
      command: `bun ${fixtureDir}/test-server.ts`,
    });

    expect(port).toBe(19500);

    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');

    await pm.stopAll();
  });
});
