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
