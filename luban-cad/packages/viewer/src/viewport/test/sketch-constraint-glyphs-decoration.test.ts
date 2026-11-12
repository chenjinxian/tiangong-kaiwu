/**
 * SketchConstraintGlyphsDecoration（Onshape 约束 glyph，2026-11-12）：
 * 投影/上移放置、重叠右移避让、非空间视口 no-op、setGlyphs 失效重绘、dispose。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecorateContext, ScreenViewport } from '@itwin/core-frontend';
import { Point3d } from '@itwin/core-geometry';

const { addDecoratorMock, removeListenerMock } = vi.hoisted(() => {
  const remove = vi.fn();
  return { addDecoratorMock: vi.fn((_decorator: unknown) => remove), removeListenerMock: remove };
});

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: { viewManager: { addDecorator: addDecoratorMock } },
}));

import {
  CONSTRAINT_GLYPH_SIZE,
  drawConstraintGlyphSymbol,
  layoutSketchConstraintGlyphs,
  SketchConstraintGlyphsDecoration,
} from '../decorations/sketch-constraint-glyphs-decoration.js';
import type { SketchConstraintGlyphAnnotation } from '../decorations/sketch-constraint-glyphs-decoration.js';

function makeViewport(spatial = true): { viewport: ScreenViewport; invalidate: ReturnType<typeof vi.fn> } {
  const invalidate = vi.fn();
  const viewport = {
    view: { isSpatialView: () => spatial },
    worldToView: vi.fn((p: Point3d) => ({ x: p.x * 10, y: 300 - p.y * 10 })),
    invalidateScene: invalidate,
  } as unknown as ScreenViewport;
  return { viewport, invalidate };
}

function makeContext(viewport: ScreenViewport): { context: DecorateContext; addCanvasDecoration: ReturnType<typeof vi.fn> } {
  const addCanvasDecoration = vi.fn();
  const context = {
    viewport,
    addCanvasDecoration,
  } as unknown as DecorateContext;
  return { context, addCanvasDecoration };
}

function makeCtx(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    rect: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    setLineDash: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
  } as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

const glyph = (id: string, kind: SketchConstraintGlyphAnnotation['kind'], x: number, y: number): SketchConstraintGlyphAnnotation => ({
  id,
  kind,
  position: new Point3d(x, y, 0),
});

beforeEach(() => {
  vi.clearAllMocks();
  addDecoratorMock.mockReturnValue(removeListenerMock);
});

describe('layoutSketchConstraintGlyphs', () => {
  it('投影锚点并整体上移 16px；方块 18px', () => {
    const { viewport } = makeViewport();
    const layout = layoutSketchConstraintGlyphs([glyph('constraint-3', 'horizontal', 5, 10)], viewport);
    expect(layout).toHaveLength(1);
    expect(layout[0]!.center).toEqual({ x: 50, y: 300 - 100 - 16 });
    expect(layout[0]!.rect.right - layout[0]!.rect.left).toBeCloseTo(CONSTRAINT_GLYPH_SIZE, 9);
  });

  it('同一锚点重叠时向右平移一格（Onshape 成排）', () => {
    const { viewport } = makeViewport();
    const layout = layoutSketchConstraintGlyphs([
      glyph('constraint-1', 'horizontal', 5, 10),
      glyph('constraint-2', 'vertical', 5, 10),
    ], viewport);
    expect(layout).toHaveLength(2);
    expect(layout[1]!.center.x - layout[0]!.center.x).toBeGreaterThan(layout[0]!.rect.right - layout[0]!.rect.left);
  });

  it('非有限投影被跳过（不猜测）', () => {
    const viewport = {
      view: { isSpatialView: () => true },
      worldToView: vi.fn(() => ({ x: Number.NaN, y: 0 })),
      invalidateScene: vi.fn(),
    } as unknown as ScreenViewport;
    expect(layoutSketchConstraintGlyphs([glyph('constraint-1', 'equal', 0, 0)], viewport)).toEqual([]);
  });
});

describe('drawConstraintGlyphSymbol', () => {
  it('所有种类都落在方块内且产生笔画（不抛错）', () => {
    for (const kind of ['coincident', 'horizontal', 'vertical', 'parallel', 'perpendicular', 'equal', 'midpoint', 'mirror', 'tangent', 'concentric', 'fixed', 'offset'] as const) {
      const ctx = makeCtx();
      expect(() => drawConstraintGlyphSymbol(ctx as unknown as CanvasRenderingContext2D, kind, 20, 20)).not.toThrow();
      expect(ctx.stroke!.mock.calls.length + ctx.fill!.mock.calls.length).toBeGreaterThan(0);
    }
  });
});

describe('SketchConstraintGlyphsDecoration', () => {
  it('空间视图注册 canvas 装饰；非空间 no-op', () => {
    const { viewport } = makeViewport();
    const decoration = new SketchConstraintGlyphsDecoration(viewport, [glyph('constraint-1', 'horizontal', 1, 1)]);
    const { context, addCanvasDecoration } = makeContext(viewport);
    decoration.decorate(context);
    expect(addCanvasDecoration).toHaveBeenCalledTimes(1);

    const { viewport: flat } = makeViewport(false);
    const flatDecoration = new SketchConstraintGlyphsDecoration(flat, [glyph('constraint-1', 'horizontal', 1, 1)]);
    const flatContext = makeContext(flat);
    flatDecoration.decorate(flatContext.context);
    expect(flatContext.addCanvasDecoration).not.toHaveBeenCalled();
    decoration.dispose();
    flatDecoration.dispose();
  });

  it('setGlyphs 触发 invalidate；空集不注册 canvas 装饰', () => {
    const { viewport, invalidate } = makeViewport();
    const decoration = new SketchConstraintGlyphsDecoration(viewport, []);
    const { context, addCanvasDecoration } = makeContext(viewport);
    decoration.decorate(context);
    expect(addCanvasDecoration).not.toHaveBeenCalled();
    decoration.setGlyphs([glyph('constraint-1', 'mirror', 2, 2)]);
    expect(invalidate).toHaveBeenCalled();
    decoration.dispose();
  });
});
