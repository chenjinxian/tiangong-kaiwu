/** imprintFace → 草图面域近似单测（Playwright，无需真栈）。 */
import { expect, test } from '@playwright/test';
import type { SketchRegionDto } from '@luban-cad/shared';
import {
  dominantImprintRegion,
  imprintSideFromSign,
  imprintSignFromQuery,
  mergeImprintRegions,
  pickImprintRegion,
} from './imprint-region.js';

const regions: SketchRegionDto[] = [
  { area: 100, outerEntityIds: [1, 2, 3, 4] },
  { area: 60, outerEntityIds: [1], holeEntityIds: [5] },
  { area: 40, outerEntityIds: [5] },
  { area: 80, outerEntityIds: [2], holeEntityIds: [6] },
];

test.describe('pickImprintRegion', () => {
  test('优先“实体作为孔洞边界”的面域，多个候选取面积最大', () => {
    expect(pickImprintRegion(regions, 5)).toEqual({ regionIndex: 1, basis: 'hole', area: 60 });
    const twoHoles: SketchRegionDto[] = [
      { area: 10, outerEntityIds: [1], holeEntityIds: [7] },
      { area: 20, outerEntityIds: [2], holeEntityIds: [7] },
    ];
    expect(pickImprintRegion(twoHoles, 7)?.regionIndex).toBe(1);
  });

  test('无孔洞边界时回退外环', () => {
    expect(pickImprintRegion(regions, 3)).toEqual({ regionIndex: 0, basis: 'outer', area: 100 });
  });

  test('找不到实体时返回 undefined，不猜', () => {
    expect(pickImprintRegion(regions, 99)).toBeUndefined();
    expect(pickImprintRegion(undefined, 1)).toBeUndefined();
  });

  test('imprint 侧向：-1 环外（孔侧）、+1 环内（外环）', () => {
    expect(pickImprintRegion(regions, 5, 'outside')).toEqual({ regionIndex: 1, basis: 'hole', area: 60 });
    expect(pickImprintRegion(regions, 5, 'inside')).toEqual({ regionIndex: 2, basis: 'outer', area: 40 });
  });

  test('指定侧无候选：唯一相邻材料面域回退；多相邻仍不换侧', () => {
    // 实体 3 只有 region 0 一个相邻材料面 → 侧向无候选时取它（几何确定）。
    expect(pickImprintRegion(regions, 3, 'outside')).toEqual({ regionIndex: 0, basis: 'outer', area: 100 });
    const multiAdjacent: SketchRegionDto[] = [
      { area: 10, outerEntityIds: [8] },
      { area: 20, outerEntityIds: [8] },
    ];
    expect(pickImprintRegion(multiAdjacent, 8, 'outside')).toBeUndefined();
  });

  test('多查询合并：已解析面域照用（去重），未解析标 partial', () => {
    expect(mergeImprintRegions([9, 10, 10], undefined)).toEqual({
      regions: [9, 10],
      partial: false,
    });
    expect(mergeImprintRegions([9, 10], '实体 27 无 outside 候选面域')).toEqual({
      regions: [9, 10],
      partial: true,
    });
    // 一条都没解析出来才放弃（不拿 region 0 冒充）。
    expect(mergeImprintRegions([], '实体 27 无候选')).toBeUndefined();
  });

  test('多查询主导面域：大材料面包含全部查询边且面积占优才收敛', () => {
    const dominantRegions: SketchRegionDto[] = [
      { area: 1000, outerEntityIds: [1], holeEntityIds: [2, 3, 5, 11, 12] },
      { area: 50, outerEntityIds: [2, 3, 11, 13] },
      { area: 40, outerEntityIds: [2, 3, 12, 13] },
      { area: 30, outerEntityIds: [4, 8, 12] },
    ];
    expect(dominantImprintRegion(dominantRegions, [2, 3, 5, 11, 12], [1, 2])).toEqual({
      regionIndex: 0,
      area: 1000,
    });
    // 面积不占优 → 不收敛（保留多面域选集）。
    const weak: SketchRegionDto[] = [
      { area: 60, outerEntityIds: [1], holeEntityIds: [2, 3] },
      { area: 50, outerEntityIds: [2, 3] },
    ];
    expect(dominantImprintRegion(weak, [2, 3], [1])).toBeUndefined();
    // 单实体 / 无共同包含者 → 不收敛。
    expect(dominantImprintRegion(dominantRegions, [2], [1])).toBeUndefined();
    expect(dominantImprintRegion(dominantRegions, [2, 99], [1])).toBeUndefined();
  });

  test('侧向数字解析：明文 topologyDisambiguation / compact $IMPRINTD±1', () => {
    expect(imprintSideFromSign(-1)).toBe('outside');
    expect(imprintSideFromSign(1)).toBe('inside');
    expect(imprintSideFromSign(undefined)).toBeUndefined();
    expect(imprintSideFromSign(0)).toBeUndefined();

    const plain = 'makeQuery(id+"F1Wmf.imprint","IMPRINT",EntityType.FACE,{"disambiguationData":' +
      '[topologyDisambiguation([[makeQuery(id+"F1Wmf.imprint","IMPRINT",EntityType.EDGE,' +
      '{"derivedFrom":sketchEntityQuery(id+"F1Wmf.wireOp",EntityType.EDGE,"abc")}),-1.0]])]})';
    expect(imprintSignFromQuery(plain)).toBe(-1);

    const compact = 'query=qCompressed(1.0,"%B5$...$imprintRcS7$IMPRINTD1R5C7S4$FACER7")';
    expect(imprintSignFromQuery(compact)).toBe(1);
    expect(imprintSignFromQuery('makeQuery(...)')).toBeUndefined();
  });
});
