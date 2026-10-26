/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Onshape 视觉基线渲染画像（2026-10-26 渲染对齐战役阶段 1）。
 *
 * 依据（分析全文见会话记录；数值与 webhook-agent baseline 生成器
 * `baseline-generator.ts` 的 default 样式互为镜像——改一处须同步另一处）：
 * - Onshape 视觉基因 = 中灰哑光面 + 深黑细边线 + 白底 + 方向光三级明暗
 *   （os-11 采集图实测分析）；
 * - 边线：Onshape 默认显示模式「Shaded」**含边线**；我们 baseline 样式
 *   visibleEdges=false，此前截图看到的「边」只是面明暗差分界——打开
 *   visibleEdges + 深灰边色即得 Onshape 式深边线；
 * - 灯光：baseline 旧值（solar 0.8/portrait 0.4/ambient 0.3）令画面平灰；
 *   对齐上游 DisplayStyle 缺省（solar 1.0/ambient 0.2）并压人像光
 *   （portrait 相机补光会抹平明暗阶差）与高光；
 * - 材质：MS 侧类别（LubanCAD:BodySolid）与 baseline 类别均无中灰外观
 *   （白/缺省黑）——统一经 displayStyle.subCategoryOvr 覆盖为中灰哑光，
 *   存量库与新库一致生效（文件真值另由 baseline 镜像值兜底）；
 * - 抗锯齿：Onshape「View in high quality」≈ MSAA——viewport.antialiasSamples
 *   运行时可热设（Viewport.ts:667-680），无需动 IModelApp.startup。
 *
 * AO（Onshape 默认 37.5% 强度）阶段 1 不开（保守；阶段 2 显示设置页签
 * 暴露 viewFlags.ambientOcclusion + ao.intensity≈0.375）。
 */

import { DisplayStyle3dState, type ScreenViewport } from '@itwin/core-frontend';
import { ColorDef, HiddenLine, SubCategoryOverride, ViewFlags } from '@itwin/core-common';

/** 边线：深灰近黑（Onshape 式），1px 级权重。 */
export const EDGE_COLOR = ColorDef.from(61, 61, 61); // #3d3d3d
export const EDGE_WEIGHT = 1;

/** 面材质：中灰哑光（Onshape 默认零件色系）；高光统一走灯光 specularIntensity。 */
export const BODY_COLOR = ColorDef.from(154, 154, 158); // #9a9a9e

/** 灯光（LightSettingsProps 镜像值；solar 1.0/ambient 0.2 = 上游缺省）。
 *  hemisphere 显式归零：旧 baseline 样式带 0.4 天空补光，clone 只覆写给出项——
 *  不归零会残留蓝灰罩色（中性灰是 Onshape 观感的一部分）。 */
export const LIGHTS_PROFILE = {
  solar: { intensity: 1.0, alwaysEnabled: true },
  ambient: { intensity: 0.2 },
  portrait: { intensity: 0.1 },
  hemisphere: { intensity: 0 },
  specularIntensity: 0.5,
} as const;

/** MSAA 采样数（对应 Onshape「View in high quality」）。 */
export const ANTIALIAS_SAMPLES = 4;

/**
 * 把 Onshape 视觉基线应用到视口（幂等——重复应用写入同值）。
 *
 * 只动「基线观感」四件：可见边（深灰 1px）、灯光、全体 SubCategory 中灰
 * 哑光覆盖、MSAA。不碰 renderMode/背景/取景——那些归用户操作与
 * theme-background 等既有机制。displayStyle 均为 ViewState 持有的内存态
 * （不落库），同 ViewState 复用于多视口时共享——本产品单视口形态无此顾虑。
 */
export function applyRenderProfile(viewport: ScreenViewport, subCategoryIds: readonly string[]): void {
  // 1) 可见边：Onshape「Shaded（默认，含边线）」。JSON prop 名是 visEdges。
  viewport.viewFlags = ViewFlags.fromJSON({ ...viewport.viewFlags.toJSON(), visEdges: true });

  // 2) 边线观感：hiddenLineSettings.visible 管 SmoothShade 下的可见边
  //    （无覆盖=用元素自身线符——BRep 无线符信息故此前呈现为浅灰细线）。
  //    本产品恒为空间 3D 视图；2D 样式无这些旋钮，非 3D 态直接跳过本节。
  const displayStyle = viewport.view.displayStyle;
  if (!(displayStyle instanceof DisplayStyle3dState)) return;
  const style = displayStyle.settings;
  const hline = style.hiddenLineSettings;
  const visible = hline.visible?.toJSON() ?? {};
  style.hiddenLineSettings = HiddenLine.Settings.fromJSON({
    ...hline.toJSON(),
    visible: { ...visible, ovrColor: true, color: EDGE_COLOR.tbgr, width: EDGE_WEIGHT },
  });

  // 3) 灯光：clone(changed) 局部覆写（LightSettings.clone 语义，含子灯 clone）。
  style.lights = style.lights.clone({ ...LIGHTS_PROFILE });

  // 4) 面：全体 SubCategory → 中灰哑光（存量库白/黑类别统一为 Onshape 灰）。
  const grayAppearance = SubCategoryOverride.fromJSON({ color: BODY_COLOR.tbgr });
  for (const id of subCategoryIds) style.overrideSubCategory(id, grayAppearance);

  // 5) MSAA 热设（power-of-2；写 OnScreenTarget 并 invalidateRenderPlan）。
  viewport.antialiasSamples = ANTIALIAS_SAMPLES;
}
