/** imprintFace → 草图面域近似单测（Playwright，无需真栈）。 */
import { expect, test } from '@playwright/test';
import type { SketchRegionDto } from '@luban-cad/shared';
import {
  imprintSideFromSign,
  imprintSignFromQuery,
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

  test('imprint 侧向：-1 环外（孔侧）、+1 环内（外环），指定侧无候选不换侧', () => {
    expect(pickImprintRegion(regions, 5, 'outside')).toEqual({ regionIndex: 1, basis: 'hole', area: 60 });
    expect(pickImprintRegion(regions, 5, 'inside')).toEqual({ regionIndex: 2, basis: 'outer', area: 40 });
    // 实体 3 只有外环候选：要求孔侧时返回 undefined，不静默改用外环。
    expect(pickImprintRegion(regions, 3, 'outside')).toBeUndefined();
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
