/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 渲染基线单测（2026-11-03 回归 iTwin 默认）：
 * - 灯光 = LightSettings.fromJSON(undefined)；
 * - environment = Environment.fromJSON(undefined)（sky/ground/atmosphere 全关）；
 * - 不写任何 SubCategoryOverride（材质回到元素/类别默认）；
 * - viewFlags = SmoothShade + lighting + visibleEdges，AO/shadows 关；
 * - hiddenLine visible 边线保留 #1f1f1f/2px；MSAA 4。
 */
import { describe, expect, it, vi } from 'vitest';
import { Environment, HiddenLine, LightSettings, RenderMode, ViewFlags } from '@itwin/core-common';
import { DisplayStyle3dState } from '@itwin/core-frontend';
import {
  ANTIALIAS_SAMPLES,
  applyViewportRenderBaseline,
  EDGE_COLOR,
  EDGE_WEIGHT,
} from '../render-profile.js';

function fakeViewport() {
  const settings = {
    environment: Environment.defaults.withDisplay({ sky: true, ground: true, atmosphere: true }),
    hiddenLineSettings: HiddenLine.Settings.fromJSON({
      visible: { ovrColor: true, color: 0x123456, width: 5 },
    }),
    lights: LightSettings.fromJSON({
      solar: { intensity: 3, alwaysEnabled: true, direction: [1, 0, 0] },
    }),
  };
  const vp = {
    viewFlags: ViewFlags.fromJSON({
      renderMode: RenderMode.HiddenLine,
      noSolarLight: true,
      noCameraLights: true,
      noSourceLights: true,
      grid: true,
      acs: true,
      backgroundMap: true,
      monochrome: true,
      wiremesh: true,
      thematicDisplay: true,
    }),
    antialiasSamples: 1,
    invalidateScene: vi.fn(),
    setLightSettings(next: LightSettings) { settings.lights = next; },
    view: {
      displayStyle: Object.create(DisplayStyle3dState.prototype, {
        settings: { value: settings },
      }),
    },
  };
  return { vp, settings };
}

describe('render-profile：iTwin 默认渲染基线', () => {
  it('灯光回到 LightSettings 默认值', () => {
    const { vp, settings } = fakeViewport();
    applyViewportRenderBaseline(vp as never);
    expect(settings.lights.solar.intensity).toBe(1);
    expect(settings.lights.solar.alwaysEnabled).toBe(false);
    expect(settings.lights.solar.direction.isAlmostEqual({ x: 0.272166, y: 0.680414, z: 0.680414 } as never)).toBe(true);
    expect(settings.lights.ambient.intensity).toBe(0.2);
    expect(settings.lights.portraitIntensity).toBe(0.3);
    expect(settings.lights.specularIntensity).toBe(1);
    expect(settings.lights.hemisphere.intensity).toBe(0);
  });

  it('environment 回到默认全关', () => {
    const { vp, settings } = fakeViewport();
    applyViewportRenderBaseline(vp as never);
    expect(settings.environment.displaySky).toBe(false);
    expect(settings.environment.displayGround).toBe(false);
    expect(settings.environment.displayAtmosphere).toBe(false);
  });

  it('view flags = SmoothShade + lighting + visibleEdges；AO/阴影关并清污染', () => {
    const { vp } = fakeViewport();
    applyViewportRenderBaseline(vp as never);
    const f = vp.viewFlags;
    expect(f.renderMode).toBe(RenderMode.SmoothShade);
    expect(f.lighting).toBe(true);
    expect(f.visibleEdges).toBe(true);
    expect(f.hiddenEdges).toBe(false);
    expect(f.ambientOcclusion).toBe(false);
    expect(f.shadows).toBe(false);
    expect(f.grid).toBe(false);
    expect(f.acsTriad).toBe(false);
    expect(f.backgroundMap).toBe(false);
    expect(f.monochrome).toBe(false);
    expect(f.wiremesh).toBe(false);
    expect(f.thematicDisplay).toBe(false);
  });

  it('visible 边线覆盖 = #1f1f1f / 2px', () => {
    const { vp, settings } = fakeViewport();
    applyViewportRenderBaseline(vp as never);
    expect(settings.hiddenLineSettings.toJSON().visible).toMatchObject({
      ovrColor: true,
      color: EDGE_COLOR.tbgr,
      width: EDGE_WEIGHT,
    });
  });

  it('不写 SubCategoryOverride（fake settings 未提供 overrideSubCategory 也不抛错）', () => {
    const { vp } = fakeViewport();
    expect(() => applyViewportRenderBaseline(vp as never)).not.toThrow();
  });

  it('幂等：重复应用不叠加，边线/灯光/环境保持 stock 值', () => {
    const { vp, settings } = fakeViewport();
    applyViewportRenderBaseline(vp as never);
    const firstVisible = settings.hiddenLineSettings.toJSON().visible;

    applyViewportRenderBaseline(vp as never);

    // 边线覆盖重复写入同值（不嵌套/不漂移）。
    expect(settings.hiddenLineSettings.toJSON().visible).toEqual(firstVisible);
    expect(settings.hiddenLineSettings.toJSON().visible).toMatchObject({
      ovrColor: true,
      color: EDGE_COLOR.tbgr,
      width: EDGE_WEIGHT,
    });
    // 灯光仍是 core 默认值（solar 1 / ambient 0.2 / portrait 0.3 / specular 1）。
    expect(settings.lights.solar.intensity).toBe(1);
    expect(settings.lights.solar.alwaysEnabled).toBe(false);
    expect(settings.lights.ambient.intensity).toBe(0.2);
    expect(settings.lights.portraitIntensity).toBe(0.3);
    expect(settings.lights.specularIntensity).toBe(1);
    expect(settings.lights.hemisphere.intensity).toBe(0);
    // 环境仍全关。
    expect(settings.environment.displaySky).toBe(false);
    expect(settings.environment.displayGround).toBe(false);
    expect(settings.environment.displayAtmosphere).toBe(false);
  });

  it('MSAA=4 且 invalidateScene 恰一次', () => {
    const { vp } = fakeViewport();
    applyViewportRenderBaseline(vp as never);
    expect(vp.antialiasSamples).toBe(ANTIALIAS_SAMPLES);
    expect(vp.invalidateScene).toHaveBeenCalledTimes(1);
  });

  it('常量钉形：边 #1f1f1f / 2px', () => {
    expect(EDGE_COLOR.toHexString()).toBe('#1f1f1f');
    expect(EDGE_WEIGHT).toBe(2);
    expect(ANTIALIAS_SAMPLES).toBe(4);
  });
});
