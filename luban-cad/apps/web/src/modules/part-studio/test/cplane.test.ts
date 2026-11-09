/**
 * ADR-0006 切片 B1：cPlane 平面派生与草图平面选项（shared 1.29）。
 */
import { describe, expect, it } from 'vitest';
import type { FeatureTreeEntry } from '@luban-cad/shared';
import { cPlanePlaneFromParams, cPlanePlaneOptions, isCPlaneReference } from '../internal/cplane.js';

function entry(id: string, params: unknown, overrides: Partial<FeatureTreeEntry> = {}): FeatureTreeEntry {
  return { id, featureType: 'cPlane', orderKey: Number(id.slice(2)) || 1, suppressed: false, status: 0, params, ...overrides };
}

describe('cPlanePlaneFromParams', () => {
  it('top 无偏移 → XY 面', () => {
    expect(cPlanePlaneFromParams({ reference: 'top' })).toEqual({
      origin: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      xDir: { x: 1, y: 0, z: 0 },
    });
  });

  it('front 偏移 -20 + sourceFeatureId → 原点沿法向、来源指针保留', () => {
    expect(cPlanePlaneFromParams({ reference: 'front', offsetMm: -20 }, '0x42')).toEqual({
      origin: { x: 0, y: -20, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      xDir: { x: 1, y: 0, z: 0 },
      sourceFeatureId: '0x42',
    });
  });

  it('right 偏移 50 + 反转法线 → 位置不变、法线反向、xDir 保持', () => {
    expect(cPlanePlaneFromParams({ reference: 'right', offsetMm: 50, flipNormal: true })).toEqual({
      origin: { x: 50, y: 0, z: 0 },
      normal: { x: -1, y: 0, z: 0 },
      xDir: { x: 0, y: 1, z: 0 },
    });
  });

  it('v1.31 平面点 origin → 直接用世界原点，法线取 reference', () => {
    expect(cPlanePlaneFromParams({ reference: 'top', origin: { x: 1, y: 2, z: 3 } })).toEqual({
      origin: { x: 1, y: 2, z: 3 },
      normal: { x: 0, y: 0, z: 1 },
      xDir: { x: 1, y: 0, z: 0 },
    });
    expect(cPlanePlaneFromParams({ reference: 'front', origin: { x: -5, y: 0, z: 7 }, flipNormal: true })).toEqual({
      origin: { x: -5, y: 0, z: 7 },
      normal: { x: 0, y: -1, z: 0 },
      xDir: { x: 1, y: 0, z: 0 },
    });
  });

  it('非法参考/非对象 → undefined（不猜）', () => {
    expect(cPlanePlaneFromParams({ reference: 'bottom' })).toBeUndefined();
    expect(cPlanePlaneFromParams(null)).toBeUndefined();
    expect(cPlanePlaneFromParams('top')).toBeUndefined();
    expect(cPlanePlaneFromParams({ reference: 'top', offsetMm: Number.NaN })?.origin.z).toBe(0);
  });

  describe('LINE_ANGLE（v1.40 / ADR-0013 切片 1）', () => {
    const xLine = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } };

    it('Top + X 轴线 + 45° → 法线绕线旋转、xDir=线方向、平面含线', () => {
      const plane = cPlanePlaneFromParams({ reference: 'top', line: xLine, angleDeg: 45 }, '0x7');
      expect(plane?.origin).toEqual({ x: 0, y: 0, z: 0 });
      expect(plane?.xDir).toEqual({ x: 1, y: 0, z: 0 });
      expect(plane?.normal.x).toBeCloseTo(0, 12);
      expect(plane?.normal.y).toBeCloseTo(-Math.SQRT1_2, 12);
      expect(plane?.normal.z).toBeCloseTo(Math.SQRT1_2, 12);
      expect(plane?.sourceFeatureId).toBe('0x7');
      // 平面含轴线：direction ⟂ normal。
      const n = plane!.normal;
      expect(n.x * 1 + n.y * 0 + n.z * 0).toBeCloseTo(0, 12);
    });

    it('Front + X 轴线 + 90° → XY 面；flipNormal 反转法线', () => {
      const plane = cPlanePlaneFromParams({
        reference: 'front',
        line: { origin: { x: 1, y: 2, z: 3 }, direction: { x: 2, y: 0, z: 0 } },
        angleDeg: 90,
      });
      expect(plane?.origin).toEqual({ x: 1, y: 2, z: 3 });
      expect(plane?.normal.x).toBeCloseTo(0, 12);
      expect(plane?.normal.y).toBeCloseTo(0, 12);
      expect(plane?.normal.z).toBeCloseTo(1, 12);
      expect(plane?.xDir).toEqual({ x: 1, y: 0, z: 0 });
      const flipped = cPlanePlaneFromParams({ reference: 'front', line: xLine, angleDeg: 90, flipNormal: true });
      expect(flipped?.normal.z).toBeCloseTo(-1, 12);
    });

    it('线方向非单位 → 归一化；反向线 → xDir 反向、法线反向（同一平面朝向翻转）', () => {
      const plane = cPlanePlaneFromParams({
        reference: 'top', line: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 3, z: 0 } }, angleDeg: 0,
      });
      expect(plane?.xDir).toEqual({ x: 0, y: 1, z: 0 });
      expect(plane?.normal.z).toBeCloseTo(1, 12);
      const reversed = cPlanePlaneFromParams({
        reference: 'top', line: { origin: { x: 0, y: 0, z: 0 }, direction: { x: -1, y: 0, z: 0 } }, angleDeg: 45,
      });
      expect(reversed?.normal.y).toBeCloseTo(Math.SQRT1_2, 12);
      expect(reversed?.normal.z).toBeCloseTo(Math.SQRT1_2, 12);
    });

    it('非法/退化 → undefined（不猜）', () => {
      expect(cPlanePlaneFromParams({ reference: 'top', line: xLine })).toBeUndefined();
      expect(cPlanePlaneFromParams({ reference: 'top', angleDeg: 45 })).toBeUndefined();
      expect(cPlanePlaneFromParams({ reference: 'top', line: { ...xLine, direction: { x: 0, y: 0, z: 0 } }, angleDeg: 45 }))
        .toBeUndefined();
      expect(cPlanePlaneFromParams({ reference: 'top', line: { ...xLine, direction: { x: 0, y: 0, z: 1 } }, angleDeg: 45 }))
        .toBeUndefined();
      expect(cPlanePlaneFromParams({ reference: 'top', line: xLine, angleDeg: Number.NaN })).toBeUndefined();
      expect(cPlanePlaneFromParams({ reference: 'bottom', line: xLine, angleDeg: 45 })).toBeUndefined();
    });
  });

  describe('LINE_POINT（v1.43 / ADR-0013 切片 2）', () => {
    const xLine = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } };

    it('Top + X 线 + 过线点 (0,1,1) → 平面过线、法线 d×(p−o)', () => {
      const plane = cPlanePlaneFromParams({ reference: 'top', line: xLine, point: { x: 0, y: 1, z: 1 } }, '0x9');
      expect(plane?.origin).toEqual({ x: 0, y: 0, z: 0 });
      expect(plane?.xDir).toEqual({ x: 1, y: 0, z: 0 });
      expect(plane?.normal.x).toBeCloseTo(0, 12);
      expect(plane?.normal.y).toBeCloseTo(-Math.SQRT1_2, 12);
      expect(plane?.normal.z).toBeCloseTo(Math.SQRT1_2, 12);
      expect(plane?.sourceFeatureId).toBe('0x9');
    });

    it('Front + 偏置线 + 点 + flipNormal → 法线反向、原点=线原点', () => {
      const plane = cPlanePlaneFromParams({
        reference: 'front',
        line: { origin: { x: 1, y: 2, z: 3 }, direction: { x: 1, y: 0, z: 0 } },
        point: { x: 1, y: 4, z: 3 },
        flipNormal: true,
      });
      expect(plane?.origin).toEqual({ x: 1, y: 2, z: 3 });
      expect(plane?.normal).toEqual({ x: 0, y: 0, z: -1 });
      expect(plane?.xDir).toEqual({ x: 1, y: 0, z: 0 });
    });

    it('退化/非法 → undefined（不猜）', () => {
      expect(cPlanePlaneFromParams({ reference: 'top', line: xLine, point: { x: 5, y: 0, z: 0 } })).toBeUndefined();
      expect(cPlanePlaneFromParams({ reference: 'top', point: { x: 0, y: 1, z: 1 } })).toBeUndefined();
      expect(cPlanePlaneFromParams({
        reference: 'top', line: xLine, point: { x: 0, y: 1, z: 1 }, angleDeg: 45,
      })).toBeUndefined();
      expect(cPlanePlaneFromParams({
        reference: 'top', line: { ...xLine, direction: { x: 0, y: 0, z: 0 } }, point: { x: 0, y: 1, z: 1 },
      })).toBeUndefined();
    });
  });

  describe('THREE_POINT（v1.44 / ADR-0013 切片 3）', () => {
    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 1, y: 0, z: 0 };
    const p3 = { x: 0, y: 1, z: 1 };

    it('三点 → origin=p1、normal=(p2−p1)×(p3−p1)、xDir=p2−p1', () => {
      const plane = cPlanePlaneFromParams({ reference: 'top', threePoints: [p1, p2, p3] }, '0xa');
      expect(plane?.origin).toEqual(p1);
      expect(plane?.xDir).toEqual({ x: 1, y: 0, z: 0 });
      expect(plane?.normal.x).toBeCloseTo(0, 12);
      expect(plane?.normal.y).toBeCloseTo(-Math.SQRT1_2, 12);
      expect(plane?.normal.z).toBeCloseTo(Math.SQRT1_2, 12);
      expect(plane?.sourceFeatureId).toBe('0xa');
      const flipped = cPlanePlaneFromParams({ reference: 'top', threePoints: [p1, p2, p3], flipNormal: true });
      expect(flipped?.normal.y).toBeCloseTo(Math.SQRT1_2, 12);
      expect(flipped?.normal.z).toBeCloseTo(-Math.SQRT1_2, 12);
    });

    it('三点共线/重合/与 offset 同给 → undefined（不猜）', () => {
      expect(cPlanePlaneFromParams({ reference: 'top', threePoints: [p1, p2, { x: 2, y: 0, z: 0 }] })).toBeUndefined();
      expect(cPlanePlaneFromParams({ reference: 'top', threePoints: [p1, p1, p3] })).toBeUndefined();
      expect(cPlanePlaneFromParams({ reference: 'top', threePoints: [p1, p2, p3], offsetMm: 5 })).toBeUndefined();
      expect(cPlanePlaneFromParams({ reference: 'bottom', threePoints: [p1, p2, p3] })).toBeUndefined();
    });
  });

  it('isCPlaneReference 判别域', () => {
    expect(isCPlaneReference('top')).toBe(true);
    expect(isCPlaneReference('right')).toBe(true);
    expect(isCPlaneReference('front')).toBe(true);
    expect(isCPlaneReference('bottom')).toBe(false);
    expect(isCPlaneReference(undefined)).toBe(false);
  });
});

describe('cPlanePlaneOptions', () => {
  const typeLabel = (type: string): string => (type === 'cPlane' ? '平面' : type);

  it('按树序产出「平面 N」+ 世界平面；失败/抑制条目不可选', () => {
    const options = cPlanePlaneOptions([
      entry('0x1', { reference: 'front', offsetMm: -20 }),
      entry('0x2', { reference: 'top' }, { status: 1 }),
      entry('0x3', { reference: 'right', offsetMm: 50 }, { suppressed: true }),
      entry('0x4', { reference: 'right', offsetMm: 10 }),
    ], typeLabel);
    expect(options.map((option) => option.label)).toEqual(['平面 1', '平面 4']);
    expect(options[0]?.plane?.sourceFeatureId).toBe('0x1');
    expect(options[1]?.plane?.origin.x).toBe(10);
  });

  it('非 cPlane 条目与不可解析参数被跳过', () => {
    const options = cPlanePlaneOptions([
      { id: '0x9', featureType: 'extrude', orderKey: 1, suppressed: false, status: 0, params: {} },
      entry('0x5', { reference: 'bottom' }),
    ], typeLabel);
    expect(options).toEqual([]);
  });
});
