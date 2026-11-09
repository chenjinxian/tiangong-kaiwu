/**
 * SWEPT_EDGE 圆实体 + 相邻实体消歧单测（无浏览器，不需要真栈）：
 * Hydraulic Components Fillet 1 实测——外圆引用的 SWEPT_EDGE 由两条相邻直线
 * 消歧，应命中两线唯一共享且落在圆上的端点（六边形角点）所扫出的侧边。
 * 圆无端点，旧实现恒空候选 → matches=0。这里钉死纯函数语义与诚实守卫。
 */
import { expect, test } from '@playwright/test';
import { sweptCandidatePoints } from './edge-resolver.js';

const CIRCLE = { kind: 'circle', center: { x: 0, y: 0 }, radius: 5 };

test.describe('SWEPT_EDGE 圆 + 相邻实体消歧', () => {
  test('两条相邻线唯一共享端点（在圆上）→ 该点', () => {
    const left = { kind: 'line', p1: { x: -5, y: 0 }, p2: { x: 0, y: 5 } };
    const right = { kind: 'line', p1: { x: 0, y: 5 }, p2: { x: 5, y: 0 } };
    expect(sweptCandidatePoints(CIRCLE, [left, right])).toEqual([[0, 5]]);
  });

  test('共享点不在圆上 → 空集（不猜）', () => {
    const a = { kind: 'line', p1: { x: 0, y: 6 }, p2: { x: 3, y: 6 } };
    const b = { kind: 'line', p1: { x: 3, y: 6 }, p2: { x: 3, y: 0 } };
    expect(sweptCandidatePoints(CIRCLE, [a, b])).toEqual([]);
  });

  test('上下文不足（<2）→ 空集（圆无端点）', () => {
    const only = { kind: 'line', p1: { x: 0, y: 5 }, p2: { x: 3, y: 0 } };
    expect(sweptCandidatePoints(CIRCLE, [only])).toEqual([]);
    expect(sweptCandidatePoints(CIRCLE, [])).toEqual([]);
  });

  test('两条重合线共享两个落圆端点 → 歧义空集', () => {
    const a = { kind: 'line', p1: { x: -5, y: 0 }, p2: { x: 5, y: 0 } };
    const b = { kind: 'line', p1: { x: -5, y: 0 }, p2: { x: 5, y: 0 } };
    expect(sweptCandidatePoints(CIRCLE, [a, b])).toEqual([]);
  });

  test('线主实体保持旧语义：与相邻实体的唯一共享端点', () => {
    const top = { kind: 'line', p1: { x: 0, y: 10 }, p2: { x: 10, y: 10 } };
    const right = { kind: 'line', p1: { x: 10, y: 0 }, p2: { x: 10, y: 10 } };
    expect(sweptCandidatePoints(top, [right])).toEqual([[10, 10]]);
  });
});
