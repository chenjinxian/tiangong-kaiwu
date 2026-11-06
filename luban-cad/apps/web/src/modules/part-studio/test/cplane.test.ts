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
