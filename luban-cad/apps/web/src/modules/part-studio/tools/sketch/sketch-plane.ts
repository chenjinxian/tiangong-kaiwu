/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图平面坐标架（M6-a T5）：SketchPlaneDto（世界系三向量契约，shared v1.6）
 * ↔ 局部 2D（u,v）的正交换算——绘制工具取点投影（世界点→(u,v)，法向分量
 * 丢弃=投影）与预览/AccuDraw 锁定的世界化（(u,v)→世界点）共用此一架。
 *
 * 缺省语义：dto 缺省/退化（xDir∥normal 或零向量）→ XY@z=0（契约缺省，与
 * 后端 planeZ v1 恒 0 语义一致——SketchPlaneDto 三基准面恰为正交单位向量，
 * 非基准面（拾取面）T4 省略 plane 键落同一缺省）。
 *
 * 正交化：z=normalize(normal)；x=normalize(xDir − z·(xDir·z))（Gram-Schmidt
 * 去法向分量）；y=z×x。产出右手单位正交架（x×y=z），localToWorld 为刚体
 * 变换（无镜像无缩放），曲线 tryTransformInPlace 恒成功。
 */

import { Matrix3d, Point3d, Transform, Vector3d } from '@itwin/core-geometry';
import type { SketchPlaneDto } from '@luban-cad/shared';

/** 草图局部 2D 点（(u,v) 米制；提交契约的 point.x/point.y 即此二值）。 */
export interface SketchPoint2 {
  u: number;
  v: number;
}

/** 草图平面坐标架（世界↔局部双向换算 + AccuDraw 提示面）。 */
export interface SketchPlaneFrame {
  /** 平面原点（世界系）。 */
  readonly origin: Point3d;
  /** 平面 x 轴（世界系单位向量，局部 u 方向）。 */
  readonly xDir: Vector3d;
  /** 平面 y 轴（世界系单位向量，局部 v 方向）。 */
  readonly yDir: Vector3d;
  /** 平面法向（世界系单位向量）。 */
  readonly normal: Vector3d;
  /** 局部(u,v,0)→世界 的刚体变换（列=xDir/yDir/normal，原点=origin）。 */
  readonly localToWorld: Transform;
  /** 世界点 → 局部 (u,v)；法向分量丢弃（=投影到草图平面）。 */
  toLocal(world: Point3d): SketchPoint2;
  /** 局部 (u,v) → 世界点（恰落在平面上）。 */
  toWorld(point: SketchPoint2): Point3d;
}

/** 缺省平面（XY@z=0）：契约缺省语义的唯一载体。 */
const DEFAULT_ORIGIN = Point3d.createZero();
const DEFAULT_X = Vector3d.unitX();
const DEFAULT_Y = Vector3d.unitY();
const DEFAULT_Z = Vector3d.unitZ();

function frameFromAxes(origin: Point3d, x: Vector3d, y: Vector3d, z: Vector3d): SketchPlaneFrame {
  const localToWorld = Transform.createOriginAndMatrix(origin, Matrix3d.createColumns(x, y, z));
  return {
    origin,
    xDir: x,
    yDir: y,
    normal: z,
    localToWorld,
    toLocal(world: Point3d): SketchPoint2 {
      const d = Vector3d.createStartEnd(origin, world);
      return { u: d.dotProduct(x), v: d.dotProduct(y) };
    },
    toWorld(point: SketchPoint2): Point3d {
      return localToWorld.multiplyPoint3d(Point3d.create(point.u, point.v, 0));
    },
  };
}

/**
 * SketchPlaneDto → 坐标架。dto 缺省（undefined/null）或退化（xDir 与 normal
 * 平行/零向量）→ XY@z=0 缺省架（契约缺省语义；退化输入静默回退而非抛错——
 * 工具链不得因平面数据缺陷崩死，绘制仍可在 XY 面进行）。
 */
export function sketchPlaneFrameFrom(dto?: SketchPlaneDto | null): SketchPlaneFrame {
  if (!dto) return frameFromAxes(DEFAULT_ORIGIN, DEFAULT_X, DEFAULT_Y, DEFAULT_Z);

  const z = Vector3d.create(dto.normal.x, dto.normal.y, dto.normal.z).normalize();
  const xRaw = Vector3d.create(dto.xDir.x, dto.xDir.y, dto.xDir.z);
  if (!z) return frameFromAxes(DEFAULT_ORIGIN, DEFAULT_X, DEFAULT_Y, DEFAULT_Z);

  // Gram-Schmidt：xDir 去法向分量后归一；退化（xDir∥normal 或零向量）回缺省。
  const x = xRaw.minus(z.scale(xRaw.dotProduct(z))).normalize();
  if (!x) return frameFromAxes(DEFAULT_ORIGIN, DEFAULT_X, DEFAULT_Y, DEFAULT_Z);

  const y = z.crossProduct(x); // 右手系：x×y=z ⇐ y=z×x（z、x 皆单位且正交 → y 单位）
  const origin = Point3d.create(dto.origin.x, dto.origin.y, dto.origin.z);
  return frameFromAxes(origin, x, y, z);
}
