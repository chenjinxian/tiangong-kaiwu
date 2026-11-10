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

  it('同面积面域的选择必须 ambiguous（浮点噪声不得选出“唯一”解）', () => {
    const same = selectProfileRegionsByArea(regions([1000, 1000, 1000]), 1000);
    expect(same?.ambiguous).toBe(true);
    const pair = selectProfileRegionsByArea(regions([1000, 1000, 1000, 1000]), 2000);
    expect(pair?.ambiguous).toBe(true);
  });

  it('无子集落在容差内 → undefined', () => {
    expect(selectProfileRegionsByArea(regions([10, 20, 30]), 1000)).toBeUndefined();
  });

  it('精确证据轨关闭绝对下限后不得静默选择 1mm² 内的近似子集', () => {
    // 目标 100.2：缺省容差 max(1, 0.2004)=1mm² 会把面积 100（Δ=−0.2）当成
    // 候选并直接选中；精确证据轨必须用 target*1e-7 的相对容差（此例
    // tolerance=1.002e-5），100 与 100.5 都不在容差内 → undefined。
    const areas = regions([100, 100.5]);
    expect(selectProfileRegionsByArea(areas, 100.2)?.regions).toEqual([0]);
    expect(selectProfileRegionsByArea(areas, 100.2, {
      toleranceRatio: 1e-7,
      toleranceMm2: 0,
    })).toBeUndefined();
  });

  it('校准回退（2e-7、无绝对下限）仍拒绝近面积同面数子集', () => {
    // P2.2 required-less 回退的容差是 target*2e-7（无 1mm² 下限）：目标
    // 100.2 时 tolerance≈2e-5，100（Δ−0.2）与 100.5（Δ+0.3）都不在容差内。
    const areas = regions([100, 100.5]);
    expect(selectProfileRegionsByArea(areas, 100.2, {
      toleranceRatio: 2e-7,
      toleranceMm2: 0,
    })).toBeUndefined();
    // 边界校准而非零容差：目标 100.00002（Δ−2e-5 < tolerance≈2.0000004e-5）
    // 接受面积 100，证明该回退仍能吸收采集值/产品求值的极小数值差。
    expect(selectProfileRegionsByArea(areas, 100.00002, {
      toleranceRatio: 2e-7,
      toleranceMm2: 0,
    })?.regions).toEqual([0]);
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

  it('bbox 证据能在面积多解时选出唯一子集（无 bbox 时 ambiguous）', () => {
    const cells = [
      { area: 10, bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 } },
      { area: 20, bounds: { minX: 10, minY: 0, maxX: 30, maxY: 10 } },
      { area: 10, bounds: { minX: 100, minY: 0, maxX: 110, maxY: 10 } },
    ];
    // 面积多解：[0,1] 与 [1,2] 都是 30；bbox 只接受前者。
    expect(selectProfileRegionsByArea(cells, 30)?.ambiguous).toBe(true);
    const picked = selectProfileRegionsByArea(cells, 30, {
      profileBoundsMm: { minX: 0, minY: 0, maxX: 30, maxY: 10 },
    });
    expect(picked?.regions).toEqual([0, 1]);
    expect(picked?.ambiguous).toBe(false);
  });

  it('bbox 与选集不匹配 → undefined（不以面积/顺序猜）', () => {
    const cells = [
      { area: 645.16, bounds: { minX: 0, minY: 0, maxX: 25.4, maxY: 25.4 } },
      { area: 645.16, bounds: { minX: 0, minY: 25.4, maxX: 25.4, maxY: 50.8 } },
      { area: 645.16, bounds: { minX: 0, minY: 50.8, maxX: 25.4, maxY: 76.2 } },
    ];
    expect(selectProfileRegionsByArea(cells, 1935.48, {
      profileBoundsMm: { minX: 0, minY: 0, maxX: 25.4, maxY: 50.8 },
    })).toBeUndefined();
  });

  it('有 bbox 目标但面域缺少 bounds → undefined（证据不全不猜）', () => {
    expect(selectProfileRegionsByArea(regions([10, 20, 30]), 50, {
      profileBoundsMm: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    })).toBeUndefined();
  });

  it('质心证据能在面积/bbox 多解时选出唯一子集（面积加权）', () => {
    const cells = [
      { area: 10, centroid: { x: 5, y: 5 } },
      { area: 20, centroid: { x: 20, y: 5 } },
      { area: 10, centroid: { x: 50, y: 5 } },
    ];
    // 面积多解：[0,1] 与 [1,2] 都是 30；目标质心只接受后者（x=(20*20+50*10)/30=30）。
    expect(selectProfileRegionsByArea(cells, 30)?.ambiguous).toBe(true);
    const picked = selectProfileRegionsByArea(cells, 30, {
      profileCentroidMm: { x: 30, y: 5 },
    });
    expect(picked?.regions).toEqual([1, 2]);
    expect(picked?.ambiguous).toBe(false);
  });

  it('目标质心不匹配 → undefined（不以面积/顺序猜）', () => {
    const cells = [
      { area: 10, centroid: { x: 5, y: 5 } },
      { area: 20, centroid: { x: 20, y: 5 } },
    ];
    expect(selectProfileRegionsByArea(cells, 30, {
      profileCentroidMm: { x: 100, y: 5 },
    })).toBeUndefined();
  });

  it('有质心目标但面域缺 centroid → undefined（证据不全不猜）', () => {
    expect(selectProfileRegionsByArea(regions([10, 20, 30]), 50, {
      profileCentroidMm: { x: 0, y: 0 },
    })).toBeUndefined();
  });

  it('分量质心证据：Part 4 对角 2 格 / L 形 3 格 / 1+3 格均唯一（面积+bbox 不够）', () => {
    // 3×3 网格，每格 645.16mm²；行列均 25.4mm，质心取格中心（草图局部 mm）。
    const cells = Array.from({ length: 9 }, (_, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      return {
        area: 645.16,
        centroid: { x: 12.7 + col * 25.4, y: 12.7 + row * 25.4 },
        bounds: {
          minX: col * 25.4, minY: row * 25.4,
          maxX: (col + 1) * 25.4, maxY: (row + 1) * 25.4,
        },
      };
    });
    const adjacentRegions = Array.from({ length: 9 }, (_, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const neighbors: number[] = [];
      if (col > 0) neighbors.push(index - 1);
      if (col < 2) neighbors.push(index + 1);
      if (row > 0) neighbors.push(index - 3);
      if (row < 2) neighbors.push(index + 3);
      return neighbors;
    });
    // Extrude 1：对角 2 格（6=col0,row2 与 2=col2,row0），两个独立面分量。
    const e1 = selectProfileRegionsByArea(cells, 1290.32, {
      profileBoundsMm: { minX: 0, minY: 0, maxX: 76.2, maxY: 76.2 },
      profileFaceCentroidsMm: [
        { areaMm2: 645.16, centroid: { x: 12.7, y: 63.5 } },
        { areaMm2: 645.16, centroid: { x: 63.5, y: 12.7 } },
      ],
      adjacentRegions,
    });
    expect(e1?.regions).toEqual([2, 6]);
    expect(e1?.ambiguous).toBe(false);
    // 无分量证据：两个对角集合同面积+bbox，必须 ambiguous。
    expect(selectProfileRegionsByArea(cells, 1290.32, {
      profileBoundsMm: { minX: 0, minY: 0, maxX: 76.2, maxY: 76.2 },
    })?.ambiguous).toBe(true);

    // Extrude 2：L 形 3 格（1,3,4），一个合并面。
    const e2 = selectProfileRegionsByArea(cells, 1935.48, {
      profileBoundsMm: { minX: 0, minY: 0, maxX: 50.8, maxY: 50.8 },
      profileFaceCentroidsMm: [
        { areaMm2: 1935.48, centroid: { x: 29.6333333333, y: 29.6333333333 } },
      ],
      adjacentRegions,
    });
    expect(e2?.regions).toEqual([1, 3, 4]);
    expect(e2?.ambiguous).toBe(false);

    // Extrude 3：单格 0 + L 形 5,7,8，两个分量（面积 645.16 + 1935.48）。
    const e3 = selectProfileRegionsByArea(cells, 2580.64, {
      profileBoundsMm: { minX: 0, minY: 0, maxX: 76.2, maxY: 76.2 },
      profileFaceCentroidsMm: [
        { areaMm2: 645.16, centroid: { x: 12.7, y: 12.7 } },
        { areaMm2: 1935.48, centroid: { x: 55.0333333333, y: 55.0333333333 } },
      ],
      adjacentRegions,
    });
    expect(e3?.regions).toEqual([0, 5, 7, 8]);
    expect(e3?.ambiguous).toBe(false);

    // 目标分量位置不存在 → 不接受，不以面积/顺序猜。
    expect(selectProfileRegionsByArea(cells, 1290.32, {
      profileBoundsMm: { minX: 0, minY: 0, maxX: 76.2, maxY: 76.2 },
      profileFaceCentroidsMm: [
        { areaMm2: 645.16, centroid: { x: 20, y: 20 } },
        { areaMm2: 645.16, centroid: { x: 60, y: 60 } },
      ],
      adjacentRegions,
    })).toBeUndefined();
  });

  it('分量证据缺少相邻表 → 不把 L 形 3 格臆测为同一合并面（fail closed）', () => {
    const cells = Array.from({ length: 9 }, (_, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      return { area: 645.16, centroid: { x: 12.7 + col * 25.4, y: 12.7 + row * 25.4 } };
    });
    // 缺 adjacentRegions 时每格视为孤立分量：3 分量 ≠ 目标 1 个 L 面 → undefined。
    expect(selectProfileRegionsByArea(cells, 1935.48, {
      profileBoundsMm: { minX: 0, minY: 0, maxX: 50.8, maxY: 50.8 },
      profileFaceCentroidsMm: [
        { areaMm2: 1935.48, centroid: { x: 29.6333333333, y: 29.6333333333 } },
      ],
    })).toBeUndefined();
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
