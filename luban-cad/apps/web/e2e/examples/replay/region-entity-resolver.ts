/**
 * v1.50 回放辅助：revolve/extrude 轮廓实体 → 产品草图面域下标（test-only）。
 *
 * 背景：Onshape 轮廓查询给的是草图实体（`sketchEntityId`，LD 轮廓边），
 * converter 对单 query 旧口径盲取 regionIndex=0——同一草图上的多个 NEW
 * revolve 会全部落在同一面域（Handle Parts 三体实测）。产品
 * `getSketch().regions[].outerEntityIds/holeEntityIds` 是面域边界的唯一事实，
 * 因此在回放器里按实体归属解析真实面域。
 *
 * 诚实口径：实体未命中任何面域、或一条实体同时属于多个面域（共享边界，
 * Onshape imprint sign 未采集）→ 不猜，返回 unmatched/ambiguous，由调用方
 * 沿旧 converter 口径并标近似。
 */
import type { SketchRegionDto } from '@luban-cad/shared';

export interface RegionEntityMapping {
  /** 命中面域下标（升序去重）。多个实体跨面域时可为多个（多面域轮廓）。 */
  regions: number[];
  /** 未出现在任何面域边界上的实体（映射失败）。 */
  unmatchedEntityIds: number[];
  /** 同时属于多个面域的实体（共享边界，无法唯一定位）。 */
  ambiguousEntityIds: number[];
}

export function resolveRegionsFromProfileEntities(
  regions: readonly SketchRegionDto[] | undefined,
  profileEntityIds: readonly number[],
): RegionEntityMapping {
  const wanted = Array.from(new Set(profileEntityIds.filter((id) => Number.isInteger(id) && id > 0)));
  const hitsByEntity = new Map<number, number[]>();
  (regions ?? []).forEach((region, index) => {
    for (const entityId of [...region.outerEntityIds, ...(region.holeEntityIds ?? [])]) {
      if (!wanted.includes(entityId)) continue;
      const hits = hitsByEntity.get(entityId) ?? [];
      if (!hits.includes(index)) hits.push(index);
      hitsByEntity.set(entityId, hits);
    }
  });
  const regionSet = new Set<number>();
  const unmatched: number[] = [];
  const ambiguous: number[] = [];
  for (const entityId of wanted) {
    const hits = hitsByEntity.get(entityId) ?? [];
    if (hits.length === 0) {
      unmatched.push(entityId);
      continue;
    }
    if (hits.length > 1) ambiguous.push(entityId);
    for (const region of hits) regionSet.add(region);
  }
  return {
    regions: Array.from(regionSet).sort((a, b) => a - b),
    unmatchedEntityIds: unmatched,
    ambiguousEntityIds: ambiguous,
  };
}
