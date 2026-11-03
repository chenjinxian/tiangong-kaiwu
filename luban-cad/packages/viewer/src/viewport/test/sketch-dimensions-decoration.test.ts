/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * SketchDimensionsDecoration：活动草图尺寸标注的屏幕空间绘制（Onshape live）。
 * 验证投影、文本、setAnnotations 失效重绘、空集/非空间视口 no-op、dispose。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecorateContext, ScreenViewport } from '@itwin/core-frontend';
import { Point3d, Vector3d } from '@itwin/core-geometry';

const { addDecoratorMock, removeListenerMock } = vi.hoisted(() => {
  const remove = vi.fn();
  return { addDecoratorMock: vi.fn((_decorator: unknown) => remove), removeListenerMock: remove };
});

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: { viewManager: { addDecorator: addDecoratorMock } },
}));

import { SketchDimensionsDecoration } from '../decorations/sketch-dimensions-decoration.js';
import type { SketchDimensionAnnotation } from '../decorations/sketch-dimensions-decoration.js';

function makeViewport(spatial = true): { viewport: ScreenViewport; invalidate: ReturnType<typeof vi.fn> } {
  const invalidate = vi.fn();
  const viewport = {
    view: { isSpatialView: () => spatial },
    worldToView: vi.fn((p: Point3d) => ({ x: p.x * 10, y: 300 - p.y * 10 })),
    invalidateScene: invalidate,
  } as unknown as ScreenViewport;
  return { viewport, invalidate };
}

function makeContext(viewport: ScreenViewport, spatial = true): {
  context: DecorateContext;
  addCanvasDecoration: ReturnType<typeof vi.fn>;
} {
  const addCanvasDecoration = vi.fn();
  const context = {
    viewport: { ...viewport, view: { isSpatialView: () => spatial } },
    addCanvasDecoration,
  } as unknown as DecorateContext;
  return { context, addCanvasDecoration };
}

function makeCtx(): Record<string, ReturnType<typeof vi.fn>> & {
  fillText: ReturnType<typeof vi.fn>;
  strokeText: ReturnType<typeof vi.fn>;
} {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    setLineDash: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
  } as unknown as Record<string, ReturnType<typeof vi.fn>> & {
    fillText: ReturnType<typeof vi.fn>;
    strokeText: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  addDecoratorMock.mockReturnValue(removeListenerMock);
});

describe('SketchDimensionsDecoration', () => {
  it('线性尺寸：投影锚点、绘制尺寸线/延长线/箭头并写出数值', () => {
    const { viewport } = makeViewport();
    const annotations: SketchDimensionAnnotation[] = [{
      kind: 'linear',
      id: 'dimension-1',
      a: Point3d.create(0, 0, 0),
      b: Point3d.create(10, 0, 0),
      side: Vector3d.create(0, -1, 0),
      text: '82.55',
    }];
    const deco = new SketchDimensionsDecoration(viewport, annotations);
    expect(addDecoratorMock).toHaveBeenCalledWith(deco);

    const { context, addCanvasDecoration } = makeContext(viewport);
    deco.decorate(context);
    expect(addCanvasDecoration).toHaveBeenCalledTimes(1);

    const decoration = addCanvasDecoration.mock.calls[0]![0] as { drawDecoration: (ctx: unknown) => void };
    const ctx = makeCtx();
    decoration.drawDecoration(ctx);

    expect(ctx.fillText).toHaveBeenCalledWith('82.55', expect.any(Number), expect.any(Number));
    // 尺寸线 + 两条延长线至少 3 次 stroke。
    expect(ctx.stroke.mock.calls.length).toBeGreaterThanOrEqual(3);
    // 两端箭头填充。
    expect(ctx.fill.mock.calls.length).toBeGreaterThanOrEqual(2);
    // 锚点确实投影过（2 锚点 + 侧向点）。
    expect(viewport.worldToView).toHaveBeenCalled();
  });

  it('径向尺寸：圆心-弧点引线 + R 文本', () => {
    const { viewport } = makeViewport();
    const annotations: SketchDimensionAnnotation[] = [{
      kind: 'radial',
      id: 'dimension-2',
      center: Point3d.create(0, 0, 0),
      point: Point3d.create(5, 0, 0),
      side: Vector3d.create(1, 0, 0),
      text: 'R15.875',
    }];
    const deco = new SketchDimensionsDecoration(viewport, annotations);
    const { context, addCanvasDecoration } = makeContext(viewport);
    deco.decorate(context);
    const decoration = addCanvasDecoration.mock.calls[0]![0] as { drawDecoration: (ctx: unknown) => void };
    const ctx = makeCtx();
    decoration.drawDecoration(ctx);

    expect(ctx.fillText).toHaveBeenCalledWith('R15.875', expect.any(Number), expect.any(Number));
    expect(ctx.stroke.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('setAnnotations 触发 invalidate；空集/非空间视图不添加装饰；dispose 反注册', () => {
    const { viewport, invalidate } = makeViewport();
    const deco = new SketchDimensionsDecoration(viewport);
    deco.setAnnotations([{
      kind: 'linear',
      id: 'dimension-3',
      a: Point3d.create(0, 0, 0),
      b: Point3d.create(1, 0, 0),
      side: Vector3d.create(0, -1, 0),
      text: '1',
    }]);
    expect(invalidate).toHaveBeenCalledTimes(1);

    const empty = makeContext(viewport);
    new SketchDimensionsDecoration(viewport).decorate(empty.context);
    expect(empty.addCanvasDecoration).not.toHaveBeenCalled();

    const nonSpatialViewport = makeViewport(false);
    const nonSpatial = makeContext(nonSpatialViewport.viewport, false);
    nonSpatialViewport.viewport = nonSpatial.context.viewport;
    deco.decorate(nonSpatial.context);
    expect(nonSpatial.addCanvasDecoration).not.toHaveBeenCalled();

    deco.dispose();
    expect(removeListenerMock).toHaveBeenCalledTimes(1);
  });
});
