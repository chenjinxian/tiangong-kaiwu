/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * Onshape 单尺寸工具推断（2026-11-02）：一个「尺寸」按钮，不再有长度/半径
 * 下拉。按用户拾取的实体动态决定结果：
 * - 单线 + 放置点击 → length
 * - 单圆 + 放置点击 → diameter；单弧 → radius
 * - 两个 point/line 实体 → distance（点-点 / 点-线 / 线-线；线-线平行语义由
 *   后端求解器裁决）
 * - 单点、两圆/两弧 → invalid（不伪造尺寸）
 *
 * 纯函数：工具状态机与单测共用；refs 原样透传给 dimensionCandidate 值确认桥。
 *
 * W21（2026-11-16 live S1c）：`findExistingDimensionConstraint` 是「点击已标注
 * 几何 → 打开既有尺寸对话框」的纯匹配器——同一实体（或同一对引用）已有尺寸时
 * 不再追加第二条。圆/弧的半径与直径是同一实体的等价测量，命中既有约束时以
 * 约束自身的 kind/value 为准（已有直径标注的圆不得再生成半径尺寸）。
 */
import type { SketchConstraintDto, SketchRef } from '@luban-cad/shared';
import { EDITABLE_CONSTRAINT_KINDS } from '../../internal/sketch-dimension-value.js';
import type { SketchPick } from './sketch-constraint-logic.js';

export type DimensionKind = Extract<SketchConstraintDto['kind'], 'length' | 'radius' | 'diameter' | 'distance'>;

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
 */
export function inferDimensionCompletion(
  picks: readonly SketchPick[],
  placementClick: boolean,
): DimensionCompletion {
  if (picks.length === 0) return { kind: 'pending' };
  if (picks.length === 1) {
    if (!placementClick) return { kind: 'pending' };
    return singleDimension(picks[0]!);
  }
  if (picks.length > 2) return { kind: 'invalid', reason: 'tooManyPicks' };

  const [a, b] = picks as [SketchPick, SketchPick];
  if (sameRef(a.ref, b.ref)) return singleDimension(a);
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
