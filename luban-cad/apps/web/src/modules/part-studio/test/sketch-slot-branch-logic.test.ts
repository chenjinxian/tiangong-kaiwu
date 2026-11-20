// ADR-0022 S2m：单毂分支链槽（live 2026-11-20 `branch-slot.dxf`）。
// 基准 = 私有 S2l 探针的精确输入/输出坐标：毂 P=(108.1568,-178.0472)，
// 尖端 A=(72.4728,-155.3391)/B=(143.8409,-155.3391)/C=(108.1568,-203.9992)，
// Ø20 → 斜接点 (118.1568,-183.5366)/(108.1568,-166.1941)/(98.1568,-183.5366)。
import { describe, expect, it } from 'vitest';
import type { SketchEntityDto } from '@luban-cad/shared';
import {
  branchChainFromSelection,
  buildBranchChainSlotDraft,
} from '../tools/sketch/sketch-slot-branch-logic.js';

const P = { x: 108.156830072403, y: -178.0471652746201 };
const A = { x: 72.47275859117508, y: -155.3391069173813 };
const B = { x: 143.8408941030502, y: -155.3391069173813 };
const C = { x: 108.156830072403, y: -203.9992213249207 };

/** 三线共点（点 1=P；11/12/13=A/B/C；线 21=P-A、22=P-B、23=P-C）。 */
function ySketch(): SketchEntityDto[] {
  return [
    { kind: 'point', id: 1, ...P },
    { kind: 'point', id: 11, ...A },
    { kind: 'point', id: 12, ...B },
    { kind: 'point', id: 13, ...C },
    { kind: 'line', id: 21, p1: 1, p2: 11 },
    { kind: 'line', id: 22, p1: 1, p2: 12 },
    { kind: 'line', id: 23, p1: 1, p2: 13 },
  ];
}

const built = (width = 20, entities = ySketch()) => {
  const chain = branchChainFromSelection(entities, [21, 22, 23]);
  if (!chain) throw new Error('branch chain missing');
  return { chain, result: buildBranchChainSlotDraft({ chain, width, startId: 100 }) };
};

const lineCoords = (entities: SketchEntityDto[]) =>
  entities.filter((e) => e.kind === 'line').map((e) => {
    if (e.kind !== 'line') throw new Error('kind');
    const p = (ref: unknown) => ref as { x: number; y: number };
    return [p(e.p1).x, p(e.p1).y, p(e.p2).x, p(e.p2).y];
  });

describe('branchChainFromSelection（S2m 单毂分支识别）', () => {
  it('三条线共点：毂 P，臂按极角 CCW 排序 C(-90°)→B(32.5°)→A(147.5°)', () => {
    const { chain } = built();
    expect(chain.hub).toEqual({ u: P.x, v: P.y });
    expect(chain.arms.map((a) => [a.line.id, a.hubPart, a.farPart])).toEqual([
      [23, 'start', 'end'],
      [22, 'start', 'end'],
      [21, 'start', 'end'],
    ]);
    expect(chain.arms.map((a) => [a.far.u, a.far.v])).toEqual([
      [C.x, C.y], [B.x, B.y], [A.x, A.y],
    ]);
  });

  it('诚实拒收：两线、开放链、自由端共点、T 形 180° 缺口、非直线', () => {
    const entities = ySketch();
    expect(branchChainFromSelection(entities, [21, 22])).toBeUndefined();
    // 开放链：P-A、A-B 相连（无三度点）。
    const openChain: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 10, y: 0 },
      { kind: 'point', id: 3, x: 20, y: 0 },
      { kind: 'line', id: 21, p1: 1, p2: 2 },
      { kind: 'line', id: 22, p1: 2, p2: 3 },
      { kind: 'line', id: 23, p1: 1, p2: 3 },
    ];
    expect(branchChainFromSelection(openChain, [21, 22, 23])).toBeUndefined();
    // 自由端共点（两条线共享尖端）。
    const sharedTip = ySketch().map((e) => e.id === 12 && e.kind === 'point' ? { ...e, y: A.y, x: A.x } : e);
    expect(branchChainFromSelection(sharedTip, [21, 22, 23])).toBeUndefined();
    // T 形：臂 0°/90°/270° → 90°→270° 缺口 180°。
    const tShape: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 11, x: 10, y: 0 },
      { kind: 'point', id: 12, x: 0, y: 10 },
      { kind: 'point', id: 13, x: 0, y: -10 },
      { kind: 'line', id: 21, p1: 1, p2: 11 },
      { kind: 'line', id: 22, p1: 1, p2: 12 },
      { kind: 'line', id: 23, p1: 1, p2: 13 },
    ];
    expect(branchChainFromSelection(tShape, [21, 22, 23])).toBeUndefined();
    // 非直线成员。
    const withArc: SketchEntityDto[] = [...ySketch(),
      { kind: 'point', id: 14, x: 0, y: 0 },
      { kind: 'arc', id: 24, center: 14, radius: 5, startAngle: 0, sweepAngle: 1 }];
    expect(branchChainFromSelection(withArc, [21, 22, 23, 24])).toBeUndefined();
  });
});

describe('buildBranchChainSlotDraft（S2m 并集轮廓）', () => {
  it('Ø20：3 帽心 + 6 边界线 + 3 个 r10 尖端帽；单 diameter + 2 equal', () => {
    const { result } = built();
    if (!result.ok) throw new Error(result.error);
    const { draft } = result;
    expect(draft.entities.filter((e) => e.kind === 'point').map((p) => (p.kind === 'point' ? [p.id, p.x, p.y] : [])))
      .toEqual([
        [100, C.x, C.y],
        [101, B.x, B.y],
        [102, A.x, A.y],
      ]);
    expect(draft.entities.filter((e) => e.kind === 'line')).toHaveLength(6);
    expect(draft.entities.filter((e) => e.kind === 'arc')).toHaveLength(3);
    expect(draft.capArcIds).toEqual([109, 110, 111]);
    expect(draft.boundaryLineIds).toHaveLength(6);
    expect(draft.cornerArcIds).toBeUndefined();
    const kinds = draft.constraints.map((c) => c.kind);
    expect(kinds.filter((k) => k === 'diameter')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'equal')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'parallel')).toHaveLength(6);
    expect(kinds.filter((k) => k === 'tangent')).toHaveLength(6);
    expect(kinds.filter((k) => k === 'coincident')).toHaveLength(12);
    const diameter = draft.constraints.find((c) => c.kind === 'diameter')!;
    expect(diameter.value).toBe(20);
    expect(diameter.refs).toEqual([109]);
    // 源实体不复制（追加语义）。
    expect(draft.entities.some((e) => e.id === 21 || e.id === 22 || e.id === 23)).toBe(false);
  });

  it('几何与 live DXF 同构：斜接点/左右边界线/尖端帽起点角', () => {
    const { result } = built();
    if (!result.ok) throw new Error(result.error);
    const lines = lineCoords(result.draft.entities);
    // 实体顺序：臂 C/B/A 各先左边界后右边界。
    const close = (actual: number[], expected: number[]) => {
      expect(actual).toHaveLength(4);
      for (let i = 0; i < 4; i++) expect(actual[i]!).toBeCloseTo(expected[i]!, 6);
    };
    // 臂 C 左边界：缺口 C→B 斜接 (118.1568,-183.5366) → 尖端左侧 (118.1568,-203.9992)。
    close(lines[0]!, [118.15683007, -183.53662191, 118.15683007, -203.99922132]);
    // 臂 C 右边界：缺口 A→C 斜接 (98.1568,-183.5366) → 尖端右侧 (98.1568,-203.9992)。
    close(lines[1]!, [98.15683007, -183.53662252, 98.15683007, -203.99922132]);
    // 臂 B 左边界：缺口 B→A 斜接 (108.1568,-166.1941) → 尖端左侧 (138.4721,-146.9025)。
    close(lines[2]!, [108.15682951, -166.1940677, 138.47213622, -146.90249393]);
    // 臂 B 右边界：缺口 C→B 斜接 (118.1568,-183.5366) → 尖端右侧 (149.2097,-163.7757)。
    close(lines[3]!, [118.15683007, -183.53662191, 149.20965199, -163.77571991]);
    // 臂 A 左边界：缺口 A→C 斜接 (98.1568,-183.5366) → 尖端左侧 (67.1040,-163.7757)。
    close(lines[4]!, [98.15683007, -183.53662252, 67.1040015, -163.77572042]);
    // 臂 A 右边界：缺口 B→A 斜接 (108.1568,-166.1941) → 尖端右侧 (77.8415,-146.9025)。
    close(lines[5]!, [108.15682951, -166.1940677, 77.84151568, -146.90249342]);
    const arcs = result.draft.entities.filter((e) => e.kind === 'arc');
    const arcOf = (i: number) => {
      const a = arcs[i];
      if (!a || a.kind !== 'arc') throw new Error('arc');
      return a;
    };
    // 尖端帽：半径 10、扫 +π；起点=右偏移点角度（live：C 180°/B −57.53°/A 57.53°）。
    expect(arcOf(0).radius).toBeCloseTo(10, 9);
    expect(arcOf(0).startAngle).toBeCloseTo(Math.PI, 6);
    expect(arcOf(0).sweepAngle).toBeCloseTo(Math.PI, 9);
    expect(arcOf(1).startAngle).toBeCloseTo(-57.52878758 * Math.PI / 180, 6);
    expect(arcOf(2).startAngle).toBeCloseTo(57.528793 * Math.PI / 180, 6);
    for (const a of [arcOf(0), arcOf(1), arcOf(2)]) expect(a.sweepAngle).toBeCloseTo(Math.PI, 9);
  });

  it('错误：零宽 → zeroWidth；宽度过大（半宽 > 臂长）→ degenerateRadius', () => {
    const entities = ySketch();
    const chain = branchChainFromSelection(entities, [21, 22, 23])!;
    expect(buildBranchChainSlotDraft({ chain, width: 0, startId: 100 }))
      .toEqual({ ok: false, error: 'zeroWidth' });
    expect(buildBranchChainSlotDraft({ chain, width: 200, startId: 100 }))
      .toEqual({ ok: false, error: 'degenerateRadius' });
  });
});
