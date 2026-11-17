/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * Onshape 单尺寸工具推断（2026-11-02）：一个「尺寸」按钮，不再有长度/半径
 * 下拉。按用户拾取的实体动态决定结果：
 * - 单线 + 放置点击 → length
 * - 单圆 + 放置点击 → diameter；单弧 → radius
 * - 两个 point/line 实体 → distance（点-点 / 点-线 / 线-线；线-线平行语义由
 *   后端求解器裁决）
 * - 两条**非平行**线 → angle（W22 2026-11-16 live：两非平行线生成角度尺寸）；
 *   平行线保持 distance（无 live 证据，不发明平行线角度语义）
 * - 单点、两圆/两弧 → invalid（不伪造尺寸）
 *
 * 纯函数：工具状态机与单测共用；refs 原样透传给 dimensionCandidate 值确认桥。
 *
 * W21（2026-11-16 live S1c）：`findExistingDimensionConstraint` 是「点击已标注
 * 几何 → 打开既有尺寸对话框」的纯匹配器——同一实体（或同一对引用）已有尺寸时
 * 不再追加第二条。圆/弧的半径与直径是同一实体的等价测量，命中既有约束时以
 * 约束自身的 kind/value 为准（已有直径标注的圆不得再生成半径尺寸）。
 *
 * W31-A（2026-11-17 live）：`withConstraintDriven` 生成尺寸菜单「更改为驱动/
 * 从动尺寸」后的约束集——整体覆写 updateSketch 的载荷投影：保序、保 id/refs/
 * value；`nextDriven=false` **删除** `driven` 键（不写 false，与 shared/
 * ScenarioReplay「仅 true 才携带」口径一致）。
 */
import type { SketchConstraintDto, SketchRef } from '@luban-cad/shared';
import { EDITABLE_CONSTRAINT_KINDS } from '../../internal/sketch-dimension-value.js';
import type { SketchPick } from './sketch-constraint-logic.js';

export type DimensionKind = Extract<
  SketchConstraintDto['kind'],
  'length' | 'radius' | 'diameter' | 'distance' | 'angle'
>;

/**
 * 两线「平行」判定阈值（度，2026-11-16 W22）：夹角由 `lineAngleDeg` 给出
 *（0–90 锐角口径——反向 ~180° 也归一到 ~0°）。不大于本阈值视为平行 →
 * 保持既有 distance 语义；大于则按 live 证据推断 angle。浮点求解噪声
 *（acos 在 cos≈1 处放大）远小于该阈值。
 */
export const PARALLEL_LINE_ANGLE_MAX_DEG = 1e-4;

/** 可编辑尺寸种类（后端 updateSketchConstraint 白名单的尺寸子集）。 */
export type EditableDimensionKind = Extract<
  SketchConstraintDto['kind'],
  'distance' | 'radius' | 'diameter' | 'length' | 'angle'
>;

/** 命中既有尺寸约束的窄化形态：kind 保证在可编辑尺寸集合内。 */
export type ExistingDimensionConstraint = SketchConstraintDto & { kind: EditableDimensionKind };

export type DimensionCompletion =
  | { kind: 'pending' }
  | { kind: 'invalid'; reason: string }
  | { kind: DimensionKind; refs: SketchConstraintDto['refs']; entityIds: number[] };

function sameRef(a: SketchPick['ref'], b: SketchPick['ref']): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function firstEntityIds(picks: readonly SketchPick[]): number[] {
  return picks.flatMap((pick) => (pick.entityId === undefined ? [] : [pick.entityId]));
}

function singleDimension(pick: SketchPick): DimensionCompletion {
  switch (pick.kind) {
    case 'line':
      return { kind: 'length', refs: [pick.ref], entityIds: firstEntityIds([pick]) };
    case 'circle':
      // v1.23（ADR-0004）：Onshape 圆默认直径尺寸；弧默认半径。
      return { kind: 'diameter', refs: [pick.ref], entityIds: firstEntityIds([pick]) };
    case 'arc':
      return { kind: 'radius', refs: [pick.ref], entityIds: firstEntityIds([pick]) };
    case 'point':
      return { kind: 'invalid', reason: 'singlePoint' };
    default:
      return { kind: 'invalid', reason: 'unsupported' };
  }
}

/**
 * @param picks 已拾取实体（最多 2）
 * @param placementClick 本次点击是否落在空白处（Onshape 尺寸放置点击）
 * @param twoLineAngleDeg 两线拾取时的夹角（度）；由工具用既有 `lineAngleDeg`
 *   测量后传入。undefined=几何不可解析（保持旧 distance 行为，不猜角度）。
 *   W22：非平行线（角度 > `PARALLEL_LINE_ANGLE_MAX_DEG`）→ angle，平行线 →
 *   既有 distance。
 */
export function inferDimensionCompletion(
  picks: readonly SketchPick[],
  placementClick: boolean,
  twoLineAngleDeg?: number,
): DimensionCompletion {
  if (picks.length === 0) return { kind: 'pending' };
  if (picks.length === 1) {
    if (!placementClick) return { kind: 'pending' };
    return singleDimension(picks[0]!);
  }
  if (picks.length > 2) return { kind: 'invalid', reason: 'tooManyPicks' };

  const [a, b] = picks as [SketchPick, SketchPick];
  if (sameRef(a.ref, b.ref)) return singleDimension(a);
  // W22（live 2026-11-16）：两非平行线 → 角度尺寸（度值对话框；契约存弧度）。
  // 平行线（含反向 ~180° → 锐角口径 ~0°）保持既有 distance；角度不可测时
  // 同样回退 distance（旧语义，不伪造）。
  if (
    a.kind === 'line'
    && b.kind === 'line'
    && twoLineAngleDeg !== undefined
    && Number.isFinite(twoLineAngleDeg)
    && twoLineAngleDeg > PARALLEL_LINE_ANGLE_MAX_DEG
  )
    return { kind: 'angle', refs: [a.ref, b.ref], entityIds: firstEntityIds(picks) };
  const distanceKinds = new Set(['point', 'line']);
  if (distanceKinds.has(a.kind) && distanceKinds.has(b.kind))
    return { kind: 'distance', refs: [a.ref, b.ref], entityIds: firstEntityIds(picks) };
  // 两圆/两弧、圆+线等暂不支持距离（后端 distance 槽位只接受 point/line）。
  return { kind: 'invalid', reason: 'unsupportedPair' };
}

// ---------------------------------------------------------------------------
// W21（2026-11-16 live S1c）：既有尺寸匹配
// ---------------------------------------------------------------------------

/**
 * 可编辑尺寸的槽位形态（与后端 updateSketchConstraint 白名单一致）。
 * `driven`（参考尺寸）不在 W21 范围：参考尺寸只读，不得经本通道改值。
 */
/** 单实体尺寸种类（长度/半径/直径）：refs 恰一条。 */
const SINGLE_REF_KINDS: ReadonlySet<SketchConstraintDto['kind']> = new Set(['length', 'radius', 'diameter']);

/** 单实体等价：同种类，或圆/弧的半径↔直径（同一实体的等价测量）。 */
function equivalentSingleKind(a: EditableDimensionKind, b: EditableDimensionKind): boolean {
  if (a === b) return true;
  return (a === 'radius' && b === 'diameter') || (a === 'diameter' && b === 'radius');
}

/** 引用指向的实体 id（数字=整实体；结构化 ref=entity；origin 无实体）。 */
function refEntityId(ref: SketchRef): number | undefined {
  if (typeof ref === 'number') return ref;
  return 'entity' in ref ? ref.entity : undefined;
}

/** 引用归一化文本（数字 → entity:<id>；结构化 → entity:<id>:<part>[:index]）。 */
function normalizedRef(ref: SketchRef): string {
  if (typeof ref === 'number') return `entity:${ref}`;
  if ('origin' in ref) return 'origin';
  const index = 'index' in ref ? `:${ref.index}` : '';
  return `entity:${ref.entity}:${ref.part}${index}`;
}

/** 两引用顺序无关的规范化相等（distance/angle 槽位；origin 参与比较）。 */
function sameRefPair(a: readonly SketchRef[], b: readonly SketchRef[]): boolean {
  const [a0, a1, b0, b1] = [a[0], a[1], b[0], b[1]];
  if (a0 === undefined || a1 === undefined || b0 === undefined || b1 === undefined) return false;
  const [na0, na1, nb0, nb1] = [normalizedRef(a0), normalizedRef(a1), normalizedRef(b0), normalizedRef(b1)];
  return (na0 === nb0 && na1 === nb1) || (na0 === nb1 && na1 === nb0);
}

/**
 * W31-A：驱动的约束集投影（尺寸菜单驱动/从动切换的 updateSketch 载荷）。
 *
 * - 保序、保 id/refs/value（只动目标约束的 `driven` 键）；
 * - `nextDriven=true` → 目标约束写 `driven: true`；
 * - `nextDriven=false` → **删除** `driven` 键（不写 `false`：shared/ScenarioReplay
 *   只在 true 时携带该字段）；
 * - 未命中 `constraintId` → 原数组副本（调用方另行守卫，不产生写请求）。
 */
export function withConstraintDriven(
  constraints: readonly SketchConstraintDto[],
  constraintId: number,
  nextDriven: boolean,
): SketchConstraintDto[] {
  return constraints.map((constraint) => {
    if (constraint.id !== constraintId) return constraint;
    if (nextDriven)
      return { ...constraint, driven: true };
    const next: SketchConstraintDto = { ...constraint };
    delete (next as { driven?: boolean }).driven;
    return next;
  });
}

/**
 * 查找本次尺寸完成所对应的既有约束（live S1c）：命中时尺寸工具打开**该约束**
 * 的值对话框并在确认时原地改值，而不是追加第二条尺寸。
 *
 * 匹配规则（纯函数，与工具/浮层解耦）：
 * - 只考虑可编辑尺寸种类（distance/radius/diameter/length/angle）且非
 *   `driven` 参考尺寸；
 * - 单引用完成（length/radius/diameter）：同实体（数字 id 与 `{entity}` 按实体
 *   id 等价）；radius↔diameter 视为同一实体的等价测量（返回约束自身种类）；
 * - 两引用完成（distance/angle）：同种类且两条 refs 顺序无关地归一化相等；
 * - 多条命中 → 返回 id 最小者（确定性；正常草图同一实体只有一条驱动尺寸）。
 *
 * 未命中/空草稿返回 undefined（调用方走「测量并新建」路径）。
 */
export function findExistingDimensionConstraint(
  constraints: readonly SketchConstraintDto[],
  completion: { kind: EditableDimensionKind; refs: readonly SketchRef[] },
): ExistingDimensionConstraint | undefined {
  let best: ExistingDimensionConstraint | undefined;
  for (const constraint of constraints) {
    // 参考（driven）尺寸只读：W21 只编辑驱动尺寸，不把参考尺寸变成可编辑。
    if (constraint.driven === true) continue;
    const kind = constraint.kind;
    if (!EDITABLE_CONSTRAINT_KINDS.has(kind)) continue;
    const editableKind = kind as EditableDimensionKind;

    if (completion.refs.length === 1) {
      if (!SINGLE_REF_KINDS.has(kind) || constraint.refs.length !== 1) continue;
      if (!equivalentSingleKind(editableKind, completion.kind)) continue;
      const existingEntity = refEntityId(constraint.refs[0]!);
      const pickedEntity = refEntityId(completion.refs[0]!);
      if (existingEntity === undefined || pickedEntity === undefined || existingEntity !== pickedEntity) continue;
    } else if (completion.refs.length === 2) {
      if (editableKind !== completion.kind || constraint.refs.length !== 2) continue;
      if (!sameRefPair(constraint.refs, completion.refs)) continue;
    } else {
      continue;
    }

    if (!best || constraint.id < best.id) best = constraint as ExistingDimensionConstraint;
  }
  return best;
}
