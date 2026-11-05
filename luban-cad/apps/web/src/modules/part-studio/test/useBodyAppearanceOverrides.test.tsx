/**
 * 逐 body 外观颜色 hook：独立 FeatureOverrideProvider 注册/颜色覆盖/卸载清理。
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ScreenViewport } from '@itwin/core-frontend';
import { FeatureAppearance } from '@itwin/core-common';
import { useBodyAppearanceOverrides } from '../hooks/useBodyAppearanceOverrides.js';

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
});
