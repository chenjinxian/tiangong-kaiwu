/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * EventForwarder retry/abandon semantics, locked with injected fetch and fake
 * timers (no real network, no real clock).
 *
 * Config seam: the forwarder reads the outbound API key from the frozen
 * `config` singleton at send time, so the module is mocked wholesale instead
 * of poking process.env (the real config validates at import time and would
 * race the repo-root .env).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventForwarder } from './forwarder.js';
import type { ProcessedEvent } from './types.js';

vi.mock('./config.js', () => ({
  config: {
    BACKEND_API_KEY: 'b'.repeat(32),
    MODELING_SERVER_URL: 'http://ms.test:4001',
    LOG_LEVEL: 'error',
  },
}));

/**
 * ProcessedEvent extends the shared WebhookEvent envelope (eventType /
 * iTwinId / messageId / webhookId / enqueuedDateTime); `content` rides along
 * at runtime (the processor spreads the incoming wire event) even though the
 * base interface does not declare it, hence the assertion.
 */
function makeEvent(id: string): ProcessedEvent {
  return {
    eventType: 'iModels.ChangesetPushed.v1',
    iTwinId: 't1',
    messageId: id,
    webhookId: 'wh1',
    enqueuedDateTime: '2026-01-01T00:00:00Z',
    content: { imodelId: 'im1', changesetId: 'cs1', changesetIndex: 1, userId: 'u1' },
    id,
    status: 'completed',
  } as ProcessedEvent;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('EventForwarder', () => {
  it('sends X-API-Key and forwards on success, clearing pending', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    vi.stubGlobal('fetch', (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      calls.push({ url: String(input), headers: (init?.headers ?? {}) as Record<string, string> });
      return new Response('{}', { status: 200 });
    }) as typeof fetch);

    const f = new EventForwarder({ backendUrl: 'http://ms.test:4001', timeout: 1000, retryAttempts: 3, retryDelay: 10 });
    const ok = await f.forwardEvent(makeEvent('e1'));

    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('http://ms.test:4001');
    expect(calls[0].headers['X-API-Key'] ?? calls[0].headers['x-api-key']).toBe('b'.repeat(32));
    expect(f.getPendingCount()).toBe(0);
  });

  it('retries failures and gives up after retryAttempts, keeping the event observable', async () => {
    let n = 0;
    vi.stubGlobal('fetch', (async () => { n++; return new Response('{}', { status: 500 }); }) as typeof fetch);

    const f = new EventForwarder({ backendUrl: 'http://ms.test:4001', timeout: 1000, retryAttempts: 3, retryDelay: 10 });
    const ok = await f.forwardEvent(makeEvent('e2'));
    expect(ok).toBe(false);

    // Drive the interval-driven retry processor through every backoff window
    // so retries actually fire and the give-up path is exercised.
    await vi.advanceTimersByTimeAsync(10 * 10);

    expect(n).toBeGreaterThanOrEqual(2); // at least one retry occurred
    expect(n).toBeLessThanOrEqual(4); // bounded by retryAttempts: gave up, not looping forever
    expect(f.getRetryQueueLength() + f.getPendingCount()).toBeGreaterThan(0); // event not silently dropped
  });

  it('clears its background retry interval on shutdown (no leaked timer)', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const f = new EventForwarder({ backendUrl: 'http://ms.test:4001', timeout: 1000, retryAttempts: 3, retryDelay: 10 });

    // Queue is empty, so the drain loop skips straight to timer teardown.
    await f.shutdown();

    expect(clearSpy).toHaveBeenCalledTimes(1);
    clearSpy.mockRestore();
  });
});
