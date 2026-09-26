/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Characterization tests locking EventProcessor dispatch semantics:
 * typed + wildcard fan-out, handler-failure isolation (a throwing handler is
 * logged, never fatal to the event), and the no-handler case completing
 * silently.
 *
 * Config seam: processor.ts pulls the shared logger, whose level is read from
 * the frozen `config` singleton at import time — the module is mocked
 * wholesale (same as forwarder.test.ts) instead of poking process.env (the
 * real config validates at import time and would race the repo-root .env).
 */
import { describe, expect, it, vi } from 'vitest';
import { EventProcessor } from './processor.js';
import type { IncomingWebhookEvent } from './processor.js';

vi.mock('./config.js', () => ({
  config: { LOG_LEVEL: 'error' },
}));

const evt = (type: string): IncomingWebhookEvent => ({
  eventType: type as IncomingWebhookEvent['eventType'],
  iTwinId: 't1',
  messageId: 'm1',
  webhookId: 'wh1',
  enqueuedDateTime: '2026-01-01T00:00:00Z',
  content: { imodelId: 'im-1' },
});

describe('EventProcessor', () => {
  it('dispatches to handlers registered for the event type and to wildcards', async () => {
    const p = new EventProcessor({});
    const specific = vi.fn();
    const wild = vi.fn();
    p.on('iModels.ChangesetPushed.v1', specific);
    p.on('*', wild);

    const wire = evt('iModels.ChangesetPushed.v1');
    const result = await p.processEvent(wire);

    expect(specific).toHaveBeenCalledTimes(1);
    expect(wild).toHaveBeenCalledTimes(1);
    // Both handler flavours receive the wire event and its content payload
    // (characterized: the ORIGINAL wire object, not the enriched
    // ProcessedEvent copy that processEvent keeps in its queue).
    expect(specific).toHaveBeenCalledWith(wire, wire.content);
    expect(result.status).toBe('completed');
  });

  it('isolates handler failures: one throwing handler does not prevent others', async () => {
    const p = new EventProcessor({});
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    p.on('iModels.ChangesetPushed.v1', bad);
    p.on('iModels.ChangesetPushed.v1', good);

    const result = await p.processEvent(evt('iModels.ChangesetPushed.v1'));

    expect(good).toHaveBeenCalledTimes(1); // sibling handler still ran
    expect(result.status).toBe('completed'); // handler error is logged, not fatal
    expect(result.error).toBeUndefined();
  });

  it('completes an event with no registered handlers (silently, not failed)', async () => {
    const p = new EventProcessor({});
    const r = await p.processEvent(evt('iModels.iModelDeleted.v1'));
    expect(r.status).toBe('completed'); // characterized: no-handler is not an error
  });
});
