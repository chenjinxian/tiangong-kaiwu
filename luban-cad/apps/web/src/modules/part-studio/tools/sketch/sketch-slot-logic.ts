/**
 * 草图槽（Slot）首切片纯逻辑（ADR-0022 S2，2026-11-19 live 探针）。
 *
 * live 语义（私有 `ui-evidence/slot-probe-20261119/` + `sketch1-slot.dxf`）：
 * - 选一条草图曲线 → 工具立即预览沿该曲线的等宽槽；默认宽 Ø20（mm 文档）。
 * - 槽 = 两条平行边界线 + 两端半圆帽；**原中线保留**（不替换/不消耗）。
 * - 宽度是直径/Ø 驱动尺寸（一个 Ø 尺寸 + 两帽等半径），改宽 → 边界与帽半径联动。
 * - 提交后一次 updateSketch 事务（可撤销）。
 *
 * 首切片范围：**单条直线**。多段相连链、圆弧中线、闭合环槽、多条独立曲线的
 * 联动等宽槽尚未采到交互证据，诚实拒收（调用方 toast），不得用近似冒充。
 */
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';

export interface SlotPoint { u: number; v: number }

/** live mm 文档默认槽宽（Onshape 预览默认 Ø20）。 */
export const DEFAULT_SLOT_WIDTH = 20;

/** 几何容差（与 offset 逻辑同量级）。 */
export const SLOT_TOL = 1e-9;

export type SlotBuildError =
  | 'unsupportedChain'
  | 'unsupportedKind'
  | 'zeroWidth'
  | 'unsolvedLine';

export interface SlotDraft {
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
  nextId: number;
  capArcIds: [number, number];
  boundaryLineIds: [number, number];
  diameterConstraintId: number;
}

/** 单条直线中线的最小输入（工具负责选链与范围裁决）。 */
export interface SlotLineSeed {
  line: SketchEntityDto & { kind: 'line' };
  entities: SketchEntityDto[];
}

interface SolvedPoint { u: number; v: number }

function indexPoints(entities: SketchEntityDto[]): Map<number, SolvedPoint> {
  const points = new Map<number, SolvedPoint>();
  for (const e of entities) {
    if (e.kind === 'point' && e.x !== undefined && e.y !== undefined)
      points.set(e.id, { u: e.x, v: e.y });
  }
  return points;
}

function resolvePoint(ref: number | { x: number; y: number }, points: Map<number, SolvedPoint>): SolvedPoint | undefined {
  return typeof ref === 'number' ? points.get(ref) : { u: ref.x, v: ref.y };
}

/**
 * 单条直线槽草稿：pA/pB 为两帽圆心点；U/D 为 ±half 边界线；capA/capB 为半圆帽。
 * 约束：帽心↔中线端点（coincident center）、边界端点↔帽端点（4 coincident）、
 * 4 tangent（帽-线）、2 parallel（边界↔中线）、1 diameter（首帽=width）、1 equal（两帽）。
 */
export function buildLineSlotDraft(input: SlotLineSeed & { width: number; startId: number }): { ok: true; draft: SlotDraft } | { ok: false; error: SlotBuildError } {
  const { line, entities, width } = input;
  if (!(width > SLOT_TOL)) return { ok: false, error: 'zeroWidth' };

  const points = indexPoints(entities);
  const a = resolvePoint(line.p1, points);
  const b = resolvePoint(line.p2, points);
  if (!a || !b) return { ok: false, error: 'unsolvedLine' };
  const dx = b.u - a.u;
  const dy = b.v - a.v;
  const len = Math.hypot(dx, dy);
  if (!(len > SLOT_TOL)) return { ok: false, error: 'unsolvedLine' };

  const half = width / 2;
  const n: SolvedPoint = { u: -dy / len, v: dx / len }; // 左法向（offset 同式）
  let nextId = input.startId;
  const alloc = (): number => nextId++;

  const pA = alloc();
  const pB = alloc();
  const uLine = alloc();
  const dLine = alloc();
  const capA = alloc();
  const capB = alloc();

  const upperAngle = Math.atan2(n.v, n.u);
  const lowerAngle = Math.atan2(-n.v, -n.u);

  const entitiesOut: SketchEntityDto[] = [
    { kind: 'point', id: pA, x: a.u, y: a.v },
    { kind: 'point', id: pB, x: b.u, y: b.v },
    {
      kind: 'line', id: uLine,
      p1: { x: a.u + n.u * half, y: a.v + n.v * half },
      p2: { x: b.u + n.u * half, y: b.v + n.v * half },
    },
    {
      kind: 'line', id: dLine,
      p1: { x: a.u - n.u * half, y: a.v - n.v * half },
      p2: { x: b.u - n.u * half, y: b.v - n.v * half },
    },
    {
      kind: 'arc', id: capA, center: pA, radius: half,
      startAngle: upperAngle, sweepAngle: Math.PI,
    },
    {
      kind: 'arc', id: capB, center: pB, radius: half,
      startAngle: lowerAngle, sweepAngle: Math.PI,
    },
  ];

  const constraints: SketchConstraintDto[] = [];
  const add = (constraint: Omit<SketchConstraintDto, 'id'>): number => {
    const id = alloc();
    constraints.push({ ...constraint, id });
    return id;
  };

  // 帽心与中线端点重合（帽心是新建 point；中线端点可为 point id 或内联点）。
  add({ kind: 'coincident', refs: [pA, { entity: line.id, part: 'start' }] });
  add({ kind: 'coincident', refs: [pB, { entity: line.id, part: 'end' }] });
  // 边界端点与帽端点重合：U start↔capA start；U end↔capB end；D start↔capA end；D end↔capB start。
  add({ kind: 'coincident', refs: [{ entity: uLine, part: 'start' }, { entity: capA, part: 'start' }] });
  add({ kind: 'coincident', refs: [{ entity: uLine, part: 'end' }, { entity: capB, part: 'end' }] });
  add({ kind: 'coincident', refs: [{ entity: dLine, part: 'start' }, { entity: capA, part: 'end' }] });
  add({ kind: 'coincident', refs: [{ entity: dLine, part: 'end' }, { entity: capB, part: 'start' }] });
  // 相切：四条（每帽×两边界）；求解器按初值就近配对端点。
  add({ kind: 'tangent', refs: [capA, uLine] });
  add({ kind: 'tangent', refs: [capB, uLine] });
  add({ kind: 'tangent', refs: [capA, dLine] });
  add({ kind: 'tangent', refs: [capB, dLine] });
  // 边界与中线平行（live 字形；也锁住方向）。
  add({ kind: 'parallel', refs: [line.id, uLine] });
  add({ kind: 'parallel', refs: [line.id, dLine] });
  // 宽度：一个 Ø 驱动尺寸 + 两帽等半径（live 仅一个 Ø 标签）。
  const diameterConstraintId = add({ kind: 'diameter', refs: [capA], value: width });
  add({ kind: 'equal', refs: [capA, capB] });

  return {
    ok: true,
    draft: {
      entities: entitiesOut,
      constraints,
      nextId,
      capArcIds: [capA, capB],
      boundaryLineIds: [uLine, dLine],
      diameterConstraintId,
    },
  };
}
