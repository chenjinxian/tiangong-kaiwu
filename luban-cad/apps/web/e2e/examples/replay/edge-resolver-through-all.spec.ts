/**
 * CAP_EDGE through-all 端盖边匹配单测（无浏览器，不需要真栈）：
 * Stirrup 实测暴露——through-all remove 源的端盖位置由 body 决定，且端盖边可能
 * 被布尔裁剪，端点不再等于草图段。匹配按“同一支撑线 + 投影重叠”（草图系 2D），
 * 不拿记录 depthMm 当端点。这里钉死该纯函数语义。
 */
import { expect, test } from '@playwright/test';
import { projectedCapEdgeOnLine, type Frame } from './edge-resolver.js';

const FRAME: Frame = {
  o: [0, 0, 0],
  x: [1, 0, 0],
  y: [0, 1, 0],
  n: [0, 0, 1],
};

const LINE = { kind: 'line', p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } };

function edge(p0: [number, number, number], p1: [number, number, number]) {
  return { bodyKey: 'body', subEntityId: 1, curve: { kind: 'line' as const, p0, p1 } };
}

test.describe('CAP_EDGE through-all 端盖边（支撑线 + 投影重叠）', () => {
  test('同一支撑线、端点被裁剪但投影重叠 → true', () => {
    expect(projectedCapEdgeOnLine(edge([2, 0, 5], [7, 0, 5]), LINE, FRAME)).toBe(true);
  });

  test('端点顺序反转 → true', () => {
    expect(projectedCapEdgeOnLine(edge([7, 0, 5], [2, 0, 5]), LINE, FRAME)).toBe(true);
  });

  test('边覆盖整段草图线 → true', () => {
    expect(projectedCapEdgeOnLine(edge([-1, 0, 5], [11, 0, 5]), LINE, FRAME)).toBe(true);
  });

  test('垂直偏移（不同支撑线）→ false', () => {
    expect(projectedCapEdgeOnLine(edge([2, 0.1, 5], [7, 0.1, 5]), LINE, FRAME)).toBe(false);
  });

  test('沿线段投影不相交 → false', () => {
    expect(projectedCapEdgeOnLine(edge([-5, 0, 5], [-1, 0, 5]), LINE, FRAME)).toBe(false);
  });

  test('端点跨法向（不在同一端盖平面）→ false', () => {
    expect(projectedCapEdgeOnLine(edge([2, 0, 5], [7, 0, 6]), LINE, FRAME)).toBe(false);
  });

  test('非 line 实体 / 非 line 边 → false（不误匹配）', () => {
    expect(projectedCapEdgeOnLine(edge([2, 0, 5], [7, 0, 5]), { kind: 'circle' }, FRAME)).toBe(false);
    expect(projectedCapEdgeOnLine(
      { bodyKey: 'body', subEntityId: 1, curve: { kind: 'arc', center: [0, 0, 0], radius: 1 } },
      LINE,
      FRAME,
    )).toBe(false);
  });
});
