/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 尺寸数值「显示值 ↔ 契约值」转换（ADR-0018 S1e/S1h 2026-11-12）。
 *
 * 后端 updateSketchConstraint 白名单：distance/radius/diameter/length/angle。
 * 除 angle 外均为草图局部毫米值，编辑器原样显示/提交；angle 在 shared 契约中
 * 是弧度（direction-vector 语义），而 Onshape 显示度数——编辑器显示度、提交
 * 前换算回弧度，避免把用户输入的 45 当成 45 rad。
 */
import type { SketchConstraintDto } from '@luban-cad/shared';
import { formatSketchDimensionValue } from './sketch-annotations.js';

/** 后端 `precomputeSketchConstraint` 白名单（与私有 backend 保持同一集合）。 */
export const EDITABLE_CONSTRAINT_KINDS = new Set<SketchConstraintDto['kind']>([
  'distance', 'radius', 'diameter', 'length', 'angle',
]);

/** 约束 → 编辑器初值（angle 显示为度；其余保持毫米/原值）。 */
export function formatConstraintEditorValue(constraint: SketchConstraintDto): string {
  if (constraint.value === undefined || !Number.isFinite(constraint.value))
    return '';
  if (constraint.kind === 'angle')
    return formatSketchDimensionValue(Math.abs(constraint.value) * 180 / Math.PI);
  return String(constraint.value);
}

/**
 * 编辑器输入 → 契约值；非正/非有限/角度 ≥360° 返回 undefined（拒绝提交，
 * 不静默改值）。角度输入按度解释并换算为弧度。
 */
export function parseConstraintEditorValue(
  kind: SketchConstraintDto['kind'],
  input: string,
): number | undefined {
  const numeric = Number(input.trim());
  if (!Number.isFinite(numeric) || numeric <= 0)
    return undefined;
  if (kind === 'angle') {
    if (numeric >= 360)
      return undefined;
    return numeric * Math.PI / 180;
  }
  return numeric;
}
