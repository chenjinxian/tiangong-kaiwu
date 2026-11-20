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

import {
  layoutSketchDimensions,
  type SketchDimensionAnnotation,
  sketchDimensionLabels,
  SketchDimensionsDecoration,
} from '../decorations/sketch-dimensions-decoration.js';

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

    const decoration = addCanvasDecoration.mock.calls[0][0] as { drawDecoration: (ctx: unknown) => void };
    const ctx = makeCtx();
    decoration.drawDecoration(ctx);

    expect(ctx.fillText).toHaveBeenCalledWith('82.55', expect.any(Number), expect.any(Number));
    // 尺寸线 + 两条延长线至少 3 次 stroke。
    expect(ctx.stroke.mock.calls.length).toBeGreaterThanOrEqual(3);
    // 两端箭头填充。
    expect(ctx.fill.mock.calls.length).toBeGreaterThanOrEqual(2);
    // 锚点确实投影过（2 锚点 + 侧向点）。
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(vi.mocked(viewport.worldToView).mock.calls.length).toBeGreaterThan(0);
  });

  it('表达式气泡：标签携带气泡文本/包围盒，绘制在数值上方（live S2u4）', () => {
    const { viewport } = makeViewport();
    const annotations: SketchDimensionAnnotation[] = [{
      kind: 'linear',
      id: 'dimension-1b',
      a: Point3d.create(0, 0, 0),
      b: Point3d.create(10, 0, 0),
      side: Vector3d.create(0, -1, 0),
      text: 'ƒ Ø10',
      expressionText: '(5*2) mm',
    }];
    const layout = layoutSketchDimensions(annotations, viewport);
    const labels = sketchDimensionLabels(layout);
    expect(labels[0]).toMatchObject({ text: 'ƒ Ø10', expressionText: '(5*2) mm' });
    expect(labels[0].expressionRect).toBeDefined();
    // 气泡紧贴数值上方（屏幕 y 更小）。
    expect(labels[0].expressionRect!.bottom).toBeLessThanOrEqual(labels[0].rect.top + 0.001);

    const deco = new SketchDimensionsDecoration(viewport, annotations);
    const { context, addCanvasDecoration } = makeContext(viewport);
    deco.decorate(context);
    const decoration = addCanvasDecoration.mock.calls[0][0] as { drawDecoration: (ctx: unknown) => void };
    const ctx = makeCtx();
    decoration.drawDecoration(ctx);
    const texts = ctx.fillText.mock.calls.map((call) => call[0]);
    expect(texts).toEqual(expect.arrayContaining(['ƒ Ø10', '(5*2) mm']));
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
    const decoration = addCanvasDecoration.mock.calls[0][0] as { drawDecoration: (ctx: unknown) => void };
    const ctx = makeCtx();
    decoration.drawDecoration(ctx);

    expect(ctx.fillText).toHaveBeenCalledWith('R15.875', expect.any(Number), expect.any(Number));
    expect(ctx.stroke.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('角度尺寸：顶点+两射线 → 弧布局/度数标签；绘制弧与文本', () => {
    const { viewport } = makeViewport();
    const annotations: SketchDimensionAnnotation[] = [{
      kind: 'angular',
      id: 'dimension-4',
      vertex: Point3d.create(0, 0, 0),
      a: Point3d.create(10, 0, 0),
      b: Point3d.create(0, 10, 0),
      text: '90°',
    }];
    const layout = layoutSketchDimensions(annotations, viewport);
    expect(layout).toHaveLength(1);
    expect(layout[0].kind).toBe('angular');
    const labels = sketchDimensionLabels(layout);
    expect(labels[0]).toMatchObject({ id: 'dimension-4', kind: 'angular', text: '90°' });
    expect(labels[0].rect.right).toBeGreaterThan(labels[0].rect.left);

    const deco = new SketchDimensionsDecoration(viewport, annotations);
    const { context, addCanvasDecoration } = makeContext(viewport);
    deco.decorate(context);
    const decoration = addCanvasDecoration.mock.calls[0][0] as { drawDecoration: (ctx: unknown) => void };
    const ctx = makeCtx();
    decoration.drawDecoration(ctx);
    expect(ctx.fillText).toHaveBeenCalledWith('90°', expect.any(Number), expect.any(Number));
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.stroke.mock.calls.length).toBeGreaterThanOrEqual(2);
    deco.dispose();
  });

  it('角度尺寸表达式气泡：标签暴露 expressionText/expressionRect，绘制包含气泡文本（live S2u4）', () => {
    const { viewport } = makeViewport();
    const annotations: SketchDimensionAnnotation[] = [{
      kind: 'angular',
      id: 'dimension-4b',
      vertex: Point3d.create(0, 0, 0),
      a: Point3d.create(10, 0, 0),
      b: Point3d.create(0, 10, 0),
      text: '45°',
      expressionText: '(5*2) deg',
    }];
    const layout = layoutSketchDimensions(annotations, viewport);
    expect(layout).toHaveLength(1);
    const labels = sketchDimensionLabels(layout);
    expect(labels[0]).toMatchObject({ kind: 'angular', text: '45°', expressionText: '(5*2) deg' });
    expect(labels[0].expressionRect).toBeDefined();
    // 气泡紧贴数值上方（屏幕 y 更小），数值命中框保持不变。
    expect(labels[0].expressionRect!.bottom).toBeLessThanOrEqual(labels[0].rect.top + 0.001);

    const deco = new SketchDimensionsDecoration(viewport, annotations);
    const { context, addCanvasDecoration } = makeContext(viewport);
    deco.decorate(context);
    const decoration = addCanvasDecoration.mock.calls[0][0] as { drawDecoration: (ctx: unknown) => void };
    const ctx = makeCtx();
    decoration.drawDecoration(ctx);
    const texts = ctx.fillText.mock.calls.map((call) => call[0]);
    expect(texts).toEqual(expect.arrayContaining(['45°', '(5*2) deg']));
    deco.dispose();
  });

  it('角度尺寸表达式气泡参与避让：仅与气泡重叠的相邻标签被堆叠（live S2u4 回归）', () => {
    const { viewport } = makeViewport();
    const angular = (expressionText?: string): SketchDimensionAnnotation => ({
      kind: 'angular',
      id: 'dimension-4c',
      vertex: Point3d.create(0, 0, 0),
      a: Point3d.create(10, 0, 0),
      b: Point3d.create(0, 10, 0),
      text: '45°',
      ...(expressionText ? { expressionText } : {}),
    });
    // 线性标注初始位置只与角度气泡重叠（y 236.2–252.2），不与角度数值命中框
    // 重叠（y 255.2–271.2）；因此只有气泡参与避让时它才会被堆叠。
    const linear: SketchDimensionAnnotation = {
      kind: 'linear',
      id: 'dimension-4d',
      a: Point3d.create(2, 1.28, 0),
      b: Point3d.create(2.4, 1.28, 0),
      side: Vector3d.create(0, 1, 0),
      text: '10',
    };

    const withoutBubble = layoutSketchDimensions([angular(), linear], viewport);
    const withBubble = layoutSketchDimensions([angular('(5*2) deg'), linear], viewport);
    expect(withoutBubble).toHaveLength(2);
    expect(withBubble).toHaveLength(2);
    expect(withoutBubble[1].kind).toBe('linear');
    expect(withBubble[1].kind).toBe('linear');
    // 无气泡：线性标签留在初始位置（不重叠）。
    expect(withoutBubble[1].labelCenter.y).toBeCloseTo(244.2, 5);
    // 有气泡：初始位置与气泡重叠 → 沿侧向堆叠 STACK_STEP=22px。
    expect(withBubble[1].labelCenter.y).toBeCloseTo(222.2, 5);
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
