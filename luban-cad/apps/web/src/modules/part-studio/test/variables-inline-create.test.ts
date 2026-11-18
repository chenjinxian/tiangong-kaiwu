// src/modules/part-studio/test/variables-inline-create.test.ts
//
// ADR-0020 S4c review P2.2：内联创建单位 → 变量类型（角度表达式字段必须建
// angle 变量，否则字段的量纲门立即拒收）。
import { describe, expect, it } from 'vitest';
import { variableTypeForInlineCreateUnit } from '../internal/variables.js';

describe('variableTypeForInlineCreateUnit', () => {
  it('角度表达式字段（°）与草图角度编辑器（deg）→ angle', () => {
    expect(variableTypeForInlineCreateUnit('°')).toBe('angle');
    // SketchDimensionEditor / SketchValuePopup 传 'deg'；必须建 angle 变量。
    expect(variableTypeForInlineCreateUnit('deg')).toBe('angle');
  });

  it('长度/未知单位 → length（保持 S3 默认口径）', () => {
    expect(variableTypeForInlineCreateUnit('mm')).toBe('length');
    expect(variableTypeForInlineCreateUnit('in')).toBe('length');
    expect(variableTypeForInlineCreateUnit('')).toBe('length');
  });
});
