/**
 * 逐 body 外观颜色 hook：独立 FeatureOverrideProvider 注册/颜色覆盖/卸载清理。
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ScreenViewport } from '@itwin/core-frontend';
import { FeatureAppearance } from '@itwin/core-common';
import { buildBodyAppearances, useBodyAppearanceOverrides } from '../hooks/useBodyAppearanceOverrides.js';

function fakeViewport() {
  let provider: { addFeatureOverrides: (overrides: unknown, vp: unknown) => void } | undefined;
  const viewport = {
    addFeatureOverrideProvider: vi.fn((p) => { provider = p; return true; }),
    dropFeatureOverrideProvider: vi.fn((p) => { if (provider === p) provider = undefined; return true; }),
    setFeatureOverrideProviderChanged: vi.fn(),
    invalidateScene: vi.fn(),
  } as unknown as ScreenViewport;
  return {
    viewport,
    getProvider: () => provider,
  };
}

function appearanceRgb(value: unknown): { r: number; g: number; b: number } | undefined {
  return (value as { appearance?: FeatureAppearance } | undefined)?.appearance?.rgb;
}

describe('useBodyAppearanceOverrides', () => {
  it('registers a provider, writes per-body colors, and drops it on unmount', () => {
    const fake = fakeViewport();
    const { rerender, unmount } = renderHook(
      ({ colors }) => useBodyAppearanceOverrides(fake.viewport, colors),
      { initialProps: { colors: { '0x15': '#ff0000' } as Record<string, string> } },
    );
    expect(fake.viewport.addFeatureOverrideProvider).toHaveBeenCalledTimes(1);
    const provider = fake.getProvider()!;
    const overrides = { override: vi.fn() };
    provider.addFeatureOverrides(overrides, fake.viewport);
    expect(overrides.override).toHaveBeenCalledTimes(1);
    const args = overrides.override.mock.calls[0]![0] as { elementId: string; appearance: unknown };
    expect(args.elementId).toBe('0x15');
    expect(appearanceRgb(args)).toEqual({ r: 255, g: 0, b: 0 });

    rerender({ colors: { '0x15': '#00ff00', '0x18': '#0000ff' } });
    expect(fake.viewport.setFeatureOverrideProviderChanged).toHaveBeenCalled();
    const next = { override: vi.fn() };
    provider.addFeatureOverrides(next, fake.viewport);
    expect(next.override).toHaveBeenCalledTimes(2);

    act(() => unmount());
    expect(fake.viewport.dropFeatureOverrideProvider).toHaveBeenCalledTimes(1);
  });

  it('empty colors produce no overrides', () => {
    const fake = fakeViewport();
    renderHook(() => useBodyAppearanceOverrides(fake.viewport, {}));
    const overrides = { override: vi.fn() };
    fake.getProvider()!.addFeatureOverrides(overrides, fake.viewport);
    expect(overrides.override).not.toHaveBeenCalled();
  });

  it('2026-11-13 透明度：颜色+透明度合并、仅透明度不写颜色、越界夹取', () => {
    const both = buildBodyAppearances({ '0x15': '#ff0000' }, { '0x15': 0.4 }).get('0x15')!;
    expect(both.rgb).toEqual({ r: 255, g: 0, b: 0 });
    expect(both.transparency).toBeCloseTo(0.4, 6);
    expect(both.ignoresMaterial).toBe(true);

    const onlyTransparency = buildBodyAppearances({}, { '0x18': 0.25 }).get('0x18')!;
    expect(onlyTransparency.rgb).toBeUndefined();
    expect(onlyTransparency.transparency).toBeCloseTo(0.25, 6);

    expect(buildBodyAppearances({}, { '0x20': 2 }).get('0x20')!.transparency).toBe(1);
    expect(buildBodyAppearances({}, { '0x22': 0 }).size).toBe(0);
    expect(buildBodyAppearances({}, { '0x24': -1 }).size).toBe(0);
  });

  it('透明度变化触发 provider 刷新（同色仅改透明度）', () => {
    const fake = fakeViewport();
    const { rerender } = renderHook(
      ({ transparency }) => useBodyAppearanceOverrides(fake.viewport, { '0x15': '#ff0000' }, transparency),
      { initialProps: { transparency: {} as Record<string, number> } },
    );
    rerender({ transparency: { '0x15': 0.5 } });
    expect(fake.viewport.setFeatureOverrideProviderChanged).toHaveBeenCalled();
    const overrides = { override: vi.fn() };
    fake.getProvider()!.addFeatureOverrides(overrides, fake.viewport);
    const args = overrides.override.mock.calls[0]![0] as { appearance: FeatureAppearance };
    expect(args.appearance.transparency).toBeCloseTo(0.5, 6);
  });
});
