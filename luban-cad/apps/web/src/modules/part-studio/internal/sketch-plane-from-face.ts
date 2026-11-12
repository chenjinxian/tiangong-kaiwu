/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * ADR-0017 Stage D：模型平面 → 草图平面快照（纯函数）。
 *
 * 数据来源是 `readBrepFaceHandle` 读到的同一份缓存面几何（`BrepFaceHandle`）：
 * - normal = 面平面法向（`CurveOps.isPlanar` 的世界矩阵列 Z）；
 * - origin = 首个边界环的首个可用点（线 p0 / 弧 start）；
 * - xDir = 首条边界线的方向（无直线时取首条圆弧的半径方向；再无则取面范围
 *   对角线）投影到平面并归一化。
 *
 * 非平面面在读取层已被拒收；本函数再对退化法向/零向量/非有限值诚实返回
 * undefined——调用方据此提示失败，绝不编造平面。
 */
import type { SketchPlaneDto } from '@luban-cad/shared';
import type { BrepFaceHandle, BrepFaceLoopCurve } from './brep-topology.js';

type Vec3 = { x: number; y: number; z: number };

const EPSILON = 1e-9;

function finite(point: readonly number[]): boolean {
  return point.length === 3 && point.every((value) => Number.isFinite(value));
}

function vec(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function length(vector: Vec3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalized(vector: Vec3): Vec3 | undefined {
  const magnitude = length(vector);
  if (!(magnitude > EPSILON)) return undefined;
  return vec(vector.x / magnitude, vector.y / magnitude, vector.z / magnitude);
}

/** 去掉沿法向的分量（把任意向量投到平面内）。 */
function projectToPlane(vector: Vec3, normal: Vec3): Vec3 {
  const dot = vector.x * normal.x + vector.y * normal.y + vector.z * normal.z;
  return vec(vector.x - dot * normal.x, vector.y - dot * normal.y, vector.z - dot * normal.z);
}

function pointFromCurve(curve: BrepFaceLoopCurve): Vec3 | undefined {
  switch (curve.kind) {
    case 'line':
      return finite(curve.p0) ? vec(curve.p0[0], curve.p0[1], curve.p0[2]) : undefined;
    case 'arc':
      return finite(curve.start) ? vec(curve.start[0], curve.start[1], curve.start[2]) : undefined;
    default:
      return undefined;
  }
}

function directionFromCurve(curve: BrepFaceLoopCurve): Vec3 | undefined {
  switch (curve.kind) {
    case 'line': {
      if (!finite(curve.p0) || !finite(curve.p1)) return undefined;
      return vec(curve.p1[0] - curve.p0[0], curve.p1[1] - curve.p0[1], curve.p1[2] - curve.p0[2]);
    }
    case 'arc': {
      if (!finite(curve.center) || !finite(curve.start)) return undefined;
      return vec(
        curve.start[0] - curve.center[0],
        curve.start[1] - curve.center[1],
        curve.start[2] - curve.center[2],
      );
    }
    default:
      return undefined;
  }
}

/** 从面句柄生成持久化的草图平面快照；无法解析时 undefined（不猜）。 */
export function sketchPlaneFromFaceHandle(handle: BrepFaceHandle): SketchPlaneDto | undefined {
  if (!finite(handle.normal)) return undefined;
  const normal = normalized(vec(handle.normal[0], handle.normal[1], handle.normal[2]));
  if (!normal) return undefined;

  let origin: Vec3 | undefined;
  let xDir: Vec3 | undefined;
  for (const loop of handle.loops) {
    for (const curve of loop) {
      origin ??= pointFromCurve(curve);
      const direction = directionFromCurve(curve);
      if (direction) {
        const projected = normalized(projectToPlane(direction, normal));
        if (projected) xDir = projected;
      }
      if (origin && xDir) break;
    }
    if (origin && xDir) break;
  }

  // 环退化（无点/无方向）：按面范围取中心与对角线方向。仍失败则诚实拒绝。
  if (!origin) {
    const { low, high } = handle.range;
    if (!finite(low) || !finite(high)) return undefined;
    origin = vec(
      (low[0] + high[0]) / 2,
      (low[1] + high[1]) / 2,
      (low[2] + high[2]) / 2,
    );
  }
  if (!xDir) {
    const { low, high } = handle.range;
    if (finite(low) && finite(high)) {
      const diagonal = projectToPlane(vec(high[0] - low[0], high[1] - low[1], high[2] - low[2]), normal);
      xDir = normalized(diagonal);
    }
  }
  if (!xDir) {
    // 兜底正交方向：与法向不平行即可（保证右手系可用）。
    const seed = Math.abs(normal.x) < 0.9 ? vec(1, 0, 0) : vec(0, 1, 0);
    xDir = normalized(projectToPlane(seed, normal));
  }
  if (!xDir) return undefined;
  if (![origin.x, origin.y, origin.z].every(Number.isFinite)) return undefined;

  return {
    origin: { x: origin.x, y: origin.y, z: origin.z },
    normal: { x: normal.x, y: normal.y, z: normal.z },
    xDir: { x: xDir.x, y: xDir.y, z: xDir.z },
  };
}

/** 从面句柄集合按 owner body + 缓存子实体 id 唯一定位；无/多重匹配 → undefined。 */
export function findFaceHandle(
  handles: readonly BrepFaceHandle[],
  ownerBodyKey: string,
  cacheId: number,
): BrepFaceHandle | undefined {
  const matches = handles.filter(
    (handle) => handle.bodyKey === ownerBodyKey && handle.subEntityId === cacheId,
  );
  return matches.length === 1 ? matches[0] : undefined;
}
