/**
 * SketchConstraintGlyphsDecoration（Onshape 约束 glyph，2026-11-12）：
 * 投影/上移放置、重叠右移避让、非空间视口 no-op、setGlyphs 失效重绘、dispose。
 * 2026-11-16 live 像素：未选中 chip 纯白填充、无方块描边，符号 #555555
 *（选中 #E2F0FA 由 web 层 HTML overlay 负责，不在此断言）。
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
  type SketchConstraintGlyphAnnotation,
  SketchConstraintGlyphsDecoration,
} from '../decorations/sketch-constraint-glyphs-decoration.js';

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

/** 记录每次 fill/stroke 时的样式，用于断言方块“只有白 fill、没有 stroke”。 */
function makeRecordingCtx() {
  const fills: string[] = [];
  const strokes: string[] = [];
  const mocks = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    rect: vi.fn(),
    arc: vi.fn(),
    setLineDash: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
  };
  mocks.fill.mockImplementation(() => { fills.push(mocks.fillStyle); });
  mocks.stroke.mockImplementation(() => { strokes.push(mocks.strokeStyle); });
  return { ctx: mocks as unknown as CanvasRenderingContext2D, mocks, fills, strokes };
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
  it('投影锚点并整体上移 16px；方块 20px（2026-11-15 live 实测）', () => {
    // live dpr2 像素量取：选中 chip 浅蓝填充 40×40 设备 px = 20×20 CSS px。
    expect(CONSTRAINT_GLYPH_SIZE).toBe(20);
    const { viewport } = makeViewport();
    const layout = layoutSketchConstraintGlyphs([glyph('constraint-3', 'horizontal', 5, 10)], viewport);
    expect(layout).toHaveLength(1);
    expect(layout[0].center).toEqual({ x: 50, y: 300 - 100 - 16 });
    expect(layout[0].rect.right - layout[0].rect.left).toBeCloseTo(CONSTRAINT_GLYPH_SIZE, 9);
  });

  it('同一锚点重叠时向右平移一格（Onshape 成排）', () => {
    const { viewport } = makeViewport();
    const layout = layoutSketchConstraintGlyphs([
      glyph('constraint-1', 'horizontal', 5, 10),
      glyph('constraint-2', 'vertical', 5, 10),
    ], viewport);
    expect(layout).toHaveLength(2);
    expect(layout[1].center.x - layout[0].center.x).toBeGreaterThan(layout[0].rect.right - layout[0].rect.left);
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
      expect(ctx.stroke.mock.calls.length + ctx.fill.mock.calls.length).toBeGreaterThan(0);
    }
  });

  it('符号颜色 #555555（live 2026-11-16 采样，不再是深色）', () => {
    const ctx = makeCtx();
    drawConstraintGlyphSymbol(ctx as unknown as CanvasRenderingContext2D, 'horizontal', 20, 20);
    expect(ctx.strokeStyle).toBe('#555555');
    expect(ctx.fillStyle).toBe('#555555');
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

  it('未选中 chip：20px 纯白 #ffffff 填充、无方块描边；符号 #555555（live 2026-11-16）', () => {
    const annotation = glyph('constraint-1', 'horizontal', 1, 1);
    const { viewport } = makeViewport();
    const decoration = new SketchConstraintGlyphsDecoration(viewport, [annotation]);
    const { context, addCanvasDecoration } = makeContext(viewport);
    decoration.decorate(context);
    expect(addCanvasDecoration).toHaveBeenCalledTimes(1);

    const { drawDecoration } = addCanvasDecoration.mock.calls[0][0] as {
      drawDecoration: (ctx: CanvasRenderingContext2D) => void;
    };
    const { ctx, mocks, fills, strokes } = makeRecordingCtx();
    drawDecoration(ctx);

    const [expected] = layoutSketchConstraintGlyphs([annotation], viewport);
    expect(mocks.rect).toHaveBeenCalledTimes(1);
    expect(mocks.rect).toHaveBeenCalledWith(
      expected.rect.left,
      expected.rect.top,
      CONSTRAINT_GLYPH_SIZE,
      CONSTRAINT_GLYPH_SIZE,
    );
    // 方块只有白 fill；horizontal 符号仅一条横线。若深色方块描边回归，strokes 会多一次。
    expect(fills).toEqual(['#ffffff']);
    expect(strokes).toEqual(['#555555']);
    decoration.dispose();
  });
});
