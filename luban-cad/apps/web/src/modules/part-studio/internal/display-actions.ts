/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 显示/渲染设置动作层（2026-11-02 Onshape ViewCube 对齐；复用 2caeeafadf 的
 * web-next 实现并扩展）：
 * - 六显示模式（Onshape View tools：Shaded / Shaded without edges /
 *   Shaded with hidden edges / Hidden edges removed / Hidden edges visible /
 *   Translucent）；
 * - 透视/FOV、阴影、AO + 强度、MSAA、背景、边宽/边色；
 * - Translucent 用模型 FeatureAppearance 0.5 透明度实现（iTwin 无全局
 *   “半透明”开关）；退出时 drop overrides。
 *
 * 所有动作对 undefined viewport no-op，返回是否实际应用。
 */
import { DisplayStyle3dState, type ScreenViewport } from '@itwin/core-frontend';
import { Angle } from '@itwin/core-geometry';
import {
  AmbientOcclusion,
  ColorDef,
  FeatureAppearance,
  HiddenLine,
  RenderMode,
  ViewFlags,
} from '@itwin/core-common';
import { applyViewportBackground } from '@luban-cad/viewer';

export type DisplayModeId =
  | 'shaded'
  | 'shaded-no-edges'
  | 'shaded-hidden-edges'
  | 'hidden-removed'
  | 'hidden-visible'
  | 'translucent';

export type BackgroundMode = 'theme' | 'light' | 'dark';

export interface DisplaySettings {
  mode: DisplayModeId;
  perspective: boolean;
  fovDegrees: number;
  ambientOcclusion: boolean;
  aoIntensityPct: number;
  edgeWidthPx: number;
  edgeColor: string;
  /** 完整 BRep 拓扑边叠加（native tile 只含特征/轮廓边；默认开）。 */
  showBrepEdges: boolean;
  /** 全部 BRep 顶点圆点（默认关；仅由显示设置控制）。 */
  showBrepVertices: boolean;
  shadows: boolean;
  antialiasSamples: 1 | 2 | 4 | 8;
  background: BackgroundMode;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  mode: 'shaded',
  perspective: false,
  fovDegrees: 90,
  ambientOcclusion: false, // 2026-11-03：iTwin 默认 AO 关
  aoIntensityPct: 37.5,
  edgeWidthPx: 2,
  edgeColor: '#1f1f1f',
  showBrepEdges: true,
  showBrepVertices: false,
  shadows: false,
  antialiasSamples: 4,
  background: 'theme',
};

/**
 * 六态 + AO/阴影 → viewFlags。
 * 除模式位外统一清掉落库视图可能携带的污染 flags（grid/wiremesh/monochrome/
 * ACS/背景图），并以三个 no*Light 反推打开 lighting——只写 `lighting` 到
 * ViewFlagProps 无效（fromJSON 忽略该键）。
 */
function viewFlagsFor(mode: DisplayModeId, aoOn: boolean, shadowsOn: boolean, base: ViewFlags): ViewFlags {
  const j = base.toJSON();
  const common = {
    ambientOcclusion: aoOn,
    shadows: shadowsOn,
    noCameraLights: false,
    noSourceLights: false,
    noSolarLight: false,
    grid: false,
    acs: false,
    backgroundMap: false,
    monochrome: false,
    wiremesh: false,
    thematicDisplay: false,
  };
  switch (mode) {
    case 'shaded':
    case 'translucent':
      return ViewFlags.fromJSON({ ...j, ...common, renderMode: RenderMode.SmoothShade, visEdges: true, hidEdges: false });
    case 'shaded-no-edges':
      return ViewFlags.fromJSON({ ...j, ...common, renderMode: RenderMode.SmoothShade, visEdges: false, hidEdges: false });
    case 'shaded-hidden-edges':
      return ViewFlags.fromJSON({ ...j, ...common, renderMode: RenderMode.SmoothShade, visEdges: true, hidEdges: true });
    case 'hidden-removed':
      return ViewFlags.fromJSON({ ...j, ...common, renderMode: RenderMode.HiddenLine });
    case 'hidden-visible':
      return ViewFlags.fromJSON({ ...j, ...common, renderMode: RenderMode.Wireframe });
  }
}


/** BRep 拓扑叠加层选项（显示模式/边设置 → 装饰件样式）。 */
export function brepOverlayOptionsFor(s: DisplaySettings): {
  showEdges: boolean;
  showVertices: boolean;
  edgeColor: string;
  edgeWidthPx: number;
  xrayEdges: boolean;
} {
  return {
    showEdges: s.showBrepEdges && s.mode !== 'shaded-no-edges',
    showVertices: s.showBrepVertices,
    edgeColor: s.edgeColor,
    edgeWidthPx: s.edgeWidthPx,
    xrayEdges: s.mode === 'hidden-visible' || s.mode === 'translucent',
  };
}

/** Onshape AO 百分比 → iTwin 幂指数（37.5% ↔ iTwin 默认 1.0，夹 [0.25, 4]）。
 * 2026-11-03：旧锚点 2.0 等于默认强度两倍，默认视口暗一档；以默认 1.0 为
 * 37.5% 锚点后 AO 只收缝隙，不再整体压暗。 */
export function aoIntensityFromPct(pct: number): number {
  return Math.min(4, Math.max(0.25, 1.0 * pct / 37.5));
}

/**
 * 应用设置到指定视口（幂等）。返回 false = 视口不存在。
 * 背景为 theme 时保持现状（由调用方主题 observer 维护）；light/dark 直接写。
 */
export function applyDisplaySettings(
  viewport: ScreenViewport | undefined,
  s: DisplaySettings,
): boolean {
  if (!viewport) return false;

  // 1) 显示模式 + AO + 阴影
  viewport.viewFlags = viewFlagsFor(s.mode, s.ambientOcclusion, s.shadows, viewport.viewFlags);

  // 2) 透视/FOV
  if (s.perspective) viewport.turnCameraOn(Angle.createDegrees(s.fovDegrees));
  else viewport.turnCameraOff();

  // 3) 抗锯齿
  viewport.antialiasSamples = s.antialiasSamples;

  const displayStyle = viewport.view.displayStyle;
  const style = displayStyle.settings;

  // 4) 背景（theme 由 hook 主题 observer 处理）
  if (s.background === 'light') applyViewportBackground(viewport, 'light');
  else if (s.background === 'dark') applyViewportBackground(viewport, 'dark');

  // 5) Translucent 模型透明度（仅 SmoothShade 语义；退出即 drop）
  const view = viewport.view;
  const modelIds = view.isSpatialView() ? [...view.modelSelector.models] : [];
  if (s.mode === 'translucent') {
    const appearance = FeatureAppearance.fromTransparency(0.5);
    for (const id of modelIds) style.overrideModelAppearance(id, appearance);
  } else {
    for (const id of modelIds)
      if (style.modelAppearanceOverrides.has(id)) style.dropModelAppearanceOverride(id);
  }

  // 6) 3D 样式：AO 强度 + 边线
  if (displayStyle instanceof DisplayStyle3dState) {
    const style3d = displayStyle.settings;
    const ao = style3d.ambientOcclusionSettings;
    style3d.ambientOcclusionSettings = AmbientOcclusion.Settings.fromJSON({
      ...ao.toJSON(),
      intensity: aoIntensityFromPct(s.aoIntensityPct),
    });
    const hline = style3d.hiddenLineSettings;
    const visible = hline.visible?.toJSON() ?? {};
    style3d.hiddenLineSettings = HiddenLine.Settings.fromJSON({
      ...hline.toJSON(),
      visible: { ...visible, ovrColor: true, color: ColorDef.fromString(s.edgeColor).tbgr, width: s.edgeWidthPx },
    });
  }

  viewport.synchWithView({});
  return true;
}
