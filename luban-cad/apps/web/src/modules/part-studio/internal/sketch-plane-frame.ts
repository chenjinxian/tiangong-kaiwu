/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图平面框几何（2026-11-13 Onshape live f4/f5 复核）：
 * 创建/编辑草图且平面已确定时，Onshape 在视口渲染一个浅蓝平面框。f4（零件
 * ~1.5× 框宽）与 f5（75 mm 草图 vs ~150 mm 框）实测框尺寸随模型/草图范围
 * 自适应、以平面原点为中心；本模块只产出纯几何（世界四角 + 半尺寸），
 * 渲染在 SketchPlanePicker 的 2D overlay 完成。
 */
import { Point3d, Range3d, Vector3d } from '@itwin/core-geometry';
import type { SketchPlaneDto } from '@luban-cad/shared';

/** 框相对内容包围盒的放大系数（live 两例 1.5–2×；取 1.5 偏保守）。 */
export const SKETCH_FRAME_SCALE = 1.5;
/** 极小草图/零件的保底半尺寸（mm），避免框退化为一条线。 */
export const SKETCH_FRAME_MIN_HALF_SIZE_MM = 12;

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

/** 平面内以原点为中心的方框四角（闭合顺序，不重复首点）。 */
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
 * 包围盒 → 平面框半尺寸：取 8 角相对平面原点在 u/v 方向的最大投影 ×
 * SKETCH_FRAME_SCALE；range 为空/退化返回 undefined（调用方回退基准面尺寸）。
 */
export function sketchPlaneFrameHalfSize(
  plane: SketchPlaneDto,
  range: Range3d,
): number | undefined {
  if (range.isNull)
    return undefined;
  const basis = planeBasis(plane);
  if (!basis)
    return undefined;
  let maxAbs = 0;
  for (const x of [range.low.x, range.high.x]) {
    for (const y of [range.low.y, range.high.y]) {
      for (const z of [range.low.z, range.high.z]) {
        const d = Vector3d.create(x - basis.origin.x, y - basis.origin.y, z - basis.origin.z);
        maxAbs = Math.max(maxAbs, Math.abs(d.dotProduct(basis.u)), Math.abs(d.dotProduct(basis.v)));
      }
    }
  }
  if (!Number.isFinite(maxAbs) || maxAbs <= 1e-6)
    return undefined;
  return Math.max(SKETCH_FRAME_MIN_HALF_SIZE_MM, maxAbs * SKETCH_FRAME_SCALE);
}
