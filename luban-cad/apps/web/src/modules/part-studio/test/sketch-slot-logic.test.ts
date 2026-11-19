// ADR-0022 S2 首切片：单直线槽几何/约束闭式草稿单测。
// 基准 = live 私有证据 sketch1-slot.dxf：中线 (90,25)→(-90,25)、width 20 →
// 边界 y=15/35、两帽 r=10（右帽 270→90、左帽 90→270）、原中线保留。
import { describe, expect, it } from 'vitest';
import type { SketchEntityDto } from '@luban-cad/shared';
import {
  DEFAULT_SLOT_WIDTH,
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

  it('诚实拒收：非直线成员、未相连、闭环（矩形 4 段）、共线折点', () => {
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

    const rectangle: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 }, { kind: 'point', id: 2, x: 40, y: 0 },
      { kind: 'point', id: 3, x: 40, y: 20 }, { kind: 'point', id: 4, x: 0, y: 20 },
      { kind: 'line', id: 5, p1: 1, p2: 2 }, { kind: 'line', id: 6, p1: 2, p2: 3 },
      { kind: 'line', id: 7, p1: 3, p2: 4 }, { kind: 'line', id: 8, p1: 4, p2: 1 },
    ];
    expect(chainBuilt(rectangle, [5, 6, 7, 8])).toEqual({ ok: false, error: 'unsupportedChain' });

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
