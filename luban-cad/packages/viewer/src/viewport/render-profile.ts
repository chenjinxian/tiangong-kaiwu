/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * iTwin 默认渲染基线（2026-11-03）：
 * - 灯光/环境回到 core 默认值（LightSettings.fromJSON() / Environment.fromJSON()）；
 * - 不覆盖元素/子类别材质（删除 Onshape 灰面 SubCategoryOverride）；
 * - 保留白底（theme-background）与 BRep 全拓扑边线（#1f1f1f 2px）；
 * - AO 默认关、阴影关、MSAA 4。
 */
import { DisplayStyle3dState, type ScreenViewport } from '@itwin/core-frontend';
import { ColorDef, Environment, HiddenLine, LightSettings, RenderMode } from '@itwin/core-common';

/** 边线：BRep 全拓扑叠加的配套近黑 2px。 */
export const EDGE_COLOR = ColorDef.from(31, 31, 31); // #1f1f1f
export const EDGE_WEIGHT = 2;

/** MSAA 采样数（保留高质量视图）。 */
export const ANTIALIAS_SAMPLES = 4;

/**
 * 把 iTwin 默认渲染基线应用到视口（幂等）。
 * 只动灯光/环境/基础 flags/边线外观/MSAA；不写 SubCategoryOverride，
 * 不碰背景（theme-background 负责白底/暗底）。
 */
export function applyViewportRenderBaseline(viewport: ScreenViewport): void {
  // 1) 灯光：core 默认（solar 1 / ambient 0.2 / portrait 0.3 / specular 1）。
  viewport.setLightSettings(LightSettings.fromJSON(undefined));

  // 2) flags：平滑着色 + 光照；AO/阴影关；清掉落库视图污染。
  viewport.viewFlags = viewport.viewFlags.copy({
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

  // 3) 3D 样式：环境默认全关 + BRep 边线外观。
  const displayStyle = viewport.view.displayStyle;
  if (displayStyle instanceof DisplayStyle3dState) {
    const style = displayStyle.settings;
    style.environment = Environment.fromJSON(undefined);
    const hline = style.hiddenLineSettings;
    const visible = hline.visible?.toJSON() ?? {};
    style.hiddenLineSettings = HiddenLine.Settings.fromJSON({
      ...hline.toJSON(),
      visible: { ...visible, ovrColor: true, color: EDGE_COLOR.tbgr, width: EDGE_WEIGHT },
    });
  }

  // 4) MSAA 热设。
  viewport.antialiasSamples = ANTIALIAS_SAMPLES;

  // settings 直改的字典类写入不走 onDisplayStyleChanged——显式失效。
  viewport.invalidateScene();
}
