import type { Subprocess } from 'bun';
import type { ExternalApp } from './gateway.types.ts';

interface ManagedProcess {
  entry: ExternalApp;
  port: number;
  proc: Subprocess;
}

/**
 * Spawns and supervises child processes for external-runtime apps.
 * Each process gets its own port and is expected to bind an HTTP
 * server on it.
 */
export class ProcessManager {
  private processes: ManagedProcess[] = [];
  private nextPort: number;

  constructor(basePort = 9100) {
    this.nextPort = basePort;
  }

  allocatePort(requested?: number): number {
    if (requested !== undefined) {
      return requested;
    }
    return this.nextPort++;
  }

  async startProcess(entry: ExternalApp): Promise<number> {
    const port = this.allocatePort(entry.port);

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      PORT: String(port),
      HOST: '127.0.0.1',
      ...entry.env,
    };

    const [cmd, ...args] = entry.command.split(' ');
    if (!cmd) {
      throw new Error(`Empty command for app at path "${entry.path}"`);
    }

    const proc = Bun.spawn([cmd, ...args], {
      env,
      stdout: 'inherit',
      stderr: 'inherit',
    });

    this.processes.push({ entry, port, proc });

    await this.waitForPort(port);

    return port;
  }

  async stopAll(): Promise<void> {
    const stopping = this.processes.map(async ({ proc, entry }) => {
      try {
        proc.kill();
        await proc.exited;
      } catch {
        console.warn(`Failed to stop process for "${entry.path}"`);
      }
    });
    await Promise.all(stopping);
    this.processes = [];
  }

  private async waitForPort(port: number, timeoutMs = 15_000): Promise<void> {
    const start = Date.now();
    const interval = 200;

    while (Date.now() - start < timeoutMs) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(500),
        });
        response.body?.cancel();
        return;
      } catch {
        await Bun.sleep(interval);
      }
    }

    console.warn(`Port ${port} did not respond within ${timeoutMs}ms — proceeding anyway`);
  }
}
