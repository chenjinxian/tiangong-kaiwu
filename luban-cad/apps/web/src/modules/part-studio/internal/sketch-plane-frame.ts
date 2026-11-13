/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图平面框几何（2026-11-13 Onshape live f4/f5 复核 + 用户二次复核）：
 * 创建/编辑草图且平面已确定时，Onshape 在视口渲染一个浅蓝平面框——框是
 * **比内容（草图实体或模型）略大的长方形**（沿平面局部 u/v 轴对齐），不是
 * 正方形。本模块只产出纯几何（世界四角），渲染在 SketchPlanePicker 的 2D
 * overlay 完成；空场景（无草图/无模型）回退基准面尺寸的方框。
 */
import { Point3d, Range3d, Vector3d } from '@itwin/core-geometry';
import type { SketchPlaneDto } from '@luban-cad/shared';

/** 框相对内容包围盒每边的留白比例（live f4/f5：比内容大一点）。 */
export const SKETCH_FRAME_MARGIN_RATIO = 0.08;
/** 每边最小留白（mm），避免极小草图/零件时框贴边。 */
export const SKETCH_FRAME_MIN_MARGIN_MM = 2;

interface PlaneBasis {
  origin: Point3d;
  u: Vector3d;
  v: Vector3d;
}

/** 平面正交基（xDir 对 normal 正交化；退化平面返回 undefined）。 */
function planeBasis(plane: SketchPlaneDto): PlaneBasis | undefined {
  const n = Vector3d.create(plane.normal.x, plane.normal.y, plane.normal.z);
  if (!n.normalizeInPlace())
    return undefined;
  const rawU = Vector3d.create(plane.xDir.x, plane.xDir.y, plane.xDir.z);
  const u = rawU.minus(n.scale(rawU.dotProduct(n)));
  if (!u.normalizeInPlace())
    return undefined;
  const v = n.crossProduct(u);
  if (!v || !v.normalizeInPlace())
    return undefined;
  return { origin: Point3d.create(plane.origin.x, plane.origin.y, plane.origin.z), u, v };
}

/** 平面内以原点为中心的方框四角（空场景回退；闭合顺序，不重复首点）。 */
export function sketchPlaneFrameCorners(
  plane: SketchPlaneDto,
  halfSize: number,
): Point3d[] | undefined {
  const basis = planeBasis(plane);
  if (!basis)
    return undefined;
  const s = Math.max(1e-3, halfSize);
  const corner = (su: number, sv: number): Point3d =>
    basis.origin.plusScaled(basis.u, su * s).plusScaled(basis.v, sv * s);
  return [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
}

/**
 * 包围盒 → 平面内**长方形**框四角（沿平面 u/v 轴对齐，每边留白
 * SKETCH_FRAME_MARGIN_RATIO，至少 SKETCH_FRAME_MIN_MARGIN_MM）。
 * 框贴合内容的实际长宽比——零件/草图是长方时框就是长方形（用户 2026-11-13
 * 复核：Onshape 是比内容略大的长方形，不是正方形）。
 */
export function sketchPlaneFrameRect(
  plane: SketchPlaneDto,
  range: Range3d,
): Point3d[] | undefined {
  if (range.isNull)
    return undefined;
  const basis = planeBasis(plane);
  if (!basis)
    return undefined;
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (const x of [range.low.x, range.high.x]) {
    for (const y of [range.low.y, range.high.y]) {
      for (const z of [range.low.z, range.high.z]) {
        const d = Vector3d.create(x - basis.origin.x, y - basis.origin.y, z - basis.origin.z);
        const du = d.dotProduct(basis.u);
        const dv = d.dotProduct(basis.v);
        minU = Math.min(minU, du); maxU = Math.max(maxU, du);
        minV = Math.min(minV, dv); maxV = Math.max(maxV, dv);
      }
    }
  }
  const width = maxU - minU;
  const height = maxV - minV;
  if (!Number.isFinite(width) || !Number.isFinite(height) || (width <= 1e-6 && height <= 1e-6))
    return undefined;
  const marginU = Math.max(SKETCH_FRAME_MIN_MARGIN_MM, width * SKETCH_FRAME_MARGIN_RATIO);
  const marginV = Math.max(SKETCH_FRAME_MIN_MARGIN_MM, height * SKETCH_FRAME_MARGIN_RATIO);
  const corner = (u: number, v: number): Point3d =>
    basis.origin.plusScaled(basis.u, u).plusScaled(basis.v, v);
  return [
    corner(minU - marginU, minV - marginV),
    corner(maxU + marginU, minV - marginV),
    corner(maxU + marginU, maxV + marginV),
    corner(minU - marginU, maxV + marginV),
  ];
}
