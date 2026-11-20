// ADR-0022 S2h：线+弧混合开放链槽（live 2026-11-20 `mixed-slot.dxf`）。
// 基准：直线 (0,0)→(100,0) + 圆弧 c=(50,0) r50 a0=0° sweep=+90°（在 (100,0)
// 处以 +90° 相连接）。槽 Ø20：
// - 外侧（右）转角弧 c=(100,0) r10 −90°→0°；内侧（左）线/弧偏移交点
//   (88.7298,10)，左偏移弧 r40 从 14.4775° 到 90°、右偏移弧 r60 0°→90°；
// - 起点帽 c=(0,0) 从左侧 90° 扫 180°；终点帽 c=(50,50) 从右侧 90° 扫 180°；
// - 单 diameter + 2 equal（终点帽/转角弧）。
import { describe, expect, it } from 'vitest';
import type { SketchEntityDto } from '@luban-cad/shared';
import {
  buildMixedChainSlotDraft,
  mixedChainFromSelection,
} from '../tools/sketch/sketch-slot-mixed-logic.js';

/** 直线 3 + 圆弧 5（在 (100,0) 相连；圆弧按 authored 方向 start→end 遍历）。 */
function mixedSketch(): SketchEntityDto[] {
  return [
    { kind: 'point', id: 1, x: 0, y: 0 },
    { kind: 'point', id: 2, x: 100, y: 0 },
    { kind: 'line', id: 3, p1: 1, p2: 2 },
    { kind: 'point', id: 4, x: 50, y: 0 },
    { kind: 'arc', id: 5, center: 4, radius: 50, startAngle: 0, sweepAngle: Math.PI / 2 },
  ];
}

const built = (width = 20) => {
  const entities = mixedSketch();
  const chain = mixedChainFromSelection(entities, [3, 5]);
  if (!chain) throw new Error('chain missing');
  return { entities, chain, result: buildMixedChainSlotDraft({ chain, entities, width, startId: 10 }) };
};

type ArcEntity = Extract<SketchEntityDto, { kind: 'arc' }>;
const arcOf = (entities: SketchEntityDto[], id: number): ArcEntity => {
  const found = entities.find((e) => e.id === id);
  if (!found || found.kind !== 'arc') throw new Error(`arc ${id} missing`);
  return found;
};

describe('mixedChainFromSelection（S2h 线+弧链排序）', () => {
  it('line + arc 在线上末端相连：2 成员，顶点 (0,0)→(100,0)→(50,50)', () => {
    const { chain } = built();
    expect(chain.members.map((m) => [m.kind, m.entryPart, m.exitPart])).toEqual([
      ['line', 'start', 'end'],
      ['arc', 'start', 'end'],
    ]);
    expect(chain.vertices.map((v) => [v.u, v.v])).toEqual([[0, 0], [100, 0], [50, 50]]);
  });

  it('诚实拒收：纯直线、断开、完整圆、反向遍历弧', () => {
    const entities = mixedSketch();
    expect(mixedChainFromSelection(entities, [3])).toBeUndefined();
    // 纯直线（两条相连线）。
    const onlyLines: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 10, y: 0 },
      { kind: 'point', id: 3, x: 10, y: 10 },
      { kind: 'line', id: 4, p1: 1, p2: 2 },
      { kind: 'line', id: 5, p1: 2, p2: 3 },
    ];
    expect(mixedChainFromSelection(onlyLines, [4, 5])).toBeUndefined();
    // 断开。
    const apart = mixedSketch().map((e) =>
      e.id === 4 && e.kind === 'point' ? { ...e, y: 200 } : e);
    expect(mixedChainFromSelection(apart, [3, 5])).toBeUndefined();
    // 完整圆（sweep 2π）。
    const full = mixedSketch().map((e) =>
      e.id === 5 && e.kind === 'arc' ? { ...e, sweepAngle: 2 * Math.PI } : e);
    expect(mixedChainFromSelection(full, [3, 5])).toBeUndefined();
    // 反向遍历弧：弧的末端与直线末端相连（entry 应为 end → 拒收）。
    const reversed = mixedSketch().map((e) =>
      e.id === 5 && e.kind === 'arc'
        ? { ...e, startAngle: Math.PI / 2, sweepAngle: -Math.PI / 2 }
        : e);
    expect(mixedChainFromSelection(reversed, [3, 5])).toBeUndefined();
  });
});

describe('buildMixedChainSlotDraft（S2h 混合链槽）', () => {
  it('Ø20：3 点 + 2 边界线 + 5 弧（2 偏移/2 帽/1 转角）+ 单 diameter + 2 equal', () => {
    const { result } = built();
    if (!result.ok) throw new Error(result.error);
    const { draft } = result;
    expect(draft.entities.filter((e) => e.kind === 'point').map((p) => (p.kind === 'point' ? [p.id, p.x, p.y] : [])))
      .toEqual([[14, 0, 0], [21, 50, 50], [28, 100, 0]]);
    expect(draft.entities.filter((e) => e.kind === 'line')).toHaveLength(2);
    expect(draft.entities.filter((e) => e.kind === 'arc')).toHaveLength(5);
    expect(draft.capArcIds).toEqual([15, 22]);
    expect(draft.cornerArcIds).toEqual([29]);
    expect(draft.boundaryLineIds).toEqual([10, 11, 12, 13]);
    const kinds = draft.constraints.map((c) => c.kind);
    expect(kinds.filter((k) => k === 'diameter')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'equal')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'parallel')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'concentric')).toHaveLength(2);
    const diameter = draft.constraints.find((c) => c.kind === 'diameter')!;
    expect(diameter.value).toBe(20);
    expect(diameter.refs).toEqual([15]);
    // 源实体原样保留（追加语义）。
    expect(draft.entities.some((e) => e.id === 3 || e.id === 5)).toBe(false);
  });

  it('几何：内侧交点裁剪 + 外侧转角弧 + 两帽方向（背离链体）', () => {
    const { result } = built();
    if (!result.ok) throw new Error(result.error);
    const { draft } = result;
    const lineCoords = draft.entities.filter((e) => e.kind === 'line').map((l) => {
      if (l.kind !== 'line') throw new Error('kind');
      const p = (ref: unknown) => ref as { x: number; y: number };
      return [p(l.p1).x, p(l.p1).y, p(l.p2).x, p(l.p2).y];
    });
    expect(lineCoords[0]![0]).toBeCloseTo(0, 6);
    expect(lineCoords[0]![1]).toBeCloseTo(10, 6);
    expect(lineCoords[0]![2]).toBeCloseTo(88.72983346, 6);
    expect(lineCoords[0]![3]).toBeCloseTo(10, 6);
    expect(lineCoords[1]).toEqual([0, -10, 100, -10]);
    // 左偏移弧 r40：start = 派生交点角（14.4775°），end 90°。
    const leftArc = arcOf(draft.entities, 11);
    expect(leftArc.radius).toBeCloseTo(40, 6);
    expect(leftArc.startAngle).toBeCloseTo(Math.atan2(10, 38.72983346), 6);
    expect(leftArc.startAngle! + leftArc.sweepAngle!).toBeCloseTo(Math.PI / 2, 6);
    const rightArc = arcOf(draft.entities, 13);
    expect(rightArc.radius).toBeCloseTo(60, 6);
    expect(rightArc.startAngle).toBeCloseTo(0, 6);
    expect(rightArc.sweepAngle).toBeCloseTo(Math.PI / 2, 6);
    // 转角弧：c=(100,0) r10，−90° 扫 +90°。
    const corner = arcOf(draft.entities, 29);
    expect(corner.center).toBe(28);
    expect(corner.startAngle).toBeCloseTo(-Math.PI / 2, 6);
    expect(corner.sweepAngle).toBeCloseTo(Math.PI / 2, 6);
    // 起点帽：左侧 90° 扫 180°；终点帽：右侧 90° 扫 180°（背离链体）。
    const startCap = arcOf(draft.entities, 15);
    expect(startCap.center).toBe(14);
    expect(startCap.startAngle).toBeCloseTo(Math.PI / 2, 6);
    expect(startCap.sweepAngle).toBeCloseTo(Math.PI, 6);
    const endCap = arcOf(draft.entities, 22);
    expect(endCap.center).toBe(21);
    expect(endCap.startAngle).toBeCloseTo(Math.PI / 2, 6);
    expect(endCap.sweepAngle).toBeCloseTo(Math.PI, 6);
  });

  it('错误：零宽 → zeroWidth；弧半径不足半宽 → degenerateRadius', () => {
    const entities = mixedSketch();
    const chain = mixedChainFromSelection(entities, [3, 5])!;
    expect(buildMixedChainSlotDraft({ chain, entities, width: 0, startId: 10 }))
      .toEqual({ ok: false, error: 'zeroWidth' });
    // 宽度 120 → 半宽 60 > 弧半径 50：偏移弧 R−60 为负 → 拒收。
    expect(buildMixedChainSlotDraft({ chain, entities, width: 120, startId: 10 }))
      .toEqual({ ok: false, error: 'degenerateRadius' });
  });
});
