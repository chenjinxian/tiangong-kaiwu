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
/** 面域包围盒（世界/草图 mm）。 */
export interface RegionBoundsMm {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 平面面域质心（世界/草图 mm）。 */
export interface RegionCentroidMm {
  x: number;
  y: number;
}

export interface AreaSelectableRegion {
  /** SketchRegionDto 的面积（mm²）。 */
  area: number;
  /** 面域包围盒；提供目标 bbox 时必须存在。 */
  bounds?: RegionBoundsMm;
  /** 面域质心；提供目标质心时必须存在。 */
  centroid?: RegionCentroidMm;
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
  /** 目标面的世界/草图 bbox；有值时要求选集 union bbox 匹配。 */
  profileBoundsMm?: RegionBoundsMm;
  /** bbox 容差（mm，缺省 0.2）。 */
  boundsToleranceMm?: number;
  /** 目标面的世界/草图质心；有值时要求选集面积加权质心匹配。 */
  profileCentroidMm?: RegionCentroidMm;
  /** 质心容差（mm，缺省 0.2）。 */
  centroidToleranceMm?: number;
  /**
   * 目标面按 Onshape face 连通分量的面积/质心集合（mm²/mm）。有值时要求
   * 选集按 `adjacentRegions` 分组后的每个分量与目标面一一匹配；用于 Part 4
   * 这类“多个同面积面域被合并成一个 Onshape 面”的场景。顺序无关，按
   * 面积+质心做一一匹配；任一分量无法匹配或多解 → 该 mask 不通过。
   */
  profileFaceCentroidsMm?: readonly RegionFaceEvidence[];
  /** 目标面分量的质心容差（mm，缺省 0.2）。 */
  faceCentroidToleranceMm?: number;
  /** 目标面分量的面积相对容差（缺省 1e-6）。 */
  faceAreaToleranceRatio?: number;
  /**
   * 面域邻接表（下标 → 共享草图实体/边的相邻面域）。缺省视为每个面域孤立；
   * 分量证据必须显式提供，不得按面积/顺序猜连通。
   */
  adjacentRegions?: readonly (readonly number[])[];
}

/** Onshape face 分量证据：一个合并面的面积与质心。 */
export interface RegionFaceEvidence {
  centroid: RegionCentroidMm;
  /** 面面积（mm²）；有值时参与匹配。 */
  areaMm2?: number;
}

function bitCount(mask: number): number {
  let count = 0;
  for (let value = mask; value !== 0; value &= value - 1) count++;
  return count;
}

/** 选集内所有面域包围盒的并集；任一面域缺少 bounds → undefined。 */
function unionBounds(regions: readonly AreaSelectableRegion[], mask: number): RegionBoundsMm | undefined {
  let bounds: RegionBoundsMm | undefined;
  for (let i = 0; i < regions.length; i++) {
    if ((mask & (1 << i)) === 0) continue;
    const b = regions[i].bounds;
    if (!b) return undefined;
    bounds = bounds === undefined ? { ...b } : {
      minX: Math.min(bounds.minX, b.minX),
      minY: Math.min(bounds.minY, b.minY),
      maxX: Math.max(bounds.maxX, b.maxX),
      maxY: Math.max(bounds.maxY, b.maxY),
    };
  }
  return bounds;
}

function boundsMatch(a: RegionBoundsMm | undefined, b: RegionBoundsMm, tol: number): boolean {
  return a !== undefined
    && Math.abs(a.minX - b.minX) <= tol && Math.abs(a.minY - b.minY) <= tol
    && Math.abs(a.maxX - b.maxX) <= tol && Math.abs(a.maxY - b.maxY) <= tol;
}

/**
 * 选集的面积加权质心。任一面域缺质心或面积为 0/非法 → undefined。
 * 面积加权与 Onshape 面质心口径一致（面域可视为均质平面片）。
 */
function weightedCentroid(regions: readonly AreaSelectableRegion[], mask: number): RegionCentroidMm | undefined {
  let areaSum = 0;
  let xSum = 0;
  let ySum = 0;
  for (let i = 0; i < regions.length; i++) {
    if ((mask & (1 << i)) === 0) continue;
    const region = regions[i]!;
    const centroid = region.centroid;
    if (!centroid || !Number.isFinite(centroid.x) || !Number.isFinite(centroid.y)) return undefined;
    if (!Number.isFinite(region.area) || region.area <= 0) return undefined;
    areaSum += region.area;
    xSum += region.area * centroid.x;
    ySum += region.area * centroid.y;
  }
  if (areaSum <= 0) return undefined;
  return { x: xSum / areaSum, y: ySum / areaSum };
}

function centroidMatch(a: RegionCentroidMm | undefined, b: RegionCentroidMm, tol: number): boolean {
  return a !== undefined
    && Math.abs(a.x - b.x) <= tol
    && Math.abs(a.y - b.y) <= tol;
}

/** 选集按共享边邻接分组后的一个连通分量。 */
interface RegionComponent {
  /** 分量面积（mm²）。 */
  area: number;
  /** 面积加权质心。 */
  centroid: RegionCentroidMm;
  /** 分量内面域下标（升序）。 */
  regions: number[];
}

/**
 * 按 `adjacentRegions` 把选集中的面域分成连通分量。缺省邻接表视为每个面域
 * 孤立；邻接下标越界 → undefined（非法证据不猜）。
 */
function selectedComponents(
  regions: readonly AreaSelectableRegion[],
  mask: number,
  adjacency: readonly (readonly number[])[] | undefined,
): RegionComponent[] | undefined {
  const count = regions.length;
  if (adjacency !== undefined) {
    if (adjacency.length !== count) return undefined;
    for (const neighbors of adjacency) {
      for (const neighbor of neighbors) {
        if (!Number.isInteger(neighbor) || neighbor < 0 || neighbor >= count) return undefined;
      }
    }
  }
  const selected = new Set<number>();
  for (let i = 0; i < count; i++) if ((mask & (1 << i)) !== 0) selected.add(i);
  const components: RegionComponent[] = [];
  const visited = new Set<number>();
  for (const start of selected) {
    if (visited.has(start)) continue;
    const queue = [start];
    visited.add(start);
    const members: number[] = [];
    let area = 0;
    let xSum = 0;
    let ySum = 0;
    while (queue.length > 0) {
      const index = queue.pop()!;
      const region = regions[index]!;
      if (!region.centroid
        || !Number.isFinite(region.centroid.x) || !Number.isFinite(region.centroid.y)) return undefined;
      if (!Number.isFinite(region.area) || region.area <= 0) return undefined;
      members.push(index);
      area += region.area;
      xSum += region.area * region.centroid.x;
      ySum += region.area * region.centroid.y;
      for (const neighbor of adjacency?.[index] ?? []) {
        if (selected.has(neighbor) && !visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    if (area <= 0) return undefined;
    members.sort((a, b) => a - b);
    components.push({ area, centroid: { x: xSum / area, y: ySum / area }, regions: members });
  }
  return components;
}

/**
 * 分量证据的一一匹配（目标面顺序无意义）。面积/质心都满足才算命中；DFS
 * 回溯保证“存在唯一双射”而不是按排序贪心。分量数一般 ≤9，回溯可接受。
 */
function faceComponentsMatch(
  components: readonly RegionComponent[],
  targets: readonly RegionFaceEvidence[],
  centroidTol: number,
  areaTolRatio: number,
): boolean {
  if (components.length === 0 || components.length !== targets.length) return false;
  const used = new Array<boolean>(targets.length).fill(false);
  const matches = (component: RegionComponent, target: RegionFaceEvidence): boolean => {
    if (!centroidMatch(component.centroid, target.centroid, centroidTol)) return false;
    if (target.areaMm2 !== undefined) {
      if (!Number.isFinite(target.areaMm2) || target.areaMm2 <= 0) return false;
      const tolerance = Math.max(1e-6, target.areaMm2 * areaTolRatio);
      if (Math.abs(component.area - target.areaMm2) > tolerance) return false;
    }
    return true;
  };
  const assign = (index: number): boolean => {
    if (index === components.length) return true;
    const component = components[index]!;
    for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
      if (used[targetIndex] || !matches(component, targets[targetIndex]!)) continue;
      used[targetIndex] = true;
      if (assign(index + 1)) return true;
      used[targetIndex] = false;
    }
    return false;
  };
  return assign(0);
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
    if (options.profileBoundsMm !== undefined
      && !boundsMatch(unionBounds(regions, mask), options.profileBoundsMm, options.boundsToleranceMm ?? 0.2))
      continue;
    if (options.profileCentroidMm !== undefined
      && !centroidMatch(weightedCentroid(regions, mask), options.profileCentroidMm, options.centroidToleranceMm ?? 0.2))
      continue;
    if (options.profileFaceCentroidsMm !== undefined) {
      const components = selectedComponents(regions, mask, options.adjacentRegions);
      if (!components || !faceComponentsMatch(
        components,
        options.profileFaceCentroidsMm,
        options.faceCentroidToleranceMm ?? 0.2,
        options.faceAreaToleranceRatio ?? 1e-6,
      )) continue;
    }
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
