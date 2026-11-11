/**
 * 几何边选择器的纯匹配测试（无栈）。
 *
 * 句柄曲线坐标是 mm 世界系（与 dev-only `readEdgeHandles` 一致）。
 */
import { expect, test } from '@playwright/test';
import type { EdgeHandle } from '../replay/edge-resolver.js';
import { matchesLiveEdge } from './edge-select.js';

function line(p0: [number, number, number], p1: [number, number, number]): EdgeHandle {
  return {
    bodyKey: 'body',
    subEntityId: 1,
    curve: { kind: 'line', p0, p1 },
  };
}

function arc(radius: number, sweepRadians: number): EdgeHandle {
  return {
    bodyKey: 'body',
    subEntityId: 2,
    curve: { kind: 'arc', radius, sweepRadians, start: [0, 0, 0], end: [10, 0, 0] },
  };
}

test.describe('live edge selector 纯匹配', () => {
  test('line：方向正/反平行、长度、中点容差', () => {
    const edge = line([0, 0, 0], [0, 0, 20]);
    expect(matchesLiveEdge(edge, {
      curveKind: 'line',
      direction: { x: 0, y: 0, z: 1 },
      midpoint: { x: 0, y: 0, z: 10 },
      lengthMm: 20,
    })).toBe(true);
    expect(matchesLiveEdge(edge, { direction: { x: 0, y: 0, z: -1 } })).toBe(true);
    expect(matchesLiveEdge(edge, { direction: { x: 1, y: 0, z: 0 } })).toBe(false);
    expect(matchesLiveEdge(edge, { midpoint: { x: 0, y: 0, z: 12 } })).toBe(false);
    expect(matchesLiveEdge(edge, { midpoint: { x: 0, y: 0, z: 11.5 }, toleranceMm: 2 })).toBe(true);
    expect(matchesLiveEdge(edge, { lengthMm: 25 })).toBe(false);
    expect(matchesLiveEdge(edge, { lengthMm: 25, lengthToleranceMm: 6 })).toBe(true);
  });

  test('line：curveKind/direction 对 arc 不适用', () => {
    const edge = arc(5, Math.PI);
    expect(matchesLiveEdge(edge, { curveKind: 'arc', lengthMm: 5 * Math.PI })).toBe(true);
    expect(matchesLiveEdge(edge, { curveKind: 'line' })).toBe(false);
    expect(matchesLiveEdge(edge, { direction: { x: 1, y: 0, z: 0 } })).toBe(false);
  });

  test('无条件的选择器会匹配所有边（由 resolve 层拒绝多命中）', () => {
    expect(matchesLiveEdge(line([0, 0, 0], [1, 0, 0]), {})).toBe(true);
  });
});
