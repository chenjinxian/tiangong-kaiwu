/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * cPlane（基准面）平面派生（ADR-0006 切片 B1，shared 1.29）：
 * params.reference/offsetMm/flipNormal → SketchPlaneDto。前端是唯一计算点（后端只存参数与
 * 直通求值）；草图插入时把结果作为派生快照写入 `plane`，并携带 sourceFeatureId。
 *
 * 语义：
 * - origin = 基准面 origin(0,0,0) + normal * offsetMm（offsetMm 可负；flip 不改位置）；
 * - v1.31 平面点：params.origin 存在时直接作为世界原点（offsetMm 忽略），
 *   法线仍取 reference 世界基准面法线；与 offsetMm 的互斥由后端 schema 把守；
 * - flipNormal=true 只反转法线（草图正面朝另一侧），xDir 保持——局部 Y = normal × xDir
 *   随之翻转，符合“反转法线”的直观语义。
 *
 * v1.40（ADR-0013 切片 1）LINE_ANGLE：`line` + `angleDeg` 成对出现时，平面过线：
 * 参考法线先投影到垂直于线方向的平面（线在参考面内时即参考法线本身），再按右手定则
 * 绕线旋转 angleDeg；origin=线原点，xDir=线方向（单位化），平面必然含线。线方向与
 * 参考法线平行时无唯一“含线且最近参考面”的平面 → 返回 undefined（诚实不可解析）。
 * v1.43（ADR-0013 切片 2）LINE_POINT：`line` + `point` 成对时，平面 = 过线与点的
 * 唯一平面；normal = normalize(d × (point − line.origin))，origin=线原点，xDir=线方向。
 * point 在线上（叉积≈0）→ undefined。
 * v1.44（ADR-0013 切片 3）THREE_POINT：`threePoints` 三点时，origin=p1，
 * normal=normalize((p2−p1)×(p3−p1))，xDir=normalize(p2−p1)；三点共线 → undefined。
 */
import type { CPlaneParams, FeatureTreeEntry, SketchPlaneDto } from '@luban-cad/shared';
import { mapFeatureEntries } from '../hooks/useFeatureTree.js';
import type { SketchPlaneOption } from '../dialogs/SketchDialog.js';

export const CPLANE_REFERENCES = ['top', 'front', 'right'] as const;
export type CPlaneReference = (typeof CPLANE_REFERENCES)[number];

const DATUM_FRAMES: Record<CPlaneReference, {
  normal: { x: number; y: number; z: number };
  xDir: { x: number; y: number; z: number };
}> = {
  top: { normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
  front: { normal: { x: 0, y: 1, z: 0 }, xDir: { x: 1, y: 0, z: 0 } },
  right: { normal: { x: 1, y: 0, z: 0 }, xDir: { x: 0, y: 1, z: 0 } },
};

export function isCPlaneReference(value: unknown): value is CPlaneReference {
  return value === 'top' || value === 'front' || value === 'right';
}

type Vec3 = { x: number; y: number; z: number };

function isFiniteVec(value: unknown): value is Vec3 {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

/** 归一整 -0（0*负数 / 三角函数在 0 附近会产生 -0；JSON/toEqual 会把它当不同值）。 */
function cleanZero(component: number): number {
  return component === 0 ? 0 : component;
}

/**
 * LINE_ANGLE 派生：参考法线投影到 d⊥ → 绕 d（右手定则）旋转 angleDeg。
 * n = u·cosθ + (d × u)·sinθ；origin=线原点；xDir=d（单位化后）。
 */
function lineAnglePlane(
  line: unknown,
  angleDeg: unknown,
  frame: (typeof DATUM_FRAMES)[CPlaneReference],
  flip: boolean,
): SketchPlaneDto | undefined {
  if (typeof angleDeg !== 'number' || !Number.isFinite(angleDeg)) return undefined;
  if (typeof line !== 'object' || line === null) return undefined;
  const origin = (line as { origin?: unknown }).origin;
  const direction = (line as { direction?: unknown }).direction;
  if (!isFiniteVec(origin) || !isFiniteVec(direction)) return undefined;
  const lenSq = direction.x ** 2 + direction.y ** 2 + direction.z ** 2;
  if (!(lenSq > 0)) return undefined;
  const invLen = 1 / Math.sqrt(lenSq);
  const d: Vec3 = { x: direction.x * invLen, y: direction.y * invLen, z: direction.z * invLen };
  const n0 = frame.normal;
  const along = n0.x * d.x + n0.y * d.y + n0.z * d.z;
  // u = n0 − (n0·d)d（参考法线在 d⊥ 上的投影）。
  const u: Vec3 = {
    x: n0.x - along * d.x,
    y: n0.y - along * d.y,
    z: n0.z - along * d.z,
  };
  const uLenSq = u.x ** 2 + u.y ** 2 + u.z ** 2;
  if (!(uLenSq > 1e-18)) return undefined; // 线平行参考法线：无唯一含线平面
  const uInv = 1 / Math.sqrt(uLenSq);
  const un: Vec3 = { x: u.x * uInv, y: u.y * uInv, z: u.z * uInv };
  // v = d × u（与 d、un 构成右手正交系）。
  const v: Vec3 = {
    x: d.y * un.z - d.z * un.y,
    y: d.z * un.x - d.x * un.z,
    z: d.x * un.y - d.y * un.x,
  };
  const theta = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const rotated: Vec3 = {
    x: un.x * cos + v.x * sin,
    y: un.y * cos + v.y * sin,
    z: un.z * cos + v.z * sin,
  };
  const nLenSq = rotated.x ** 2 + rotated.y ** 2 + rotated.z ** 2;
  if (!(nLenSq > 1e-18)) return undefined; // 数值退化，不猜
  const nInv = 1 / Math.sqrt(nLenSq);
  const normal: Vec3 = flip
    ? { x: cleanZero(-rotated.x * nInv), y: cleanZero(-rotated.y * nInv), z: cleanZero(-rotated.z * nInv) }
    : { x: cleanZero(rotated.x * nInv), y: cleanZero(rotated.y * nInv), z: cleanZero(rotated.z * nInv) };
  return {
    origin: { x: origin.x, y: origin.y, z: origin.z },
    normal,
    xDir: { x: cleanZero(d.x), y: cleanZero(d.y), z: cleanZero(d.z) },
  };
}

/** THREE_POINT 派生：origin=p1，normal=normalize((p2−p1)×(p3−p1))，xDir=normalize(p2−p1)。 */
function threePointsPlane(points: unknown, flip: boolean): SketchPlaneDto | undefined {
  if (!Array.isArray(points) || points.length !== 3) return undefined;
  const [p1, p2, p3] = points;
  if (!isFiniteVec(p1) || !isFiniteVec(p2) || !isFiniteVec(p3)) return undefined;
  const a: Vec3 = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
  const b: Vec3 = { x: p3.x - p1.x, y: p3.y - p1.y, z: p3.z - p1.z };
  const aLenSq = a.x ** 2 + a.y ** 2 + a.z ** 2;
  if (!(aLenSq > 0)) return undefined; // p1=p2
  const raw: Vec3 = {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
  const nLenSq = raw.x ** 2 + raw.y ** 2 + raw.z ** 2;
  if (!(nLenSq > 1e-18)) return undefined; // 三点共线
  const nInv = 1 / Math.sqrt(nLenSq);
  const aInv = 1 / Math.sqrt(aLenSq);
  const normal: Vec3 = flip
    ? { x: cleanZero(-raw.x * nInv), y: cleanZero(-raw.y * nInv), z: cleanZero(-raw.z * nInv) }
    : { x: cleanZero(raw.x * nInv), y: cleanZero(raw.y * nInv), z: cleanZero(raw.z * nInv) };
  return {
    origin: { x: p1.x, y: p1.y, z: p1.z },
    normal,
    xDir: { x: cleanZero(a.x * aInv), y: cleanZero(a.y * aInv), z: cleanZero(a.z * aInv) },
  };
}

/** LINE_POINT 派生：normal = normalize(d × (point − line.origin))；点在线 → undefined。 */
function linePointPlane(
  line: unknown,
  point: unknown,
  flip: boolean,
): SketchPlaneDto | undefined {
  if (typeof line !== 'object' || line === null) return undefined;
  const origin = (line as { origin?: unknown }).origin;
  const direction = (line as { direction?: unknown }).direction;
  if (!isFiniteVec(origin) || !isFiniteVec(direction) || !isFiniteVec(point)) return undefined;
  const lenSq = direction.x ** 2 + direction.y ** 2 + direction.z ** 2;
  if (!(lenSq > 0)) return undefined;
  const invLen = 1 / Math.sqrt(lenSq);
  const d: Vec3 = { x: direction.x * invLen, y: direction.y * invLen, z: direction.z * invLen };
  const w: Vec3 = { x: point.x - origin.x, y: point.y - origin.y, z: point.z - origin.z };
  const raw: Vec3 = {
    x: d.y * w.z - d.z * w.y,
    y: d.z * w.x - d.x * w.z,
    z: d.x * w.y - d.y * w.x,
  };
  const nLenSq = raw.x ** 2 + raw.y ** 2 + raw.z ** 2;
  if (!(nLenSq > 1e-18)) return undefined; // 点在线：无唯一平面
  const nInv = 1 / Math.sqrt(nLenSq);
  const normal: Vec3 = flip
    ? { x: cleanZero(-raw.x * nInv), y: cleanZero(-raw.y * nInv), z: cleanZero(-raw.z * nInv) }
    : { x: cleanZero(raw.x * nInv), y: cleanZero(raw.y * nInv), z: cleanZero(raw.z * nInv) };
  return {
    origin: { x: origin.x, y: origin.y, z: origin.z },
    normal,
    xDir: { x: cleanZero(d.x), y: cleanZero(d.y), z: cleanZero(d.z) },
  };
}

/** cPlane 落库 params → 世界平面快照；非法形态返回 undefined（诚实不可解析，不猜）。 */
export function cPlanePlaneFromParams(
  params: unknown,
  sourceFeatureId?: string,
): SketchPlaneDto | undefined {
  if (typeof params !== 'object' || params === null) return undefined;
  const p = params as Partial<CPlaneParams>;
  if (!isCPlaneReference(p.reference)) return undefined;
  const frame = DATUM_FRAMES[p.reference];
  const offset = typeof p.offsetMm === 'number' && Number.isFinite(p.offsetMm) ? p.offsetMm : 0;
  const flip = p.flipNormal === true;
  // THREE_POINT：三点平面（v1.44；与其余模式全部互斥，后端 schema 把守）。
  if (p.threePoints !== undefined) {
    if (p.line !== undefined || p.angleDeg !== undefined || p.point !== undefined
      || p.offsetMm !== undefined || p.origin !== undefined) return undefined;
    const plane = threePointsPlane(p.threePoints, flip);
    return plane === undefined
      ? undefined
      : { ...plane, ...(sourceFeatureId !== undefined ? { sourceFeatureId } : {}) };
  }
  // LINE_POINT：line + point（v1.43；与 LINE_ANGLE 互斥，后端 schema 把守）。
  if (p.point !== undefined) {
    if (p.line === undefined || p.angleDeg !== undefined) return undefined;
    const plane = linePointPlane(p.line, p.point, flip);
    return plane === undefined
      ? undefined
      : { ...plane, ...(sourceFeatureId !== undefined ? { sourceFeatureId } : {}) };
  }
  // LINE_ANGLE：line/angleDeg 任一出现即按该模式解析（后端 schema 要求成对）。
  if (p.line !== undefined || p.angleDeg !== undefined) {
    if (p.line === undefined) return undefined;
    const plane = lineAnglePlane(p.line, p.angleDeg, frame, flip);
    return plane === undefined
      ? undefined
      : { ...plane, ...(sourceFeatureId !== undefined ? { sourceFeatureId } : {}) };
  }
  // 归一整 -0（offset 为负时 0*offset=-0；JSON/toEqual 会把它当不同值）。
  const scaled = (component: number): number => (component * offset === 0 ? 0 : component * offset);
  const neg = (component: number): number => (component === 0 ? 0 : -component);
  const normal = flip
    ? { x: neg(frame.normal.x), y: neg(frame.normal.y), z: neg(frame.normal.z) }
    : frame.normal;
  const finiteOrigin = p.origin !== undefined
    && Number.isFinite(p.origin.x) && Number.isFinite(p.origin.y) && Number.isFinite(p.origin.z);
  const origin = finiteOrigin
    ? { x: p.origin!.x, y: p.origin!.y, z: p.origin!.z }
    : {
        x: scaled(frame.normal.x),
        y: scaled(frame.normal.y),
        z: scaled(frame.normal.z),
      };
  return {
    origin,
    normal,
    xDir: frame.xDir,
    ...(sourceFeatureId !== undefined ? { sourceFeatureId } : {}),
  };
}

/**
 * 特征树中的 cPlane 条目 → 草图平面选项（顺序与树一致；失败/抑制的平面不可选）。
 * 命名复用 mapFeatureEntries（只过滤 cPlane 时，同类型序号与整树一致：「平面 N」）。
 */
export function cPlanePlaneOptions(
  entries: readonly FeatureTreeEntry[],
  typeLabel: (featureType: string) => string,
): SketchPlaneOption[] {
  // 命名基于**全部** cPlane 条目（含失败/抑制），与特征树「平面 N」序号一致；
  // 只有健康条目进入可选列表（失败平面不能作为草图平面）。
  const all = entries.filter((entry) => entry.featureType === 'cPlane');
  return mapFeatureEntries(all, typeLabel).flatMap((node) => {
    const entry = all.find((candidate) => candidate.id === node.id);
    if (entry === undefined || entry.suppressed || entry.status !== 0) return [];
    const plane = cPlanePlaneFromParams(entry.params, node.id);
    return plane === undefined ? [] : [{ id: node.id, label: node.name, plane }];
  });
}
