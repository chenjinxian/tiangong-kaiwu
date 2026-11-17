/**
 * ADR-0020 S3b：Part Studio 变量纯逻辑（internal/variables.ts）全矩阵。
 *
 * 覆盖：单位/显示格式（纯数字→值+单位，表达式→原文，不 throw）、树行文本、
 * id 生成、追加/替换/删除、草稿校验（名称规则/唯一/类型/说明/表达式求值/
 * 自引用/编辑排除自身/既有表损坏）、求值 helper 与变量表求值。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VariableDto } from '@luban-cad/shared';
import {
  evaluatedVariableValues,
  evaluateVariableExpression,
  formatVariableDisplay,
  formatVariableNumber,
  formatVariableValueWithUnit,
  nextVariableId,
  removeVariable,
  upsertVariable,
  validateVariableDraft,
  variableTreeRowText,
  variableUnit,
  MAX_VARIABLE_DESCRIPTION_LENGTH,
  VARIABLES_READ_TIMEOUT_MS,
  withTimeout,
} from '../internal/variables.js';

const V = (id: string, name: string, expression: string, extra: Partial<VariableDto> = {}): VariableDto => ({
  id, name, expression, ...extra,
});

describe('variableUnit（缺省 length）', () => {
  it('length→mm、angle→deg、number/any→空；undefined=length', () => {
    expect(variableUnit('length')).toBe('mm');
    expect(variableUnit('angle')).toBe('deg');
    expect(variableUnit('number')).toBe('');
    expect(variableUnit('any')).toBe('');
    expect(variableUnit(undefined)).toBe('mm');
  });
});

describe('formatVariableDisplay（树行/标题口径）', () => {
  it('纯数字 → 数值 + 单位（去尾零）；角度 7 位', () => {
    expect(formatVariableDisplay(V('v1', 'width', '10'))).toBe('10 mm');
    expect(formatVariableDisplay(V('v1', 'width', '10.50000'))).toBe('10.5 mm');
    expect(formatVariableDisplay(V('v1', 'ang', '45', { type: 'angle' }))).toBe('45 deg');
    expect(formatVariableDisplay(V('v1', 'n', '12.25', { type: 'number' }))).toBe('12.25');
    expect(formatVariableDisplay(V('v1', 'a', '3', { type: 'any' }))).toBe('3');
  });

  it('表达式 → 原文（保留设计意图；不借用求值结果）', () => {
    expect(formatVariableDisplay(V('v2', 'height', '#width*2'))).toBe('#width*2');
    expect(formatVariableDisplay(V('v2', 'height', '#width * 2', { type: 'angle' }))).toBe('#width * 2');
  });

  it('无效输入不 throw（非字符串/非有限/空白）', () => {
    expect(() => formatVariableDisplay({ expression: undefined as unknown as string })).not.toThrow();
    expect(formatVariableDisplay({ expression: '' })).toBe('');
    expect(formatVariableDisplay({ expression: '   ' })).toBe('   ');
    expect(formatVariableDisplay({ expression: 'Infinity' })).toBe('Infinity');
  });

  it('variableTreeRowText = #name = 显示文本', () => {
    expect(variableTreeRowText(V('v1', 'width', '10'))).toBe('#width = 10 mm');
    expect(variableTreeRowText(V('v2', 'height', '#width*2'))).toBe('#height = #width*2');
  });
});

describe('求值 helper', () => {
  it('既有表内引用求值；排除自身旧定义防自引用', () => {
    const vars = [V('v1', 'width', '10'), V('v2', 'height', '#width*2')];
    expect(evaluateVariableExpression('#width + 5', vars)).toBe(15);
    expect(evaluateVariableExpression('#height*2', vars)).toBe(40);
    // 展示上下文用完整既有表（自引用/循环由 validateVariableDraft 拦截）。
    expect(evaluateVariableExpression('#height', vars)).toBe(20);
    expect(evaluateVariableExpression('#missing', vars)).toBeUndefined();
  });

  it('既有表损坏（循环）→ 求值 undefined；evaluatedVariableValues 同口径', () => {
    const broken = [V('a', 'a', '#b'), V('b', 'b', '#a')];
    expect(evaluateVariableExpression('1+1', broken)).toBeUndefined();
    expect(evaluatedVariableValues(broken)).toBeUndefined();
    expect(evaluatedVariableValues([])?.size).toBe(0);
  });

  it('数值格式化：长度 5 位/角度 7 位、去尾零、带单位', () => {
    expect(formatVariableNumber(10, 'length')).toBe('10');
    expect(formatVariableNumber(10.123456, 'length')).toBe('10.12346');
    expect(formatVariableNumber(45.12345678, 'angle')).toBe('45.1234568');
    expect(formatVariableValueWithUnit(10, 'length')).toBe('10 mm');
    expect(formatVariableValueWithUnit(45, 'angle')).toBe('45 deg');
    expect(formatVariableValueWithUnit(2, 'number')).toBe('2');
  });
});

describe('nextVariableId', () => {
  it('空表 → v1；最大值 +1；跳过占用；忽略非 vN id', () => {
    expect(nextVariableId([])).toBe('v1');
    expect(nextVariableId([V('v1', 'a', '1')])).toBe('v2');
    expect(nextVariableId([V('v1', 'a', '1'), V('v3', 'b', '2')])).toBe('v4');
    expect(nextVariableId([V('v1', 'a', '1'), V('v2', 'b', '2'), V('v4', 'c', '3')])).toBe('v5');
    expect(nextVariableId([V('a', 'a', '1'), V('b', 'b', '2')])).toBe('v1');
  });
});

describe('upsertVariable / removeVariable（整表覆写纯函数，不改入参）', () => {
  it('按 id 替换保持顺序；新 id 追加；入参数组不变', () => {
    const list = [V('v1', 'a', '1'), V('v2', 'b', '2')];
    const replaced = upsertVariable(list, V('v2', 'b', '20'));
    expect(replaced.map((entry) => entry.expression)).toEqual(['1', '20']);
    expect(list[1]!.expression).toBe('2');
    const appended = upsertVariable(list, V('v3', 'c', '3'));
    expect(appended.map((entry) => entry.id)).toEqual(['v1', 'v2', 'v3']);
  });

  it('按 id 删除（不存在时原样内容）', () => {
    const list = [V('v1', 'a', '1'), V('v2', 'b', '2')];
    expect(removeVariable(list, 'v1').map((entry) => entry.id)).toEqual(['v2']);
    expect(removeVariable(list, 'nope').map((entry) => entry.id)).toEqual(['v1', 'v2']);
    expect(list).toHaveLength(2);
  });
});

describe('validateVariableDraft', () => {
  const existing = [V('v1', 'width', '10'), V('v2', 'height', '#width*2')];

  it('新建纯数字：id 自动生成、expression=trim 原文、type 保留、说明空省略', () => {
    const result = validateVariableDraft(
      { name: 'depth', valueText: ' 5 ', type: 'length', description: '  ' },
      existing,
    );
    expect(result).toEqual({
      ok: true,
      dto: { id: 'v3', name: 'depth', expression: '5', type: 'length' },
    });
  });

  it('表达式引用既有变量可求值；说明入 DTO', () => {
    const result = validateVariableDraft(
      { name: 'total', valueText: '#width + #height', type: 'number', description: ' 合计 ' },
      existing,
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.dto).toEqual({
        id: 'v3', name: 'total', expression: '#width + #height', type: 'number', description: '合计',
      });
  });

  it('编辑：保留 id、允许自身原名；排除自身旧定义（引用自身 → 未知变量）', () => {
    const kept = validateVariableDraft(
      { id: 'v1', name: 'width', valueText: '20', type: 'angle', description: '' },
      existing,
    );
    expect(kept.ok).toBe(true);
    if (kept.ok)
      expect(kept.dto).toEqual({ id: 'v1', name: 'width', expression: '20', type: 'angle' });

    const self = validateVariableDraft(
      { id: 'v1', name: 'width', valueText: '#width * 2', type: 'length', description: '' },
      existing,
    );
    expect(self.ok).toBe(false);
    if (!self.ok) {
      expect(self.field).toBe('value');
      // 提议整表把自引用变成显式循环（旧定义不参与解析）。
      expect(self.message).toMatch(/循环|未知变量/);
    }
  });

  it('新建自引用（#同名）→ 未知变量（不得循环）', () => {
    const result = validateVariableDraft(
      { name: 'loop', valueText: '#loop + 1', type: 'length', description: '' },
      existing,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe('value');
      expect(result.message).toMatch(/循环|未知变量/);
    }
  });

  it('名称规则/唯一（编辑排除自身 id）', () => {
    const invalid = validateVariableDraft(
      { name: '1abc', valueText: '1', type: 'length', description: '' },
      existing,
    );
    expect(invalid).toMatchObject({
      ok: false, field: 'name', message: 'partStudio.variables.errors.invalidName',
    });
    const blank = validateVariableDraft(
      { name: '  ', valueText: '1', type: 'length', description: '' },
      existing,
    );
    expect(blank).toMatchObject({ ok: false, field: 'name' });
    const duplicate = validateVariableDraft(
      { name: 'width', valueText: '1', type: 'length', description: '' },
      existing,
    );
    expect(duplicate).toMatchObject({
      ok: false, field: 'name', message: 'partStudio.variables.errors.duplicateName',
    });
  });

  it('类型枚举/说明上限/空值', () => {
    const badType = validateVariableDraft(
      { name: 'x', valueText: '1', type: 'bogus' as never, description: '' },
      existing,
    );
    expect(badType).toMatchObject({
      ok: false, field: 'type', message: 'partStudio.variables.errors.invalidType',
    });
    const longDescription = validateVariableDraft(
      {
        name: 'x', valueText: '1', type: 'length',
        description: 'a'.repeat(MAX_VARIABLE_DESCRIPTION_LENGTH + 1),
      },
      existing,
    );
    expect(longDescription).toMatchObject({
      ok: false, field: 'description', message: 'partStudio.variables.errors.descriptionTooLong',
    });
    const empty = validateVariableDraft(
      { name: 'x', valueText: '   ', type: 'length', description: '' },
      existing,
    );
    expect(empty).toMatchObject({
      ok: false, field: 'value', message: 'partStudio.variables.errors.emptyValue',
    });
  });

  it('语法/非有限错误透传 shared 消息', () => {
    const syntax = validateVariableDraft(
      { name: 'x', valueText: '1 +', type: 'length', description: '' },
      existing,
    );
    expect(syntax.ok).toBe(false);
    if (!syntax.ok) {
      expect(syntax.field).toBe('value');
      expect(syntax.message.length).toBeGreaterThan(0);
    }
    const nonFinite = validateVariableDraft(
      { name: 'x', valueText: '1/0', type: 'length', description: '' },
      existing,
    );
    expect(nonFinite.ok).toBe(false);
  });

  it('既有变量表损坏 → 值字段错误（不静默通过）', () => {
    const broken = [V('a', 'a', '#b'), V('b', 'b', '#a')];
    const result = validateVariableDraft(
      { name: 'x', valueText: '1', type: 'length', description: '' },
      broken,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe('value');
      expect(result.message.length).toBeGreaterThan(0);
    }
  });
});

describe('withTimeout（P3-6：超时不把写门永久卡住）', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('超时 reject（fake timers 推进 deadline）', async () => {
    vi.useFakeTimers();
    const pending = new Promise<never>(() => undefined);
    const result = withTimeout(pending, VARIABLES_READ_TIMEOUT_MS, '变量表读取');
    const assertion = expect(result).rejects.toThrow('变量表读取超时');
    await vi.advanceTimersByTimeAsync(VARIABLES_READ_TIMEOUT_MS);
    await assertion;
  });

  it('按时回包清除计时器并原样透传结果/错误', async () => {
    vi.useFakeTimers();
    const ok = await withTimeout(Promise.resolve('value'), 1000, '读');
    expect(ok).toBe('value');
    const failed = withTimeout(Promise.reject(new Error('boom')), 1000, '读');
    await expect(failed).rejects.toThrow('boom');
    // 计时器已清除：推进 deadline 后不再产生未处理拒绝/超时。
    await vi.advanceTimersByTimeAsync(2000);
  });
});
