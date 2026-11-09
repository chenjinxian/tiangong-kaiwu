/**
 * v1.50：轮廓实体 → 草图面域映射纯函数（Handle Parts 三 NEW revolve 的
 * regionIndex 0 盲取缺陷回归）。
 */
import { expect, test } from '@playwright/test';
import type { SketchRegionDto } from '@luban-cad/shared';
import { resolveRegionsFromProfileEntities } from './region-entity-resolver.js';

const region = (outer: number[], holes: number[] = []): SketchRegionDto =>
  ({ area: 100, outerEntityIds: outer, ...(holes.length > 0 ? { holeEntityIds: holes } : {}) });

test.describe('resolveRegionsFromProfileEntities', () => {
  const regions = [region([1, 2]), region([3, 4]), region([5, 6], [7, 8])];

  test('单实体唯一归属 → 对应面域下标', () => {
    expect(resolveRegionsFromProfileEntities(regions, [3])).toEqual({
      regions: [1], unmatchedEntityIds: [], ambiguousEntityIds: [],
    });
  });

  test('同一面域的多个实体 → 单个面域；孔边界实体同样参与归属', () => {
    expect(resolveRegionsFromProfileEntities(regions, [1, 2]).regions).toEqual([0]);
    expect(resolveRegionsFromProfileEntities(regions, [7]).regions).toEqual([2]);
  });

  test('跨面域实体 → 多面域（多面域轮廓）', () => {
    expect(resolveRegionsFromProfileEntities(regions, [2, 3]).regions).toEqual([0, 1]);
  });

  test('共享边界实体 → ambiguous（不猜）+ regions 仍给出候选集合', () => {
    const shared = [region([1, 2]), region([2, 3])];
    expect(resolveRegionsFromProfileEntities(shared, [2])).toEqual({
      regions: [0, 1], unmatchedEntityIds: [], ambiguousEntityIds: [2],
    });
  });

  test('未命中实体 / 空面域 → unmatched（不退回 region 0）', () => {
    expect(resolveRegionsFromProfileEntities(regions, [99])).toMatchObject({
      regions: [], unmatchedEntityIds: [99],
    });
    expect(resolveRegionsFromProfileEntities(undefined, [1])).toMatchObject({
      regions: [], unmatchedEntityIds: [1],
    });
  });

  test('重复/非法实体 id 归一化（去重、忽略非正整数）', () => {
    expect(resolveRegionsFromProfileEntities(regions, [1, 1, 0, -2, 2.5])).toEqual({
      regions: [0], unmatchedEntityIds: [], ambiguousEntityIds: [],
    });
  });
});
