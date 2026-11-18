/**
 * ADR-0020 S5：表达式求值错误的 zh/en 本地化（internal/expression-error-message.ts）。
 *
 * 覆盖：每个 detail.kind 的 zh/en 文案与插值；empty（按 code）；无 detail /
 * 未知 kind 的本地化兜底（绝不回落 shared 中文 message）；变量表归因前缀 +
 * 引用链；en 无 CJK；共享字段搬运 helper。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { ExpressionErrorDetail, VariableDto } from '@luban-cad/shared';
import { initI18n } from '../../../common/i18n/index.js';
import {
  expressionFailureFields,
  expressionFailureMessage,
  expressionFailureToLocal,
  type ExpressionFailureMessageInput,
  type ExpressionMessageTranslator,
} from '../internal/expression-error-message.js';
import { evaluateFeatureNumberField } from '../internal/feature-expression-field.js';
import { evaluateDimensionInput } from '../internal/sketch-dimension-expression.js';

/** 共享中文 message 的哨兵：本地化输出**绝不**包含 shared message。 */
const SHARED_MESSAGE = '中文消息哨兵';
const CJK = /[　-〿㐀-鿿豈-﫿＀-￯𠀀-𯨟]/u;

let zh: ExpressionMessageTranslator;
let en: ExpressionMessageTranslator;

beforeAll(async () => {
  const i18n = await initI18n();
  // 语言在每次调用时显式钉住（i18n 是全局可变单例；两个翻译器并存使用）。
  const make = (lng: 'zh-CN' | 'en'): ExpressionMessageTranslator =>
    (key, options) => i18n.t(key, { ...(options ?? {}), lng } as never) as string;
  zh = make('zh-CN');
  en = make('en');
});

function failure(
  detail: ExpressionErrorDetail | undefined,
  extra: Partial<ExpressionFailureMessageInput> = {},
): ExpressionFailureMessageInput {
  return {
    code: 'syntax',
    message: SHARED_MESSAGE,
    ...(detail !== undefined ? { detail } : {}),
    ...extra,
  };
}

describe('expressionFailureMessage：empty（按 code，detail 缺省）', () => {
  it('zh/en 空表达式文案；不回落 shared message', () => {
    const empty: ExpressionFailureMessageInput = { code: 'empty', message: SHARED_MESSAGE };
    expect(expressionFailureMessage(empty, zh)).toBe('表达式为空');
    expect(expressionFailureMessage(empty, en)).toBe('Expression is empty');
    expect(expressionFailureMessage(empty, en)).not.toContain(SHARED_MESSAGE);
  });
});

describe('expressionFailureMessage：detail.kind 全矩阵 zh/en 与插值', () => {
  it.each<[ExpressionErrorDetail, string, string]>([
    [{ kind: 'invalidNumber' }, '非法数字字面量', 'Invalid number literal'],
    [{ kind: 'invalidChar', char: '$' }, '非法字符 "$"', 'Invalid character "$"'],
    [{ kind: 'invalidVariableRef' }, '变量引用 # 后须为字母或下划线', 'A variable reference must be followed by a letter or underscore'],
    [{ kind: 'trailingCharacter', token: '2' }, '多余的字符 "2"', 'Unexpected trailing character "2"'],
    [{ kind: 'unexpectedToken', token: '*' }, '意外的记号 "*"', 'Unexpected token "*"'],
    [{ kind: 'unexpectedEnd' }, '表达式意外结束（缺少操作数）', 'Expression ended unexpectedly (missing operand)'],
    [{ kind: 'missingRightParen' }, '缺少右括号', 'Missing closing parenthesis'],
    [{ kind: 'depthLimit', limit: 64 }, '表达式嵌套超过 64 层', 'Expression nesting exceeds 64 levels'],
    [{ kind: 'lengthLimit', limit: 1024 }, '表达式超过 1024 字符上限', 'Expression exceeds the 1024-character limit'],
    [{ kind: 'invalidVariableName', name: '1a' }, '非法变量名: "1a"', 'Invalid variable name: "1a"'],
    [{ kind: 'duplicateName', name: 'a' }, '变量名重复: "a"', 'Duplicate variable name: "a"'],
    [{ kind: 'unknownVariable', name: 'width' }, '未知变量: #width', 'Unknown variable: #width'],
    [{ kind: 'cycle', chain: ['a', 'b', 'a'] }, '变量循环引用: #a → #b → #a', 'Circular variable reference: #a → #b → #a'],
    [{ kind: 'divisionByZero' }, '除数为零', 'Division by zero'],
    [{ kind: 'literalOutOfRange', text: '9'.repeat(3) }, '数字字面量超出有限数范围: 999', 'Number literal is outside the finite range: 999'],
    [{ kind: 'resultNotFinite' }, '表达式结果不是有限数', 'The expression result is not a finite number'],
    [{ kind: 'variableNotFinite', name: 'a' }, '变量 #a 的值不是有限数', 'Variable #a is not a finite number'],
  ])('%j', (detail, zhText, enText) => {
    const input = failure(detail);
    expect(expressionFailureMessage(input, zh)).toBe(zhText);
    expect(expressionFailureMessage(input, en)).toBe(enText);
    expect(expressionFailureMessage(input, zh)).not.toContain(SHARED_MESSAGE);
    expect(expressionFailureMessage(input, en)).not.toContain(SHARED_MESSAGE);
    expect(expressionFailureMessage(input, en)).not.toMatch(CJK);
  });
});

describe('expressionFailureMessage：归因前缀与引用链', () => {
  it('attributedVariable → 「变量 "name"：原因」；referenceChain → 追加引用链（zh/en）', () => {
    const input = failure(
      { kind: 'unknownVariable', name: 'missing' },
      { attributedVariable: 'b', referenceChain: ['a', 'b'] },
    );
    expect(expressionFailureMessage(input, zh))
      .toBe('变量 "b": 未知变量: #missing（引用链：a → b）');
    expect(expressionFailureMessage(input, en))
      .toBe('Variable "b": Unknown variable: #missing (reference chain: a → b)');
  });

  it('仅引用链（无归因）也可追加；空引用链不追加', () => {
    expect(expressionFailureMessage(
      failure({ kind: 'divisionByZero' }, { referenceChain: ['a', 'b'] }),
      zh,
    )).toBe('除数为零（引用链：a → b）');
    expect(expressionFailureMessage(
      failure({ kind: 'divisionByZero' }, { referenceChain: [] }),
      zh,
    )).toBe('除数为零');
  });

  it('cycle 自带闭环链，不与归因/引用链重复（shared 口径）', () => {
    const input = failure({ kind: 'cycle', chain: ['a', 'a'] });
    expect(expressionFailureMessage(input, zh)).toBe('变量循环引用: #a → #a');
    expect(expressionFailureMessage(input, en)).toBe('Circular variable reference: #a → #a');
  });
});

describe('expressionFailureMessage：本地化兜底（绝不回落中文共享消息）', () => {
  it('无 detail → 通用文案（zh/en）', () => {
    const input: ExpressionFailureMessageInput = { code: 'syntax', message: SHARED_MESSAGE };
    expect(expressionFailureMessage(input, zh)).toBe('无效的表达式');
    expect(expressionFailureMessage(input, en)).toBe('Invalid expression');
    expect(expressionFailureMessage(input, en)).not.toMatch(CJK);
  });

  it('未知 detail.kind（旧 web 消费新 shared）→ 通用文案', () => {
    const input = { code: 'syntax', message: SHARED_MESSAGE, detail: { kind: 'futureKind' } } as unknown as ExpressionFailureMessageInput;
    expect(expressionFailureMessage(input, zh)).toBe('无效的表达式');
    expect(expressionFailureMessage(input, en)).toBe('Invalid expression');
  });
});

describe('共享字段搬运 helper', () => {
  it('expressionFailureFields：只复制在场字段（空对象不多出 undefined 键）', () => {
    const fields = expressionFailureFields({
      position: 4,
      detail: { kind: 'unknownVariable', name: 'x' },
      attributedVariable: 'b',
      referenceChain: ['a', 'b'],
    });
    expect(fields).toEqual({
      position: 4,
      detail: { kind: 'unknownVariable', name: 'x' },
      attributedVariable: 'b',
      referenceChain: ['a', 'b'],
    });
    expect(expressionFailureFields({})).toEqual({});
    expect(Object.keys(expressionFailureFields({})).length).toBe(0);
  });

  it('expressionFailureToLocal：code=expression + sourceCode + shared message/字段逐项保留', () => {
    const local = expressionFailureToLocal({
      ok: false,
      code: 'unknownVariable',
      message: '未知变量: #x',
      position: 2,
      detail: { kind: 'unknownVariable', name: 'x' },
      attributedVariable: 'b',
      referenceChain: ['a', 'b'],
    });
    expect(local).toEqual({
      code: 'expression',
      message: '未知变量: #x',
      sourceCode: 'unknownVariable',
      position: 2,
      detail: { kind: 'unknownVariable', name: 'x' },
      attributedVariable: 'b',
      referenceChain: ['a', 'b'],
    });
  });
});

describe('P2-1 回归：本地包装保留 sourceCode="empty"（空表达式不被通用文案吞掉）', () => {
  /** 变量表定义全空白 → 表求值失败为 code=empty（无 detail）。 */
  const blankVariables: VariableDto[] = [{ id: 'v1', name: 'blank', expression: '   ' }];

  it('特征字段：空白变量定义 → sourceCode=empty + 归因，zh/en 空表达式文案', () => {
    const result = evaluateFeatureNumberField({
      kind: 'length',
      text: '#blank * 2',
      variables: blankVariables,
    });
    if (result.ok) throw new Error('expected error');
    expect(result.error.code).toBe('expression');
    if (result.error.code !== 'expression') throw new Error('expected expression error');
    expect(result.error.sourceCode).toBe('empty');
    expect(result.error.attributedVariable).toBe('blank');
    expect(result.error.referenceChain).toEqual(['blank']);
    expect(expressionFailureMessage(result.error, zh))
      .toBe('变量 "blank": 表达式为空（引用链：blank）');
    expect(expressionFailureMessage(result.error, en))
      .toBe('Variable "blank": Expression is empty (reference chain: blank)');
  });

  it('草图尺寸：空白变量定义 → sourceCode=empty + 归因，zh/en 空表达式文案', () => {
    const result = evaluateDimensionInput({
      kind: 'length',
      text: '#blank * 2',
      variables: blankVariables,
    });
    if (result.ok) throw new Error('expected error');
    expect(result.error.code).toBe('expression');
    if (result.error.code !== 'expression') throw new Error('expected expression error');
    expect(result.error.sourceCode).toBe('empty');
    expect(result.error.attributedVariable).toBe('blank');
    expect(result.error.referenceChain).toEqual(['blank']);
    expect(expressionFailureMessage(result.error, zh))
      .toBe('变量 "blank": 表达式为空（引用链：blank）');
    expect(expressionFailureMessage(result.error, en))
      .toBe('Variable "blank": Expression is empty (reference chain: blank)');
  });

  it('helper 单元：sourceCode=empty 且 code=expression 等价空表达式（无归因）', () => {
    expect(expressionFailureMessage(
      { code: 'expression', message: SHARED_MESSAGE, sourceCode: 'empty' },
      zh,
    )).toBe('表达式为空');
    expect(expressionFailureMessage(
      { code: 'expression', message: SHARED_MESSAGE, sourceCode: 'empty' },
      en,
    )).toBe('Expression is empty');
  });
});
