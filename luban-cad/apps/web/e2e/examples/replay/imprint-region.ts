/**
 * imprintFace → 草图面域近似（test-only；face split 未实现）。
 *
 * Onshape 的 imprint 面查询通常引用一个草图曲线；回放时用“该曲线是孔洞边界”
 * 的面域（材料面）优先，其次“该曲线是外环”的面域；多个候选取面积最大者。
 * 找不到返回 undefined，调用方保留原 region 0 近似——不猜。
 */
import type { SketchRegionDto } from '@luban-cad/shared';

export interface ImprintRegionPick {
  regionIndex: number;
  basis: 'hole' | 'outer';
  area: number;
}

export function pickImprintRegion(
  regions: readonly SketchRegionDto[] | undefined,
  entityId: number,
): ImprintRegionPick | undefined {
  const holes: Array<{ regionIndex: number; region: SketchRegionDto }> = [];
  const outers: Array<{ regionIndex: number; region: SketchRegionDto }> = [];
  (regions ?? []).forEach((region, regionIndex) => {
    if (region.holeEntityIds?.includes(entityId)) holes.push({ regionIndex, region });
    else if (region.outerEntityIds.includes(entityId)) outers.push({ regionIndex, region });
  });
  const pool = holes.length > 0 ? holes : outers;
  if (pool.length === 0) return undefined;
  const best = pool.reduce((a, b) => (b.region.area > a.region.area ? b : a));
  return {
    regionIndex: best.regionIndex,
    basis: holes.length > 0 ? 'hole' : 'outer',
    area: best.region.area,
  };
}
