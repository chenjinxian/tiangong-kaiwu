// ADR-0022 S2 首切片：单直线槽几何/约束闭式草稿单测。
// 基准 = live 私有证据 sketch1-slot.dxf：中线 (90,25)→(-90,25)、width 20 →
// 边界 y=15/35、两帽 r=10（右帽 270→90、左帽 90→270）、原中线保留。
import { describe, expect, it } from 'vitest';
import type { SketchEntityDto } from '@luban-cad/shared';
import { DEFAULT_SLOT_WIDTH, buildLineSlotDraft } from '../tools/sketch/sketch-slot-logic.js';

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
