/**
 * 尺寸编辑器「显示值 ↔ 契约值」转换（ADR-0018 S1h）：
 * 角度在 UI 显示度、提交弧度；线性类保持毫米原值；非法输入拒绝。
 * 2026-11-16 W17：长度类初值 5 位小数（显示 2 + 3）去尾零；方向键 ±1 步进。
 * 2026-11-16 W18：角度初值/步进 7 位小数（度）、方向键 ±1°。
 */
import { describe, expect, it } from 'vitest';
import type { SketchConstraintDto } from '@luban-cad/shared';
import {
  DIMENSION_EDITOR_ANGLE_DECIMALS,
  DIMENSION_EDITOR_DECIMALS,
  DIMENSION_EDITOR_STEP_DEG,
  DIMENSION_EDITOR_STEP_MM,
  EDITABLE_CONSTRAINT_KINDS,
  dimensionConstraintDisplayValue,
  formatAngleEditorDegrees,
  formatConstraintEditorValue,
  formatDimensionPopupValue,
  isSteppableConstraintKind,
  parseConstraintEditorValue,
  stepConstraintEditorValue,
} from '../internal/sketch-dimension-value.js';

const constraint = (kind: SketchConstraintDto['kind'], value?: number): SketchConstraintDto =>
  ({ kind, id: 1, refs: [1], value });

describe('formatConstraintEditorValue', () => {
  it('角度弧度 → 度数文本（W18 live：7 位小数、去尾零）', () => {
    expect(formatConstraintEditorValue(constraint('angle', Math.PI / 2))).toBe('90');
    expect(formatConstraintEditorValue(constraint('angle', Math.PI / 3))).toBe('60');
    expect(formatConstraintEditorValue(constraint('angle', Math.PI * 1.5))).toBe('270');
    expect(formatConstraintEditorValue(constraint('angle', -Math.PI / 4))).toBe('45');
    // live 83.7325188 deg（编辑器初值；度 = 弧度 × 180/π）。
    expect(formatConstraintEditorValue(constraint('angle', 83.7325188 * Math.PI / 180)))
      .toBe('83.7325188');
  });

  it('formatAngleEditorDegrees：7 位小数、去尾零（"83.7325188" / "90"）', () => {
    expect(DIMENSION_EDITOR_ANGLE_DECIMALS).toBe(7);
    expect(formatAngleEditorDegrees(83.7325188)).toBe('83.7325188');
    expect(formatAngleEditorDegrees(90)).toBe('90');
    expect(formatAngleEditorDegrees(12.345678901)).toBe('12.3456789');
  });

  it('线性尺寸 5 位小数（显示 2 + 3）去尾零；缺值显示空串', () => {
    expect(formatConstraintEditorValue(constraint('distance', 15.74582793))).toBe('15.74583');
    expect(formatConstraintEditorValue(constraint('length', 82.55))).toBe('82.55');
    expect(formatConstraintEditorValue(constraint('radius', 4))).toBe('4');
    expect(formatConstraintEditorValue(constraint('diameter', 12.5))).toBe('12.5');
    expect(formatConstraintEditorValue(constraint('length', 20))).toBe('20');
    expect(formatConstraintEditorValue(constraint('distance'))).toBe('');
  });

  it('dimensionConstraintDisplayValue（W21 预填）：线性保持 mm、角度弧度→度、缺值空', () => {
    expect(dimensionConstraintDisplayValue({ kind: 'length', value: 25.98062 })).toBe(25.98062);
    expect(dimensionConstraintDisplayValue({ kind: 'diameter', value: 10 })).toBe(10);
    expect(dimensionConstraintDisplayValue({ kind: 'angle', value: Math.PI / 2 })).toBeCloseTo(90, 12);
    expect(dimensionConstraintDisplayValue({ kind: 'angle', value: -Math.PI / 4 })).toBeCloseTo(45, 12);
    expect(dimensionConstraintDisplayValue({ kind: 'length' })).toBeUndefined();
    expect(dimensionConstraintDisplayValue({ kind: 'length', value: Number.NaN })).toBeUndefined();
  });
});

describe('parseConstraintEditorValue', () => {
  it('角度输入度 → 契约弧度', () => {
    expect(parseConstraintEditorValue('angle', '45')).toBeCloseTo(Math.PI / 4, 12);
    expect(parseConstraintEditorValue('angle', '60.5')).toBeCloseTo(60.5 * Math.PI / 180, 12);
  });

  it('角度 ≤0 / ≥180 / 非数字拒收（返回 undefined；契约为 (0, π) 弧度）', () => {
    expect(parseConstraintEditorValue('angle', '0')).toBeUndefined();
    expect(parseConstraintEditorValue('angle', '-5')).toBeUndefined();
    expect(parseConstraintEditorValue('angle', '180')).toBeUndefined();
    expect(parseConstraintEditorValue('angle', '200')).toBeUndefined();
    expect(parseConstraintEditorValue('angle', '360')).toBeUndefined();
    expect(parseConstraintEditorValue('angle', 'abc')).toBeUndefined();
    expect(parseConstraintEditorValue('angle', '')).toBeUndefined();
  });

  it('线性尺寸保持毫米原值并同样拒收非正值', () => {
    expect(parseConstraintEditorValue('length', '20')).toBe(20);
    expect(parseConstraintEditorValue('diameter', '12.5')).toBe(12.5);
    expect(parseConstraintEditorValue('length', '0')).toBeUndefined();
    expect(parseConstraintEditorValue('radius', 'NaN')).toBeUndefined();
  });
});

describe('EDITABLE_CONSTRAINT_KINDS', () => {
  it('含 angle；非尺寸约束不在白名单', () => {
    expect(EDITABLE_CONSTRAINT_KINDS.has('angle')).toBe(true);
    expect(EDITABLE_CONSTRAINT_KINDS.has('parallel')).toBe(false);
    expect(EDITABLE_CONSTRAINT_KINDS.has('coincident')).toBe(false);
    expect(EDITABLE_CONSTRAINT_KINDS).toEqual(new Set(['distance', 'radius', 'diameter', 'length', 'angle']));
  });
});

describe('formatDimensionPopupValue / formatAngleEditorDegrees（十进制 half-up）', () => {
  it('长度 5 位、角度 7 位按十进制 half-up 取整（live 28.575 → 28.58）', () => {
    expect(formatDimensionPopupValue('length', 28.575)).toBe('28.575');
    expect(formatDimensionPopupValue('length', 28.575005)).toBe('28.57501');
    expect(formatAngleEditorDegrees(83.73251885)).toBe('83.7325189');
  });
});

describe('stepConstraintEditorValue（live 方向键步进）', () => {
  const base = { initialText: '15.74583', rawValue: 15.74582793 };

  it('常量：初值 5 位小数、步进 1 mm；角度步进 1°', () => {
    expect(DIMENSION_EDITOR_DECIMALS).toBe(5);
    expect(DIMENSION_EDITOR_STEP_MM).toBe(1);
    expect(DIMENSION_EDITOR_STEP_DEG).toBe(1);
  });

  it('未编辑文本：以约束原始值（全精度）为基线 ±1', () => {
    expect(stepConstraintEditorValue({ kind: 'distance', text: '15.74583', direction: -1, ...base }))
      .toBe('14.74582793');
    expect(stepConstraintEditorValue({ kind: 'length', text: '15.74583', direction: 1, ...base }))
      .toBe('16.74582793');
    expect(stepConstraintEditorValue({ kind: 'radius', text: '15.74583', direction: -1, ...base }))
      .toBe('14.74582793');
    expect(stepConstraintEditorValue({ kind: 'diameter', text: '15.74583', direction: -1, ...base }))
      .toBe('14.74582793');
  });

  it('已编辑文本：以 Number(text) 为基线 ±1', () => {
    expect(stepConstraintEditorValue({
      kind: 'length', text: '14.74582793', initialText: '15.74583', rawValue: 15.74582793, direction: 1,
    })).toBe('15.74582793');
    expect(stepConstraintEditorValue({
      kind: 'length', text: '20.5', initialText: '20', rawValue: 20, direction: 1,
    })).toBe('21.5');
  });

  it('角度（W18 live）：度为单位 ±1，步进结果 7 位小数去尾零', () => {
    expect(stepConstraintEditorValue({
      kind: 'angle', text: '83.7325188', initialText: '83.7325188', rawValue: 83.7325188, direction: -1,
    })).toBe('82.7325188');
    expect(stepConstraintEditorValue({
      kind: 'angle', text: '83.7325188', initialText: '83.7325188', rawValue: 83.7325188, direction: 1,
    })).toBe('84.7325188');
    // 整数值去掉尾零（90 − 1 = 89，而不是 89.0000000）。
    expect(stepConstraintEditorValue({
      kind: 'angle', text: '90', initialText: '90', rawValue: 90, direction: -1,
    })).toBe('89');
  });

  it('角度已编辑文本：以 Number(text)（度）为基线 ±1', () => {
    expect(stepConstraintEditorValue({
      kind: 'angle', text: '45', initialText: '90', rawValue: 90, direction: -1,
    })).toBe('44');
    expect(stepConstraintEditorValue({
      kind: 'angle', text: '12.5', initialText: '90', rawValue: 90, direction: 1,
    })).toBe('13.5');
  });

  it('空文本/非数字不步进；非正值照常步进（提交侧拒收）', () => {
    expect(stepConstraintEditorValue({
      kind: 'length', text: '', initialText: '', direction: 1,
    })).toBeUndefined();
    expect(stepConstraintEditorValue({
      kind: 'length', text: 'abc', initialText: '20', rawValue: 20, direction: 1,
    })).toBeUndefined();
    expect(stepConstraintEditorValue({
      kind: 'angle', text: 'abc', initialText: '20', rawValue: 20, direction: 1,
    })).toBeUndefined();
    // 步进侧不静默抑制非正值（live 无证据）：显示 -0.5，提交由既有解析器拒收。
    expect(stepConstraintEditorValue({
      kind: 'length', text: '0.5', initialText: '20', rawValue: 20, direction: -1,
    })).toBe('-0.5');
    expect(stepConstraintEditorValue({
      kind: 'angle', text: '0.5', initialText: '20', rawValue: 20, direction: -1,
    })).toBe('-0.5');
  });

  it('isSteppableConstraintKind：全部可编辑尺寸种类都可步进（含角度）', () => {
    expect(isSteppableConstraintKind('distance')).toBe(true);
    expect(isSteppableConstraintKind('length')).toBe(true);
    expect(isSteppableConstraintKind('radius')).toBe(true);
    expect(isSteppableConstraintKind('diameter')).toBe(true);
    expect(isSteppableConstraintKind('angle')).toBe(true);
    // 非尺寸白名单种类不可步进（负例，防止函数退化为恒真）。
    expect(isSteppableConstraintKind('parallel')).toBe(false);
    expect(isSteppableConstraintKind('coincident')).toBe(false);
  });
});
