/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图尺寸输入：纯数字 ↔ 表达式判别与本地预校验（ADR-0020 §2.6 D3，S2）。
 *
 * - 纯数字（trim 后 `/^[+-]?(\d+(\.\d*)?|\.\d+)$/`）沿用既有
 *   `parseConstraintEditorValue`（角度按度→弧度、非正/≥180° 拒收），并**不携带**
 *   expression——提交仍走 `updateSketchConstraint` 单值通道。
 * - 其余文本（含 `#`、运算符、括号、非法数字）一律按表达式求值：先用 shared
 *   `evaluateVariableTable` 把 Part Studio 变量表求成 name→值（失败消息原样
 *   透传，如 `变量 "x": ...`），再 `evaluateExpression(text, values)`。
 * - 角度表达式按**度**书写（与界面一致），返回契约弧度；长度类（length/
 *   distance/radius/diameter）要求有限且 > 0。
 * - 求值器是纯函数、禁 eval（shared 职责）；这里只做 UI 预校验，事实源仍是
 *   params（P0-06）——后端权威求值覆盖 value。
 *
 * 错误模型（2026-11-17 评审 P2）：本地错误返回**错误码**（empty/invalidValue/
 * invalidAngle），由 UI 映射 zh-CN/en i18n 文案；shared 求值器消息（语法/未知
 * 变量/循环/非有限）按 `expression` 码原样透传（与 S1 契约一致）。
 */
import type { SketchConstraintDto, VariableDto } from '@luban-cad/shared';
import { evaluateExpression, evaluateVariableTable } from '@luban-cad/shared';
import { parseConstraintEditorValue } from './sketch-dimension-value.js';

/** 尺寸输入（kind = 约束种类；text = 用户当前文本；variables = 既有变量表）。 */
export interface DimensionExpressionInput {
  kind: SketchConstraintDto['kind'];
  text: string;
  variables?: readonly VariableDto[];
}

/** 本地错误码：空输入 / 非正（角度越界）/ shared 求值错误（消息透传）。 */
export type DimensionExpressionErrorCode = 'empty' | 'invalidValue' | 'invalidAngle' | 'expression';

export type DimensionExpressionError =
  | { code: 'empty' }
  | { code: 'invalidValue' }
  | { code: 'invalidAngle' }
  | { code: 'expression'; message: string };

export type DimensionExpressionResult =
  | { ok: true; value: number; expression?: string }
  | { ok: false; error: DimensionExpressionError };

/** 纯数字文本（允许首尾空白与正负号/小数；不支持科学计数法——按表达式处理）。 */
const NUMERIC_DIMENSION_TEXT = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/** 本地错误码 → i18n key（`expression` 码无 key，直接显示 shared 消息）。 */
export const DIMENSION_INVALID_VALUE_I18N_KEY = 'partStudio.sketch.panel.errors.invalidDimension';
export const DIMENSION_INVALID_ANGLE_I18N_KEY = 'partStudio.sketch.expression.invalidAngle';

/** 错误 → i18n key；shared 求值错误（`expression`）返回 undefined（消息透传）。 */
export function dimensionExpressionErrorI18nKey(
  error: DimensionExpressionError,
): string | undefined {
  switch (error.code) {
    case 'empty':
    case 'invalidValue':
      return DIMENSION_INVALID_VALUE_I18N_KEY;
    case 'invalidAngle':
      return DIMENSION_INVALID_ANGLE_I18N_KEY;
    case 'expression':
      return undefined;
  }
}

/** trim 后是否为纯十进制数字（`#`/运算符/括号/空串均按表达式）。 */
export function isNumericDimensionText(text: string): boolean {
  return NUMERIC_DIMENSION_TEXT.test(text.trim());
}

/**
 * 尺寸输入 → 契约值（单一预校验入口；编辑器/放置值弹层共用）。
 *
 * 数字：复用 `parseConstraintEditorValue`（角度度→弧度；非正/≥180 拒收），
 * `expression` 缺省。表达式：变量表失败 → 同一错误消息；表达式失败 → 同一
 * 错误消息；角度校验 0<deg<180 后换弧度，长度类校验 >0 且有限；成功返回
 * `expression` = trim 后的原文（提交时落库设计意图）。
 */
export function evaluateDimensionInput(input: DimensionExpressionInput): DimensionExpressionResult {
  const text = input.text.trim();
  // 空输入有独立错误码（UI 映射既有「必须为大于 0 的数值」文案，评审 P3）。
  if (text === '')
    return { ok: false, error: { code: 'empty' } };

  if (isNumericDimensionText(text)) {
    const value = parseConstraintEditorValue(input.kind, text);
    if (value !== undefined)
      return { ok: true, value };
    return {
      ok: false,
      error: { code: input.kind === 'angle' ? 'invalidAngle' : 'invalidValue' },
    };
  }

  // 表达式：变量表失败（语法/循环/重复名）→ 原样透传 shared 错误消息；
  // 未知变量由后续 evaluateExpression 报 `未知变量: #name`（同一消息面）。
  let values: ReadonlyMap<string, number> | undefined;
  const variables = input.variables ?? [];
  if (variables.length > 0) {
    const table = evaluateVariableTable(variables.map((variable) => ({
      name: variable.name,
      expression: variable.expression,
    })));
    if (!table.ok)
      return { ok: false, error: { code: 'expression', message: table.message } };
    values = table.values;
  }

  const result = evaluateExpression(text, values);
  if (!result.ok)
    return { ok: false, error: { code: 'expression', message: result.message } };

  if (input.kind === 'angle') {
    if (!(result.value > 0 && result.value < 180))
      return { ok: false, error: { code: 'invalidAngle' } };
    return { ok: true, value: result.value * Math.PI / 180, expression: text };
  }

  if (!(result.value > 0) || !Number.isFinite(result.value))
    return { ok: false, error: { code: 'invalidValue' } };
  return { ok: true, value: result.value, expression: text };
}
