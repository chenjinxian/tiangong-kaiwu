/**
 * 面域面积证据选择（纯几何工具，shared 单一实现）。
 *
 * Onshape 的面选择查询（imprint/CAP_FACE）在草图被内部曲线分割时，一条边只能
 * 定位“相邻的一个面”，无法静态还原整组被选面。2026-11-09 Drive Sleeve 真栈
 * 暴露该缺口后，我们改为消费**采集到的面面积证据**：
 * - Onshape 最终 BRep 的平面面面积（bodydetails，如底盖 JHK=10530.060 mm²）；
 * - 场景里每个面域的采样边界面积（SketchRegionDto.area）。
 *
 * 给定目标面积与必须在选集内的查询命中面域，枚举剩余面域子集，取面积最接近
 * 且满足容差的唯一解。多个等距解 → `ambiguous`，调用方必须如实登记，禁止
 * 按面积/顺序猜一个。该工具不接触内核/RPC，只在 scenario replay 与测试中使用。
 */
export interface AreaSelectableRegion {
  /** SketchRegionDto 的面积（mm²）。 */
  area: number;
}

export interface ProfileAreaSelection {
  /** 面域下标（升序）。 */
  regions: number[];
  /** 选集总面积（mm²）。 */
  area: number;
  /** 与目标面积的差（selection.area - targetArea）。 */
  delta: number;
  /** 是否有另一个不同选集与最优解等距。 */
  ambiguous: boolean;
}

export interface ProfileAreaSelectOptions {
  /** 必须包含的查询命中面域（例如逐边侧向 picker 的结果）。 */
  requireRegions?: readonly number[];
  /** 相对目标面积的容差（缺省 0.2%）。 */
  toleranceRatio?: number;
  /** 绝对容差下限（mm²，缺省 1）。 */
  toleranceMm2?: number;
  /**
   * 枚举上限（面域数）。缺省 20（约 1M 子集）；超过时返回 undefined，
   * 由调用方登记 blocked-selector，禁止静默取前缀。
   */
  maxRegions?: number;
}

function bitCount(mask: number): number {
  let count = 0;
  for (let value = mask; value !== 0; value &= value - 1) count++;
  return count;
}

/**
 * 按目标面积选择面域子集。返回 undefined 表示：无任何子集在容差内、面域数
 * 超过枚举上限、输入非法或必需面域越界。
 */
export function selectProfileRegionsByArea(
  regions: readonly AreaSelectableRegion[],
  targetArea: number,
  options: ProfileAreaSelectOptions = {},
): ProfileAreaSelection | undefined {
  if (!Number.isFinite(targetArea) || targetArea <= 0) return undefined;
  const count = regions.length;
  const maxRegions = options.maxRegions ?? 20;
  if (count === 0 || count > maxRegions || count > 30) return undefined;
  if (regions.some((region) => !Number.isFinite(region.area) || region.area < 0)) return undefined;

  const required = new Set<number>();
  for (const index of options.requireRegions ?? []) {
    if (!Number.isInteger(index) || index < 0 || index >= count) return undefined;
    required.add(index);
  }
  const requiredMask = [...required].reduce((mask, index) => mask | (1 << index), 0);
  const tolerance = Math.max(
    options.toleranceMm2 ?? 1,
    Math.abs(targetArea) * (options.toleranceRatio ?? 0.002),
  );
  // “面积不可区分”阈值取相对 1e-7（~0.0004mm² @4069）：既能判同形面域
  // （四象限成对面积差异 <1e-6）为 ambiguous，又能把 0.0007mm² 差异的
  // 另一组几何子集排除（Drive Sleeve [5,6,7,8]）。不能放到 0.2% 容差量级。
  const ambiguityEpsilon = Math.max(1e-9, Math.abs(targetArea) * 1e-7);

  let bestMask = -1;
  let bestArea = 0;
  let bestDelta = Infinity;
  let bestCount = Infinity;
  let ambiguous = false;

  const totalMasks = 1 << count;
  for (let mask = 0; mask < totalMasks; mask++) {
    if ((mask & requiredMask) !== requiredMask) continue;
    if (mask === 0) continue;
    let area = 0;
    for (let index = 0; index < count; index++) {
      if ((mask & (1 << index)) !== 0) area += regions[index]!.area;
    }
    const delta = area - targetArea;
    const distance = Math.abs(delta);
    if (distance > tolerance) continue;
    const selectedCount = bitCount(mask);
    // 最近优先；同等距离取更少面域，再取较小 mask（稳定、可复现）。
    const better = bestMask === -1
      || distance < bestDelta - ambiguityEpsilon
      || (Math.abs(distance - bestDelta) <= ambiguityEpsilon && (
        selectedCount < bestCount
        || (selectedCount === bestCount && mask < bestMask)
      ));
    if (better) {
      bestMask = mask;
      bestArea = area;
      bestDelta = delta;
      bestCount = selectedCount;
      ambiguous = false;
    } else if (
      distance <= bestDelta + ambiguityEpsilon
      && selectedCount === bestCount
      && mask !== bestMask
    ) {
      // 同面积、同面域数的不同子集才判 ambiguous。不同面域数的近似子集
      // 是有意用“更少面域”优先（Occam）：例如 Drive Sleeve 的 4 面域切削面
      // 与一个 5 面域的等面积组合；后者不是同一面，不能按面积抢答。
      ambiguous = true;
    }
  }

  if (bestMask === -1) return undefined;
  const selected: number[] = [];
  for (let index = 0; index < count; index++) {
    if ((bestMask & (1 << index)) !== 0) selected.push(index);
  }
  return { regions: selected, area: bestArea, delta: bestDelta, ambiguous };
}
