/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * ViewCube 纯方向数学（2026-11-02）：
 * - eye direction → 世界→视图旋转矩阵（rowX=屏幕右、rowY=屏幕上、rowZ=eye 方向）；
 * - 旋转矩阵 → CSS matrix3d（列主序）；
 * - Iso/Dimetric/Trimetric 预设方向。
 * 与 UI 解耦，便于单测钉矩阵。
 */
import { Angle, Matrix3d, Vector3d } from '@itwin/core-geometry';

// 与 Onshape 默认右前上 iso 一致（可见 Top/Front/Right）：X 轴右下、Y 轴右上。
export const ISO_DIRECTION = Vector3d.create(1, -1, 1);
export const DIMETRIC_DIRECTION = Vector3d.create(1, -0.5, 1);
export const TRIMETRIC_DIRECTION = Vector3d.create(1, -0.75, 0.6);

export type CubeFaceId = 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back';

export interface ProjectedFaceLabel {
  id: CubeFaceId;
  /** 相对 cube 中心的屏幕偏移（CSS px；y 向下）。 */
  x: number;
  y: number;
}

/** cube 局部坐标面法向（局部 +Z=Top，局部 +Y=世界 -Y=Front）。 */
const FACE_NORMALS: readonly { id: CubeFaceId; normal: readonly [number, number, number] }[] = [
  { id: 'top', normal: [0, 0, 1] },
  { id: 'bottom', normal: [0, 0, -1] },
  { id: 'right', normal: [1, 0, 0] },
  { id: 'left', normal: [-1, 0, 0] },
  { id: 'front', normal: [0, 1, 0] },
  { id: 'back', normal: [0, -1, 0] },
];

/** 面标签投影半径（150px stage / 60px cube；标签落在可见面中心）。 */
const LABEL_RADIUS = 30;
/** 角点命中区投影半径（落在 cube 圆角处）。 */
const CORNER_RADIUS = 42;

/** CSS matrix3d 元素（含 F·R·F 的 Y 翻转，与 cssMatrix3dFromRotation 同口径）。 */
function cssEntry(rotation: Matrix3d, row: number, col: number): number {
  return rotation.at(row, col) * ((row === 1) !== (col === 1) ? -1 : 1);
}

function transform(rotation: Matrix3d, v: readonly [number, number, number]): [number, number, number] {
  return [
    cssEntry(rotation, 0, 0) * v[0] + cssEntry(rotation, 0, 1) * v[1] + cssEntry(rotation, 0, 2) * v[2],
    cssEntry(rotation, 1, 0) * v[0] + cssEntry(rotation, 1, 1) * v[1] + cssEntry(rotation, 1, 2) * v[2],
    cssEntry(rotation, 2, 0) * v[0] + cssEntry(rotation, 2, 1) * v[1] + cssEntry(rotation, 2, 2) * v[2],
  ];
}

/**
 * 当前朝向下面向观察者的面标签屏幕位置（Onshape 式屏幕对齐标签）：
 * 面法向经视图旋转后 z>0 即可见，x/y 决定标签相对 cube 中心的位置。
 */
export function projectFaceLabels(rotation: Matrix3d): ProjectedFaceLabel[] {
  const labels: ProjectedFaceLabel[] = [];
  for (const { id, normal } of FACE_NORMALS) {
    const [x, y, z] = transform(rotation, normal);
    if (z > 0.05)
      labels.push({ id, x: x * LABEL_RADIUS, y: y * LABEL_RADIUS });
  }
  return labels;
}

/**
 * 世界轴在屏幕上的方向（CSS px 单位向量；y 向下）。
 * 局部 +Y 对应世界 -Y，故世界 Y 方向取 -column1。
 */
export function axisScreenDirections(rotation: Matrix3d): Record<'x' | 'y' | 'z', [number, number]> {
  const x = transform(rotation, [1, 0, 0]);
  const y = transform(rotation, [0, -1, 0]);
  const z = transform(rotation, [0, 0, 1]);
  return { x: [x[0], x[1]], y: [y[0], y[1]], z: [z[0], z[1]] };
}

/** 本地 cube 坐标（CSS 局部：+Z=Top，+Y=Front）→ 屏幕偏移（相对 cube 中心，y 向下）。 */
export function projectCubePoint(
  rotation: Matrix3d,
  local: readonly [number, number, number],
): { x: number; y: number; z: number } {
  const [x, y, z] = transform(rotation, local);
  return { x, y, z };
}

export interface ProjectedCubeCorner {
  id: string;
  /** 相对 cube 中心的屏幕偏移（CSS px；y 向下）。 */
  x: number;
  y: number;
  /** 从中心指向该角的 eye 方向（点击后作为 trimetric 方向）。 */
  direction: [number, number, number];
}

const CORNER_SIGNS: ReadonlyArray<readonly [string, number, number, number]> = [
  ['front-top-left', -1, -1, 1],
  ['front-top-right', 1, -1, 1],
  ['back-top-left', -1, 1, 1],
  ['back-top-right', 1, 1, 1],
  ['front-bottom-left', -1, -1, -1],
  ['front-bottom-right', 1, -1, -1],
  ['back-bottom-left', -1, 1, -1],
  ['back-bottom-right', 1, 1, -1],
];

/**
 * 三色轴原点 = 当前视图中 Front 面左下角（屏幕偏移，相对 cube 中心，y 向下）。
 * Onshape live：三色轴锚在 Front 面左下角（ISO 与 Front 视图实测均吻合）。
 */
export function frontFaceBottomLeft(
  rotation: Matrix3d,
  halfSize: number,
): { x: number; y: number } {
  let best: { x: number; y: number } | undefined;
  for (const sx of [-halfSize, halfSize]) {
    for (const sz of [-halfSize, halfSize]) {
      const [x, y] = transform(rotation, [sx, halfSize, sz]);
      if (!best
        || x < best.x - 1e-6
        || (Math.abs(x - best.x) <= 1e-6 && y > best.y))
        best = { x, y };
    }
  }
  return best ?? { x: 0, y: 0 };
}

/**
 * 当前朝向下可见的 cube 角点（屏幕投影；仅 z>0 面向观察者）。
 * Onshape 点击 cube 角 = trimetric；命中区本身不可见，hover 才提示。
 */
export function projectCubeCorners(rotation: Matrix3d): ProjectedCubeCorner[] {
  const corners: ProjectedCubeCorner[] = [];
  for (const [id, sx, sy, sz] of CORNER_SIGNS) {
    const [x, y, z] = transform(rotation, [sx, sy, sz]);
    if (z <= 0.05)
      continue;
    corners.push({
      id,
      x: x * CORNER_RADIUS,
      y: y * CORNER_RADIUS,
      direction: [sx, sy, sz],
    });
  }
  return corners;
}

/** 由 eye direction 构造视图旋转（up 缺省 +Z；退化时改用 +X）。 */
export function viewRotationFromDirection(direction: Vector3d, up: Vector3d = Vector3d.unitZ()): Matrix3d | undefined {
  const z = direction.normalize();
  if (!z) return undefined;
  let x = up.crossProduct(z)?.normalize();
  if (!x) x = Vector3d.unitX().crossProduct(z)?.normalize();
  if (!x) x = Vector3d.unitY().crossProduct(z)?.normalize();
  if (!x) return undefined;
  const y = z.crossProduct(x)?.normalize();
  if (!y) return undefined;
  return Matrix3d.createRows(x, y, z);
}

/**
 * 旋转矩阵（世界→视图）→ CSS 3D matrix3d 字符串（CSS 为列主序）。
 * iTwin 视图坐标 y 向上、CSS y 向下，且 cube 局部 +Y 对应世界 -Y：
 * 需做 F·R·F 共轭（F=diag(1,-1,1)），否则俯视以外的朝向会上下镜像。
 * 单位矩阵（Top 视图）保持不变。
 */
export function cssMatrix3dFromRotation(rotation: Matrix3d): string {
  const m = (r: number, c: number): number => rotation.at(r, c) * ((r === 1) !== (c === 1) ? -1 : 1);
  // 屏幕 x/y/z = rowX·p / rowY·p / rowZ·p；列主序排列。
  return `matrix3d(${m(0, 0)},${m(1, 0)},${m(2, 0)},0,`
    + `${m(0, 1)},${m(1, 1)},${m(2, 1)},0,`
    + `${m(0, 2)},${m(1, 2)},${m(2, 2)},0,`
    + `0,0,0,1)`;
}

/** 在 dir 上叠加 yaw（绕世界 Z）与 pitch（绕当前屏幕右轴）。 */
export function orbitDirection(direction: Vector3d, screenRight: Vector3d, yawRad: number, pitchRad: number): Vector3d | undefined {
  let d = direction;
  if (yawRad !== 0) {
    const yaw = Matrix3d.createRotationAroundVector(Vector3d.unitZ(), Angle.createRadians(yawRad));
    if (yaw) d = yaw.multiplyVector(d);
  }
  if (pitchRad !== 0 && screenRight) {
    const pitch = Matrix3d.createRotationAroundVector(screenRight, Angle.createRadians(pitchRad));
    if (pitch) d = pitch.multiplyVector(d);
  }
  return d.normalize();
}
