/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * IModelHost lifecycle pairing tests. @itwin/core-backend is mocked wholesale
 * so the tests are deterministic (no native platform boot) and only assert the
 * idempotency contract: exactly one startup, exactly one shutdown + forwarder
 * flush, no matter how many times the entry points are called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@itwin/core-backend', () => ({
  IModelHost: {
    startup: vi.fn(async () => {}),
    shutdown: vi.fn(async () => {}),
  },
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

  it('shutdown shuts IModelHost down once and flushes the forwarder, and is idempotent', async () => {
    const forwarder = { shutdown: vi.fn(async () => {}) };
    await shutdownAll(forwarder);
    await shutdownAll(forwarder);
    expect(IModelHost.shutdown).toHaveBeenCalledTimes(1);
    expect(forwarder.shutdown).toHaveBeenCalledTimes(1);
  });
});
