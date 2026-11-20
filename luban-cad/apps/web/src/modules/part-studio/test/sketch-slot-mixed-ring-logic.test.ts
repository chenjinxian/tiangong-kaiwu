// ADR-0022 S2n：闭合 line+arc 混合环槽（live 2026-11-20 `closed-mix3-slot.dxf`）。
// 输入 DXF：源弧 r32.0166 c=(-129.0820,-34.8845) a=180.7630→89.2370（CCW 268.474°）
// + 源线 A(-161.0957,-35.3109)→B(-128.6557,-2.8708)（严格端点焊接）。
// 结果 Ø20：外圈 r42.0166 + 平行线（外移 10）、内圈 r22.0166 + 内移线（两端交点
// 裁剪）、两接缝外角 r10（扫 45.763°），无端帽，源保留，单 slotWidth ring。
import { describe, expect, it } from 'vitest';
import type { SketchEntityDto } from '@luban-cad/shared';
import {
  buildClosedMixedRingSlotDraft,
  closedMixedChainFromSelection,
} from '../tools/sketch/sketch-slot-mixed-logic.js';

const DEG = Math.PI / 180;
const A = { x: -161.0957235097885, y: -35.31086817383766 };
const B = { x: -128.6556571722031, y: -2.870800439268351 };
const O = { x: -129.0820109970106, y: -34.88451297040655 };

/** 源弧（A→B，CCW 268.474°）+ 源线（p1=A, p2=B）。 */
function closedSketch(): SketchEntityDto[] {
  return [
    { kind: 'point', id: 1, ...A },
    { kind: 'point', id: 2, ...B },
    { kind: 'point', id: 3, ...O },
    { kind: 'arc', id: 10, center: 3, radius: 32.01655146342722, startAngle: 180.7630139621755 * DEG, sweepAngle: 268.4739745430076 * DEG },
    { kind: 'line', id: 11, p1: 1, p2: 2 },
  ];
}

const built = (width = 20, entities = closedSketch()) => {
  const chain = closedMixedChainFromSelection(entities, [10, 11]);
  if (!chain) throw new Error('closed mixed chain missing');
  return { chain, result: buildClosedMixedRingSlotDraft({ chain, entities, width, startId: 100 }) };
};

type ArcEntity = Extract<SketchEntityDto, { kind: 'arc' }>;
const arcOf = (entities: SketchEntityDto[], id: number): ArcEntity => {
  const found = entities.find((e) => e.id === id);
  if (!found || found.kind !== 'arc') throw new Error(`arc ${id} missing`);
  return found;
};
const lineOf = (entities: SketchEntityDto[], id: number) => {
  const found = entities.find((e) => e.id === id);
  if (!found || found.kind !== 'line') throw new Error(`line ${id} missing`);
  return found;
};
const pointOf = (entities: SketchEntityDto[], id: number) => {
  const found = entities.find((e) => e.id === id);
  if (!found || found.kind !== 'point') throw new Error(`point ${id} missing`);
  return found;
};
const angleDeg = (rad: number) => (rad / DEG + 360) % 360;

describe('closedMixedChainFromSelection（S2n 闭环排序）', () => {
  it('弧按 authored 方向 A→B 遍历，线 B→A 回环；顶点 A→B→A', () => {
    const { chain } = built();
    expect(chain.members.map((m) => [m.kind, m.entryPart, m.exitPart])).toEqual([
      ['arc', 'start', 'end'],
      ['line', 'end', 'start'],
    ]);
    expect(chain.vertices).toHaveLength(3);
    expect(chain.vertices[0]!.u).toBeCloseTo(A.x, 6);
    expect(chain.vertices[0]!.v).toBeCloseTo(A.y, 6);
    expect(chain.vertices[1]!.u).toBeCloseTo(B.x, 6);
    expect(chain.vertices[1]!.v).toBeCloseTo(B.y, 6);
    expect(chain.vertices[2]!.u).toBeCloseTo(A.x, 6);
    expect(chain.vertices[2]!.v).toBeCloseTo(A.y, 6);
  });

  it('诚实拒收：开放混合链、两弧同向（任何遍历方向都有弧反向）', () => {
    // 开放链：线 (0,0)→(100,0) + 弧 c=(50,0) r50 0→90°。
    const open: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 100, y: 0 },
      { kind: 'line', id: 3, p1: 1, p2: 2 },
      { kind: 'point', id: 4, x: 50, y: 0 },
      { kind: 'arc', id: 5, center: 4, radius: 50, startAngle: 0, sweepAngle: Math.PI / 2 },
    ];
    expect(closedMixedChainFromSelection(open, [3, 5])).toBeUndefined();
    // 透镜：两条弧都 authored A→B（上弧 −180°、下弧 +180°）。
    const lens: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: -10, y: 0 },
      { kind: 'point', id: 2, x: 10, y: 0 },
      { kind: 'point', id: 3, x: 0, y: 0 },
      { kind: 'arc', id: 10, center: 3, radius: 10, startAngle: Math.PI, sweepAngle: -Math.PI },
      { kind: 'arc', id: 11, center: 3, radius: 10, startAngle: Math.PI, sweepAngle: Math.PI },
    ];
    expect(closedMixedChainFromSelection(lens, [10, 11])).toBeUndefined();
    // 纯线环由既有 ring 构建器处理。
    const linesOnly: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 10, y: 0 },
      { kind: 'point', id: 3, x: 10, y: 10 },
      { kind: 'point', id: 4, x: 0, y: 10 },
      { kind: 'line', id: 5, p1: 1, p2: 2 },
      { kind: 'line', id: 6, p1: 2, p2: 3 },
      { kind: 'line', id: 7, p1: 3, p2: 4 },
      { kind: 'line', id: 8, p1: 4, p2: 1 },
    ];
    expect(closedMixedChainFromSelection(linesOnly, [5, 6, 7, 8])).toBeUndefined();
  });
});

describe('buildClosedMixedRingSlotDraft（S2n 混合环槽）', () => {
  it('Ø20：2 偏移弧 + 2 偏移线 + 2 外角弧；无端帽；单 slotWidth ring（refs 6）', () => {
    const { result } = built();
    if (!result.ok) throw new Error(result.error);
    const { draft } = result;
    expect(draft.entities.filter((e) => e.kind === 'line')).toHaveLength(2);
    expect(draft.entities.filter((e) => e.kind === 'arc')).toHaveLength(4);
    expect(draft.entities.filter((e) => e.kind === 'point')).toHaveLength(2);
    expect(draft.capArcIds).toEqual([]);
    expect(draft.cornerArcIds).toHaveLength(2);
    for (const id of draft.cornerArcIds!)
      expect(arcOf(draft.entities, id).radius).toBeCloseTo(10, 9);
    expect(draft.boundaryLineIds).toEqual([100, 101, 102, 103]);
    const slotWidth = draft.constraints.find((c) => c.kind === 'slotWidth')!;
    expect(slotWidth).toMatchObject({ slotMode: 'ring', value: 20 });
    expect(slotWidth.refs).toEqual([10, 11, 100, 101, 102, 103]);
    expect(slotWidth.id).toBe(draft.slotWidthConstraintId);
    const kinds = draft.constraints.map((c) => c.kind);
    expect(kinds.filter((k) => k === 'parallel')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'concentric')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'tangent')).toHaveLength(4);
    expect(kinds.filter((k) => k === 'coincident')).toHaveLength(10);
    expect(draft.constraints).toHaveLength(19);
  });

  it('几何与 live DXF 同构：内 r22.0166 裁剪 / 外 r42.0166 / 两外角 r10 扫 45.763°', () => {
    const { result } = built();
    if (!result.ok) throw new Error(result.error);
    const { draft } = result;
    // 侧 +1（左=内侧）：弧 100 内偏移 + 线 101 内偏移（两端交点裁剪）。
    const innerArc = arcOf(draft.entities, 100);
    expect(innerArc.radius).toBeCloseTo(22.016551463, 9);
    expect(angleDeg(innerArc.startAngle!)).toBeCloseTo(190.924204039, 6);
    expect(((innerArc.sweepAngle! / DEG) + 360) % 360).toBeCloseTo(248.151594, 6);
    const inner = lineOf(draft.entities, 101);
    const innerStart = inner.p1 as { x: number; y: number };
    const innerEnd = inner.p2 as { x: number; y: number };
    expect(innerStart.x).toBeCloseTo(-124.909649868, 6);
    expect(innerStart.y).toBeCloseTo(-13.266928902, 6);
    expect(innerEnd.x).toBeCloseTo(-150.699594886, 6);
    expect(innerEnd.y).toBeCloseTo(-39.056875030, 6);
    // 侧 −1（右=外侧）：弧 102 外偏移（完整 268.474°）+ 线 103（未裁剪）。
    const outerArc = arcOf(draft.entities, 102);
    expect(outerArc.radius).toBeCloseTo(42.016551463, 9);
    expect(angleDeg(outerArc.startAngle!)).toBeCloseTo(180.763013962, 6);
    expect(((outerArc.sweepAngle! / DEG) + 360) % 360).toBeCloseTo(268.473974543, 6);
    const outer = lineOf(draft.entities, 103);
    const outerStart = outer.p1 as { x: number; y: number };
    const outerEnd = outer.p2 as { x: number; y: number };
    expect(outerStart.x).toBeCloseTo(-135.726725136, 6);
    expect(outerStart.y).toBeCloseTo(4.200267220, 6);
    expect(outerEnd.x).toBeCloseTo(-168.166791474, 6);
    expect(outerEnd.y).toBeCloseTo(-28.239800514, 6);
    // 角弧：B 处 89.237→135，A 处 135→180.763，均 r10。
    const cornerArcs = draft.entities.filter((e): e is ArcEntity => e.kind === 'arc' && Math.abs(e.radius! - 10) < 1e-9);
    expect(cornerArcs).toHaveLength(2);
    const pointXY = (id: number) => {
      const p = pointOf(draft.entities, id);
      if (p.x === undefined || p.y === undefined) throw new Error(`point ${id} coords missing`);
      return { x: p.x, y: p.y };
    };
    const centerOf = (arc: ArcEntity) => pointXY(arc.center as number);
    const cornerB = cornerArcs.find((a) => Math.hypot(centerOf(a).x - B.x, centerOf(a).y - B.y) < 1e-6)!;
    const cornerA = cornerArcs.find((a) => Math.hypot(centerOf(a).x - A.x, centerOf(a).y - A.y) < 1e-6)!;
    const cornerPoints = draft.entities
      .filter((e): e is Extract<SketchEntityDto, { kind: 'point' }> => e.kind === 'point')
      .map((p) => ({ x: p.x ?? NaN, y: p.y ?? NaN }));
    expect(cornerPoints).toHaveLength(2);
    expect(Math.hypot(cornerPoints[0]!.x - B.x, cornerPoints[0]!.y - B.y)).toBeCloseTo(0, 9);
    expect(Math.hypot(cornerPoints[1]!.x - A.x, cornerPoints[1]!.y - A.y)).toBeCloseTo(0, 9);
    expect(cornerB.radius).toBeCloseTo(10, 9);
    expect(angleDeg(cornerB.startAngle!)).toBeCloseTo(89.236988505, 4);
    expect(cornerB.sweepAngle! / DEG).toBeCloseTo(45.763012728, 4);
    expect(angleDeg(cornerA.startAngle!)).toBeCloseTo(135, 4);
    expect(cornerA.sweepAngle! / DEG).toBeCloseTo(45.763012728, 4);
    // 源实体不复制（追加语义）。
    expect(draft.entities.some((e) => e.id === 10 || e.id === 11)).toBe(false);
  });

  it('错误：零宽 → zeroWidth；半宽超过源弧半径 → degenerateRadius', () => {
    const entities = closedSketch();
    const chain = closedMixedChainFromSelection(entities, [10, 11])!;
    expect(buildClosedMixedRingSlotDraft({ chain, entities, width: 0, startId: 100 }))
      .toEqual({ ok: false, error: 'zeroWidth' });
    expect(buildClosedMixedRingSlotDraft({ chain, entities, width: 70, startId: 100 }))
      .toEqual({ ok: false, error: 'degenerateRadius' });
  });
});
