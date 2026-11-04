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
 */
import type { SketchConstraintDto } from '@luban-cad/shared';
import type { SketchPick } from './sketch-constraint-logic.js';

export type DimensionKind = Extract<SketchConstraintDto['kind'], 'length' | 'radius' | 'diameter' | 'distance'>;

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
