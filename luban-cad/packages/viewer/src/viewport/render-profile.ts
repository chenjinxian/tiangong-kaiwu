/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * iTwin 默认渲染基线（2026-11-03；2026-11-12 Stage A/B 收敛到 shared 常量）：
 * - 灯光/环境回到 core 默认值（LightSettings.fromJSON() / Environment.fromJSON()），
 *   仅高光强度取 `RENDER_DEFAULTS.lights.specularIntensity`（Onshape 哑光观感）；
 * - 不覆盖元素/子类别材质（材质由 iModel 类别外观决定）；
 * - 保留主题背景（theme-background）与 BRep 全拓扑边线（默认色/线宽来自 shared）；
 * - AO/阴影关闭、MSAA 来自 shared 默认值。
 *
 * 纯 ViewState 应用器（`applyViewStateRenderBaseline` / `applyViewStateBackground`）
 * 供 useViewport 在 `ScreenViewport.create` / `addViewport` **之前**同步调用，
 * 保证首帧即为 Onshape 默认外观，不再先黑后白。
 */
import { DisplayStyle3dState, type ScreenViewport, type ViewState } from '@itwin/core-frontend';
import { ColorDef, Environment, HiddenLine, LightSettings, RenderMode } from '@itwin/core-common';
import { RENDER_DEFAULTS, rgbToTbgr } from '@luban-cad/shared';

/** 边线：BRep 全拓扑叠加的配套近黑 2px（shared 单一来源）。 */
export const EDGE_COLOR = ColorDef.fromTbgr(rgbToTbgr(RENDER_DEFAULTS.edge));
export const EDGE_WEIGHT = RENDER_DEFAULTS.edgeWidthPx;

/** MSAA 采样数（保留高质量视图）。 */
export const ANTIALIAS_SAMPLES = RENDER_DEFAULTS.antialiasSamples;

/** 规范灯光：core 默认方向/开关，强度与高光取 shared 默认值。 */
function canonicalLights(): LightSettings {
  const base = LightSettings.fromJSON(undefined).toJSON() ?? {};
  return LightSettings.fromJSON({
    ...base,
    portrait: { intensity: RENDER_DEFAULTS.lights.portrait },
    solar: {
      ...(base.solar ?? {}),
      intensity: RENDER_DEFAULTS.lights.solar,
      alwaysEnabled: true,
      direction: [...RENDER_DEFAULTS.lights.solarDirection],
    },
    ambient: { ...(base.ambient ?? {}), intensity: RENDER_DEFAULTS.lights.ambient },
    hemisphere: { ...(base.hemisphere ?? {}), intensity: RENDER_DEFAULTS.lights.hemisphere },
    specularIntensity: RENDER_DEFAULTS.lights.specularIntensity,
  });
}

/**
 * 纯 ViewState 渲染基线（幂等）。只动灯光/环境/flags/边线外观；
 * 不写 SubCategoryOverride，不碰背景。
 */
export function applyViewStateRenderBaseline(view: ViewState): void {
  // 1) flags：平滑着色 + 光照；AO/阴影关；清掉落库视图污染。
  view.viewFlags = view.viewFlags.copy({
    renderMode: RenderMode.SmoothShade,
    visibleEdges: true,
    hiddenEdges: false,
    lighting: true,
    ambientOcclusion: false,
    shadows: false,
    grid: false,
    acsTriad: false,
    backgroundMap: false,
    monochrome: false,
    wiremesh: false,
    thematicDisplay: false,
  });

  // 2) 3D 样式：环境默认全关 + 规范灯光 + BRep 边线外观。
  const displayStyle = view.displayStyle;
  if (displayStyle instanceof DisplayStyle3dState) {
    const style = displayStyle.settings;
    style.environment = Environment.fromJSON(undefined);
    style.lights = canonicalLights();
    const hline = style.hiddenLineSettings;
    const visible = hline.visible?.toJSON() ?? {};
    style.hiddenLineSettings = HiddenLine.Settings.fromJSON({
      ...hline.toJSON(),
      visible: { ...visible, ovrColor: true, color: EDGE_COLOR.tbgr, width: EDGE_WEIGHT },
    });
  }
}

/**
 * 把 iTwin 默认渲染基线应用到视口（幂等）。
 * 创建链后调用；首帧前请用 `applyViewStateRenderBaseline(view)` +
 * `applyViewStateBackground(view, theme)`。
 */
export function applyViewportRenderBaseline(viewport: ScreenViewport): void {
  applyViewStateRenderBaseline(viewport.view);
  viewport.antialiasSamples = ANTIALIAS_SAMPLES;
  // settings 直改的字典类写入不走 onDisplayStyleChanged——显式失效。
  viewport.invalidateScene();
}
