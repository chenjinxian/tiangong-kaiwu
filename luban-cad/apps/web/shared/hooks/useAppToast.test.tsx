/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const positive = vi.fn();
const negative = vi.fn();
const informational = vi.fn();
vi.mock('@itwin/itwinui-react', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useToaster: () => ({ positive, negative, informational }),
}));

import { useAppToast } from './useAppToast.js';

describe('useAppToast', () => {
  it('类型映射到 itwinui toaster', () => {
    const { result } = renderHook(() => useAppToast());
    result.current.showToast('ok', 'success');
    result.current.showToast('bad', 'error');
    result.current.showToast('fyi', 'info');
    expect(positive).toHaveBeenCalledWith('ok');
    expect(negative).toHaveBeenCalledWith('bad');
    expect(informational).toHaveBeenCalledWith('fyi');
  });

  it('默认 type=info', () => {
    const { result } = renderHook(() => useAppToast());
    result.current.showToast('plain');
    expect(informational).toHaveBeenCalledWith('plain');
  });
});
