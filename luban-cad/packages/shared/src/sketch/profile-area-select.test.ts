import { describe, expect, it } from 'vitest';
import { selectProfileRegionsByArea } from './profile-area-select.js';

const regions = (areas: number[]) => areas.map((area) => ({ area }));

describe('selectProfileRegionsByArea', () => {
  it('唯一匹配：目标面积为子集和', () => {
    const picked = selectProfileRegionsByArea(regions([10, 20, 30]), 50);
    expect(picked).toEqual({
      regions: [1, 2],
      area: 50,
      delta: 0,
      ambiguous: false,
    });
  });

  it('必须包含查询命中的面域', () => {
    const picked = selectProfileRegionsByArea(regions([10, 20, 30, 40]), 60, {
      requireRegions: [0],
    });
    expect(picked?.regions).toEqual([0, 1, 2]);
    expect(picked?.ambiguous).toBe(false);
  });

  it('容差内含近似匹配（记录 delta）', () => {
    const picked = selectProfileRegionsByArea(regions([10, 20, 30]), 50.5, {
      toleranceMm2: 1,
    });
    expect(picked?.regions).toEqual([1, 2]);
    expect(picked?.delta).toBe(-0.5);
  });

  it('多解等距时 ambiguous，不擅自裁决', () => {
    const picked = selectProfileRegionsByArea(regions([10, 20, 30, 40, 50]), 60);
    expect(picked).toBeDefined();
    expect(picked?.ambiguous).toBe(true);
    expect(picked?.area).toBe(60);
  });

  it('无子集落在容差内 → undefined', () => {
    expect(selectProfileRegionsByArea(regions([10, 20, 30]), 1000)).toBeUndefined();
  });

  it('必需面域越界/非法输入 → undefined', () => {
    expect(selectProfileRegionsByArea(regions([10, 20]), 10, { requireRegions: [2] })).toBeUndefined();
    expect(selectProfileRegionsByArea(regions([10, Number.NaN]), 10)).toBeUndefined();
    expect(selectProfileRegionsByArea(regions([]), 10)).toBeUndefined();
    expect(selectProfileRegionsByArea(regions([10]), 0)).toBeUndefined();
  });

  it('面域数超过枚举上限 → undefined（调用方登记 blocked-selector）', () => {
    const many: number[] = [];
    for (let index = 0; index < 21; index++) many.push(index + 1);
    expect(selectProfileRegionsByArea(regions(many), 10, { maxRegions: 20 })).toBeUndefined();
  });

  it('Drive Sleeve 回归：8 面域 10530.06 / 内盘 4 面域 4069.54', () => {
    const driveSleeve = [
      18748.239558460496, 1615.1300896232754, 1615.1300896232754,
      1615.1300896232754, 1615.1300896232754, 1045.0839904542049,
      1045.0839904542049, 1045.0839904542049, 934.2865907030146,
      506.70705924563064, 506.70705924563064, 506.70705924563064,
      506.70705924563064, 110.79675019759274,
    ];
    const cap = selectProfileRegionsByArea(regions(driveSleeve), 10530.06, {
      requireRegions: [1, 2, 3, 7, 8],
      toleranceRatio: 0.002,
    });
    expect(cap?.regions).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(cap?.ambiguous).toBe(false);
    const cut = selectProfileRegionsByArea(regions(driveSleeve), 4069.54);
    expect(cut?.regions).toEqual([5, 6, 7, 8]);
    expect(cut?.ambiguous).toBe(false);
  });
});
