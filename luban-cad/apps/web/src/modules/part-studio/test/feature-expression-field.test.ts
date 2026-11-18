// src/modules/part-studio/test/feature-expression-field.test.ts
//
// ADR-0020 S4c：特征数值字段表达式纯逻辑（求值/量纲门/显示投影/视口夹紧）。
import { describe, expect, it } from 'vitest';
import type { VariableDto } from '@luban-cad/shared';
import {
  clampExpressionMenuPosition,
  evaluateFeatureNumberField,
  expressionFieldErrorI18nKey,
  expressionFieldExpectedVariableTypes,
  expressionFieldMessage,
  formatExpressionFieldValue,
  numericTextOr,
  readStoredExpression,
} from '../internal/feature-expression-field.js';

const variable = (
  name: string,
  expression: string,
  type?: VariableDto['type'],
): VariableDto => ({ id: name, name, expression, ...(type !== undefined ? { type } : {}) });

function errorOf(result: ReturnType<typeof evaluateFeatureNumberField>): {
  code: string;
  message?: string;
  variableName?: string;
  variableType?: string;
} {
  if (result.ok) throw new Error('expected error');
  return result.error;
}

describe('evaluateFeatureNumberField（S4c 纯逻辑）', () => {
  it('length：纯数字必须 >0；空输入独立错误码', () => {
    expect(evaluateFeatureNumberField({ kind: 'length', text: '10' }))
      .toEqual({ ok: true, value: 10 });
    expect(errorOf(evaluateFeatureNumberField({ kind: 'length', text: '0' })).code)
      .toBe('invalidValue');
    expect(errorOf(evaluateFeatureNumberField({ kind: 'length', text: '-1' })).code)
      .toBe('invalidValue');
    expect(errorOf(evaluateFeatureNumberField({ kind: 'length', text: '   ' })).code)
      .toBe('empty');
  });

  it('signedLength：纯数字允许负/零（抽壳/起始偏移）', () => {
    expect(evaluateFeatureNumberField({ kind: 'signedLength', text: '-2' }))
      .toEqual({ ok: true, value: -2 });
    expect(evaluateFeatureNumberField({ kind: 'signedLength', text: '0' }))
      .toEqual({ ok: true, value: 0 });
    expect(evaluateFeatureNumberField({ kind: 'signedLength', text: '-0.25' }))
      .toEqual({ ok: true, value: -0.25 });
  });

  it('表达式：变量表求值 + 原文；length 求值必须 >0', () => {
    const variables = [variable('w', '5', 'length')];
    expect(evaluateFeatureNumberField({ kind: 'length', text: '#w * 2', variables }))
      .toEqual({ ok: true, value: 10, expression: '#w * 2' });
    expect(errorOf(evaluateFeatureNumberField({ kind: 'length', text: '#w - 10', variables })).code)
      .toBe('invalidValue');
    const signed = evaluateFeatureNumberField({ kind: 'signedLength', text: '0 - #w', variables });
    expect(signed).toEqual({ ok: true, value: -5, expression: '0 - #w' });
  });

  it('变量类型门：length 拒 angle，angle 拒 length（错误码 + 变量名/类型）', () => {
    const angle = [variable('ang', '45', 'angle')];
    const lengthError = errorOf(evaluateFeatureNumberField({ kind: 'length', text: '#ang * 2', variables: angle }));
    expect(lengthError).toMatchObject({ code: 'variableType', variableName: 'ang', variableType: 'angle' });
    expect(lengthError.message).toBeUndefined();

    const length = [variable('w', '5', 'length')];
    const angleError = errorOf(evaluateFeatureNumberField({
      kind: 'angleRadFromDeg', text: '#w / 2', variables: length,
    }));
    expect(angleError).toMatchObject({ code: 'variableType', variableName: 'w', variableType: 'length' });
  });

  it('number/any 两类字段都接受；未声明 type 按 length', () => {
    const vars = [variable('n', '2', 'number'), variable('x', '3', 'any'), variable('legacy', '4')];
    expect(evaluateFeatureNumberField({ kind: 'length', text: '#n + #x + #legacy', variables: vars }))
      .toMatchObject({ ok: true, value: 9 });
    expect(evaluateFeatureNumberField({ kind: 'angleDeg', text: '#n + #x', variables: vars }))
      .toMatchObject({ ok: true, value: 5 });
  });

  it('angleDeg：度制、validate 度域（draft 非零 |deg|<89）', () => {
    const validate = (value: number): boolean => value !== 0 && Math.abs(value) < 89;
    expect(evaluateFeatureNumberField({ kind: 'angleDeg', text: '30', validate }))
      .toEqual({ ok: true, value: 30 });
    expect(errorOf(evaluateFeatureNumberField({ kind: 'angleDeg', text: '90', validate })).code)
      .toBe('invalidAngle');
    expect(errorOf(evaluateFeatureNumberField({ kind: 'angleDeg', text: '0', validate })).code)
      .toBe('invalidAngle');
    expect(evaluateFeatureNumberField({
      kind: 'angleDeg', text: '#deg / 2', variables: [variable('deg', '45', 'angle')], validate,
    })).toEqual({ ok: true, value: 22.5, expression: '#deg / 2' });
  });

  it('angleRadFromDeg：求值度 → 契约弧度（validate 仍按度域）', () => {
    const validate = (value: number): boolean => value > 0 && value <= 360;
    const numeric = evaluateFeatureNumberField({ kind: 'angleRadFromDeg', text: '180', validate });
    expect(numeric.ok).toBe(true);
    if (numeric.ok) expect(numeric.value).toBeCloseTo(Math.PI, 12);
    const expressed = evaluateFeatureNumberField({
      kind: 'angleRadFromDeg', text: '#a', variables: [variable('a', '90', 'angle')], validate,
    });
    expect(expressed.ok).toBe(true);
    if (expressed.ok) {
      expect(expressed.value).toBeCloseTo(Math.PI / 2, 12);
      expect(expressed.expression).toBe('#a');
    }
    expect(errorOf(evaluateFeatureNumberField({ kind: 'angleRadFromDeg', text: '361', validate })).code)
      .toBe('invalidAngle');
  });

  it('shared 求值错误原样透传（未知变量/语法/循环）', () => {
    const unknown = errorOf(evaluateFeatureNumberField({ kind: 'length', text: '#nope' }));
    expect(unknown.code).toBe('expression');
    expect(unknown.message).toContain('未知变量');
    const table = errorOf(evaluateFeatureNumberField({
      kind: 'length',
      text: '#a',
      variables: [variable('a', '#b'), variable('b', '#a')],
    }));
    expect(table.code).toBe('expression');
    expect(table.message).toBeTruthy();
  });

  it('错误码 → i18n key；variableType 不拼中文（message 缺省）', () => {
    expect(expressionFieldErrorI18nKey({ code: 'variableType', variableName: 'x', variableType: 'angle' }))
      .toBe('partStudio.featureDialog.expressionVariableType');
    expect(expressionFieldErrorI18nKey({ code: 'empty' }))
      .toBe('partStudio.featureDialog.expressionInvalidValue');
    expect(expressionFieldErrorI18nKey({ code: 'invalidAngle' }))
      .toBe('partStudio.featureDialog.expressionInvalidAngle');
    expect(expressionFieldErrorI18nKey({ code: 'expression', message: 'x' })).toBeUndefined();
    expect(expressionFieldExpectedVariableTypes('length')).toBe('length/number/any');
    expect(expressionFieldExpectedVariableTypes('angleDeg')).toBe('angle/number/any');
  });

  it('expressionFieldMessage：variableType 用 i18n 模板插值；expression 透传 shared', () => {
    const t = (key: string, options?: Record<string, unknown>): string =>
      `${key}:${String(options?.name ?? '')}:${String(options?.type ?? '')}:${String(options?.field ?? '')}:${String(options?.expected ?? '')}`;
    expect(expressionFieldMessage(
      { code: 'variableType', variableName: 'ang', variableType: 'angle' },
      'length',
      t,
      { variableTypeField: '深度字段' },
    )).toBe('partStudio.featureDialog.expressionVariableType:ang:angle:深度字段:length/number/any');
    expect(expressionFieldMessage({ code: 'expression', message: '未知变量: #x' }, 'length', t))
      .toBe('未知变量: #x');
    expect(expressionFieldMessage({ code: 'variablesLoading' }, 'length', t))
      .toBe('partStudio.featureDialog.expressionVariablesLoading::::');
  });

  it('formatExpressionFieldValue：长度 4 位小数去尾零、角度显示 deg、-0 归一', () => {
    expect(formatExpressionFieldValue('length', 12.345678)).toBe('12.3457');
    expect(formatExpressionFieldValue('signedLength', -2)).toBe('-2');
    expect(formatExpressionFieldValue('length', 10)).toBe('10');
    expect(formatExpressionFieldValue('length', -0.00001)).toBe('0');
    expect(formatExpressionFieldValue('angleDeg', 45.123456)).toBe('45.1235');
    expect(formatExpressionFieldValue('angleRadFromDeg', Math.PI / 2)).toBe('90');
    expect(formatExpressionFieldValue('length', Number.NaN)).toBe('');
  });

  it('numericTextOr：表达式草稿不适用清除时归位为可解析数值', () => {
    expect(numericTextOr('12.5', '0')).toBe('12.5');
    expect(numericTextOr(' -2 ', '0')).toBe(' -2 ');
    expect(numericTextOr('#d2*2', '5')).toBe('5');
    expect(numericTextOr('', '10')).toBe('10');
    expect(numericTextOr('NaN', '360')).toBe('360');
  });

  it('readStoredExpression：只接受非空字符串', () => {
    expect(readStoredExpression({ a: '#x' }, 'a')).toBe('#x');
    expect(readStoredExpression({ a: '   ' }, 'a')).toBeUndefined();
    expect(readStoredExpression({ a: 5 }, 'a')).toBeUndefined();
    expect(readStoredExpression(undefined, 'a')).toBeUndefined();
  });
});

describe('clampExpressionMenuPosition（补全菜单视口夹紧）', () => {
  const viewport = { width: 800, height: 600 };

  it('下方放得下：左对齐输入框、top=输入框 bottom', () => {
    expect(clampExpressionMenuPosition({
      anchor: { left: 100, right: 220, top: 50, bottom: 74 },
      menu: { width: 180, height: 120 },
      viewport,
    })).toEqual({ left: 100, top: 74 });
  });

  it('右侧溢出：左移夹到 viewport-菜单宽-8', () => {
    expect(clampExpressionMenuPosition({
      anchor: { left: 700, right: 780, top: 50, bottom: 74 },
      menu: { width: 180, height: 120 },
      viewport,
    }).left).toBe(800 - 180 - 8);
  });

  it('下方放不下且上方有空间：翻到输入框上方', () => {
    const position = clampExpressionMenuPosition({
      anchor: { left: 100, right: 220, top: 500, bottom: 524 },
      menu: { width: 180, height: 120 },
      viewport,
    });
    expect(position.top).toBe(500 - 120);
  });

  it('菜单大于 viewport：宽度/高度夹到 viewport−16 且从 8px 边距开始', () => {
    expect(clampExpressionMenuPosition({
      anchor: { left: 0, right: 10, top: 0, bottom: 10 },
      menu: { width: 2000, height: 2000 },
      viewport,
    })).toEqual({ left: 8, top: 8 });
  });
});
