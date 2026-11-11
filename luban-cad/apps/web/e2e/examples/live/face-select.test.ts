/**
 * 几何面选择器纯匹配测试（无栈）。
 */
import { expect, test } from '@playwright/test';
import { faceCenter, matchesLiveFace, type LiveFaceHandle } from './face-select.js';

function face(
  center: [number, number, number],
  normal: [number, number, number],
  loops = 1,
): LiveFaceHandle {
  const half = 2.5;
  return {
    bodyKey: 'body',
    subEntityId: 7,
    range: {
      low: [center[0] - half, center[1] - half, center[2] - half],
      high: [center[0] + half, center[1] + half, center[2] + half],
    },
    normal,
    loops: Array.from({ length: loops }, () => []),
  };
}

test.describe('live face selector 纯匹配', () => {
  test('中心/法向/环数匹配与容差', () => {
    const f = face([0, 0, 30], [0, 0, 1]);
    expect(faceCenter(f)).toEqual({ x: 0, y: 0, z: 30 });
    expect(matchesLiveFace(f, {
      center: { x: 0, y: 0, z: 30 },
      normal: { x: 0, y: 0, z: 1 },
      loopCount: 1,
    })).toBe(true);
    expect(matchesLiveFace(f, { normal: { x: 0, y: 0, z: -1 } })).toBe(true);
    expect(matchesLiveFace(f, { normal: { x: 1, y: 0, z: 0 } })).toBe(false);
    expect(matchesLiveFace(f, { center: { x: 0, y: 0, z: 35 }, toleranceMm: 5 })).toBe(true);
    expect(matchesLiveFace(f, { center: { x: 0, y: 0, z: 36 }, toleranceMm: 5 })).toBe(false);
    expect(matchesLiveFace(f, { loopCount: 2 })).toBe(false);
  });

  test('无条件选择器匹配所有面（由 resolve 层拒绝多命中）', () => {
    expect(matchesLiveFace(face([0, 0, 0], [0, 0, 1]), {})).toBe(true);
  });
});
