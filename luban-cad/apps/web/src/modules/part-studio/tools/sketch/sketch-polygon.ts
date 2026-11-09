/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 正多边形几何（Onshape 多边形飞菜单首切片，2026-11-09）。
 *
 * 证据：Onshape Help「Inscribed Polygon / Circumscribed Polygon」——先点圆心，
 * 再点构造圆直径点；构造圆与多边形的内外关系按 Onshape 命名（与几何教材直觉相反）：
 * - Inscribed（内切多边形，主钮）：构造圆在多边形内、与各边相切；
 *   顶点半径 = r / cos(π/N)，顶点相对半径点方向偏 π/N（半径点指向边中点）。
 * - Circumscribed（外切多边形，飞菜单）：多边形在构造圆内、圆过各顶点；
 *   顶点半径 = r，第一个顶点在半径点方向。
 * 边数 3–50（Onshape 帮助页范围），默认 6；键盘输入边数 + Enter 或第三次点击完成。
 *
 * 约束模型（首切片）：N 条内联端点线 + 相邻端点 coincident + 全边 equal +
 * N 个外角 angle(2π/N)。后端 SlvsSolver 探针 N=3/5/6 无冲突；构造圆仅显示，
 * 尚未与多边形建立求解约束（尺寸编辑后的联动后续切片）。
 */
import type { SketchPoint2 } from './sketch-plane.js';

export type PolygonMode = 'inscribed' | 'circumscribed';

export const POLYGON_MIN_SIDES = 3;
export const POLYGON_MAX_SIDES = 50;
export const POLYGON_DEFAULT_SIDES = 6;

export interface RegularPolygon {
  /** 顶点（局部草图坐标，逆时针）。 */
  vertices: SketchPoint2[];
  /** 构造圆半径（= 用户第二点距圆心）。 */
  constructionRadius: number;
}

/** 正 N 边形顶点；点数/半径非法或边数越界返回 undefined。 */
export function regularPolygonVertices(
  center: SketchPoint2,
  radiusPoint: SketchPoint2,
  sides: number,
  mode: PolygonMode,
): RegularPolygon | undefined {
  if (!Number.isInteger(sides) || sides < POLYGON_MIN_SIDES || sides > POLYGON_MAX_SIDES) return undefined;
  const constructionRadius = Math.hypot(radiusPoint.u - center.u, radiusPoint.v - center.v);
  if (!(constructionRadius > 1e-12)) return undefined;
  const theta = Math.atan2(radiusPoint.v - center.v, radiusPoint.u - center.u);
  const vertexRadius = mode === 'inscribed'
    ? constructionRadius / Math.cos(Math.PI / sides)
    : constructionRadius;
  const offset = mode === 'inscribed' ? Math.PI / sides : 0;
  const vertices = Array.from({ length: sides }, (_, k) => {
    const angle = theta + offset + (k * 2 * Math.PI) / sides;
    return {
      u: center.u + vertexRadius * Math.cos(angle),
      v: center.v + vertexRadius * Math.sin(angle),
    };
  });
  return { vertices, constructionRadius };
}
