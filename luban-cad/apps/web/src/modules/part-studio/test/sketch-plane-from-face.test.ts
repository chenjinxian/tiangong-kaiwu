/**
 * ADR-0017 Stage D：模型面 → SketchPlaneDto 纯函数。
 * 法向来自面平面；origin 取环点；xDir 取环线方向投影；退化输入诚实 undefined。
 */
import { describe, expect, it } from 'vitest';
import type { BrepFaceHandle } from '../internal/brep-topology.js';
import { findFaceHandle, sketchPlaneFromFaceHandle } from '../internal/sketch-plane-from-face.js';

function handle(overrides?: Partial<BrepFaceHandle>): BrepFaceHandle {
  return {
    bodyKey: 'body-1',
    subEntityId: 6,
    range: { low: [0, 0, 10], high: [20, 10, 10] },
    normal: [0, 0, 1],
    loops: [[
      { kind: 'line', p0: [0, 0, 10], p1: [20, 0, 10] },
      { kind: 'line', p0: [20, 0, 10], p1: [20, 10, 10] },
      { kind: 'line', p0: [20, 10, 10], p1: [0, 10, 10] },
      { kind: 'line', p0: [0, 10, 10], p1: [0, 0, 10] },
    ]],
    ...overrides,
  };
}

describe('sketchPlaneFromFaceHandle', () => {
  it('顶面（z=10，法向 +Z）→ origin 首环点、xDir 首线方向、法向 +Z', () => {
    const plane = sketchPlaneFromFaceHandle(handle());
    expect(plane).toEqual({
      origin: { x: 0, y: 0, z: 10 },
      normal: { x: 0, y: 0, z: 1 },
      xDir: { x: 1, y: 0, z: 0 },
    });
  });

  it('斜面：法向归一化，xDir 为环线在面内的投影（正交、单位长）', () => {
    // 45° 斜面：法向 (0, -√2/2, √2/2)，环线方向带法向分量 (1,1,1)。
    const radical = Math.SQRT1_2;
    const plane = sketchPlaneFromFaceHandle(handle({
      normal: [0, -radical, radical],
      loops: [[{ kind: 'line', p0: [0, 0, 0], p1: [1, 1, 1] }]],
    }));
    expect(plane).toBeDefined();
    const { normal, xDir } = plane!;
    expect(Math.hypot(normal.x, normal.y, normal.z)).toBeCloseTo(1, 12);
    expect(Math.hypot(xDir.x, xDir.y, xDir.z)).toBeCloseTo(1, 12);
    // 正交于法向
    expect(normal.x * xDir.x + normal.y * xDir.y + normal.z * xDir.z).toBeCloseTo(0, 12);
  });

  it('无直线时取圆弧半径方向作为 xDir', () => {
    const plane = sketchPlaneFromFaceHandle(handle({
      loops: [[{
        kind: 'arc', center: [5, 5, 10], radius: 5, normal: [0, 0, 1],
        start: [10, 5, 10], end: [0, 5, 10], sweepRadians: Math.PI,
      }]],
    }));
    expect(plane?.origin).toEqual({ x: 10, y: 5, z: 10 });
    expect(plane?.xDir.x).toBeCloseTo(1, 12);
    expect(plane?.xDir.y).toBeCloseTo(0, 12);
  });

  it('空环 → range 中心 + 归一化对角线方向（不崩溃）', () => {
    const plane = sketchPlaneFromFaceHandle(handle({ loops: [] }));
    expect(plane?.origin).toEqual({ x: 10, y: 5, z: 10 });
    expect(plane?.xDir.x).toBeCloseTo(2 / Math.sqrt(5), 12);
    expect(plane?.xDir.y).toBeCloseTo(1 / Math.sqrt(5), 12);
  });

  it('退化法向（零/非有限）→ undefined（不编造平面）', () => {
    expect(sketchPlaneFromFaceHandle(handle({ normal: [0, 0, 0] }))).toBeUndefined();
    expect(sketchPlaneFromFaceHandle(handle({ normal: [Number.NaN, 0, 1] }))).toBeUndefined();
  });

  it('范围与环全退化（法向有效但无法取点/方向）→ 兜底正交 xDir', () => {
    const plane = sketchPlaneFromFaceHandle(handle({
      range: { low: [0, 0, 0], high: [0, 0, 0] },
      loops: [],
      normal: [1, 0, 0],
    }));
    expect(plane).toBeDefined();
    expect(plane!.normal).toEqual({ x: 1, y: 0, z: 0 });
    expect(Math.abs(plane!.xDir.x)).toBeLessThan(1e-12);
    expect(Math.hypot(plane!.xDir.y, plane!.xDir.z)).toBeCloseTo(1, 12);
  });
});

describe('findFaceHandle', () => {
  it('按 bodyKey + cacheId 唯一命中', () => {
    const target = handle();
    expect(findFaceHandle([target, handle({ subEntityId: 7 })], 'body-1', 6)).toBe(target);
  });

  it('无命中/多重命中 → undefined（不猜）', () => {
    expect(findFaceHandle([handle()], 'body-2', 6)).toBeUndefined();
    expect(findFaceHandle([handle(), handle()], 'body-1', 6)).toBeUndefined();
  });
});
