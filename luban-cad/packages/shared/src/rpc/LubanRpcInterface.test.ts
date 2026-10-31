/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tests for LubanRpcInterface
 */

import { describe, expect, it } from 'vitest';
import { LubanRpcInterface } from './LubanRpcInterface.js';
import type { Briefcase, Changeset } from '../projects/types.js';

describe('LubanRpcInterface', () => {
  it('should have correct interface name', () => {
    expect(LubanRpcInterface.interfaceName).toBe('LubanRpcInterface');
  });

  it('should have correct interface version', () => {
    expect(LubanRpcInterface.interfaceVersion).toBe('1.0.0');
  });
});

describe('Briefcase type', () => {
  it('should have correct structure', () => {
    const briefcase: Briefcase = {
      briefcaseId: 1,
      iModelId: 'test-imodel-id',
      userId: 'test-user-id',
      acquiredDateTime: new Date().toISOString(),
    };

    expect(briefcase.briefcaseId).toBe(1);
    expect(briefcase.iModelId).toBe('test-imodel-id');
    expect(briefcase.userId).toBe('test-user-id');
    expect(typeof briefcase.acquiredDateTime).toBe('string');
  });
});

describe('Changeset type', () => {
  it('should have correct structure', () => {
    const changeset: Changeset = {
      id: 'test-changeset-id',
      index: 1,
      description: 'Test changeset',
      briefcaseId: 1,
    };

    expect(changeset.id).toBe('test-changeset-id');
    expect(changeset.index).toBe(1);
    expect(changeset.description).toBe('Test changeset');
    expect(changeset.briefcaseId).toBe(1);
  });
});
