/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图绘制实时数值提示（Onshape live 对齐，2026-11-02）：把工具已经锚定的
 * 点与当前光标点算成光标旁的即时尺寸（线长/角度、矩形宽高、圆半径、三点弧
 * 半径）。纯函数，不碰 IModelApp——工具负责把结果随光标发给覆盖层。
 *
 * 数值格式与 Onshape 输入框一致：去尾零、最多两位小数（草图单位为 mm）。
 * 样条不臆造尺寸（Onshape 只显示控制多边形），只保留阶段提示。
 */
import type { SketchPoint2 } from './sketch-plane.js';

export type SketchToolKind = 'line' | 'rectangle' | 'circle' | 'arc' | 'spline';

export interface SketchLiveMeasure {
  /** i18n 键（由覆盖层翻译；保持纯函数无 i18next 依赖）。 */
  labelKey: string;
  value: string;
}

function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '?';
  const fixed = value.toFixed(decimals);
  return fixed.replace(/\.?0+$/, '') || '0';
}

function length(a: SketchPoint2, b: SketchPoint2): number {
  return Math.hypot(b.u - a.u, b.v - a.v);
}

/** 三点定圆半径（与 SketchArc3PointTool 的构造同一几何口径）。共线返回 undefined。 */
export function radiusThroughThreePoints(a: SketchPoint2, b: SketchPoint2, c: SketchPoint2): number | undefined {
  const d = 2 * (a.u * (b.v - c.v) + b.u * (c.v - a.v) + c.u * (a.v - b.v));
  if (Math.abs(d) < 1e-12) return undefined;
  const aa = a.u * a.u + a.v * a.v;
  const bb = b.u * b.u + b.v * b.v;
  const cc = c.u * c.u + c.v * c.v;
  const centerU = (aa * (b.v - c.v) + bb * (c.v - a.v) + cc * (a.v - b.v)) / d;
  const centerV = (aa * (c.u - b.u) + bb * (a.u - c.u) + cc * (b.u - a.u)) / d;
  return Math.hypot(a.u - centerU, a.v - centerV);
}

/**
 * 当前阶段的光标旁尺寸。锚点为 0（尚未落第一点）时返回空——阶段提示另发。
 * @param kind 工具几何种类
 * @param anchors 已锚定局部点（按工具状态机顺序）
 * @param cursor 当前光标局部点
 */
export function computeSketchLiveMeasures(
  kind: SketchToolKind,
  anchors: readonly SketchPoint2[],
  cursor: SketchPoint2,
): SketchLiveMeasure[] {
  const first = anchors[0];
  if (!first) return [];

  switch (kind) {
    case 'line': {
      const len = length(first, cursor);
      const angle = (Math.atan2(cursor.v - first.v, cursor.u - first.u) * 180) / Math.PI;
      const normalized = (angle + 360) % 360;
      return [
        { labelKey: 'partStudio.sketch.live.length', value: formatNumber(len) },
        { labelKey: 'partStudio.sketch.live.angle', value: `${normalized.toFixed(1)}°` },
      ];
    }

    case 'rectangle':
      return [
        { labelKey: 'partStudio.sketch.live.width', value: formatNumber(Math.abs(cursor.u - first.u)) },
        { labelKey: 'partStudio.sketch.live.height', value: formatNumber(Math.abs(cursor.v - first.v)) },
      ];

    case 'circle':
      return [{ labelKey: 'partStudio.sketch.live.radius', value: formatNumber(length(first, cursor)) }];

    case 'arc': {
      if (anchors.length === 1) {
        return [{ labelKey: 'partStudio.sketch.live.length', value: formatNumber(length(first, cursor)) }];
      }
      const second = anchors[1]!;
      const radius = radiusThroughThreePoints(first, second, cursor);
      return radius === undefined
        ? []
        : [{ labelKey: 'partStudio.sketch.live.radius', value: formatNumber(radius) }];
    }

    case 'spline':
      return [];
  }
}
