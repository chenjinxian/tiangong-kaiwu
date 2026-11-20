// ADR-0022 §2.8 扩展（live 2026-11-20 S2o）：多连通分量联动等宽槽。
// - C：3 点弧 + 不相连直线 → 两条独立槽（弧槽 + 体育场），共享单 Ø。
// - B2：2 相连线（链）+ 1 独立线 → 链槽 + 独立体育场，共享单 Ø。
// - 混合选择中含闭合环（slotWidth 语义）→ 拒收。
import { describe, expect, it } from 'vitest';
import type { SketchEntityDto } from '@luban-cad/shared';
import {
  buildComponentsSlotDraft,
  slotMemberComponents,
} from '../tools/sketch/sketch-slot-components-logic.js';

type ArcEntity = Extract<SketchEntityDto, { kind: 'arc' }>;
type PointEntity = Extract<SketchEntityDto, { kind: 'point' }>;

const arcLineSketch = (): SketchEntityDto[] => [
  { kind: 'point', id: 1, x: 0, y: 0 },
  { kind: 'arc', id: 2, center: 1, radius: 30, startAngle: 0, sweepAngle: Math.PI },
  { kind: 'point', id: 3, x: 100, y: 0 },
  { kind: 'point', id: 4, x: 160, y: 0 },
  { kind: 'line', id: 5, p1: 3, p2: 4 },
];

const chainLineSketch = (): SketchEntityDto[] => [
  { kind: 'point', id: 1, x: 0, y: 0 },
  { kind: 'point', id: 2, x: 40, y: 0 },
  { kind: 'point', id: 3, x: 40, y: 30 },
  { kind: 'line', id: 4, p1: 1, p2: 2 },
  { kind: 'line', id: 5, p1: 2, p2: 3 },
  { kind: 'point', id: 6, x: 100, y: 0 },
  { kind: 'point', id: 7, x: 140, y: 0 },
  { kind: 'line', id: 8, p1: 6, p2: 7 },
];

const built = (entities: SketchEntityDto[], ids: number[], startId = 100) => {
  const components = slotMemberComponents(entities, ids);
  if (!components) throw new Error('components missing');
  const result = buildComponentsSlotDraft({ components, entities, width: 20, startId });
  if (!result.ok) throw new Error(result.error);
  return { components, draft: result.draft };
};

describe('slotMemberComponents（S2o 分量拆分）', () => {
  it('弧 + 不相连直线 → 2 个单成员分量', () => {
    expect(slotMemberComponents(arcLineSketch(), [2, 5])).toEqual([[2], [5]]);
  });

  it('相连 2 线 + 独立线 → 1 个链分量 + 1 个单成员分量', () => {
    expect(slotMemberComponents(chainLineSketch(), [4, 5, 8])).toEqual([[4, 5], [8]]);
  });

  it('非 line/arc 或被选中却缺失的 id → undefined', () => {
    const entities: SketchEntityDto[] = [...arcLineSketch(),
      { kind: 'circle', id: 9, center: { x: 0, y: 0 }, radius: 10 }];
    expect(slotMemberComponents(entities, [2, 9])).toBeUndefined();
    expect(slotMemberComponents(entities, [2, 99])).toBeUndefined();
  });
});

describe('buildComponentsSlotDraft（S2o 分量联动槽）', () => {
  it('C：弧槽 + 线体育场，单 diameter + 跨分量 equal', () => {
    const { draft } = built(arcLineSketch(), [2, 5]);
    const arcs = draft.entities.filter((e): e is ArcEntity => e.kind === 'arc');
    const lines = draft.entities.filter((e) => e.kind === 'line');
    const points = draft.entities.filter((e): e is PointEntity => e.kind === 'point');
    expect(lines).toHaveLength(2); // 线槽两边界
    expect(arcs).toHaveLength(6); // 弧偏移 2 + 弧帽 2 + 线帽 2
    expect(points).toHaveLength(4); // 弧帽心 2 + 线帽心 2
    const radii = arcs.map((a) => Math.round((a.radius ?? 0) * 1e6) / 1e6).sort((x, y) => x - y);
    expect(radii).toEqual([10, 10, 10, 10, 20, 40]);
    const kinds = draft.constraints.map((c) => c.kind);
    expect(kinds.filter((k) => k === 'diameter')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'equal')).toHaveLength(3);
    expect(kinds.filter((k) => k === 'concentric')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'parallel')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'tangent')).toHaveLength(8);
    expect(draft.constraints).toHaveLength(28);
    expect(draft.slotWidthConstraintId).toBeUndefined();
  });

  it('B2：链槽（2 段 + 转角弧）+ 独立体育场，单 Ø', () => {
    const { draft } = built(chainLineSketch(), [4, 5, 8]);
    const arcs = draft.entities.filter((e): e is ArcEntity => e.kind === 'arc');
    const lines = draft.entities.filter((e) => e.kind === 'line');
    expect(lines).toHaveLength(6); // 链 4 + 独立线 2
    expect(arcs).toHaveLength(5); // 链 2 帽 + 1 转角 + 独立线 2 帽
    for (const arc of arcs) expect(arc.radius).toBeCloseTo(10, 9);
    // 转角弧心 = 链折点 (40,0)。
    const corner = arcs.find((a) => {
      const center = draft.entities.find((e) => e.id === a.center);
      return center?.kind === 'point'
        && Math.hypot((center.x ?? NaN) - 40, (center.y ?? NaN) - 0) < 1e-6;
    });
    expect(corner, '链折点转角弧').toBeDefined();
    const kinds = draft.constraints.map((c) => c.kind);
    expect(kinds.filter((k) => k === 'diameter')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'equal')).toHaveLength(4);
    expect(kinds.filter((k) => k === 'parallel')).toHaveLength(6);
    expect(kinds.filter((k) => k === 'tangent')).toHaveLength(10);
    expect(draft.constraints).toHaveLength(38);
  });

  it('拒绝：混合选择中含闭合环（slotWidth 语义），以及零宽', () => {
    // 60×40 矩形闭合环（w20 可解）+ 独立线；环分量使用 slotWidth → 合并拒收。
    const ringPlusLine: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 60, y: 0 },
      { kind: 'point', id: 3, x: 60, y: 40 },
      { kind: 'point', id: 4, x: 0, y: 40 },
      { kind: 'line', id: 5, p1: 1, p2: 2 },
      { kind: 'line', id: 6, p1: 2, p2: 3 },
      { kind: 'line', id: 7, p1: 3, p2: 4 },
      { kind: 'line', id: 8, p1: 4, p2: 1 },
      { kind: 'point', id: 9, x: 100, y: 0 },
      { kind: 'point', id: 10, x: 140, y: 0 },
      { kind: 'line', id: 11, p1: 9, p2: 10 },
    ];
    const components = slotMemberComponents(ringPlusLine, [5, 6, 7, 8, 11])!;
    expect(components).toHaveLength(2);
    expect(buildComponentsSlotDraft({ components, entities: ringPlusLine, width: 20, startId: 100 }))
      .toEqual({ ok: false, error: 'unsupportedChain' });
    const two = slotMemberComponents(arcLineSketch(), [2, 5])!;
    expect(buildComponentsSlotDraft({ components: two, entities: arcLineSketch(), width: 0, startId: 100 }))
      .toEqual({ ok: false, error: 'zeroWidth' });
  });
});
