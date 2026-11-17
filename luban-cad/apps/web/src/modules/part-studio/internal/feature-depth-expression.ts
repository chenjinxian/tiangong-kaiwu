/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 拉伸深度表达式本地预校验（ADR-0020 S4b 复核 P2）。
 *
 * 在 S2 通用尺寸校验（`evaluateDimensionInput`，长度语义）之上补齐 S4a 的
 * **变量类型门**：深度字段只接受 length/number/any（旧变量无 type 按 length）；
 * 引用 angle 变量必须在本地报与后端同一句错误，不得先给出可提交的毫米预览。
 *
 * 顺序与后端 `FeatureExpressionResolution.evaluateLengthFieldExpression` 一致：
 * 先求值（语法/未知变量/表循环等规范错误优先）→ 类型门。表达式无变量引用时
 * 类型门为恒真。
 *
 * 数值语法与 S2 同口径：纯十进制（允许符号/小数）走数值通道；科学计数法
 * （如 `1e3`）按表达式处理并被 shared 求值器以“非法字符 e”拒收（v1 不做单位/
 * 科学计数法解析，ADR-0020 §2.7）。
 */
import { collectVariableReferences, type VariableDto, type VariableType } from '@luban-cad/shared';
import {
  evaluateDimensionInput,
  type DimensionExpressionError,
} from './sketch-dimension-expression.js';

/** 长度类字段可接受的变量类型（与后端 LENGTH_FIELD_VARIABLE_TYPES 同集）。 */
const LENGTH_FIELD_VARIABLE_TYPES: ReadonlySet<VariableType> = new Set(['length', 'number', 'any']);

/** 深度字段本地错误：S2 尺寸错误 + 变量量纲不兼容。 */
export type FeatureDepthExpressionError =
  | DimensionExpressionError
  | { code: 'variableType'; message: string };

export type FeatureDepthExpressionResult =
  | { ok: true; value: number; expression?: string }
  | { ok: false; error: FeatureDepthExpressionError };

export interface FeatureDepthExpressionInput {
  text: string;
  variables?: readonly VariableDto[];
}

/**
 * 深度表达式 → 求值数 + 原文（纯数字时无 expression）。错误消息口径：
 * - shared 求值错误原样透传（`expression` 码）；
 * - 角度变量 → 与后端同句 `变量 #x 的类型 angle 与深度字段不兼容...`。
 */
export function evaluateFeatureDepthExpression(
  input: FeatureDepthExpressionInput,
): FeatureDepthExpressionResult {
  const evaluated = evaluateDimensionInput({
    kind: 'length',
    text: input.text,
    variables: input.variables,
  });
  if (!evaluated.ok)
    return evaluated;
  // 纯数字不携带表达式：无变量引用可查（数值直接受正数域约束）。
  if (evaluated.expression === undefined)
    return evaluated;

  const types = new Map<string, VariableType>();
  for (const variable of input.variables ?? [])
    types.set(variable.name, variable.type ?? 'length');
  for (const name of collectVariableReferences(evaluated.expression)) {
    const type = types.get(name);
    // 未定义引用已由求值器报 unknownVariable；这里只拦已定义的非法量纲。
    if (type === undefined || LENGTH_FIELD_VARIABLE_TYPES.has(type))
      continue;
    return {
      ok: false,
      error: {
        code: 'variableType',
        message: `变量 #${name} 的类型 ${type} 与深度字段不兼容（需要 length/number/any）`,
      },
    };
  }
  return evaluated;
}
