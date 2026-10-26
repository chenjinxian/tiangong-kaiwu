/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 显示设置动作层（渲染对齐阶段 2，2026-10-26）：右停靠「显示设置」页签的
 * 纯函数出口。与 viewport-actions.ts 同通道/同纪律——经
 * `IModelApp.viewManager.selectedView` 取视口，壳期/测试态缺席时静默 no-op。
 *
 * 映射口径（Onshape View settings → iTwin.js，全记录见渲染对齐分析）：
 * - 显示模式五态（Onshape 六态减 Translucent——全局半透明无 iTwin 旋钮，
 *   诚实差距登记，不硬造）：renderMode + visEdges/hiddenEdges 组合；
 * - 透视 = viewport.turnCameraOn(lensAngle)/turnCameraOff；FOV 20-120° =
 *   lens 角度（Onshape Graphics preferences Field of view 同域）；
 * - AO = viewFlags.ambientOcclusion + AmbientOcclusion.Settings.intensity。
 *   注意 iTwin 的 intensity 是**幂指数**（默认 2.0，越大越暗），与 Onshape
 *   0-100% 线性语义不同——按 Onshape 默认 37.5% ↔ iTwin 默认 2.0 锚点
 *   线性换算并夹值；
 * - 边线宽/色 = hiddenLineSettings.visible（与 render-profile 同一旋钮；
 *   iTwin width 为 1-32 整数 px，Onshape 0.1-3px 取整档）。
 *
 * 会话级口径：只改 viewport 内存态，不落库（Onshape 是账号偏好持久——
 * 我们后续任务再议持久层）。
 */

import { DisplayStyle3dState, IModelApp } from '@itwin/core-frontend';
import { Angle } from '@itwin/core-geometry';
import { AmbientOcclusion, ColorDef, HiddenLine, RenderMode, ViewFlags } from '@itwin/core-common';

/** 显示模式五态（Onshape View cube 菜单口径，减 Translucent）。 */
export type DisplayModeId = 'shaded' | 'shaded-no-edges' | 'shaded-hidden-edges' | 'hidden-removed' | 'hidden-visible';

export interface DisplaySettings {
  mode: DisplayModeId;
  /** 透视相机（默认关，Onshape 同默认）。 */
  perspective: boolean;
  /** 视场角 20-120°（仅透视时有意义；Onshape Field of view 同域）。 */
  fovDegrees: number;
  /** 环境光遮蔽开关（Onshape 默认开；我们先保守关，用户可开）。 */
  ambientOcclusion: boolean;
  /** AO 强度 0-100%（Onshape 默认 37.5%）。 */
  aoIntensityPct: number;
  /** 可见边线宽 1-3px（iTwix width 整数档；Onshape 0.1-3px）。 */
  edgeWidthPx: number;
  /** 可见边线色（hex，如 #3d3d3d——render-profile 基线同款）。 */
  edgeColor: string;
}

/** 缺省（=render-profile 落的基线 + AO 关；Onshape 对齐值见各字段注）。 */
export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  mode: 'shaded',
  perspective: false,
  fovDegrees: 90,
  ambientOcclusion: false,
  aoIntensityPct: 37.5,
  edgeWidthPx: 1,
  edgeColor: '#3d3d3d',
};

/** 五态 + AO 开关 → viewFlags（renderMode + 边组；HiddenLine/Wireframe 自带无光照语义）。 */
function viewFlagsFor(mode: DisplayModeId, aoOn: boolean, base: ViewFlags): ViewFlags {
  const j = base.toJSON();
  switch (mode) {
    case 'shaded': return ViewFlags.fromJSON({ ...j, renderMode: RenderMode.SmoothShade, visEdges: true, hidEdges: false, ambientOcclusion: aoOn });
    case 'shaded-no-edges': return ViewFlags.fromJSON({ ...j, renderMode: RenderMode.SmoothShade, visEdges: false, hidEdges: false, ambientOcclusion: aoOn });
    case 'shaded-hidden-edges': return ViewFlags.fromJSON({ ...j, renderMode: RenderMode.SmoothShade, visEdges: true, hidEdges: true, ambientOcclusion: aoOn });
    case 'hidden-removed': return ViewFlags.fromJSON({ ...j, renderMode: RenderMode.HiddenLine, ambientOcclusion: aoOn });
    case 'hidden-visible': return ViewFlags.fromJSON({ ...j, renderMode: RenderMode.Wireframe, ambientOcclusion: aoOn });
  }
}

/**
 * Onshape AO 百分比 → iTwin 幂指数：37.5% ↔ 2.0（双方默认锚点）线性换算，
 * 夹 [0.25, 8]。
 */
export function aoIntensityFromPct(pct: number): number {
  return Math.min(8, Math.max(0.25, 2.0 * pct / 37.5));
}

/**
 * 应用显示设置到当前视口（幂等；selectedView 缺席时 no-op）。
 * 返回是否实际应用（面板据此提示「视口未就绪」态）。
 */
export function applyDisplaySettings(s: DisplaySettings): boolean {
  const viewport = IModelApp.viewManager?.selectedView;
  if (!viewport) return false;

  // 1) 显示模式 + AO 开关（viewFlags setter 走事件链自动失效）
  viewport.viewFlags = viewFlagsFor(s.mode, s.ambientOcclusion, viewport.viewFlags);

  // 2) 透视/FOV（相机路径）
  if (s.perspective) {
    viewport.turnCameraOn(Angle.createDegrees(s.fovDegrees));
  } else {
    viewport.turnCameraOff();
  }

  // 3d 样式旋钮（本产品恒空间 3D 视图；2D 缺这些 setter，非 3D 只应用模式/相机）
  const displayStyle = viewport.view.displayStyle;
  if (!(displayStyle instanceof DisplayStyle3dState)) {
    viewport.synchWithView({});
    return true;
  }
  const style = displayStyle.settings;
  // 3) AO（settings setter 走事件链）
  const ao = style.ambientOcclusionSettings;
  style.ambientOcclusionSettings = AmbientOcclusion.Settings.fromJSON({
    ...ao.toJSON(),
    intensity: aoIntensityFromPct(s.aoIntensityPct),
  });

  // 4) 边线宽/色（hiddenLineSettings setter 走事件链）
  const hline = style.hiddenLineSettings;
  const visible = hline.visible?.toJSON() ?? {};
  const color = ColorDef.fromString(s.edgeColor);
  style.hiddenLineSettings = HiddenLine.Settings.fromJSON({
    ...hline.toJSON(),
    visible: { ...visible, ovrColor: true, color: color.tbgr, width: s.edgeWidthPx },
  });

  viewport.synchWithView({});
  return true;
}
