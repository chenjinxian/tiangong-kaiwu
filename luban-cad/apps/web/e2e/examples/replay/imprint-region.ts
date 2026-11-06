/**
 * imprintFace → 草图面域近似（test-only）。
 *
 * Onshape 的 imprint FACE 查询根节点是 `<sketchId>.imprint`——指向**草图面/
 * 材料面域**，不是实体 BRep 面。查询里的 `topologyDisambiguation([[edge, ±1]])`
 * 选择被引用曲线两侧之一：
 * - `-1` = 环外（若该曲线是孔洞边界，即“孔侧”材料面域）——iOS 实证；
 * - `+1` = 环内（该曲线作为外环的材料面域）——与 −1 对称，待更多真栈例证。
 * 方向未识别时保留旧的“孔侧优先”；指定侧无候选即返回 undefined（不换侧）。
 */
import type { SketchRegionDto } from '@luban-cad/shared';

export type ImprintSide = 'outside' | 'inside';

export interface ImprintRegionPick {
  regionIndex: number;
  basis: 'hole' | 'outer';
  area: number;
}

export function pickImprintRegion(
  regions: readonly SketchRegionDto[] | undefined,
  entityId: number,
  side?: ImprintSide,
): ImprintRegionPick | undefined {
  const holes: Array<{ regionIndex: number; region: SketchRegionDto }> = [];
  const outers: Array<{ regionIndex: number; region: SketchRegionDto }> = [];
  (regions ?? []).forEach((region, regionIndex) => {
    if (region.holeEntityIds?.includes(entityId)) holes.push({ regionIndex, region });
    else if (region.outerEntityIds.includes(entityId)) outers.push({ regionIndex, region });
  });
  let pool: Array<{ regionIndex: number; region: SketchRegionDto }>;
  let basis: 'hole' | 'outer';
  if (side === 'outside') {
    pool = holes;
    basis = 'hole';
  } else if (side === 'inside') {
    pool = outers;
    basis = 'outer';
  } else {
    pool = holes.length > 0 ? holes : outers;
    basis = holes.length > 0 ? 'hole' : 'outer';
  }
  if (pool.length === 0) {
    // 唯一相邻材料面域：草图里该曲线只邻接一个材料面（另一侧无草图材料）。
    // 侧向只在“该侧确有候选”时有意义；此时回退到唯一邻接面是几何确定的，
    // 不是任意猜（Pedal Extrude 4 的 line 3 / Rear Shock line 18 实测场景）。
    const byIndex = new Map<number, { regionIndex: number; region: SketchRegionDto; basis: 'hole' | 'outer' }>();
    for (const entry of holes) byIndex.set(entry.regionIndex, { ...entry, basis: 'hole' });
    for (const entry of outers) byIndex.set(entry.regionIndex, { ...entry, basis: 'outer' });
    if (byIndex.size === 1) {
      const only = [...byIndex.values()][0]!;
      return { regionIndex: only.regionIndex, basis: only.basis, area: only.region.area };
    }
    return undefined;
  }
  const best = pool.reduce((a, b) => (b.region.area > a.region.area ? b : a));
  return {
    regionIndex: best.regionIndex,
    basis,
    area: best.region.area,
  };
}

/** 查询侧向数字 → 面域侧：−1 环外、+1 环内；0/非数/缺失不指定。 */
export function imprintSideFromSign(sign: number | undefined): ImprintSide | undefined {
  if (sign === undefined || !Number.isFinite(sign) || sign === 0) return undefined;
  return sign < 0 ? 'outside' : 'inside';
}

/**
 * 从原始 imprint 查询串提取侧向数字：
 * - 明文：`topologyDisambiguation([[makeQuery(...), -1.0]])`；
 * - FeatureScript compact：`...$imprint...$IMPRINTD-1`（D+数字）。
 * 解析不到返回 undefined（调用方保留孔侧优先并登记）。
 */
export function imprintSignFromQuery(queryString: string | undefined): number | undefined {
  const text = String(queryString ?? '');
  if (!text) return undefined;
  const plain = /topologyDisambiguation\(\[\[\s*makeQuery\([\s\S]*?\),\s*(-?[01](?:\.\d+)?)\s*\]\]/.exec(text);
  if (plain) return Number(plain[1]);
  const compact = /imprint[\s\S]{0,160}?D(-?[01](?:\.\d+)?)/.exec(text);
  if (compact) return Number(compact[1]);
  return undefined;
}
