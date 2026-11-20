// ADR-0022 S2 首切片：单直线槽几何/约束闭式草稿单测。
// 基准 = live 私有证据 sketch1-slot.dxf：中线 (90,25)→(-90,25)、width 20 →
// 边界 y=15/35、两帽 r=10（右帽 270→90、左帽 90→270）、原中线保留。
import { describe, expect, it } from 'vitest';
import type { SketchEntityDto } from '@luban-cad/shared';
import {
  DEFAULT_SLOT_WIDTH,
  buildArcSlotDraft,
  buildCircleSlotDraft,
  buildClosedRingSlotDraft,
  buildLineChainSlotDraft,
  buildLineSlotDraft,
  lineChainFromSelection,
  orderLineChain,
} from '../tools/sketch/sketch-slot-logic.js';

function lineSketch(a: { x: number; y: number }, b: { x: number; y: number }): SketchEntityDto[] {
  return [
    { kind: 'point', id: 1, x: a.x, y: a.y },
    { kind: 'point', id: 2, x: b.x, y: b.y },
    { kind: 'line', id: 3, p1: 1, p2: 2 },
  ];
}

const entitiesOf = (draft: ReturnType<typeof buildLineSlotDraft>) => {
  if (!draft.ok) throw new Error(`unexpected ${draft.error}`);
  return draft.draft.entities;
};

describe('buildLineSlotDraft（单直线槽首切片）', () => {
  it('复现 live DXF：中线 (90,25)→(-90,25)、Ø20 → y=15/35 边界 + 两帽 r10', () => {
    const entities = lineSketch({ x: 90, y: 25 }, { x: -90, y: 25 });
    const built = buildLineSlotDraft({ line: entities[2] as SketchEntityDto & { kind: 'line' }, entities, width: 20, startId: 10 });
    expect(built.ok).toBe(true);
    const out = entitiesOf(built);
    const lines = out.filter((e) => e.kind === 'line');
    const arcs = out.filter((e) => e.kind === 'arc');
    const points = out.filter((e) => e.kind === 'point');
    expect(points.map((p) => [p.id, p.x, p.y])).toEqual([[10, 90, 25], [11, -90, 25]]);
    const coords = lines.map((l) => {
      if (l.kind !== 'line') throw new Error('kind');
      const p = (ref: unknown) => ref as { x: number; y: number };
      return [p(l.p1).x, p(l.p1).y, p(l.p2).x, p(l.p2).y];
    });
    expect(coords).toEqual(expect.arrayContaining([
      [90, 15, -90, 15],
      [90, 35, -90, 35],
    ]));
    const arcData = arcs.map((a) => {
      if (a.kind !== 'arc') throw new Error('kind');
      return { center: a.center, radius: a.radius, startAngle: a.startAngle, sweepAngle: a.sweepAngle };
    });
    expect(arcData[0]).toMatchObject({ center: 10, radius: 10, startAngle: -Math.PI / 2, sweepAngle: Math.PI });
    expect(arcData[1]).toMatchObject({ center: 11, radius: 10, startAngle: Math.PI / 2, sweepAngle: Math.PI });
  });

  it('正向中线 (0,0)→(100,0)：上/下边界 ±10、帽心在中线端点', () => {
    const entities = lineSketch({ x: 0, y: 0 }, { x: 100, y: 0 });
    const built = buildLineSlotDraft({ line: entities[2] as SketchEntityDto & { kind: 'line' }, entities, width: 20, startId: 100 });
    const out = entitiesOf(built);
    const lines = out.filter((e) => e.kind === 'line');
    const ys = lines.map((l) => (l.kind === 'line' ? [(l.p1 as { y: number }).y, (l.p2 as { y: number }).y] : []));
    expect(ys).toEqual(expect.arrayContaining([[10, 10], [-10, -10]]));
    const arcs = out.filter((e) => e.kind === 'arc');
    expect(arcs[0]?.kind === 'arc' ? arcs[0].center : undefined).toBe(100);
    expect(arcs[1]?.kind === 'arc' ? arcs[1].center : undefined).toBe(101);
  });

  it('约束集：2 帽心 coincident + 4 边界 coincident + 4 tangent + 2 parallel + Ø + equal', () => {
    const entities = lineSketch({ x: 0, y: 0 }, { x: 100, y: 0 });
    const built = buildLineSlotDraft({ line: entities[2] as SketchEntityDto & { kind: 'line' }, entities, width: DEFAULT_SLOT_WIDTH, startId: 100 });
    if (!built.ok) throw new Error(built.error);
    const kinds = built.draft.constraints.map((c) => c.kind);
    expect(kinds.filter((k) => k === 'coincident')).toHaveLength(6);
    expect(kinds.filter((k) => k === 'tangent')).toHaveLength(4);
    expect(kinds.filter((k) => k === 'parallel')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'diameter')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'equal')).toHaveLength(1);
    const diameter = built.draft.constraints.find((c) => c.kind === 'diameter');
    expect(diameter?.value).toBe(20);
    expect(diameter?.refs).toEqual([built.draft.capArcIds[0]]);
    // 中线保留：草稿不包含删除/替换语义。
    expect(built.draft.entities.some((e) => e.id === 3)).toBe(false);
    expect([...entities, ...built.draft.entities]).toContainEqual(entities[2]);
  });

  it('零/负宽度 → zeroWidth；未解算端点/零长线 → unsolvedLine', () => {
    const entities = lineSketch({ x: 0, y: 0 }, { x: 10, y: 0 });
    const line = entities[2] as SketchEntityDto & { kind: 'line' };
    expect(buildLineSlotDraft({ line, entities, width: 0, startId: 1 })).toEqual({ ok: false, error: 'zeroWidth' });
    expect(buildLineSlotDraft({ line, entities, width: -5, startId: 1 })).toEqual({ ok: false, error: 'zeroWidth' });
    const noPoints: SketchEntityDto[] = [{ kind: 'line', id: 3, p1: 1, p2: 2 }];
    expect(buildLineSlotDraft({ line: noPoints[0] as SketchEntityDto & { kind: 'line' }, entities: noPoints, width: 20, startId: 1 }))
      .toEqual({ ok: false, error: 'unsolvedLine' });
    const zero: SketchEntityDto[] = lineSketch({ x: 5, y: 5 }, { x: 5, y: 5 });
    expect(buildLineSlotDraft({ line: zero[2] as SketchEntityDto & { kind: 'line' }, entities: zero, width: 20, startId: 1 }))
      .toEqual({ ok: false, error: 'unsolvedLine' });
  });
});

// ---------------------------------------------------------------------------
// S2b 相连折线链槽（live 2026-11-19 chain-slot.dxf 同构：3 段链 → 6 边界线 +
// 2 半圆帽 + 2 外侧圆角弧；弧心=内顶点；内顶点外侧圆角、内侧尖角斜接）
// ---------------------------------------------------------------------------

/** L 形链：P0(0,0) → P1(100,0) → P2(100,100)，两段共享端点（point 2）。 */
function lChainSketch(): SketchEntityDto[] {
  return [
    { kind: 'point', id: 1, x: 0, y: 0 },
    { kind: 'point', id: 2, x: 100, y: 0 },
    { kind: 'point', id: 3, x: 100, y: 100 },
    { kind: 'line', id: 4, p1: 1, p2: 2 },
    { kind: 'line', id: 5, p1: 2, p2: 3 },
  ];
}

function chainBuilt(entities: SketchEntityDto[], ids: number[], width = 20) {
  const chain = lineChainFromSelection(entities, ids);
  if (!chain) throw new Error('chain missing');
  return buildLineChainSlotDraft({ chain, entities, width, startId: 10 });
}

describe('buildLineChainSlotDraft（S2b 相连折线链槽）', () => {
  it('L 形链 Ø20：6 边界线 + 2 半圆帽 + 1 外侧圆角弧，弧心=内顶点', () => {
    const entities = lChainSketch();
    const built = chainBuilt(entities, [4, 5]);
    if (!built.ok) throw new Error(built.error);
    const { draft } = built;
    expect(draft.entities.filter((e) => e.kind === 'point').map((p) => (p.kind === 'point' ? [p.id, p.x, p.y] : [])))
      .toEqual([[10, 0, 0], [11, 100, 100], [12, 100, 0]]);
    expect(draft.entities.filter((e) => e.kind === 'line')).toHaveLength(4);
    expect(draft.entities.filter((e) => e.kind === 'arc')).toHaveLength(3);
    const lineCoords = draft.entities.filter((e) => e.kind === 'line').map((l) => {
      if (l.kind !== 'line') throw new Error('kind');
      const p = (ref: unknown) => ref as { x: number; y: number };
      return [p(l.p1).x, p(l.p1).y, p(l.p2).x, p(l.p2).y];
    });
    expect(lineCoords).toEqual(expect.arrayContaining([
      // 左（内侧）边界在 90° 顶点斜接于 (90,10)。
      [0, 10, 90, 10],
      [90, 10, 90, 100],
      // 右（外侧）边界在圆角弧两端断开。
      [0, -10, 100, -10],
      [110, 0, 110, 100],
    ]));
    const arcs = draft.entities.filter((e) => e.kind === 'arc');
    expect(arcs[0]).toMatchObject({ center: 10, radius: 10, startAngle: Math.PI / 2, sweepAngle: Math.PI });
    expect(arcs[1]).toMatchObject({ center: 11, radius: 10, startAngle: 2 * Math.PI, sweepAngle: Math.PI });
    expect(arcs[2]).toMatchObject({ center: 12, radius: 10, startAngle: -Math.PI / 2, sweepAngle: Math.PI / 2 });
    expect(draft.cornerArcIds).toEqual([arcs[2]?.id]);
    expect(draft.capArcIds).toEqual([arcs[0]?.id, arcs[1]?.id]);
  });

  it('约束集：帽/角心 coincident、边界并行、8 相切、Ø + 逐对 equal（后端恰 2 同型）', () => {
    const entities = lChainSketch();
    const built = chainBuilt(entities, [4, 5]);
    if (!built.ok) throw new Error(built.error);
    const kinds = built.draft.constraints.map((c) => c.kind);
    expect(kinds.filter((k) => k === 'coincident')).toHaveLength(11);
    expect(kinds.filter((k) => k === 'parallel')).toHaveLength(4);
    expect(kinds.filter((k) => k === 'tangent')).toHaveLength(6);
    expect(kinds.filter((k) => k === 'diameter')).toHaveLength(1);
    const equals = built.draft.constraints.filter((c) => c.kind === 'equal');
    expect(equals).toHaveLength(2);
    for (const equal of equals) expect(equal.refs).toHaveLength(2);
    const diameter = built.draft.constraints.find((c) => c.kind === 'diameter');
    expect(diameter?.value).toBe(20);
    // 原中线保留（草稿只追加，不删除）。
    for (const id of [4, 5]) expect(built.draft.entities.some((e) => e.id === id)).toBe(false);
  });

  it('选择顺序无关：反序选择仍得到同一条链与同一轮廓', () => {
    const entities = lChainSketch();
    const forward = chainBuilt(entities, [4, 5]);
    const reverse = chainBuilt(entities, [5, 4]);
    if (!forward.ok || !reverse.ok) throw new Error('build failed');
    const outline = (draft: typeof forward.draft): Array<[number, number, number, number]> => draft.entities
      .filter((e) => e.kind === 'line')
      .map((l) => {
        if (l.kind !== 'line') throw new Error('kind');
        const p = (ref: unknown) => ref as { x: number; y: number };
        return [p(l.p1).x, p(l.p1).y, p(l.p2).x, p(l.p2).y];
      });
    const normalized = (coords: Array<[number, number, number, number]>) =>
      coords.map(([x1, y1, x2, y2]) => [
        Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2),
      ].map((v) => Math.round(v * 1e6) / 1e6).join(',')).sort();
    expect(normalized(outline(reverse.draft))).toEqual(normalized(outline(forward.draft)));
    expect(reverse.draft.entities.filter((e) => e.kind === 'arc')).toHaveLength(3);
  });

  it('诚实拒收：非直线成员、未相连、共线折点（闭环自 S2e 起由 ring 模式支持）', () => {
    const entities = lChainSketch();
    expect(lineChainFromSelection(entities, [4])).toBeUndefined();
    expect(lineChainFromSelection(entities, [4, 999])).toBeUndefined();
    const arcEntity: SketchEntityDto[] = [
      ...entities,
      { kind: 'arc', id: 6, center: 1, radius: 5, startAngle: 0, sweepAngle: Math.PI / 2 },
    ];
    expect(lineChainFromSelection(arcEntity, [4, 6])).toBeUndefined();

    const disconnected: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 }, { kind: 'point', id: 2, x: 10, y: 0 },
      { kind: 'point', id: 3, x: 0, y: 20 }, { kind: 'point', id: 4, x: 10, y: 20 },
      { kind: 'line', id: 5, p1: 1, p2: 2 }, { kind: 'line', id: 6, p1: 3, p2: 4 },
    ];
    expect(chainBuilt(disconnected, [5, 6])).toEqual({ ok: false, error: 'unsupportedChain' });

    const collinear: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 }, { kind: 'point', id: 2, x: 50, y: 0 },
      { kind: 'point', id: 3, x: 100, y: 0 },
      { kind: 'line', id: 4, p1: 1, p2: 2 }, { kind: 'line', id: 5, p1: 2, p2: 3 },
    ];
    expect(chainBuilt(collinear, [4, 5])).toEqual({ ok: false, error: 'unsupportedChain' });
  });

  it('orderLineChain：从任选自由端出发得到 n+1 个路径点；分支链拒绝', () => {
    const entities = lChainSketch();
    const chain = lineChainFromSelection(entities, [4, 5]);
    if (!chain) throw new Error('chain missing');
    const ordered = orderLineChain(chain, entities);
    if (!ordered.ok) throw new Error(ordered.error);
    expect(ordered.path.points).toEqual([{ u: 0, v: 0 }, { u: 100, v: 0 }, { u: 100, v: 100 }]);

    const branch: SketchEntityDto[] = [
      ...entities,
      { kind: 'point', id: 6, x: 100, y: -50 },
      { kind: 'line', id: 7, p1: 2, p2: 6 },
    ];
    const branchChain = lineChainFromSelection(branch, [4, 5, 7]);
    if (!branchChain) throw new Error('branch chain missing');
    expect(orderLineChain(branchChain, branch)).toEqual({ ok: false, error: 'unsupportedChain' });
  });
});

// ---------------------------------------------------------------------------
// S2c 圆弧中线槽（live 2026-11-20 `arc-slot.dxf` 同构：同心偏移弧 + 两半圆帽）
// ---------------------------------------------------------------------------

type ArcEntity = Extract<SketchEntityDto, { kind: 'arc' }>;

function arcSketch(startAngle: number, sweepAngle: number, radius = 50): SketchEntityDto[] {
  return [
    { kind: 'point', id: 1, x: 0, y: 0 },
    { kind: 'arc', id: 2, center: 1, radius, startAngle, sweepAngle },
  ];
}

function arcOf(entities: SketchEntityDto[], id: number): ArcEntity {
  const found = entities.find((e) => e.id === id);
  if (!found || found.kind !== 'arc') throw new Error(`arc ${id} missing`);
  return found;
}

function capPoint(entities: SketchEntityDto[], arc: ArcEntity, t: number): { x: number; y: number } {
  const center = entities.find((e) => e.id === arc.center);
  if (!center || center.kind !== 'point' || center.x === undefined || center.y === undefined)
    throw new Error('cap center missing');
  const angle = (arc.startAngle ?? 0) + t * (arc.sweepAngle ?? 0);
  return {
    x: center.x + (arc.radius ?? 0) * Math.cos(angle),
    y: center.y + (arc.radius ?? 0) * Math.sin(angle),
  };
}

describe('buildArcSlotDraft（S2c 圆弧槽）', () => {
  it('四分之一圆弧 Ø20：偏移弧 r40/r60 同心、帽 r10，帽从外侧点绕到内侧点', () => {
    const entities = arcSketch(0, Math.PI / 2);
    const built = buildArcSlotDraft({
      arc: arcOf(entities, 2), entities, width: 20, startId: 10,
    });
    if (!built.ok) throw new Error(built.error);
    const { draft } = built;
    const points = draft.entities.filter((e) => e.kind === 'point');
    const rounded = (v: number | undefined): number => Math.round((v ?? 0) * 1e9) / 1e9;
    expect(points.map((p) => (p.kind === 'point' ? [p.id, rounded(p.x), rounded(p.y)] : []))).toEqual([
      [10, 50, 0], [11, 0, 50],
    ]);
    const outer = arcOf(draft.entities, 12);
    const inner = arcOf(draft.entities, 13);
    expect(outer).toMatchObject({ center: 1, radius: 60, startAngle: 0, sweepAngle: Math.PI / 2 });
    expect(inner).toMatchObject({ center: 1, radius: 40, startAngle: 0, sweepAngle: Math.PI / 2 });
    const capStart = arcOf(draft.entities, 14);
    const capEnd = arcOf(draft.entities, 15);
    expect(capStart).toMatchObject({ center: 10, radius: 10, startAngle: 0, sweepAngle: -Math.PI });
    expect(capEnd).toMatchObject({ center: 11, radius: 10, startAngle: Math.PI / 2, sweepAngle: Math.PI });
    // 帽端点与偏移弧端点重合：起点帽 (60,0)→(40,0)，终点帽 (0,60)→(0,40)。
    const close = (a: { x: number; y: number }, x: number, y: number): void => {
      expect(a.x).toBeCloseTo(x, 6);
      expect(a.y).toBeCloseTo(y, 6);
    };
    close(capPoint(draft.entities, capStart, 0), 60, 0);
    close(capPoint(draft.entities, capStart, 1), 40, 0);
    close(capPoint(draft.entities, capEnd, 0), 0, 60);
    close(capPoint(draft.entities, capEnd, 1), 0, 40);
    expect(draft.entities.some((e) => e.id === 2)).toBe(false); // 原中线保留
    expect(draft.capArcIds).toEqual([14, 15]);
    expect(draft.boundaryLineIds).toEqual([]);
  });

  it('约束集：6 coincident + 2 concentric + 4 tangent + 1 diameter + 1 equal', () => {
    const entities = arcSketch(0, Math.PI / 2);
    const built = buildArcSlotDraft({ arc: arcOf(entities, 2), entities, width: DEFAULT_SLOT_WIDTH, startId: 10 });
    if (!built.ok) throw new Error(built.error);
    const kinds = built.draft.constraints.map((c) => c.kind);
    expect(kinds.filter((k) => k === 'coincident')).toHaveLength(6);
    expect(kinds.filter((k) => k === 'concentric')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'tangent')).toHaveLength(4);
    expect(kinds.filter((k) => k === 'diameter')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'equal')).toHaveLength(1);
    const diameter = built.draft.constraints.find((c) => c.kind === 'diameter');
    expect(diameter?.value).toBe(20);
  });

  it('负扫角（顺时针）中线：帽扫角方向镜像，端点仍从外侧绕到内侧', () => {
    const entities = arcSketch(Math.PI / 2, -Math.PI / 2);
    const built = buildArcSlotDraft({ arc: arcOf(entities, 2), entities, width: 20, startId: 10 });
    if (!built.ok) throw new Error(built.error);
    const { draft } = built;
    const capStart = arcOf(draft.entities, 14);
    const capEnd = arcOf(draft.entities, 15);
    expect(capStart).toMatchObject({ startAngle: Math.PI / 2, sweepAngle: Math.PI });
    expect(capEnd).toMatchObject({ startAngle: 0, sweepAngle: -Math.PI });
    const close = (a: { x: number; y: number }, x: number, y: number): void => {
      expect(a.x).toBeCloseTo(x, 6);
      expect(a.y).toBeCloseTo(y, 6);
    };
    close(capPoint(draft.entities, capStart, 0), 0, 60);
    close(capPoint(draft.entities, capStart, 1), 0, 40);
    close(capPoint(draft.entities, capEnd, 0), 60, 0);
    close(capPoint(draft.entities, capEnd, 1), 40, 0);
  });

  it('错误：宽度超过半径 → degenerateRadius；整圆弧 → unsupportedKind；未解算/零宽', () => {
    const thin = arcSketch(0, Math.PI / 2, 10);
    expect(buildArcSlotDraft({ arc: arcOf(thin, 2), entities: thin, width: 20, startId: 10 }))
      .toEqual({ ok: false, error: 'degenerateRadius' });
    const full = arcSketch(0, 2 * Math.PI);
    expect(buildArcSlotDraft({ arc: arcOf(full, 2), entities: full, width: 20, startId: 10 }))
      .toEqual({ ok: false, error: 'unsupportedKind' });
    const unresolved: SketchEntityDto[] = [{ kind: 'arc', id: 2, center: 99, radius: 50, startAngle: 0, sweepAngle: 1 }];
    expect(buildArcSlotDraft({ arc: arcOf(unresolved, 2), entities: unresolved, width: 20, startId: 10 }))
      .toEqual({ ok: false, error: 'unsolvedCurve' });
    const normal = arcSketch(0, 1);
    expect(buildArcSlotDraft({ arc: arcOf(normal, 2), entities: normal, width: 0, startId: 10 }))
      .toEqual({ ok: false, error: 'zeroWidth' });
  });
});

// ---------------------------------------------------------------------------
// S2e 整圆槽（live 2026-11-20 `circle-slot.dxf`）——ADR-0023 concentric 模式：
// 两条同心整圆 R±w/2、无端帽、单一 slotWidth 驱动（live 显示线性宽度）。
// ---------------------------------------------------------------------------

function circleSketch(radius = 30): SketchEntityDto[] {
  return [
    { kind: 'point', id: 1, x: 5, y: 7 },
    { kind: 'circle', id: 2, center: 1, radius },
  ];
}

const circleOf = (entities: SketchEntityDto[], id: number) => {
  const found = entities.find((e) => e.id === id);
  if (!found || found.kind !== 'circle') throw new Error(`circle ${id} missing`);
  return found;
};

describe('buildCircleSlotDraft（S2e 整圆槽）', () => {
  it('R30 Ø20：内 20/外 40 同心（内联圆心），无端帽，单 slotWidth concentric', () => {
    const entities = circleSketch();
    const built = buildCircleSlotDraft({
      circle: circleOf(entities, 2), entities, width: 20, startId: 10,
    });
    if (!built.ok) throw new Error(built.error);
    const { draft } = built;
    expect(draft.entities.filter((e) => e.kind === 'circle').map((c) => (c.kind === 'circle' ? [c.id, c.center, c.radius] : [])))
      .toEqual([[10, { x: 5, y: 7 }, 20], [11, { x: 5, y: 7 }, 40]]);
    expect(draft.constraints).toEqual([{
      kind: 'slotWidth', slotMode: 'concentric', id: 12, refs: [2, 10, 11], value: 20,
    }]);
    expect(draft.slotWidthConstraintId).toBe(12);
    expect(draft.capArcIds).toEqual([]);
    expect(draft.boundaryLineIds).toEqual([]);
    expect(draft.entities.some((e) => e.id === 2)).toBe(false); // 追加语义（源圆保留在草图中）
  });

  it('错误：未解算圆心 → unsolvedCurve；半径不足半宽 → degenerateRadius；零宽', () => {
    const unresolved: SketchEntityDto[] = [{ kind: 'circle', id: 2, center: 99, radius: 30 }];
    expect(buildCircleSlotDraft({ circle: circleOf(unresolved, 2), entities: unresolved, width: 20, startId: 10 }))
      .toEqual({ ok: false, error: 'unsolvedCurve' });
    const thin = circleSketch(10);
    expect(buildCircleSlotDraft({ circle: circleOf(thin, 2), entities: thin, width: 20, startId: 10 }))
      .toEqual({ ok: false, error: 'degenerateRadius' });
    const normal = circleSketch();
    expect(buildCircleSlotDraft({ circle: circleOf(normal, 2), entities: normal, width: 0, startId: 10 }))
      .toEqual({ ok: false, error: 'zeroWidth' });
  });
});

// ---------------------------------------------------------------------------
// S2e 闭合环槽（live 2026-11-20 `ring-slot.dxf`）——ADR-0023 ring 模式：
// 外侧处处 r=Ø/2 圆角弧、内侧斜接尖角、无端帽、单一 Ø 驱动内外两侧。
// ---------------------------------------------------------------------------

/** 40×30 CCW 矩形闭合链（4 点 + 4 线）。 */
function rectangleChain(): SketchEntityDto[] {
  return [
    { kind: 'point', id: 1, x: 0, y: 0 }, { kind: 'point', id: 2, x: 40, y: 0 },
    { kind: 'point', id: 3, x: 40, y: 30 }, { kind: 'point', id: 4, x: 0, y: 30 },
    { kind: 'line', id: 5, p1: 1, p2: 2 }, { kind: 'line', id: 6, p1: 2, p2: 3 },
    { kind: 'line', id: 7, p1: 3, p2: 4 }, { kind: 'line', id: 8, p1: 4, p2: 1 },
  ];
}

const lineCoords = (entities: SketchEntityDto[]): Array<[number, number, number, number]> => entities
  .filter((e) => e.kind === 'line')
  .map((l) => {
    if (l.kind !== 'line') throw new Error('kind');
    const p = (ref: unknown) => ref as { x: number; y: number };
    return [p(l.p1).x, p(l.p1).y, p(l.p2).x, p(l.p2).y];
  });

describe('buildClosedRingSlotDraft（S2e 闭合环槽）', () => {
  it('40×30 矩形 Ø20：外 ±10 + 内缩 10 + 4 角弧 r10，无端帽，单 slotWidth ring', () => {
    const entities = rectangleChain();
    const chain = lineChainFromSelection(entities, [5, 6, 7, 8]);
    if (!chain) throw new Error('chain missing');
    const built = buildClosedRingSlotDraft({ chain, entities, width: 20, startId: 10 });
    if (!built.ok) throw new Error(built.error);
    const { draft } = built;
    expect(draft.entities.filter((e) => e.kind === 'point').map((p) => (p.kind === 'point' ? [p.id, p.x, p.y] : [])))
      .toEqual([[10, 0, 0], [11, 40, 0], [12, 40, 30], [13, 0, 30]]);
    expect(lineCoords(draft.entities)).toEqual(expect.arrayContaining([
      // 外侧边界
      [0, -10, 40, -10], [50, 0, 50, 30], [40, 40, 0, 40], [-10, 30, -10, 0],
      // 内侧斜接
      [10, 10, 30, 10], [30, 10, 30, 20], [30, 20, 10, 20], [10, 20, 10, 10],
    ]));
    const arcs = draft.entities.filter((e) => e.kind === 'arc');
    // 角度的等价表示归一（−π ≡ π、−0 → 0），几何相同。
    const angle = (v: number | undefined): number => {
      const twoPi = 2 * Math.PI;
      const m = (((v ?? 0) % twoPi) + twoPi) % twoPi;
      return m === 0 ? 0 : m;
    };
    expect(arcs.map((a) => (a.kind === 'arc' ? [a.center, a.radius, angle(a.startAngle), angle(a.sweepAngle)] : []))).toEqual([
      [10, 10, Math.PI, Math.PI / 2],
      [11, 10, 3 * Math.PI / 2, Math.PI / 2],
      [12, 10, 0, Math.PI / 2],
      [13, 10, Math.PI / 2, Math.PI / 2],
    ]);
    expect(draft.capArcIds).toEqual([]);
    expect(draft.cornerArcIds).toEqual([22, 23, 24, 25]);
    const slotWidth = draft.constraints.find((c) => c.kind === 'slotWidth');
    expect(slotWidth).toMatchObject({
      slotMode: 'ring', value: 20,
      refs: [5, 6, 7, 8, 14, 16, 18, 20, 15, 17, 19, 21],
    });
    expect(slotWidth?.id).toBe(draft.slotWidthConstraintId);
    expect(draft.entities.some((e) => e.kind === 'line' && [5, 6, 7, 8].includes(e.id))).toBe(false);
  });

  it('约束集：3n coincident（2n 角心 + 2n 弧端 + n 斜接）+ 2n parallel + 2n tangent + 1 slotWidth', () => {
    const entities = rectangleChain();
    const chain = lineChainFromSelection(entities, [5, 6, 7, 8]);
    if (!chain) throw new Error('chain missing');
    const built = buildClosedRingSlotDraft({ chain, entities, width: 20, startId: 10 });
    if (!built.ok) throw new Error(built.error);
    const kinds = built.draft.constraints.map((c) => c.kind);
    expect(kinds.filter((k) => k === 'coincident')).toHaveLength(20);
    expect(kinds.filter((k) => k === 'parallel')).toHaveLength(8);
    expect(kinds.filter((k) => k === 'tangent')).toHaveLength(8);
    expect(kinds.filter((k) => k === 'slotWidth')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'diameter')).toHaveLength(0);
  });

  it('orderLineChain 闭环：path.closed=true、n+1 点且末点=首点', () => {
    const entities = rectangleChain();
    const chain = lineChainFromSelection(entities, [5, 6, 7, 8]);
    if (!chain) throw new Error('chain missing');
    const ordered = orderLineChain(chain, entities);
    if (!ordered.ok) throw new Error(ordered.error);
    expect(ordered.path.closed).toBe(true);
    expect(ordered.path.points).toHaveLength(5);
    expect(ordered.path.points[4]).toEqual(ordered.path.points[0]);
  });

  it('buildLineChainSlotDraft 自动转 ring；宽度过大内环退化 → degenerateRadius', () => {
    const entities = rectangleChain();
    const chain = lineChainFromSelection(entities, [5, 6, 7, 8]);
    if (!chain) throw new Error('chain missing');
    const viaChain = buildLineChainSlotDraft({ chain, entities, width: 20, startId: 10 });
    const direct = buildClosedRingSlotDraft({ chain, entities, width: 20, startId: 10 });
    if (!viaChain.ok || !direct.ok) throw new Error('build failed');
    expect(viaChain.draft).toEqual(direct.draft);
    expect(buildLineChainSlotDraft({ chain, entities, width: 40, startId: 10 }))
      .toEqual({ ok: false, error: 'degenerateRadius' });
  });

  it('开放链交给 ring 构建器 → unsupportedChain（只处理闭合环）', () => {
    const entities = lChainSketch();
    const chain = lineChainFromSelection(entities, [4, 5]);
    if (!chain) throw new Error('chain missing');
    expect(buildClosedRingSlotDraft({ chain, entities, width: 20, startId: 10 }))
      .toEqual({ ok: false, error: 'unsupportedChain' });
  });
});
