import { vi } from 'vitest';
import type { WebClient } from '@slack/web-api';
import type { App } from '@slack/bolt';

/**
 * Shared @slack/web-api and @slack/bolt test doubles.
 *
 * These are hand-rolled `vi.fn()` mocks cast to the SDK types (never
 * `vi.mock()` the SDK itself) — the same pattern used for axios in
 * `infrastructure/adapters/__tests__/httpDossierRepository.test.ts`.
 */

/** Minimal WebClient mock covering the methods adapters call. */
export function makeWebClientMock() {
  return {
    conversations: { open: vi.fn() },
    chat: { postMessage: vi.fn(), postEphemeral: vi.fn() },
    users: { info: vi.fn() },
    views: { open: vi.fn() },
  } as unknown as WebClient;
}

export type WebClientMock = ReturnType<typeof makeWebClientMock>;

type Handler = (args: unknown) => unknown | Promise<unknown>;

/**
 * Minimal Bolt App mock. `event`/`command`/`view`/`action` record the
 * handler passed to them under `<kind>:<key>` instead of registering with a
 * real Bolt runtime. Use `trigger()` in tests to invoke a captured handler.
 */
export function makeAppMock() {
  const handlers = new Map<string, Handler>();

  const record = (kind: string) => (key: string, handler: Handler): void => {
    handlers.set(`${kind}:${key}`, handler);
  };

  const app = {
    event: vi.fn(record('event')),
    command: vi.fn(record('command')),
    view: vi.fn(record('view')),
    action: vi.fn(record('action')),
  } as unknown as App;

  const trigger = async (kind: 'event' | 'command' | 'view' | 'action', key: string, args: unknown): Promise<void> => {
    const handler = handlers.get(`${kind}:${key}`);
    if (!handler) throw new Error(`No handler registered for ${kind}:${key}`);
    await handler(args);
  };

  return { app, trigger };
}

export function makeAckFn() {
  return vi.fn().mockResolvedValue(undefined);
}

export function makeSayFn() {
  return vi.fn().mockResolvedValue(undefined);
}

export function makeRespondFn() {
  return vi.fn().mockResolvedValue(undefined);
}
