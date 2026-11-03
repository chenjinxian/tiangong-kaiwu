/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 显示/渲染设置动作层测试（2026-11-02）：六显示模式 → viewFlags、透视/FOV、
 * 抗锯齿、背景、Translucent 模型透明度，以及 AO 百分比换算。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DisplayStyle3dState, type ScreenViewport } from '@itwin/core-frontend';
import { AmbientOcclusion, ColorDef, HiddenLine, RenderMode, ViewFlags } from '@itwin/core-common';

const mocks = vi.hoisted(() => ({
  applyViewportBackground: vi.fn(),
}));

vi.mock('@luban-cad/viewer', () => ({
  applyViewportBackground: mocks.applyViewportBackground,
}));

import {
  applyDisplaySettings,
  aoIntensityFromPct,
  brepOverlayOptionsFor,
  DEFAULT_DISPLAY_SETTINGS,
  type DisplayModeId,
  type DisplaySettings,
} from '../internal/display-actions.js';

interface FakeViewport {
  viewport: ScreenViewport;
  turnCameraOn: ReturnType<typeof vi.fn>;
  turnCameraOff: ReturnType<typeof vi.fn>;
  synchWithView: ReturnType<typeof vi.fn>;
  overrideModelAppearance: ReturnType<typeof vi.fn>;
  dropModelAppearanceOverride: ReturnType<typeof vi.fn>;
  modelAppearanceOverrides: Map<string, unknown>;
  isSpatialView: ReturnType<typeof vi.fn>;
}

function fakeViewport(initialFlags: ViewFlags = ViewFlags.fromJSON({})): FakeViewport {
  const turnCameraOn = vi.fn();
  const turnCameraOff = vi.fn();
  const synchWithView = vi.fn();
  const overrideModelAppearance = vi.fn();
  const dropModelAppearanceOverride = vi.fn();
  const modelAppearanceOverrides = new Map<string, unknown>();
  const isSpatialView = vi.fn(() => false);
  const viewport = {
    viewFlags: initialFlags,
    antialiasSamples: 1,
    turnCameraOn,
    turnCameraOff,
    synchWithView,
    view: {
      displayStyle: {
        settings: { overrideModelAppearance, dropModelAppearanceOverride, modelAppearanceOverrides },
      },
      isSpatialView,
      modelSelector: { models: ['model-1'] },
    },
  } as unknown as ScreenViewport;
  return {
    viewport,
    turnCameraOn,
    turnCameraOff,
    synchWithView,
    overrideModelAppearance,
    dropModelAppearanceOverride,
    modelAppearanceOverrides,
    isSpatialView,
  };
}

function settings(patch: Partial<DisplaySettings>): DisplaySettings {
  return { ...DEFAULT_DISPLAY_SETTINGS, ...patch };
}

function flags(viewport: ScreenViewport): ViewFlags {
  return viewport.viewFlags;
}

describe('display-actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps the six Onshape display modes onto renderMode/visEdges/hidEdges', () => {
    const cases: { mode: DisplayModeId; renderMode: RenderMode; visEdges: boolean; hidEdges: boolean }[] = [
      { mode: 'shaded', renderMode: RenderMode.SmoothShade, visEdges: true, hidEdges: false },
      { mode: 'translucent', renderMode: RenderMode.SmoothShade, visEdges: true, hidEdges: false },
      { mode: 'shaded-no-edges', renderMode: RenderMode.SmoothShade, visEdges: false, hidEdges: false },
      { mode: 'shaded-hidden-edges', renderMode: RenderMode.SmoothShade, visEdges: true, hidEdges: true },
      // HiddenLine/Wireframe 下 visibleEdges 标志被忽略（edgesRequired 恒真），
      // 实际画边由 renderMode 决定，标志保持缺省 false。
      { mode: 'hidden-removed', renderMode: RenderMode.HiddenLine, visEdges: false, hidEdges: false },
      { mode: 'hidden-visible', renderMode: RenderMode.Wireframe, visEdges: false, hidEdges: false },
    ];
    for (const c of cases) {
      const fake = fakeViewport();
      expect(applyDisplaySettings(fake.viewport, settings({ mode: c.mode }))).toBe(true);
      expect(flags(fake.viewport).renderMode, `${c.mode} renderMode`).toBe(c.renderMode);
      expect(flags(fake.viewport).visibleEdges, `${c.mode} visibleEdges`).toBe(c.visEdges);
      expect(flags(fake.viewport).hiddenEdges, `${c.mode} hiddenEdges`).toBe(c.hidEdges);
    }
  });

  it('applies AO and shadow flags independently of the display mode', () => {
    const fake = fakeViewport();
    applyDisplaySettings(fake.viewport, settings({ ambientOcclusion: false, shadows: true }));
    expect(flags(fake.viewport).ambientOcclusion).toBe(false);
    expect(flags(fake.viewport).shadows).toBe(true);
    expect(flags(fake.viewport).lighting).toBe(true);
  });

  it('lights saved views back up and clears contaminating view flags', () => {
    const fake = fakeViewport(ViewFlags.fromJSON({
      noCameraLights: true,
      noSourceLights: true,
      noSolarLight: true,
      grid: true,
      acs: true,
      backgroundMap: true,
      monochrome: true,
      wiremesh: true,
    }));
    applyDisplaySettings(fake.viewport, settings({ mode: 'shaded' }));
    const f = flags(fake.viewport);
    expect(f.lighting).toBe(true);
    expect(f.grid).toBe(false);
    expect(f.acsTriad).toBe(false);
    expect(f.backgroundMap).toBe(false);
    expect(f.monochrome).toBe(false);
    expect(f.wiremesh).toBe(false);
    expect(f.renderMode).toBe(RenderMode.SmoothShade);
  });

  it('turns the perspective camera on with the configured FOV and off when disabled', () => {
    const fake = fakeViewport();
    applyDisplaySettings(fake.viewport, settings({ perspective: true, fovDegrees: 60 }));
    expect(fake.turnCameraOn).toHaveBeenCalledTimes(1);
    const angle = fake.turnCameraOn.mock.calls[0]![0] as { degrees: number };
    expect(angle.degrees).toBeCloseTo(60, 8);

    applyDisplaySettings(fake.viewport, settings({ perspective: false }));
    expect(fake.turnCameraOff).toHaveBeenCalledTimes(1);
  });

  it('applies antialiasing samples and synchronizes the view', () => {
    const fake = fakeViewport();
    applyDisplaySettings(fake.viewport, settings({ antialiasSamples: 8 }));
    expect(fake.viewport.antialiasSamples).toBe(8);
    expect(fake.synchWithView).toHaveBeenCalledWith({});
  });

  it('routes explicit backgrounds and leaves theme background to the caller', () => {
    const fake = fakeViewport();
    applyDisplaySettings(fake.viewport, settings({ background: 'dark' }));
    expect(mocks.applyViewportBackground).toHaveBeenLastCalledWith(fake.viewport, 'dark');
    applyDisplaySettings(fake.viewport, settings({ background: 'light' }));
    expect(mocks.applyViewportBackground).toHaveBeenLastCalledWith(fake.viewport, 'light');
    mocks.applyViewportBackground.mockClear();
    applyDisplaySettings(fake.viewport, settings({ background: 'theme' }));
    expect(mocks.applyViewportBackground).not.toHaveBeenCalled();
  });

  it('overrides model appearance only for Translucent on a spatial view', () => {
    const fake = fakeViewport();
    fake.isSpatialView.mockReturnValue(true);
    applyDisplaySettings(fake.viewport, settings({ mode: 'translucent' }));
    expect(fake.overrideModelAppearance).toHaveBeenCalledWith('model-1', expect.anything());

    fake.overrideModelAppearance.mockClear();
    fake.modelAppearanceOverrides.set('model-1', {});
    applyDisplaySettings(fake.viewport, settings({ mode: 'shaded' }));
    expect(fake.overrideModelAppearance).not.toHaveBeenCalled();
    expect(fake.dropModelAppearanceOverride).toHaveBeenCalledWith('model-1');
  });

  it('drops stale translucent overrides only when one exists', () => {
    const fake = fakeViewport();
    fake.isSpatialView.mockReturnValue(true);
    applyDisplaySettings(fake.viewport, settings({ mode: 'shaded' }));
    expect(fake.dropModelAppearanceOverride).not.toHaveBeenCalled();

    fake.modelAppearanceOverrides.set('model-1', {});
    applyDisplaySettings(fake.viewport, settings({ mode: 'shaded' }));
    expect(fake.dropModelAppearanceOverride).toHaveBeenCalledWith('model-1');
  });

  it('writes AO intensity and edge width/color into the 3D display style', () => {
    const fake = fakeViewport();
    const settings3d = {
      ambientOcclusionSettings: AmbientOcclusion.Settings.fromJSON({ intensity: 1 }),
      hiddenLineSettings: HiddenLine.Settings.fromJSON({}),
    };
    const displayStyle = Object.create(DisplayStyle3dState.prototype) as object;
    Object.defineProperty(displayStyle, 'settings', { value: settings3d, configurable: true });
    (fake.viewport.view as unknown as { displayStyle: unknown }).displayStyle = displayStyle;

    applyDisplaySettings(fake.viewport, settings({ aoIntensityPct: 75, edgeWidthPx: 2, edgeColor: '#ff0000' }));
    expect(settings3d.ambientOcclusionSettings.intensity).toBeCloseTo(2, 6);
    const visibleJson = settings3d.hiddenLineSettings.toJSON().visible!;
    expect(visibleJson.width).toBe(2);
    expect(visibleJson.ovrColor).toBe(true);
    expect(visibleJson.color).toBe(ColorDef.fromString('#ff0000').tbgr);
  });

  it('maps display mode + showBrepVertices to the BRep overlay options', () => {
    expect(brepOverlayOptionsFor(DEFAULT_DISPLAY_SETTINGS)).toMatchObject({
      showEdges: true,
      showVertices: false,
      edgeColor: '#1f1f1f',
      edgeWidthPx: 2,
      xrayEdges: false,
    });
    expect(brepOverlayOptionsFor({ ...DEFAULT_DISPLAY_SETTINGS, mode: 'shaded-no-edges' }).showEdges).toBe(false);
    expect(brepOverlayOptionsFor({ ...DEFAULT_DISPLAY_SETTINGS, mode: 'hidden-visible' }).xrayEdges).toBe(true);
    expect(brepOverlayOptionsFor({ ...DEFAULT_DISPLAY_SETTINGS, mode: 'translucent' }).xrayEdges).toBe(true);
    // 顶点叠加仅由 showBrepVertices 控制（不再随选择模式自动打开）。
    expect(brepOverlayOptionsFor(DEFAULT_DISPLAY_SETTINGS).showVertices).toBe(false);
    expect(brepOverlayOptionsFor({ ...DEFAULT_DISPLAY_SETTINGS, showBrepVertices: true }).showVertices).toBe(true);
    expect(brepOverlayOptionsFor({ ...DEFAULT_DISPLAY_SETTINGS, showBrepEdges: false }).showEdges).toBe(false);
  });

  it('is a no-op without a viewport', () => {
    expect(applyDisplaySettings(undefined, DEFAULT_DISPLAY_SETTINGS)).toBe(false);
  });

  it('默认 AO 关闭（回归 iTwin 默认）', () => {
    expect(DEFAULT_DISPLAY_SETTINGS.ambientOcclusion).toBe(false);
    expect(DEFAULT_DISPLAY_SETTINGS.antialiasSamples).toBe(4);
    expect(DEFAULT_DISPLAY_SETTINGS.background).toBe('theme');
  });

  it('converts Onshape AO percentage to the iTwin intensity exponent with clamps', () => {
    // Onshape 37.5% = iTwin 默认强度 1.0（旧 2.0 锚点把默认视口压暗一倍）。
    expect(aoIntensityFromPct(37.5)).toBeCloseTo(1, 10);
    expect(aoIntensityFromPct(0)).toBe(0.25);
    expect(aoIntensityFromPct(100)).toBeCloseTo(2.666667, 5);
    expect(aoIntensityFromPct(1000)).toBe(4);
  });
});
