/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * IModelHost lifecycle pairing tests. @itwin/core-backend is mocked wholesale
 * so the tests are deterministic (no native platform boot) and only assert the
 * idempotency contract: exactly one startup, exactly one shutdown + forwarder
 * flush, no matter how many times the entry points are called.
 *
 * Config seam: lifecycle imports the logger, which reads the frozen `config`
 * singleton at import time (the real config validates eagerly and would exit
 * the test process on machines without a repo-root .env) — mocked like the
 * other suites.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@itwin/core-backend', () => ({
  IModelHost: {
    startup: vi.fn(async () => {}),
    shutdown: vi.fn(async () => {}),
  },
}));

vi.mock('./config.js', () => ({
  config: { LOG_LEVEL: 'error' },
}));

import { IModelHost } from '@itwin/core-backend';
import { ensureIModelHostStarted, shutdownAll } from './lifecycle.js';

describe('lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts IModelHost exactly once across repeated calls', async () => {
    await ensureIModelHostStarted();
    await ensureIModelHostStarted();
    await ensureIModelHostStarted();
    expect(IModelHost.startup).toHaveBeenCalledTimes(1);
  });

  it('propagates a failed startup and lets the next call retry (no latch)', async () => {
    // Fresh module instance: `started` is module-level state, and by the time
    // this runs the instance shared with the sibling tests may have already
    // started successfully (making ensure a no-op via the idempotency guard).
    vi.resetModules();
    const { ensureIModelHostStarted: ensure } = await import('./lifecycle.js');
    const { IModelHost: freshHost } = await import('@itwin/core-backend');

    vi.mocked(freshHost.startup)
      .mockRejectedValueOnce(new Error('startup boom'))
      .mockResolvedValueOnce(undefined);

    // Fail-fast: the first caller sees the rejection (main.ts's catch exits
    // the process non-zero) instead of the error being swallowed and logged.
    await expect(ensure()).rejects.toThrow('startup boom');
    // `started` was not latched, so the retry actually re-runs startup.
    await ensure();
    expect(freshHost.startup).toHaveBeenCalledTimes(2);
  });

  it('shutdown shuts IModelHost down once and flushes the forwarder, and is idempotent', async () => {
    const forwarder = { shutdown: vi.fn(async () => {}) };
    await shutdownAll(forwarder);
    await shutdownAll(forwarder);
    expect(IModelHost.shutdown).toHaveBeenCalledTimes(1);
    expect(forwarder.shutdown).toHaveBeenCalledTimes(1);
  });
});
