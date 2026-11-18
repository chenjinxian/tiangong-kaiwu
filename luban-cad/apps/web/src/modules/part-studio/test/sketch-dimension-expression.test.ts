/**
 * ADR-0020 S2：草图尺寸输入（纯数字 ↔ 表达式）本地预校验。
 *
 * 覆盖 brief §1：数字 / 表达式 / 角度（度→弧度）/ 正负 / 未知变量 / 语法 /
 * 循环 / 空 / 角度越界；变量表错误消息原样透传 shared（`变量 "x": ...`）。
 *
 * 2026-11-17 评审 P2：本地错误返回错误码（empty/invalidValue/invalidAngle），
 * 由 UI 映射 zh/en i18n；shared 求值错误按 `expression` 码透传消息。
 */
import { describe, expect, it } from 'vitest';
import type { VariableDto } from '@luban-cad/shared';
import {
  dimensionExpressionErrorI18nKey,
  evaluateDimensionInput,
  isNumericDimensionText,
  type DimensionExpressionError,
  type DimensionExpressionResult,
} from '../internal/sketch-dimension-expression.js';

/** 已窄化的表达式错误（code='expression'）。 */
type ExpressionDimensionError = Extract<DimensionExpressionError, { code: 'expression' }>;

/**
 * 断言失败且 code='expression'（P3-1：无条件断言，避免 guarded 断言空过），
 * 并返回已窄化的错误对象。
 */
function expressionErrorOf(result: DimensionExpressionResult): ExpressionDimensionError {
  if (result.ok) throw new Error('应无效');
  expect(result.error.code).toBe('expression');
  if (result.error.code !== 'expression') throw new Error('应失败于表达式错误');
  return result.error;
}

const VARIABLES: VariableDto[] = [
  { id: 'v1', name: 'width', expression: '10' },
  { id: 'v2', name: 'height', expression: '#width * 2' },
  { id: 'v3', name: 'ang', expression: '45' },
];

describe('isNumericDimensionText', () => {
  it('纯十进制数字（空白/正负/小数）→ true', () => {
    for (const text of ['10', ' 10 ', '+2.5', '-3', '.5', '1.', '0.125'])
      expect(isNumericDimensionText(text), text).toBe(true);
  });

  it('表达式/空串/科学计数法 → false（按表达式求值）', () => {
    for (const text of ['', '   ', '#width', '#width*2', '1+2', '(10)', '1e3', 'abc', '25.4 / 2'])
      expect(isNumericDimensionText(text), text).toBe(false);
  });
});

describe('dimensionExpressionErrorI18nKey（评审 P2：错误码 → i18n key）', () => {
  it('本地码映射 zh/en 同源 key；shared 求值错误无 key（消息透传）', () => {
    expect(dimensionExpressionErrorI18nKey({ code: 'empty' }))
      .toBe('partStudio.sketch.panel.errors.invalidDimension');
    expect(dimensionExpressionErrorI18nKey({ code: 'invalidValue' }))
      .toBe('partStudio.sketch.panel.errors.invalidDimension');
    expect(dimensionExpressionErrorI18nKey({ code: 'invalidAngle' }))
      .toBe('partStudio.sketch.expression.invalidAngle');
    expect(dimensionExpressionErrorI18nKey({ code: 'expression', message: '未知变量' }))
      .toBeUndefined();
  });
});

describe('evaluateDimensionInput：纯数字', () => {
  it('长度类原样返回、无 expression', () => {
    expect(evaluateDimensionInput({ kind: 'length', text: '12.5' }))
      .toEqual({ ok: true, value: 12.5 });
    expect(evaluateDimensionInput({ kind: 'distance', text: ' 20 ' }))
      .toEqual({ ok: true, value: 20 });
  });

  it('角度按度→弧度、无 expression', () => {
    const result = evaluateDimensionInput({ kind: 'angle', text: '45' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('应有效');
    expect(result.value).toBeCloseTo(Math.PI / 4, 12);
    expect(result.expression).toBeUndefined();
  });

  it('非正/角度 ≥180° 拒收（错误码）', () => {
    expect(evaluateDimensionInput({ kind: 'length', text: '0' }))
      .toEqual({ ok: false, error: { code: 'invalidValue' } });
    expect(evaluateDimensionInput({ kind: 'radius', text: '-5' }))
      .toEqual({ ok: false, error: { code: 'invalidValue' } });
    expect(evaluateDimensionInput({ kind: 'angle', text: '180' }))
      .toEqual({ ok: false, error: { code: 'invalidAngle' } });
    expect(evaluateDimensionInput({ kind: 'angle', text: '0' }))
      .toEqual({ ok: false, error: { code: 'invalidAngle' } });
  });
});

describe('evaluateDimensionInput：表达式', () => {
  it('纯算术表达式返回求值数与原文（trim）', () => {
    expect(evaluateDimensionInput({ kind: 'length', text: ' 25.4 / 2 ' }))
      .toEqual({ ok: true, value: 12.7, expression: '25.4 / 2' });
  });

  it('变量引用（含变量表内的变量依赖）', () => {
    expect(evaluateDimensionInput({ kind: 'length', text: '#width*2', variables: VARIABLES }))
      .toEqual({ ok: true, value: 20, expression: '#width*2' });
    expect(evaluateDimensionInput({ kind: 'distance', text: '#height + #width', variables: VARIABLES }))
      .toEqual({ ok: true, value: 30, expression: '#height + #width' });
  });

  it('角度表达式按度求值并换弧度', () => {
    const result = evaluateDimensionInput({ kind: 'angle', text: '#ang * 2', variables: VARIABLES });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('应有效');
    expect(result.value).toBeCloseTo(Math.PI / 2, 12);
    expect(result.expression).toBe('#ang * 2');
  });

  it('未知变量 → expression 码 + shared 错误消息/结构化字段（S5 additive）', () => {
    const error = expressionErrorOf(evaluateDimensionInput({ kind: 'length', text: '#nope' }));
    expect(error.message).toContain('未知变量');
    expect(error.message).toContain('#nope');
    expect(error.detail).toEqual({ kind: 'unknownVariable', name: 'nope' });
    expect(error.position).toBe(0);
    expect(error.attributedVariable).toBeUndefined();
    expect(error.referenceChain).toBeUndefined();
  });

  it('语法错误 → expression 码；空输入 → 独立 empty 码（UI 复用既有文案）', () => {
    const syntax = evaluateDimensionInput({ kind: 'length', text: '1 +' });
    if (syntax.ok) throw new Error('应无效');
    expect(syntax.error.code).toBe('expression');
    const empty = evaluateDimensionInput({ kind: 'length', text: '   ' });
    expect(empty).toEqual({ ok: false, error: { code: 'empty' } });
    expect(evaluateDimensionInput({ kind: 'angle', text: '' }))
      .toEqual({ ok: false, error: { code: 'empty' } });
  });

  it('变量表循环 → expression 码 + 闭环 detail（确定性），任何表达式都拒收', () => {
    const cyclic: VariableDto[] = [
      { id: 'a', name: 'a', expression: '#b + 1' },
      { id: 'b', name: 'b', expression: '#a + 1' },
    ];
    const error = expressionErrorOf(
      evaluateDimensionInput({ kind: 'length', text: '#a', variables: cyclic }),
    );
    expect(error.message).toContain('循环');
    expect(error.message).toContain('#a');
    expect(error.detail).toEqual({ kind: 'cycle', chain: ['a', 'b', 'a'] });
    // cycle 自带闭环链，不做变量归因前缀（shared 口径）。
    expect(error.attributedVariable).toBeUndefined();
    expect(error.referenceChain).toBeUndefined();
  });

  it('变量表归因 → attributedVariable/referenceChain + cause detail 保留（S5）', () => {
    const variables: VariableDto[] = [
      { id: 'v1', name: 'bad', expression: '1 +' },
    ];
    const error = expressionErrorOf(
      evaluateDimensionInput({ kind: 'length', text: '#bad * 2', variables }),
    );
    expect(error.detail).toEqual({ kind: 'unexpectedEnd' });
    expect(error.position).toBe(3);
    expect(error.attributedVariable).toBe('bad');
    expect(error.referenceChain).toEqual(['bad']);
    // shared 原文保留（后端错误面兼容）；UI 本地化由 expressionFailureMessage 负责。
    expect(error.message).toBe('变量 "bad": 表达式意外结束（缺少操作数）（引用链：bad）');
  });

  it('表达式结果非正 → invalidValue；非有限 → expression；角度表达式越界 → invalidAngle', () => {
    expect(evaluateDimensionInput({ kind: 'length', text: '#width - 10', variables: VARIABLES }))
      .toEqual({ ok: false, error: { code: 'invalidValue' } });
    // 非有限结果由 shared 求值器报 nonFinite（消息原样透传，不静默改值）。
    const nonFinite = evaluateDimensionInput({ kind: 'length', text: '1/0' });
    expect(nonFinite.ok).toBe(false);
    if (!nonFinite.ok) expect(nonFinite.error.code).toBe('expression');
    expect(evaluateDimensionInput({ kind: 'angle', text: '200' }))
      .toEqual({ ok: false, error: { code: 'invalidAngle' } });
  });
});
