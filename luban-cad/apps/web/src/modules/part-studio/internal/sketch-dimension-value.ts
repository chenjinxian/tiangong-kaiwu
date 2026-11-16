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
 *
 * 2026-11-16 W17（live 尺寸对话框）：长度类初值精度 = 工作区显示小数 + 3
 *（本产品 mm 口径 2+3 = 5 位，去尾零）；角度显示保持旧口径。输入框内
 * ArrowUp/ArrowDown 只对长度类步进 ±1 mm（角度无 live 证据，保持默认行为）。
 */
import type { SketchConstraintDto } from '@luban-cad/shared';
import { formatSketchDimensionValue } from './sketch-annotations.js';

/** 后端 `precomputeSketchConstraint` 白名单（与私有 backend 保持同一集合）。 */
export const EDITABLE_CONSTRAINT_KINDS = new Set<SketchConstraintDto['kind']>([
  'distance', 'radius', 'diameter', 'length', 'angle',
]);

/** 长度类编辑器初值小数位（live：工作区显示小数 + 3；mm 产品 2+3 = 5）。 */
export const DIMENSION_EDITOR_DECIMALS = 5;

/** 方向键步进量（mm；live 长度类约束 ±1）。 */
export const DIMENSION_EDITOR_STEP_MM = 1;

/** 长度类格式化：最多 5 位小数、去尾零（"15.74583" / "20"）。 */
function formatEditorLengthValue(value: number): string {
  const fixed = value.toFixed(DIMENSION_EDITOR_DECIMALS);
  return fixed.replace(/\.?0+$/, '') || '0';
}

/** 约束 → 编辑器初值（angle 显示为度；其余保持毫米并提高显示精度）。 */
export function formatConstraintEditorValue(constraint: SketchConstraintDto): string {
  if (constraint.value === undefined || !Number.isFinite(constraint.value))
    return '';
  if (constraint.kind === 'angle')
    return formatSketchDimensionValue(Math.abs(constraint.value) * 180 / Math.PI);
  return formatEditorLengthValue(constraint.value);
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

/** 长度类约束可方向键步进；角度无 live 证据，保持默认行为。 */
export function isSteppableConstraintKind(kind: SketchConstraintDto['kind']): boolean {
  return kind !== 'angle';
}

export interface ConstraintEditorStepInput {
  kind: SketchConstraintDto['kind'];
  /** 当前输入文本。 */
  text: string;
  /** 打开编辑器时的初始格式化文本（与 text 相同 = 尚未编辑）。 */
  initialText: string;
  /** 约束原始值（未编辑时以它为步进基线，保留全精度）。 */
  rawValue?: number;
  /** +1 = ArrowUp，-1 = ArrowDown。 */
  direction: 1 | -1;
}

/**
 * 方向键步进（live）：文本仍是初始格式化时以约束原始值（全精度）为基线，
 * 编辑过则以 `Number(text)` 为基线；返回 `String(next)`（live 显示完整内部
 * 值，如 14.74582793）。步进不提交。角度、空文本、非数字返回 undefined
 * （调用方不拦截按键，交给输入框默认行为）。非正值不做步进侧静默抑制：
 * 输入框可显示非正值，提交仍由既有 `parseConstraintEditorValue` 拒收。
 */
export function stepConstraintEditorValue(input: ConstraintEditorStepInput): string | undefined {
  const { kind, text, initialText, rawValue, direction } = input;
  if (!isSteppableConstraintKind(kind))
    return undefined;
  const untouched = text === initialText;
  let base: number;
  if (untouched && rawValue !== undefined && Number.isFinite(rawValue)) {
    base = rawValue;
  } else {
    const trimmed = text.trim();
    if (trimmed === '')
      return undefined;
    base = Number(trimmed);
  }
  if (!Number.isFinite(base))
    return undefined;
  const next = base + direction * DIMENSION_EDITOR_STEP_MM;
  if (!Number.isFinite(next))
    return undefined;
  return String(next);
}
