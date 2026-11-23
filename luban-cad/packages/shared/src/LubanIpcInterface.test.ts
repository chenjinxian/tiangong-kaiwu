/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * G1 D5: additive read-only version-open IPC contract.
 *
 * These assertions are intentionally about the public contract only: the
 * existing latest-head method must keep its exact signature, and the new
 * method/version must be present without changing the channel.
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  type BriefcaseDownloadResult,
  LUBAN_IPC_INTERFACE_VERSION,
  lubanIpcChannel,
  type LubanIpcInterface,
  type VersionOpenRequest,
  type VersionOpenResult,
} from './LubanIpcInterface.js';

describe('LubanIpcInterface contract', () => {
  it('keeps the frozen IPC channel name', () => {
    expect(lubanIpcChannel).toBe('luban-ipc');
  });

  it('declares the additive D5 contract version', () => {
    expect(LUBAN_IPC_INTERFACE_VERSION).toBe('1.1.0');
  });

  it('preserves the latest-head downloadBriefcase signature (1.0.0 behavior)', () => {
    expectTypeOf<LubanIpcInterface['downloadBriefcase']>().toEqualTypeOf<
      (iTwinId: string, iModelId: string, readonly?: boolean) => Promise<BriefcaseDownloadResult>
    >();
  });

  it('exposes downloadVersionBriefcase as an additive method', () => {
    expectTypeOf<LubanIpcInterface['downloadVersionBriefcase']>().toEqualTypeOf<
      (request: VersionOpenRequest) => Promise<VersionOpenResult>
    >();
  });

  it('accepts exactly one immutable target selector in the request shape', () => {
    const byId: VersionOpenRequest = {
      iTwinId: '4f8d8b5a-0d1e-4b7a-9d7c-111111111111',
      iModelId: '5c1f2a3b-4d5e-4f60-8a7b-222222222222',
      target: { changesetId: '0123456789abcdef0123456789abcdef01234567' },
    };
    const byIndex: VersionOpenRequest = {
      iTwinId: byId.iTwinId,
      iModelId: byId.iModelId,
      target: { changesetIndex: 12 },
    };
    const byVersion: VersionOpenRequest = {
      iTwinId: byId.iTwinId,
      iModelId: byId.iModelId,
      target: { namedVersionId: '6d2a3b4c-5e6f-4071-9b8c-333333333333' },
    };

    expect(byId.target.changesetId).toBeTypeOf('string');
    expect(byIndex.target.changesetIndex).toBe(12);
    expect(byVersion.target.namedVersionId).toBeTypeOf('string');
  });

  it('models a read-only, server-keyed result', () => {
    const result: VersionOpenResult = {
      fileName: 'C:\\cache\\sessions\\s\\imodel\\versions\\v12-0123.bim',
      briefcaseId: 0,
      changeset: { id: '0123456789abcdef0123456789abcdef01234567', index: 12 },
      requested: { changesetIndex: 12 },
      target: { changesetId: '0123456789abcdef0123456789abcdef01234567', changesetIndex: 12 },
      checkpoint: { changesetId: '0123456789abcdef0123456789abcdef01234567', changesetIndex: 12 },
      readonly: true,
    };

    expect(result.briefcaseId).toBe(0);
    expect(result.readonly).toBe(true);
    expectTypeOf(result.readonly).toEqualTypeOf<true>();
  });
});
