/**
 * 尺寸编辑器「显示值 ↔ 契约值」转换（ADR-0018 S1h）：
 * 角度在 UI 显示度、提交弧度；线性类保持毫米原值；非法输入拒绝。
 */
import { describe, expect, it } from 'vitest';
import type { SketchConstraintDto } from '@luban-cad/shared';
import {
  EDITABLE_CONSTRAINT_KINDS,
  formatConstraintEditorValue,
  parseConstraintEditorValue,
} from '../internal/sketch-dimension-value.js';

const constraint = (kind: SketchConstraintDto['kind'], value?: number): SketchConstraintDto =>
  ({ kind, id: 1, refs: [1], value });

describe('formatConstraintEditorValue', () => {
  it('角度弧度 → 度数文本（去掉无意义尾零）', () => {
    expect(formatConstraintEditorValue(constraint('angle', Math.PI / 2))).toBe('90');
    expect(formatConstraintEditorValue(constraint('angle', Math.PI / 3))).toBe('60');
    expect(formatConstraintEditorValue(constraint('angle', Math.PI * 1.5))).toBe('270');
    expect(formatConstraintEditorValue(constraint('angle', -Math.PI / 4))).toBe('45');
  });

  it('线性尺寸原样显示；缺值显示空串', () => {
    expect(formatConstraintEditorValue(constraint('length', 82.55))).toBe('82.55');
    expect(formatConstraintEditorValue(constraint('radius', 4))).toBe('4');
    expect(formatConstraintEditorValue(constraint('distance'))).toBe('');
  });
});

describe('parseConstraintEditorValue', () => {
  it('角度输入度 → 契约弧度', () => {
    expect(parseConstraintEditorValue('angle', '45')).toBeCloseTo(Math.PI / 4, 12);
    expect(parseConstraintEditorValue('angle', '60.5')).toBeCloseTo(60.5 * Math.PI / 180, 12);
  });

  it('角度 ≤0 / ≥360 / 非数字拒收（返回 undefined）', () => {
    expect(parseConstraintEditorValue('angle', '0')).toBeUndefined();
    expect(parseConstraintEditorValue('angle', '-5')).toBeUndefined();
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
