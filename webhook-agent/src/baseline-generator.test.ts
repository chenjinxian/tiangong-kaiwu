/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Characterization of the container SAS permission sets handed to
 * generateSasUrl. The real SDK permission object carries more flags
 * (add/create/deleteVersion/...) than the four load-bearing ones asserted
 * here, so the object is matched partially — those extra flags are the SDK's
 * shape, not this module's contract.
 *
 * Config seam: baseline-generator.ts (and its hubAuthClient import) read the
 * frozen `config` singleton, which validates at import time — mocked
 * wholesale so no repo-root .env is needed.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildSasPermissions } from './baseline-generator.js';

vi.mock('./config.js', () => ({
  config: { LOG_LEVEL: 'error' },
}));

describe('buildSasPermissions', () => {
  it('grants full racwdl (incl. delete) to writers and read+list to readers', () => {
    // Characterized: writers get 'racwdl' — delete IS granted, alongside add/create
    expect(buildSasPermissions(true)).toMatchObject({
      read: true, add: true, create: true, write: true, delete: true, list: true,
    });
    // Readers get 'rl' — read + list only
    expect(buildSasPermissions(false)).toMatchObject({
      read: true, add: false, create: false, write: false, delete: false, list: true,
    });
  });
});
