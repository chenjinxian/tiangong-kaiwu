/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图平面框几何（2026-11-13 Onshape live 第二轮实测 + 用户复核）：
 * 创建/编辑草图且平面已确定时，Onshape 在视口渲染一个浅蓝平面框——它是
 * **以平面原点为中心的固定长方形**：半宽 = 基准面半宽 × 2.0、半高 = 基准面
 * 半高 × 1.15（空 PS 选 Front 实测：外框 1090×617 px vs 基准面方框
 * 545×545 px，两者同心；缩放实验证明框是世界固定尺寸，不随相机缩放漂移）。
 * 不是内容包围盒，也不是正方形。内容超出该尺寸时对称扩张（每边 +8% 留白，
 * 该扩张行为无 live 直测，按“框至少包住内容”外推）。
 * 本模块只产出纯几何（世界四角），渲染在 SketchPlanePicker 的 2D overlay。
 */
import { Point3d, Range3d, Vector3d } from '@itwin/core-geometry';
import type { SketchPlaneDto } from '@luban-cad/shared';

/** 框半宽 / 基准面半宽（live 实测 ≈2.0）。 */
export const SKETCH_FRAME_WIDTH_RATIO = 2.0;
/** 框半高 / 基准面半高（live 实测 ≈1.145，取 1.15）。 */
export const SKETCH_FRAME_HEIGHT_RATIO = 1.15;
/** 内容超出最小框时每边的留白比例（无 live 直测，保守外推）。 */
export const SKETCH_FRAME_CONTENT_MARGIN_RATIO = 0.08;

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

/** 内容包围盒在平面 u/v 轴上相对原点的最大绝对值（对称扩张用）。 */
function contentExtents(basis: PlaneBasis, range: Range3d): { maxAbsU: number; maxAbsV: number } {
  let maxAbsU = 0;
  let maxAbsV = 0;
  for (const x of [range.low.x, range.high.x]) {
    for (const y of [range.low.y, range.high.y]) {
      for (const z of [range.low.z, range.high.z]) {
        const d = Vector3d.create(x - basis.origin.x, y - basis.origin.y, z - basis.origin.z);
        maxAbsU = Math.max(maxAbsU, Math.abs(d.dotProduct(basis.u)));
        maxAbsV = Math.max(maxAbsV, Math.abs(d.dotProduct(basis.v)));
      }
    }
  }
  return { maxAbsU, maxAbsV };
}

/**
 * 以平面原点为中心的固定长方形框四角（闭合顺序，不重复首点）。
 * 最小尺寸 = 基准面 × live 比例；`contentRange` 更大时对称扩张到包住内容。
 */
export function sketchPlaneFrameRect(
  plane: SketchPlaneDto,
  datumHalfSize: number,
  contentRange?: Range3d,
): Point3d[] | undefined {
  const basis = planeBasis(plane);
  if (!basis)
    return undefined;
  const base = Math.max(1e-3, datumHalfSize);
  let halfU = base * SKETCH_FRAME_WIDTH_RATIO;
  let halfV = base * SKETCH_FRAME_HEIGHT_RATIO;
  if (contentRange && !contentRange.isNull) {
    const { maxAbsU, maxAbsV } = contentExtents(basis, contentRange);
    const grow = 1 + SKETCH_FRAME_CONTENT_MARGIN_RATIO;
    halfU = Math.max(halfU, maxAbsU * grow);
    halfV = Math.max(halfV, maxAbsV * grow);
  }
  const corner = (su: number, sv: number): Point3d =>
    basis.origin.plusScaled(basis.u, su * halfU).plusScaled(basis.v, sv * halfV);
  return [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
}
