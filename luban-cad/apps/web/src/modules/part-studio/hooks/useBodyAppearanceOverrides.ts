/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 逐 body 外观覆盖（2026-11-05 Onshape「外观」面板；2026-11-13 增透明度）：
 * 用独立 FeatureOverrideProvider 覆盖每个 body 元素的颜色/透明度，与选择高亮
 * （EmphasizeElements）并存——选择清场只清它自己的 override，不会抹掉外观。
 * 透明度来自零件菜单「使之透明…」的会话滑块（0..1；0=恢复不透明）；不改 iModel。
 */
import { useEffect, useRef } from 'react';
import type { ScreenViewport } from '@itwin/core-frontend';
import { ColorDef, FeatureAppearance, type FeatureOverrides } from '@itwin/core-common';

/** 颜色/透明度合并为 FeatureAppearance（纯函数；单元测试直测）。 */
export function buildBodyAppearances(
  colors: Readonly<Record<string, string>>,
  transparency: Readonly<Record<string, number>>,
): Map<string, FeatureAppearance> {
  const next = new Map<string, FeatureAppearance>();
  const keys = new Set([...Object.keys(colors), ...Object.keys(transparency)]);
  for (const bodyKey of keys) {
    const color = colors[bodyKey];
    const raw = transparency[bodyKey];
    const alpha = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
    if (!color && alpha <= 0)
      continue;
    const props: Record<string, unknown> = {};
    if (color) {
      const rgb = ColorDef.fromString(color).colors;
      props.rgb = { r: rgb.r, g: rgb.g, b: rgb.b };
      props.ignoresMaterial = true;
    }
    if (alpha > 0)
      props.transparency = alpha;
    next.set(bodyKey, FeatureAppearance.fromJSON(props));
  }
  return next;
}

function signatureOf(
  colors: Readonly<Record<string, string>>,
  transparency: Readonly<Record<string, number>>,
): string {
  const keys = new Set([...Object.keys(colors), ...Object.keys(transparency)]);
  return [...keys].sort().map((key) => `${key}=${colors[key] ?? ''}/${transparency[key] ?? ''}`).join('|');
}

class BodyAppearanceOverrideProvider {
  private _appearances = new Map<string, FeatureAppearance>();

  /** 返回是否实际变化（避免每帧无谓刷新）。 */
  public setAppearances(
    colors: Readonly<Record<string, string>>,
    transparency: Readonly<Record<string, number>>,
  ): boolean {
    const next = buildBodyAppearances(colors, transparency);
    const signature = signatureOf(colors, transparency);
    if (signature !== this._signature) {
      this._signature = signature;
      this._appearances = next;
      return true;
    }
    return false;
  }

  private _signature = '';

  public addFeatureOverrides(overrides: FeatureOverrides): void {
    for (const [elementId, appearance] of this._appearances)
      overrides.override({ elementId, appearance, onConflict: 'replace' });
  }
}

export function useBodyAppearanceOverrides(
  viewport: ScreenViewport | null | undefined,
  colors: Readonly<Record<string, string>>,
  transparency: Readonly<Record<string, number>> = {},
): void {
  const providerRef = useRef<BodyAppearanceOverrideProvider | null>(null);

  useEffect(() => {
    if (!viewport) return;
    const provider = new BodyAppearanceOverrideProvider();
    providerRef.current = provider;
    viewport.addFeatureOverrideProvider?.(provider);
    return () => {
      viewport.dropFeatureOverrideProvider?.(provider);
      providerRef.current = null;
      viewport.invalidateScene();
    };
  }, [viewport]);

  useEffect(() => {
    if (!viewport || !providerRef.current) return;
    if (providerRef.current.setAppearances(colors, transparency))
      viewport.setFeatureOverrideProviderChanged?.();
  }, [viewport, colors, transparency]);
}
