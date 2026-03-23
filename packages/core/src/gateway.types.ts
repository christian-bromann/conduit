import type { Hono } from 'hono';

/**
 * Runtime identifier for a sub-app. Built-in runtimes get first-class
 * support; any other string is treated as a custom runtime whose
 * `command` must be provided.
 */
export type AppRuntime = 'node' | 'python' | (string & {});

export interface InProcessApp {
  /** URL path prefix where this app is mounted (e.g. "/conduit"). */
  path: string;

  /** Hono app instance to mount in-process. */
  app: Hono;
}

export interface ExternalApp {
  /** URL path prefix where this app is mounted (e.g. "/dashboard"). */
  path: string;

  /** Runtime that serves this app. */
  runtime: AppRuntime;

  /** Shell command to start the app (e.g. "python -m dashboard"). */
  command: string;

  /**
   * Port the external process will listen on.
   * If omitted, the gateway assigns one automatically.
   */
  port?: number;

  /** Extra environment variables passed to the child process. */
  env?: Record<string, string>;
}

export type AppEntry = InProcessApp | ExternalApp;

export function isInProcessApp(entry: AppEntry): entry is InProcessApp {
  return 'app' in entry && typeof (entry as InProcessApp).app !== 'undefined';
}

export interface GatewayConfig {
  /** List of apps to serve behind this gateway. */
  apps: AppEntry[];

  /**
   * Base port for auto-assigning ports to external apps.
   * Defaults to 9100.
   */
  basePort?: number;
}

export interface Gateway {
  /** The unified Hono app that routes to all sub-apps. */
  app: Hono;

  /**
   * Start all external processes. Resolves once every process
   * has bound its port (or after a short readiness delay).
   */
  start(): Promise<void>;

  /** Gracefully shut down all managed child processes. */
  stop(): Promise<void>;
}
