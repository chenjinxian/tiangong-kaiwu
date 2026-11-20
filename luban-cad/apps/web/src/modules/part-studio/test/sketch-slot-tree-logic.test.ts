// ADR-0022 §2.11 扩展：一般线树槽（live 2026-11-20 S2o）。
// A 宽缺口分支：毂 P=(-46.221,-43.610)，尖端 (-13.889,10.316)/(6.667,-13.075)/
//   (19.699,-47.861) → 3 帽 r10 + 1 绕毂弧 r10 149.055°→266.310°（扫 117.255°）
//   + 6 边界线（窄缺口两处斜接）。
// D 多毂树：5 线（P 3 臂 + C 3 臂）→ 4 帽 + 10 边界线、两毂全斜接、无毂弧。
import { describe, expect, it } from 'vitest';
import type { SketchEntityDto } from '@luban-cad/shared';
import {
  buildLineTreeSlotDraft,
  lineTreeFromSelection,
} from '../tools/sketch/sketch-slot-tree-logic.js';

const DEG = Math.PI / 180;

const P = { x: -46.221, y: -43.610 };
const T1 = { x: -13.889, y: 10.316 };
const T2 = { x: 6.667, y: -13.075 };
const T3 = { x: 19.699, y: -47.861 };
const A1 = { x: 42.871, y: 21.931 };
const A2 = { x: 79.512, y: -41.535 };
const A3 = { x: 45.705, y: 65.877 };
const A4 = { x: 3.395, y: 41.450 };
const A5 = { x: 85.020, y: -87.717 };
const A6 = { x: 116.753, y: -69.396 };

/** A：三条线共点 P（宽缺口 T1→T3 = 297.26°）。 */
function wideBranchSketch(): SketchEntityDto[] {
  return [
    { kind: 'point', id: 1, ...P },
    { kind: 'point', id: 11, ...T1 },
    { kind: 'point', id: 12, ...T2 },
    { kind: 'point', id: 13, ...T3 },
    { kind: 'line', id: 21, p1: 1, p2: 11 },
    { kind: 'line', id: 22, p1: 1, p2: 12 },
    { kind: 'line', id: 23, p1: 1, p2: 13 },
  ];
}

/** D：双毂树（P=A1 3 臂、C=A2 3 臂）。 */
function treeSketch(): SketchEntityDto[] {
  return [
    { kind: 'point', id: 1, ...A1 },
    { kind: 'point', id: 2, ...A2 },
    { kind: 'point', id: 3, ...A3 },
    { kind: 'point', id: 4, ...A4 },
    { kind: 'point', id: 5, ...A5 },
    { kind: 'point', id: 6, ...A6 },
    { kind: 'line', id: 11, p1: 1, p2: 2 },
    { kind: 'line', id: 12, p1: 1, p2: 3 },
    { kind: 'line', id: 13, p1: 1, p2: 4 },
    { kind: 'line', id: 14, p1: 2, p2: 5 },
    { kind: 'line', id: 15, p1: 2, p2: 6 },
  ];
}

type ArcEntity = Extract<SketchEntityDto, { kind: 'arc' }>;
type LineEntity = Extract<SketchEntityDto, { kind: 'line' }>;
const lineCoords = (entities: SketchEntityDto[]) =>
  entities.filter((e): e is LineEntity => e.kind === 'line')
    .map((l) => {
      const p = (ref: unknown) => ref as { x: number; y: number };
      return [p(l.p1).x, p(l.p1).y, p(l.p2).x, p(l.p2).y];
    });
const sameLine = (actual: number[], expected: number[]): boolean => {
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-3;
  return (close(actual[0]!, expected[0]!) && close(actual[1]!, expected[1]!)
    && close(actual[2]!, expected[2]!) && close(actual[3]!, expected[3]!))
    || (close(actual[0]!, expected[2]!) && close(actual[1]!, expected[3]!)
    && close(actual[2]!, expected[0]!) && close(actual[3]!, expected[1]!));
};
const arcDeg = (rad: number) => (rad / DEG + 360) % 360;

describe('lineTreeFromSelection（S2o 线树识别）', () => {
  it('A 单毂三线：4 顶点（1 度 3 + 3 度 1）、3 臂', () => {
    const tree = lineTreeFromSelection(wideBranchSketch(), [21, 22, 23]);
    expect(tree).toBeDefined();
    expect(tree!.arms).toHaveLength(3);
    expect(tree!.nodes).toHaveLength(4);
    expect(tree!.nodes.map((n) => n.ends.length).sort()).toEqual([1, 1, 1, 3]);
  });

  it('D 双毂树：6 顶点（2 度 3 + 4 度 1）、5 臂', () => {
    const tree = lineTreeFromSelection(treeSketch(), [11, 12, 13, 14, 15]);
    expect(tree).toBeDefined();
    expect(tree!.arms).toHaveLength(5);
    expect(tree!.nodes).toHaveLength(6);
    expect(tree!.nodes.map((n) => n.ends.length).sort()).toEqual([1, 1, 1, 1, 3, 3]);
  });

  it('诚实拒收：闭环（4 线）、无分支的开放链、断开的两个分支', () => {
    const loop: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 10, y: 0 },
      { kind: 'point', id: 3, x: 10, y: 10 },
      { kind: 'point', id: 4, x: 0, y: 10 },
      { kind: 'line', id: 11, p1: 1, p2: 2 },
      { kind: 'line', id: 12, p1: 2, p2: 3 },
      { kind: 'line', id: 13, p1: 3, p2: 4 },
      { kind: 'line', id: 14, p1: 4, p2: 1 },
    ];
    expect(lineTreeFromSelection(loop, [11, 12, 13, 14])).toBeUndefined();
    const chain: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 10, y: 0 },
      { kind: 'point', id: 3, x: 20, y: 0 },
      { kind: 'line', id: 11, p1: 1, p2: 2 },
      { kind: 'line', id: 12, p1: 2, p2: 3 },
    ];
    expect(lineTreeFromSelection(chain, [11, 12])).toBeUndefined();
    // 断链：一条孤立线不与其他共享端点。
    const disconnected: SketchEntityDto[] = [...wideBranchSketch(),
      { kind: 'point', id: 31, x: 500, y: 500 },
      { kind: 'point', id: 32, x: 600, y: 500 },
      { kind: 'line', id: 41, p1: 31, p2: 32 }];
    expect(lineTreeFromSelection(disconnected, [21, 22, 23, 41])).toBeUndefined();
  });
});

describe('buildLineTreeSlotDraft（S2o 线树槽）', () => {
  it('A 宽缺口：3 尖端帽 + 1 绕毂弧（149.055°→266.310°）+ 6 边界线', () => {
    const entities = wideBranchSketch();
    const tree = lineTreeFromSelection(entities, [21, 22, 23])!;
    const result = buildLineTreeSlotDraft({ tree, width: 20, startId: 100 });
    if (!result.ok) throw new Error(result.error);
    const { draft } = result;
    expect(draft.entities.filter((e) => e.kind === 'point')).toHaveLength(4); // 3 帽心 + 1 毂心
    expect(draft.entities.filter((e) => e.kind === 'line')).toHaveLength(6);
    expect(draft.entities.filter((e) => e.kind === 'arc')).toHaveLength(4); // 3 帽 + 1 毂弧
    expect(draft.capArcIds).toHaveLength(3);
    expect(draft.cornerArcIds).toHaveLength(1);
    const hubArc = draft.entities.find((e): e is ArcEntity => e.kind === 'arc' && Math.abs((e.radius ?? 0) - 10) < 1e-9
      && arcDeg(e.startAngle!) > 140 && arcDeg(e.startAngle!) < 160);
    expect(hubArc, '绕毂圆弧').toBeDefined();
    expect(arcDeg(hubArc!.startAngle!)).toBeCloseTo(149.055, 2);
    expect(((hubArc!.sweepAngle! / DEG) + 360) % 360).toBeCloseTo(117.255, 2);
    const hubCenter = draft.entities.find((e) => e.kind === 'point'
      && Math.hypot((e as { x: number }).x - P.x, (e as { y: number }).y - P.y) < 1e-6);
    expect(hubCenter, '毂心=source 端点').toBeDefined();
    // 边界线与 live DXF 同构（T1 左/右、T2 左/右、T3 左/右）。
    const lines = lineCoords(draft.entities);
    const expected = [
      [-54.797, -38.467, -22.466, 15.458],
      [-17.800, -15.654, -5.312, 5.173],
      [-17.800, -15.654, 1.667, -4.415],
      [-12.618, -35.756, 11.667, -21.735],
      [-12.618, -35.756, 20.343, -37.882],
      [-46.864, -53.589, 19.056, -57.840],
    ];
    for (const exp of expected)
      expect(lines.some((actual) => sameLine(actual, exp)), `缺边界线 ${exp}`).toBe(true);
    const kinds = draft.constraints.map((c) => c.kind);
    expect(kinds.filter((k) => k === 'diameter')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'equal')).toHaveLength(3);
    expect(kinds.filter((k) => k === 'parallel')).toHaveLength(6);
    expect(kinds.filter((k) => k === 'tangent')).toHaveLength(8); // 3 帽×2 + 毂弧×2
    expect(kinds.filter((k) => k === 'coincident')).toHaveLength(2 /*miter*/ + 3 * 3 + 3);
  });

  it('D 双毂树：4 尖端帽 + 10 边界线、无毂弧、两毂全斜接', () => {
    const entities = treeSketch();
    const tree = lineTreeFromSelection(entities, [11, 12, 13, 14, 15])!;
    const result = buildLineTreeSlotDraft({ tree, width: 20, startId: 100 });
    if (!result.ok) throw new Error(result.error);
    const { draft } = result;
    expect(draft.entities.filter((e) => e.kind === 'line')).toHaveLength(10);
    expect(draft.entities.filter((e) => e.kind === 'arc')).toHaveLength(4);
    expect(draft.capArcIds).toHaveLength(4);
    expect(draft.cornerArcIds ?? []).toHaveLength(0);
    const lines = lineCoords(draft.entities);
    // 连接臂 A1-A2 的两条边界线（miter→miter，无帽）与 live 吻合。
    expect(lines.some((actual) => sameLine(actual, [53.045, 24.309, 87.146, -34.757]))).toBe(true);
    expect(lines.some((actual) => sameLine(actual, [35.724, 14.309, 69.826, -44.757]))).toBe(true);
    // 帽心 = 4 个自由尖端。
    const centers = draft.entities.filter((e): e is Extract<SketchEntityDto, { kind: 'point' }> => e.kind === 'point')
      .map((p) => ({ x: p.x ?? NaN, y: p.y ?? NaN }));
    for (const tip of [A3, A4, A5, A6])
      expect(centers.filter((c) => Math.hypot(c.x - tip.x, c.y - tip.y) < 1e-3), '帽心=尖端').toHaveLength(1);
    const kinds = draft.constraints.map((c) => c.kind);
    expect(kinds.filter((k) => k === 'diameter')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'equal')).toHaveLength(3); // 4 帽 → 3 equal
    expect(kinds.filter((k) => k === 'parallel')).toHaveLength(10);
    expect(kinds.filter((k) => k === 'tangent')).toHaveLength(8); // 4 帽×2
    expect(kinds.filter((k) => k === 'coincident')).toHaveLength(18); // 4 帽×3 + 6 miter
  });

  it('错误：缺口≈180°（T 形）→ unsupportedChain；短臂斜接越界 → degenerateRadius', () => {
    const tShape: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 40, y: 0 },
      { kind: 'point', id: 3, x: 0, y: 40 },
      { kind: 'point', id: 5, x: -40, y: 0 },
      { kind: 'line', id: 11, p1: 1, p2: 2 },
      { kind: 'line', id: 12, p1: 1, p2: 3 },
      { kind: 'line', id: 14, p1: 1, p2: 5 },
    ];
    // 臂 0/90/180°：含 180° 缺口（东←→西）→ 拒收。
    const tree = lineTreeFromSelection(tShape, [11, 12, 14]);
    expect(tree).toBeDefined();
    expect(buildLineTreeSlotDraft({ tree: tree!, width: 20, startId: 100 }))
      .toEqual({ ok: false, error: 'unsupportedChain' });
    // 短臂：毂 (0,0)、臂长 5/40/40、半宽 10 → 斜接越界。
    const shortArm: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 5, y: 0 },
      { kind: 'point', id: 3, x: 40, y: 20 },
      { kind: 'point', id: 4, x: -40, y: 20 },
      { kind: 'line', id: 11, p1: 1, p2: 2 },
      { kind: 'line', id: 12, p1: 1, p2: 3 },
      { kind: 'line', id: 13, p1: 1, p2: 4 },
    ];
    const shortTree = lineTreeFromSelection(shortArm, [11, 12, 13])!;
    expect(buildLineTreeSlotDraft({ tree: shortTree, width: 20, startId: 100 }))
      .toEqual({ ok: false, error: 'degenerateRadius' });
  });
});
