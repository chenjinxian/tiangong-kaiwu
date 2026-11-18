/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 特征数值字段表达式本地预校验（ADR-0020 S4c）。
 *
 * 覆盖 S4b 之后的全部 typed 数值字段（shared 1.74）：fillet `radiusExpression`
 * （length）、shell `defaultDistanceExpression`（signedLength）、hole
 * `diameterExpression`/`depthExpression`（length）、extrude 附加四键
 * （secondDirection 长度 / startOffset 有符号长度 / thin 厚度 / draft 角度）、
 * revolve `angleExpression`（度→弧度）。
 *
 * 与后端 `FeatureExpressionResolution` 同序：先求值（变量表 → 表达式；语法/
 * 未知变量/循环等 shared 错误搬运为结构化 `expression` 错误并携带 detail/归因
 * 字段，由 UI 本地化），再做**变量类型门**（length 类 length/number/any；
 * angle 类 angle/number/any；未声明 type 按 length）。
 *
 * 纯数字通道不携带 expression（提交时删除对应键）；各字段的领域约束
 * （>0 / 非零 |deg|<89 / 0<deg<=360 / 非 fullRevolve 等）由调用方通过
 * `validate` 传入——角度类 validate 收到**度**值；`angleRadFromDeg` 求值后
 * ×π/180 返回契约弧度。
 *
 * 错误模型：本地错误只给**错误码**（empty/invalidValue/invalidAngle/variableType），
 * 由 UI 做 i18n 映射（`expressionFieldErrorI18nKey` / `expressionFieldMessage`）；
 * shared 求值错误按 `expression` 码搬运**结构化 detail/归因字段**（S5），
 * `expressionFieldMessage` 用 `expressionFailureMessage` 做 zh/en 本地化（不再
 * 直出中文 message）。变量量纲错误**不拼中文**，只带 variableName/variableType
 * （P0-07 契约边界）。
 */
import {
  collectVariableReferences,
  evaluateExpression,
  evaluateVariableTable,
  type ExpressionErrorCode,
  type ExpressionErrorDetail,
  type VariableDto,
  type VariableType,
} from '@luban-cad/shared';
import { formatFixedHalfUp } from './decimal-format.js';
import { expressionFailureMessage, expressionFailureToLocal } from './expression-error-message.js';
import { isNumericDimensionText } from './sketch-dimension-expression.js';

/** 特征表达式字段量纲类别。 */
export type ExpressionFieldKind = 'length' | 'signedLength' | 'angleDeg' | 'angleRadFromDeg';

export interface FeatureExpressionFieldInput {
  kind: ExpressionFieldKind;
  /** 当前输入文本（纯数字或表达式原文）。 */
  text: string;
  variables?: readonly VariableDto[];
  /**
   * 字段领域校验（长度类收到 mm；角度类收到**度**）。返回 false → 对应
   * invalidValue / invalidAngle。模块本身只做有限性/正数（length）检查。
   */
  validate?: (value: number) => boolean;
}

/**
 * 特征字段本地错误：
 * - `empty` / `invalidValue` / `invalidAngle`：本地域错误（可含 message 供调用方覆盖）；
 * - `variableType`：引用变量的量纲与字段不兼容（带 name/type，消息由 i18n 组装）；
 * - `expression`：shared 求值器错误（携带 `detail/position/attributedVariable/
 *   referenceChain`，UI 走 `expressionFailureMessage` 本地化；message 仅兼容保留）。
 */
export type FeatureExpressionFieldError =
  | {
    code: 'empty' | 'invalidValue' | 'invalidAngle';
    message?: string;
    variableName?: string;
    variableType?: string;
  }
  | {
    code: 'variableType';
    message?: string;
    variableName?: string;
    variableType?: string;
  }
  | {
    code: 'expression';
    message: string;
    /** 包装前的 shared 错误码（P2-1：empty 语义丢失防线）。 */
    sourceCode?: ExpressionErrorCode;
    position?: number;
    detail?: ExpressionErrorDetail;
    attributedVariable?: string;
    referenceChain?: string[];
  };

export type FeatureExpressionFieldResult =
  | { ok: true; value: number; expression?: string }
  | { ok: false; error: FeatureExpressionFieldError };

/** 长度类字段可接受的变量类型（与后端 LENGTH_FIELD_VARIABLE_TYPES 同集）。 */
const LENGTH_FIELD_VARIABLE_TYPES: ReadonlySet<VariableType> = new Set(['length', 'number', 'any']);

/** 角度类字段可接受的变量类型（与后端 ANGLE_FIELD_VARIABLE_TYPES 同集）。 */
const ANGLE_FIELD_VARIABLE_TYPES: ReadonlySet<VariableType> = new Set(['angle', 'number', 'any']);

/** 字段量纲 → 可接受的变量类型集。 */
export function expressionFieldVariableTypes(
  kind: ExpressionFieldKind,
): ReadonlySet<VariableType> {
  return kind === 'angleDeg' || kind === 'angleRadFromDeg'
    ? ANGLE_FIELD_VARIABLE_TYPES
    : LENGTH_FIELD_VARIABLE_TYPES;
}

/** 字段量纲 → 错误文案里的期望类型串（与后端错误同序）。 */
export function expressionFieldExpectedVariableTypes(kind: ExpressionFieldKind): string {
  return kind === 'angleDeg' || kind === 'angleRadFromDeg'
    ? 'angle/number/any'
    : 'length/number/any';
}

function isAngleKind(kind: ExpressionFieldKind): boolean {
  return kind === 'angleDeg' || kind === 'angleRadFromDeg';
}

function domainError(kind: ExpressionFieldKind): FeatureExpressionFieldError {
  return isAngleKind(kind) ? { code: 'invalidAngle' } : { code: 'invalidValue' };
}

/**
 * 求值结果落域：length >0；signedLength 仅有限（允许负/零）；角度类有限且
 * 通过 `validate`（度域）。`angleRadFromDeg` 最终 ×π/180（契约弧度）。
 */
function finalize(
  kind: ExpressionFieldKind,
  rawValue: number,
  expression: string | undefined,
  validate: ((value: number) => boolean) | undefined,
): FeatureExpressionFieldResult {
  if (!Number.isFinite(rawValue))
    return { ok: false, error: domainError(kind) };
  if (kind === 'length' && !(rawValue > 0))
    return { ok: false, error: { code: 'invalidValue' } };
  if (isAngleKind(kind) && validate !== undefined && !validate(rawValue))
    return { ok: false, error: { code: 'invalidAngle' } };
  const value = kind === 'angleRadFromDeg' ? rawValue * Math.PI / 180 : rawValue;
  if (!Number.isFinite(value))
    return { ok: false, error: domainError(kind) };
  return { ok: true, value, ...(expression !== undefined ? { expression } : {}) };
}

/**
 * 特征数值字段 → 求值数 + 原文（纯数字时无 expression）。错误口径见文件头注。
 */
export function evaluateFeatureNumberField(
  input: FeatureExpressionFieldInput,
): FeatureExpressionFieldResult {
  const text = input.text.trim();
  if (text === '')
    return { ok: false, error: { code: 'empty' } };

  // 纯数字：不走变量表；按 kind 落域。
  if (isNumericDimensionText(text)) {
    const numeric = Number(text);
    return finalize(input.kind, numeric, undefined, input.validate);
  }

  // 表达式：变量表失败（语法/循环/重复名）→ 搬运 shared 结构化失败。
  let values: ReadonlyMap<string, number> | undefined;
  const variables = input.variables ?? [];
  if (variables.length > 0) {
    const table = evaluateVariableTable(variables.map((variable) => ({
      name: variable.name,
      expression: variable.expression,
    })));
    if (!table.ok)
      return { ok: false, error: expressionFailureToLocal(table) };
    values = table.values;
  }

  const evaluated = evaluateExpression(text, values);
  if (!evaluated.ok)
    return { ok: false, error: expressionFailureToLocal(evaluated) };

  // 变量类型门（先求值后门，同 S4b）：未定义引用已由求值器报 unknownVariable。
  const accepted = expressionFieldVariableTypes(input.kind);
  const types = new Map<string, VariableType>();
  for (const variable of variables)
    types.set(variable.name, variable.type ?? 'length');
  for (const name of collectVariableReferences(text)) {
    const type = types.get(name);
    if (type === undefined || accepted.has(type))
      continue;
    return {
      ok: false,
      error: { code: 'variableType', variableName: name, variableType: type },
    };
  }

  return finalize(input.kind, evaluated.value, text, input.validate);
}

/**
 * 本地错误 → i18n key；`expression` 码无 key（走 expressionFailureMessage 本地化）。
 * variablesLoading/variablesUnavailable 属 UI 附属错误（组件层），不在本模块。
 */
export function expressionFieldErrorI18nKey(
  error: FeatureExpressionFieldError,
): string | undefined {
  switch (error.code) {
    case 'variableType':
      return 'partStudio.featureDialog.expressionVariableType';
    case 'empty':
    case 'invalidValue':
      return 'partStudio.featureDialog.expressionInvalidValue';
    case 'invalidAngle':
      return 'partStudio.featureDialog.expressionInvalidAngle';
    case 'expression':
      return undefined;
  }
}

/** 表达式字段的 UI 错误（含变量表未就绪的两种附属错误）。 */
export type ExpressionFieldUiError =
  | FeatureExpressionFieldError
  | { code: 'variablesLoading' }
  | { code: 'variablesUnavailable'; message?: string };

/**
 * UI 错误 → 可直接展示的文本（组件/对话框共用；禁止裸 i18n key 出屏）。
 * - `expression`：`expressionFailureMessage` 的 zh/en 本地化（detail/归因）；
 * - `variableType`：i18n 模板（name/type/field/expected 插值）；
 * - 变量表未就绪：独立文案，绝不误报未知变量。
 */
export function expressionFieldMessage(
  error: ExpressionFieldUiError,
  kind: ExpressionFieldKind,
  t: (key: string, options?: Record<string, unknown>) => string,
  options?: { variableTypeField?: string },
): string {
  switch (error.code) {
    case 'expression':
      return expressionFailureMessage(error, t);
    case 'variableType':
      return t('partStudio.featureDialog.expressionVariableType', {
        name: error.variableName ?? '?',
        type: error.variableType ?? '?',
        field: options?.variableTypeField ?? t('partStudio.featureDialog.expressionFieldNoun'),
        expected: expressionFieldExpectedVariableTypes(kind),
      });
    case 'empty':
    case 'invalidValue':
      return t('partStudio.featureDialog.expressionInvalidValue');
    case 'invalidAngle':
      return t('partStudio.featureDialog.expressionInvalidAngle');
    case 'variablesLoading':
      return t('partStudio.featureDialog.expressionVariablesLoading');
    case 'variablesUnavailable':
      return t('partStudio.featureDialog.expressionVariablesUnavailable', {
        message: error.message ?? t('partStudio.variables.errors.unavailable'),
      });
  }
}

/**
 * 求值数 → 失焦显示投影：长度 4 位小数、角度按度（angleRadFromDeg 由弧度
 * 换算回度）；去尾零，-0 归一为 0。角度字段的请输入文本是度，与显示一致。
 */
export function formatExpressionFieldValue(kind: ExpressionFieldKind, value: number): string {
  const display = kind === 'angleRadFromDeg' ? value * 180 / Math.PI : value;
  if (!Number.isFinite(display))
    return '';
  const fixed = formatFixedHalfUp(display, 4);
  const trimmed = fixed.includes('.')
    ? fixed.replace(/0+$/, '').replace(/\.$/, '')
    : fixed;
  if (trimmed === '' || /^-0(\.0*)?$/.test(trimmed))
    return '0';
  return trimmed;
}

/**
 * 表达式草稿归位（不适用清空时）：仍是可解析数值则保留原文，否则回退字段
 * 缺省数值文本——避免重新启用字段后显示旧 `#expr` 而数值路径得到 NaN。
 */
export function numericTextOr(text: string, fallback: string): string {
  const trimmed = text.trim();
  return trimmed !== '' && Number.isFinite(Number(trimmed)) ? text : fallback;
}

/** 落库 params 中的表达式原文字段（非字符串/空白 → undefined，不伪造）。 */
export function readStoredExpression(params: unknown, key: string): string | undefined {
  if (typeof params !== 'object' || params === null)
    return undefined;
  const raw = (params as Record<string, unknown>)[key];
  return typeof raw === 'string' && raw.trim() !== '' ? raw : undefined;
}

/** 补全菜单视口夹紧输入（input rect + 菜单尺寸 + viewport 尺寸，均为 CSS px）。 */
export interface ExpressionMenuAnchorInput {
  anchor: { left: number; right: number; top: number; bottom: number };
  menu: { width: number; height: number };
  viewport: { width: number; height: number };
  /** 距 viewport 边缘的最小距离（缺省 8px）。 */
  margin?: number;
}

/**
 * 补全菜单定位（S4b 残留修复）：优先渲染在输入框下方，放不下翻到上方；
 * 左右/上下都按 viewport 夹紧（8px 边距），菜单大于 viewport 时从边缘开始。
 */
export function clampExpressionMenuPosition(
  input: ExpressionMenuAnchorInput,
): { left: number; top: number } {
  const margin = input.margin ?? 8;
  const width = Math.max(0, Math.min(input.menu.width, input.viewport.width - margin * 2));
  const height = Math.max(0, Math.min(input.menu.height, input.viewport.height - margin * 2));
  const maxLeft = Math.max(margin, input.viewport.width - width - margin);
  const maxTop = Math.max(margin, input.viewport.height - height - margin);
  const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(value, min), Math.max(min, max));

  const below = input.anchor.bottom;
  const above = input.anchor.top - height;
  const top = below + height <= input.viewport.height - margin
    ? below
    : above >= margin
      ? above
      : below;
  return {
    left: clamp(input.anchor.left, margin, maxLeft),
    top: clamp(top, margin, maxTop),
  };
}
