// src/modules/documents/test/useBModelEnabled.test.tsx
//
// B-model P2.1 功能开关契约：`VITE_B_MODEL_ENABLED` 缺省关，只认字符串 'true'
// （'1'/'TRUE'/'false'/空串/缺席一律关——避免布尔真值误开）。测试经
// vi.stubEnv 改写 import.meta.env（vitest 官方支持），afterEach 复原。

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isBModelEnabled, useBModelEnabled } from '../hooks/useBModelEnabled.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isBModelEnabled（纯裁决）', () => {
  it.each([
    ['true', true],
    ['false', false],
    ['1', false],
    ['TRUE', false],
    [' true', false],
    ['', false],
    [undefined, false],
  ])('VITE_B_MODEL_ENABLED=%s → %s', (raw, expected) => {
    expect(isBModelEnabled(raw)).toBe(expected);
  });
});

describe('useBModelEnabled（env 读取）', () => {
  it("stub 'true' → true；stub 'false' → false（缺省关）", () => {
    vi.stubEnv('VITE_B_MODEL_ENABLED', 'true');
    expect(renderHook(() => useBModelEnabled()).result.current).toBe(true);

    vi.stubEnv('VITE_B_MODEL_ENABLED', 'false');
    expect(renderHook(() => useBModelEnabled()).result.current).toBe(false);
  });

  it('env 缺席 → false（导入测试环境默认不开 B）', () => {
    expect(renderHook(() => useBModelEnabled()).result.current).toBe(false);
  });
});
