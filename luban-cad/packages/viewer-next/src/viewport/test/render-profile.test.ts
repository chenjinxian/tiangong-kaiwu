/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * render-profile 单测（2026-10-26 渲染对齐阶段 1）：Onshape 视觉基线的
 * 应用面钉死——可见边（ovrColor+深灰+1px）、灯光镜像值（solar 1.0/
 * ambient 0.2/portrait 0.1/specular 0.5）、全 SubCategory 中灰覆盖、
 * MSAA=4。core-frontend/core-common 真模块（纯数据/纯计算对象，jsdom 可载），
 * 视口/样式层用结构替身（本包测试惯例：零真实渲染）。
 */
import { describe, expect, it } from 'vitest';
import { ColorDef, HiddenLine, SubCategoryOverride, ViewFlags } from '@itwin/core-common';
import { DisplayStyle3dState } from '@itwin/core-frontend';
import {
  ANTIALIAS_SAMPLES,
  applyRenderProfile,
  BODY_COLOR,
  EDGE_COLOR,
  EDGE_WEIGHT,
  LIGHTS_PROFILE,
} from '../render-profile.js';

/** 3D 样式层替身：记录被写入的 settings（真实 DisplayStyle3dSettings 的关键 setter 面）。 */
function fakeSettings() {
  const lights: { clone: (changed: unknown) => unknown; changed?: unknown } = {
    clone: (changed: unknown) => { lights.changed = changed; return lights; },
  };
  const s = {
    hiddenLineSettings: HiddenLine.Settings.fromJSON({}),
    lights,
    overrides: new Map<string, unknown>(),
    overrideSubCategory: (id: string, ovr: unknown) => { s.overrides.set(id, ovr); },
  };
  return s;
}

/** 视口替身：viewFlags setter + 3D displayStyle（instanceof DisplayStyle3dState 命中真类）。 */
function fakeViewport() {
  const settings = fakeSettings();
  const vp: {
    __viewFlags: { toJSON: () => Record<string, unknown> };
    viewFlags: { toJSON: () => Record<string, unknown> };
    antialiasSamples: number;
    view: { displayStyle: unknown };
  } = {
    __viewFlags: { toJSON: () => ({ renderMode: 6, lighting: true }) },
    get viewFlags() { return vp.__viewFlags; },
    set viewFlags(v: { toJSON: () => Record<string, unknown> }) { vp.__viewFlags = v; },
    antialiasSamples: 1,
    view: { displayStyle: Object.create(DisplayStyle3dState.prototype, {
      settings: { value: settings },
    }) },
  };
  return { vp, settings };
}

describe('render-profile：Onshape 视觉基线应用', () => {
  it('可见边打开 + 边线深灰 1px（ovrColor 语义）', () => {
    const { vp, settings } = fakeViewport();
    applyRenderProfile(vp as never, []);
    expect(vp.viewFlags.toJSON()).toMatchObject({ visEdges: true, renderMode: 6 });
    const visible = settings.hiddenLineSettings.toJSON().visible ?? {};
    expect(visible).toMatchObject({ ovrColor: true, color: EDGE_COLOR.tbgr, width: EDGE_WEIGHT });
  });

  it('灯光镜像值透传 lights.clone（solar 1.0/ambient 0.2/portrait 0.1/specular 0.5）', () => {
    const { vp, settings } = fakeViewport();
    applyRenderProfile(vp as never, []);
    const written = settings.lights as unknown as { changed: unknown };
    expect(written.changed).toEqual(LIGHTS_PROFILE);
  });

  it('全体 SubCategory → 中灰哑光覆盖（SubCategoryOverride 真类）', () => {
    const { vp, settings } = fakeViewport();
    applyRenderProfile(vp as never, ['0x1', '0x2']);
    expect(settings.overrides.size).toBe(2);
    for (const ovr of settings.overrides.values()) {
      expect(ovr).toBeInstanceOf(SubCategoryOverride);
      expect((ovr as SubCategoryOverride).color?.toHexString()).toBe(BODY_COLOR.toHexString());
    }
  });

  it('MSAA 热设 = 4（Onshape View in high quality 对应）', () => {
    const { vp } = fakeViewport();
    applyRenderProfile(vp as never, []);
    expect(vp.antialiasSamples).toBe(ANTIALIAS_SAMPLES);
  });

  it('幂等：重复应用写入同值不叠加', () => {
    const { vp, settings } = fakeViewport();
    applyRenderProfile(vp as never, ['0x1']);
    const first = settings.hiddenLineSettings;
    applyRenderProfile(vp as never, ['0x1']);
    expect(settings.hiddenLineSettings.toJSON()).toEqual(first.toJSON());
    expect(settings.overrides.size).toBe(1);
  });

  it('基线常量钉形：边 #3d3d3d / 面 #9a9a9e（Onshape 视觉基因镜像）', () => {
    expect(EDGE_COLOR.toHexString()).toBe('#3d3d3d');
    expect(BODY_COLOR.toHexString()).toBe('#9a9a9e');
    expect(ViewFlags.fromJSON({ visEdges: true }).visibleEdges).toBe(true);
  });
});
