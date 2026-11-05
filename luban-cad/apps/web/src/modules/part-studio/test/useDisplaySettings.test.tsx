/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 显示设置共享状态测试（2026-11-02）：localStorage 持久化、viewport 应用、
 * 主题背景跟随与自定义背景优先。
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScreenViewport } from '@itwin/core-frontend';

const mocks = vi.hoisted(() => ({
  applyDisplaySettings: vi.fn(),
  applyViewportBackground: vi.fn(),
}));

vi.mock('../internal/display-actions.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../internal/display-actions.js')>();
  return { ...actual, applyDisplaySettings: mocks.applyDisplaySettings };
});

vi.mock('@luban-cad/viewer', () => ({
  applyViewportBackground: mocks.applyViewportBackground,
}));

import { useDisplaySettings } from '../hooks/useDisplaySettings.js';
import { DEFAULT_DISPLAY_SETTINGS } from '../internal/display-actions.js';

const STORAGE_KEY = 'luban.partStudio.displaySettings.v3';
const LEGACY_V2_STORAGE_KEY = 'luban.partStudio.displaySettings.v2';
const VIEWPORT = {} as ScreenViewport;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  document.documentElement.dataset.theme = 'light';
  mocks.applyDisplaySettings.mockReturnValue(true);
});

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe('useDisplaySettings', () => {
  it('applies defaults and the theme background when a viewport becomes ready', () => {
    const { result } = renderHook(() => useDisplaySettings(VIEWPORT));
    expect(result.current.settings).toEqual(DEFAULT_DISPLAY_SETTINGS);
    expect(result.current.viewportReady).toBe(true);
    expect(mocks.applyDisplaySettings).toHaveBeenCalledWith(VIEWPORT, DEFAULT_DISPLAY_SETTINGS);
    expect(mocks.applyViewportBackground).toHaveBeenCalledWith(VIEWPORT, 'light');
  });

  it('is honestly not ready without a viewport', () => {
    const { result } = renderHook(() => useDisplaySettings(undefined));
    expect(result.current.viewportReady).toBe(false);
    expect(mocks.applyDisplaySettings).not.toHaveBeenCalled();
    expect(mocks.applyViewportBackground).not.toHaveBeenCalled();
  });

  it('persists updates and re-applies them', () => {
    const { result } = renderHook(() => useDisplaySettings(VIEWPORT));
    act(() => result.current.update({ mode: 'hidden-removed', shadows: true }));
    expect(result.current.settings.mode).toBe('hidden-removed');
    expect(result.current.settings.shadows).toBe(true);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.mode).toBe('hidden-removed');
    expect(stored.shadows).toBe(true);
    expect(mocks.applyDisplaySettings).toHaveBeenLastCalledWith(
      VIEWPORT,
      expect.objectContaining({ mode: 'hidden-removed', shadows: true }),
    );
  });

  it('loads persisted settings merged over defaults', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: 'translucent', edgeWidthPx: 3 }));
    const { result } = renderHook(() => useDisplaySettings(VIEWPORT));
    expect(result.current.settings.mode).toBe('translucent');
    expect(result.current.settings.edgeWidthPx).toBe(3);
    expect(result.current.settings.antialiasSamples).toBe(DEFAULT_DISPLAY_SETTINGS.antialiasSamples);
  });

  it('ignores corrupt persisted JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    const { result } = renderHook(() => useDisplaySettings(VIEWPORT));
    expect(result.current.settings).toEqual(DEFAULT_DISPLAY_SETTINGS);
  });

  it('忽略 v1 旧设置，让新的 Onshape 图形首选项默认生效', () => {
    localStorage.setItem('luban.partStudio.displaySettings.v1', JSON.stringify({ ambientOcclusion: false }));
    const { result } = renderHook(() => useDisplaySettings(VIEWPORT));
    expect(result.current.settings.ambientOcclusion).toBe(true);
  });

  it('v2 旧默认 AO 37.5/线宽 1 迁移到 20/2，其他自定义值保留', () => {
    localStorage.setItem(LEGACY_V2_STORAGE_KEY, JSON.stringify({
      mode: 'translucent',
      ambientOcclusion: true,
      aoIntensityPct: 37.5,
      edgeWidthPx: 1,
    }));
    const { result } = renderHook(() => useDisplaySettings(VIEWPORT));
    expect(result.current.settings.mode).toBe('translucent');
    expect(result.current.settings.aoIntensityPct).toBe(20);
    expect(result.current.settings.edgeWidthPx).toBe(2);
  });

  it('v2 用户自定义线宽 3 不被迁移覆盖', () => {
    localStorage.setItem(LEGACY_V2_STORAGE_KEY, JSON.stringify({ edgeWidthPx: 3, aoIntensityPct: 60 }));
    const { result } = renderHook(() => useDisplaySettings(VIEWPORT));
    expect(result.current.settings.edgeWidthPx).toBe(3);
    expect(result.current.settings.aoIntensityPct).toBe(60);
  });

  it('restores defaults with reset and persists the reset', () => {
    const { result } = renderHook(() => useDisplaySettings(VIEWPORT));
    act(() => result.current.update({ mode: 'hidden-visible' }));
    act(() => result.current.reset());
    expect(result.current.settings).toEqual(DEFAULT_DISPLAY_SETTINGS);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).mode).toBe('shaded');
  });

  it('follows theme changes only while background is theme', async () => {
    const { result } = renderHook(() => useDisplaySettings(VIEWPORT));
    mocks.applyViewportBackground.mockClear();

    act(() => { document.documentElement.dataset.theme = 'dark'; });
    await waitFor(() => expect(mocks.applyViewportBackground).toHaveBeenCalledWith(VIEWPORT, 'dark'));

    act(() => result.current.update({ background: 'light' }));
    mocks.applyViewportBackground.mockClear();
    act(() => { document.documentElement.dataset.theme = 'light'; });
    await waitFor(() => expect(mocks.applyViewportBackground).toHaveBeenCalledWith(VIEWPORT, 'light'));
    // 自定义背景优先：主题切回 dark 后仍应用 light。
    mocks.applyViewportBackground.mockClear();
    act(() => { document.documentElement.dataset.theme = 'dark'; });
    await waitFor(() => expect(mocks.applyViewportBackground).toHaveBeenCalledWith(VIEWPORT, 'light'));
  });
});
