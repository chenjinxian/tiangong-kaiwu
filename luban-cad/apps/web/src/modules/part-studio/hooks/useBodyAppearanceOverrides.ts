/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 逐 body 外观颜色（2026-11-05 Onshape「外观」面板）：
 * 用独立 FeatureOverrideProvider 覆盖每个 body 元素的颜色，与选择高亮
 * （EmphasizeElements）并存——选择清场只清它自己的 override，不会抹掉外观色。
 * 仅颜色覆盖（不动透明度/线型），空串表示恢复默认（不写 override）。
 */
import { useEffect, useRef } from 'react';
import type { ScreenViewport } from '@itwin/core-frontend';
import { ColorDef, FeatureAppearance, type FeatureOverrides } from '@itwin/core-common';

class BodyColorOverrideProvider {
  private _appearances = new Map<string, FeatureAppearance>();

  /** 返回是否实际变化（避免每帧无谓刷新）。 */
  public setColors(colors: Readonly<Record<string, string>>): boolean {
    const next = new Map<string, FeatureAppearance>();
    for (const [bodyKey, color] of Object.entries(colors)) {
      if (!color) continue;
      const rgb = ColorDef.fromString(color).colors;
      next.set(bodyKey, FeatureAppearance.fromJSON({
        rgb: { r: rgb.r, g: rgb.g, b: rgb.b },
        ignoresMaterial: true,
      }));
    }
    if (next.size !== this._appearances.size)
      return this.replace(next);
    for (const [key, appearance] of next) {
      if (this._appearances.get(key) !== appearance)
        return this.replace(next);
    }
    return false;
  }

  private replace(next: Map<string, FeatureAppearance>): boolean {
    this._appearances = next;
    return true;
  }

  public addFeatureOverrides(overrides: FeatureOverrides): void {
    for (const [elementId, appearance] of this._appearances)
      overrides.override({ elementId, appearance, onConflict: 'replace' });
  }
}

export function useBodyAppearanceOverrides(
  viewport: ScreenViewport | null | undefined,
  colors: Readonly<Record<string, string>>,
): void {
  const providerRef = useRef<BodyColorOverrideProvider | null>(null);

  useEffect(() => {
    if (!viewport) return;
    const provider = new BodyColorOverrideProvider();
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
    if (providerRef.current.setColors(colors))
      viewport.setFeatureOverrideProviderChanged?.();
  }, [viewport, colors]);
}
