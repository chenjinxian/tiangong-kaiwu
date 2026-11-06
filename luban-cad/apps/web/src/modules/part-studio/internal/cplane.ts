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
