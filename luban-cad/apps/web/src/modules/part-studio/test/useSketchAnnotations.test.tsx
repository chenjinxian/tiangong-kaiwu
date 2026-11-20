/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 评审 Finding 8（2026-11-21）：工具预览尺寸标注只在草图编辑态暴露——
 * `active=false` 时 annotations 不得追加 previewAnnotation（与装饰器/编辑器
 * 同一 active 门）；`active=true` 时预览仍追加在基础标注之后。
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Point3d, Vector3d } from '@itwin/core-geometry';
import type { SketchDto } from '@luban-cad/shared';
import type { SketchDimensionAnnotation } from '@luban-cad/viewer';

const mocks = vi.hoisted(() => ({
  buildSketchDimensionAnnotations: vi.fn(),
  buildSketchConstraintGlyphs: vi.fn(),
}));

// 装饰器替身：本测试只验证 hook 的标注门，不启动 iTwin.js 装饰器。
vi.mock('@luban-cad/viewer', () => ({
  SketchDimensionsDecoration: class {
    public constructor() { /* noop */ }
    public setAnnotations(): void { /* noop */ }
    public dispose(): void { /* noop */ }
  },
  SketchConstraintGlyphsDecoration: class {
    public constructor() { /* noop */ }
    public setGlyphs(): void { /* noop */ }
    public dispose(): void { /* noop */ }
  },
}));

vi.mock('../internal/sketch-annotations.js', () => ({
  buildSketchDimensionAnnotations: mocks.buildSketchDimensionAnnotations,
}));

vi.mock('../internal/sketch-constraint-glyphs.js', () => ({
  buildSketchConstraintGlyphs: mocks.buildSketchConstraintGlyphs,
}));

import { useSketchAnnotations } from '../hooks/useSketchAnnotations.js';

const SKETCH = {} as SketchDto;

const BASE_ANNOTATION: SketchDimensionAnnotation = {
  kind: 'linear',
  id: 'dimension-1',
  a: Point3d.create(0, 0, 0),
  b: Point3d.create(10, 0, 0),
  side: Vector3d.create(0, -1, 0),
  text: '10',
};

const PREVIEW_ANNOTATION: SketchDimensionAnnotation = {
  kind: 'linear',
  id: '-1000',
  a: Point3d.create(0, 0, 0),
  b: Point3d.create(20, 0, 0),
  side: Vector3d.create(0, -1, 0),
  text: 'Ø20',
};

function stubBuilders(): void {
  mocks.buildSketchDimensionAnnotations.mockReturnValue([BASE_ANNOTATION]);
  mocks.buildSketchConstraintGlyphs.mockReturnValue([]);
}

describe('useSketchAnnotations 预览标注 active 门', () => {
  // 调用计数断言（toHaveBeenCalledTimes）不得依赖测试执行顺序。
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('active=false：不暴露基础标注、不追加预览标注', () => {
    stubBuilders();
    const { result } = renderHook(() =>
      useSketchAnnotations(undefined, SKETCH, false, undefined, PREVIEW_ANNOTATION));

    expect(result.current.annotations).toEqual([]);
    expect(result.current.glyphs).toEqual([]);
    expect(mocks.buildSketchDimensionAnnotations).not.toHaveBeenCalled();
  });

  it('active=true：预览标注追加在基础标注之后', () => {
    stubBuilders();
    const { result } = renderHook(() =>
      useSketchAnnotations(undefined, SKETCH, true, undefined, PREVIEW_ANNOTATION));

    expect(result.current.annotations.map((annotation) => annotation.id)).toEqual(['dimension-1', '-1000']);
    expect(mocks.buildSketchDimensionAnnotations).toHaveBeenCalledTimes(1);
  });

  it('active=true 无预览标注：只返回基础标注', () => {
    stubBuilders();
    const { result } = renderHook(() =>
      useSketchAnnotations(undefined, SKETCH, true));

    expect(result.current.annotations.map((annotation) => annotation.id)).toEqual(['dimension-1']);
  });
});
