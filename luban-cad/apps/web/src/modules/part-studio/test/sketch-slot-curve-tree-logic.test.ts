// ADR-0022 §2.15（live 2026-11-20 S2u）：含圆弧的混合线树槽。
// 输入：毂 P 处 1 弧 + 2 线（live `s2u-arcbranch-input.dxf`）。
// 结果（w=20）：4 条直线边界 + 2 条同心弧边界（r−10 / r+10）+ 3 尖端帽
// + 1 绕毂弧（扫 11.9619°）；单 Ø20。
import { describe, expect, it } from 'vitest';
import type { SketchEntityDto } from '@luban-cad/shared';
import {
  buildCurveTreeSlotDraft,
  curveTreeFromSelection,
} from '../tools/sketch/sketch-slot-curve-tree-logic.js';

const DEG = Math.PI / 180;

const P = { x: -127.3526847362518, y: -57.66168236732483 };
const A = { x: -165.9830063581467, y: -104.0180772542953 };
const B = { x: -88.7223482131958, y: -104.0180772542953 };
const C = { x: -61.26848234283024, y: -141.5421864035569 };
const R = 106.7851148959772;
const A0 = 88.439547691644 * DEG;
const A1 = 128.2323637942156 * DEG;

type LineEntity = Extract<SketchEntityDto, { kind: 'line' }>;
type ArcEntity = Extract<SketchEntityDto, { kind: 'arc' }>;
type PointEntity = Extract<SketchEntityDto, { kind: 'point' }>;

function sketch(): SketchEntityDto[] {
  return [
    { kind: 'point', id: 1, ...P },
    { kind: 'point', id: 2, ...A },
    { kind: 'point', id: 3, ...B },
    { kind: 'point', id: 4, ...C },
    { kind: 'line', id: 5, p1: 1, p2: 2 },
    { kind: 'line', id: 6, p1: 1, p2: 3 },
    { kind: 'arc', id: 7, center: 4, radius: R, startAngle: A0, sweepAngle: A1 - A0 },
  ];
}

const pointOf = (ref: unknown): { x: number; y: number } => ref as { x: number; y: number };
const sameLine = (actual: number[], expected: number[]): boolean => {
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-2;
  return (close(actual[0]!, expected[0]!) && close(actual[1]!, expected[1]!)
    && close(actual[2]!, expected[2]!) && close(actual[3]!, expected[3]!))
    || (close(actual[0]!, expected[2]!) && close(actual[1]!, expected[3]!)
    && close(actual[2]!, expected[0]!) && close(actual[3]!, expected[1]!));
};

describe('curveTreeFromSelection（S2u 混合线树识别）', () => {
  it('1 弧 + 2 线单毂树：4 顶点（1 度 3 + 3 度 1）、3 臂', () => {
    const tree = curveTreeFromSelection(sketch(), [5, 6, 7]);
    expect(tree).toBeDefined();
    expect(tree!.arms).toHaveLength(3);
    expect(tree!.arms.filter((a) => a.kind === 'arc')).toHaveLength(1);
    expect(tree!.nodes.map((n) => n.ends.length).sort()).toEqual([1, 1, 1, 3]);
  });

  it('诚实拒收：多弧、无度≥3 顶点、非 line/arc', () => {
    const twoArcs: SketchEntityDto[] = [...sketch(),
      { kind: 'point', id: 8, x: 0, y: 0 },
      { kind: 'arc', id: 9, center: 8, radius: 20, startAngle: 0, sweepAngle: Math.PI / 2 },
    ];
    expect(curveTreeFromSelection(twoArcs, [5, 6, 7, 9])).toBeUndefined();
    // 纯开放链（弧+线，无分支）。
    const chain: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 40, y: 0 },
      { kind: 'point', id: 3, x: 40, y: 30 },
      { kind: 'arc', id: 4, center: 3, radius: 30, startAngle: -Math.PI / 2, sweepAngle: Math.PI / 2 },
      { kind: 'line', id: 5, p1: 1, p2: 2 },
    ];
    expect(curveTreeFromSelection(chain, [4, 5])).toBeUndefined();
  });
});

describe('buildCurveTreeSlotDraft（S2u 弧分支槽）', () => {
  it('live 同构：4 线边界 + 2 同心弧边界 + 3 帽 + 1 绕毂弧 + 单 Ø20', () => {
    const entities = sketch();
    const tree = curveTreeFromSelection(entities, [5, 6, 7])!;
    const result = buildCurveTreeSlotDraft({ tree, width: 20, startId: 100 });
    if (!result.ok) throw new Error(result.error);
    const { draft } = result;
    const lines = draft.entities.filter((e): e is LineEntity => e.kind === 'line');
    const arcs = draft.entities.filter((e): e is ArcEntity => e.kind === 'arc');
    const points = draft.entities.filter((e): e is PointEntity => e.kind === 'point');
    expect(lines, '每线臂 2 条边界线').toHaveLength(4);
    expect(arcs, '2 弧边界 + 3 尖端帽 + 1 绕毂弧').toHaveLength(6);
    expect(points, '2 弧心 + 3 帽心 + 1 毂心').toHaveLength(6);
    expect(draft.capArcIds).toHaveLength(3);
    expect(draft.cornerArcIds).toHaveLength(1);
    expect(draft.boundaryLineIds).toHaveLength(4);
    expect(draft.boundaryArcIds).toHaveLength(2);

    // 直线边界与 live 逐坐标同构（P 处斜接点/毂弧端/帽端）。
    const lineCoords = lines.map((l) => {
      const p1 = pointOf(l.p1);
      const p2 = pointOf(l.p2);
      return [p1.x, p1.y, p2.x, p2.y];
    });
    const expectedLines = [
      [-135.0348981394626, -51.2598390993645, -173.6652197613574, -97.61623398633502],
      [-127.3526832545936, -73.28218171913821, -158.3007929549359, -110.4199205222557],
      [-127.3526832545936, -73.28218171913821, -96.40456040193259, -110.4199219796244],
      [-112.7388376821552, -59.57779787615355, -81.04013602445902, -97.61623252896625],
    ];
    for (const exp of expectedLines)
      expect(lineCoords.some((actual) => sameLine(actual, exp)), `缺边界线 ${exp}`).toBe(true);

    // 同心弧边界：r−10 与 r+10，圆心=源弧圆心。
    const boundaryArcs = arcs.filter((a) => Math.abs((a.radius ?? NaN) - 10) > 1e-6);
    expect(boundaryArcs).toHaveLength(2);
    const byRadius = (r: number) => boundaryArcs.find((a) => Math.abs((a.radius ?? NaN) - r) < 1e-6);
    const inner = byRadius(R - 10);
    const outer = byRadius(R + 10);
    expect(inner, '内弧 r−10').toBeDefined();
    expect(outer, '外弧 r+10').toBeDefined();
    expect((inner!.sweepAngle! / DEG)).toBeCloseTo((122.1271762741154 - 88.439547691644), 2);
    expect((outer!.sweepAngle! / DEG)).toBeCloseTo((128.2323637942156 - 88.439547691644), 2);
    for (const arc of boundaryArcs) {
      const center = draft.entities.find((e) => e.id === arc.center);
      expect(center?.kind).toBe('point');
      expect(Math.hypot((center as PointEntity).x! - C.x, (center as PointEntity).y! - C.y))
        .toBeLessThan(1e-6);
    }

    // 尖端帽：圆心 = 线 A/B 端点与弧自由端 T。
    const T = { x: C.x + R * Math.cos(A0), y: C.y + R * Math.sin(A0) };
    const caps = draft.capArcIds.map((id) => arcs.find((a) => a.id === id)!);
    for (const cap of caps) expect(cap.radius).toBeCloseTo(10, 9);
    const capCenters = caps.map((cap) => pointOf(draft.entities.find((e) => e.id === cap.center)!));
    for (const tip of [A, B, T])
      expect(capCenters.filter((c) => Math.hypot(c.x - tip.x, c.y - tip.y) < 1e-3), '帽心=尖端').toHaveLength(1);

    // 绕毂弧：圆心 P、r10、起 128.2324°、扫 11.9619°。
    const hub = arcs.find((a) => draft.cornerArcIds!.includes(a.id))!;
    const hubCenter = pointOf(draft.entities.find((e) => e.id === hub.center)!);
    expect(Math.hypot(hubCenter.x - P.x, hubCenter.y - P.y)).toBeLessThan(1e-6);
    expect(hub.radius).toBeCloseTo(10, 9);
    expect((hub.startAngle! / DEG + 360) % 360).toBeCloseTo(128.2323637942156, 2);
    expect(((hub.sweepAngle! / DEG) + 360) % 360).toBeCloseTo(11.9619, 2);

    const kinds = draft.constraints.map((c) => c.kind);
    expect(kinds.filter((k) => k === 'diameter')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'equal')).toHaveLength(3);
    expect(kinds.filter((k) => k === 'parallel')).toHaveLength(4);
    expect(kinds.filter((k) => k === 'concentric')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'tangent')).toHaveLength(8);
    expect(kinds.filter((k) => k === 'coincident')).toHaveLength(14);
    const diameter = draft.constraints.find((c) => c.kind === 'diameter')!;
    expect(diameter.value).toBeCloseTo(20, 9);
  });

  it('弧半径不足以容纳半宽（w/2 ≥ r）→ degenerateRadius（诚实拒收）', () => {
    const entities = sketch();
    const tree = curveTreeFromSelection(entities, [5, 6, 7])!;
    expect(buildCurveTreeSlotDraft({ tree, width: 2 * R, startId: 100 }))
      .toEqual({ ok: false, error: 'degenerateRadius' });
    expect(buildCurveTreeSlotDraft({ tree, width: 0, startId: 100 }))
      .toEqual({ ok: false, error: 'zeroWidth' });
  });
});

// ── live 2026-11-20 S2u2：多弧臂（2 弧 + 1 线共毂）→ 3 LINE + 10 ARC ──────
describe('buildCurveTreeSlotDraft：多弧臂（live s2u2-multiarc）', () => {
  const P2 = { x: -88.722, y: -57.662 };
  const L = { x: -19.188, y: -104.018 };
  const C1 = { x: -320.504, y: 38.914 };
  const C2 = { x: -38.479, y: -86.389 };
  // 半径取 |P−C|（DXF 3 位小数半径与真实圆心距差 ~2e-4，超出 1e-6 焊接容差）。
  const R1 = Math.hypot(P2.x - C1.x, P2.y - C1.y);
  const R2 = Math.hypot(P2.x - C2.x, P2.y - C2.y);
  const DEG2 = Math.PI / 180;

  const entities: SketchEntityDto[] = [
    { kind: 'point', id: 1, ...P2 },
    { kind: 'point', id: 2, ...L },
    { kind: 'point', id: 3, ...C1 },
    { kind: 'point', id: 4, ...C2 },
    { kind: 'line', id: 5, p1: 1, p2: 2 },
    // 角由圆心↔P 反算（DXF 3 位小数会使弧端点偏离 P 0.058mm，超出焊接容差）。
    { kind: 'arc', id: 6, center: 3, radius: R1, startAngle: -36.86990005290909 * DEG2, sweepAngle: 14.25 * DEG2 },
    { kind: 'arc', id: 7, center: 4, radius: R2, startAngle: 70.3527520576169 * DEG2, sweepAngle: 79.888 * DEG2 },
  ];

  it('两对同心弧边界 + 3 帽 + 弧-弧宽缺口毂弧（7.139°）+ 2 斜接 + 单 Ø', () => {
    const tree = curveTreeFromSelection(entities, [5, 6, 7])!;
    expect(tree).toBeDefined();
    expect(tree.arms.filter((a) => a.kind === 'arc')).toHaveLength(2);
    const result = buildCurveTreeSlotDraft({ tree, width: 20, startId: 200 });
    if (!result.ok) throw new Error(result.error);
    const { draft } = result;
    const lines = draft.entities.filter((e): e is LineEntity => e.kind === 'line');
    const arcs = draft.entities.filter((e): e is ArcEntity => e.kind === 'arc');
    expect(lines, '线臂 2 条边界线').toHaveLength(2);
    expect(arcs, '4 同心弧边界 + 3 帽 + 1 毂弧').toHaveLength(8);

    // 边界弧半径/裁剪角（与 live 逐值吻合）。
    const boundary = arcs.filter((a) => {
      const r = a.radius ?? NaN;
      return Math.abs(r - (R1 + 10)) < 1e-2 || Math.abs(r - (R1 - 10)) < 1e-2
        || Math.abs(r - (R2 + 10)) < 1e-2 || Math.abs(r - (R2 - 10)) < 1e-2;
    });
    expect(boundary, '4 条同心弧边界').toHaveLength(4);
    const sweepOf = (r: number): number => {
      const a = boundary.find((x) => Math.abs((x.radius ?? NaN) - r) < 1e-2)!;
      return (a.sweepAngle ?? NaN) / DEG2;
    };
    expect(sweepOf(R1 + 10)).toBeCloseTo(11.596, 2);
    expect(sweepOf(R1 - 10)).toBeCloseTo(14.25, 2);
    expect(sweepOf(R2 + 10)).toBeCloseTo(79.888, 2);
    expect(sweepOf(R2 - 10)).toBeCloseTo(68.718, 2);

    // 尖端帽：线端 L、弧自由端 T1/T2。
    const T1 = { x: C1.x + R1 * Math.cos(-36.86990005290909 * DEG2), y: C1.y + R1 * Math.sin(-36.86990005290909 * DEG2) };
    const T2 = { x: C2.x + R2 * Math.cos(70.3527520576169 * DEG2), y: C2.y + R2 * Math.sin(70.3527520576169 * DEG2) };
    const caps = draft.capArcIds.map((id) => arcs.find((a) => a.id === id)!);
    expect(caps).toHaveLength(3);
    const capCenters = caps.map((cap) => pointOf(draft.entities.find((e) => e.id === cap.center)!));
    for (const tip of [L, T1, T2])
      expect(capCenters.filter((c) => Math.hypot(c.x - tip.x, c.y - tip.y) < 1e-2), '帽心=尖端').toHaveLength(1);

    // 弧-弧宽缺口毂弧：圆心 P、r10、起 150.241°、扫 7.139°。
    const hub = arcs.find((a) => draft.cornerArcIds!.includes(a.id))!;
    const hubCenter = pointOf(draft.entities.find((e) => e.id === hub.center)!);
    expect(Math.hypot(hubCenter.x - P2.x, hubCenter.y - P2.y)).toBeLessThan(1e-3);
    expect(hub.radius).toBeCloseTo(10, 6);
    expect((hub.startAngle! / DEG2 + 360) % 360).toBeCloseTo(150.241, 2);
    expect(((hub.sweepAngle! / DEG2) + 360) % 360).toBeCloseTo(7.139, 2);

    const kinds = draft.constraints.map((c) => c.kind);
    expect(kinds.filter((k) => k === 'diameter')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'equal')).toHaveLength(3);
    expect(kinds.filter((k) => k === 'parallel')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'concentric')).toHaveLength(4);
    expect(kinds.filter((k) => k === 'tangent')).toHaveLength(8);
    expect(kinds.filter((k) => k === 'coincident')).toHaveLength(14);
  });
});
