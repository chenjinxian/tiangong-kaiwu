/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * SketchCurvesDecoration（2026-11-02）：屏幕空间灰色虚线、无深度遮挡、
 * dispose 反注册、空集/非空间视图 no-op。
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

import { SketchCurvesDecoration } from '../decorations/sketch-curves-decoration.js';

function makeViewport(): { viewport: ScreenViewport; invalidate: ReturnType<typeof vi.fn> } {
  const invalidate = vi.fn();
  const viewport = {
    view: { isSpatialView: () => true },
    worldToView: vi.fn((p: Point3d) => ({ x: p.x * 10, y: p.y * 10 })),
    invalidateScene: invalidate,
  } as unknown as ScreenViewport;
  return { viewport, invalidate };
}

function makeContext(viewport: ScreenViewport, isSpatial = true): {
  context: DecorateContext;
  addCanvasDecoration: ReturnType<typeof vi.fn>;
} {
  const addCanvasDecoration = vi.fn();
  const context = {
    viewport: { ...viewport, view: { ...viewport.view, isSpatialView: () => isSpatial } },
    addCanvasDecoration,
  } as unknown as DecorateContext;
  return { context, addCanvasDecoration };
}

/** 记录型 canvas 桩：按 stroke()/fill() 时点的样式取样（E5 高亮断言用）。 */
function makeRecordingCtx(): {
  ctx: Record<string, unknown>;
  strokes: { style: string; width: number }[];
  fills: { style: string; radius: number }[];
} {
  let strokeStyle = '';
  let lineWidth = 0;
  let fillStyle = '';
  let lastRadius = 0;
  const strokes: { style: string; width: number }[] = [];
  const fills: { style: string; radius: number }[] = [];
  const ctx: Record<string, unknown> = {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(() => { strokes.push({ style: strokeStyle, width: lineWidth }); }),
    arc: vi.fn((_x: number, _y: number, radius: number) => { lastRadius = radius; }),
    fill: vi.fn(() => { fills.push({ style: fillStyle, radius: lastRadius }); }),
    closePath: vi.fn(),
  };
  Object.defineProperty(ctx, 'strokeStyle', {
    get: () => strokeStyle,
    set: (value: string) => { strokeStyle = value; },
  });
  Object.defineProperty(ctx, 'lineWidth', {
    get: () => lineWidth,
    set: (value: number) => { lineWidth = value; },
  });
  Object.defineProperty(ctx, 'fillStyle', {
    get: () => fillStyle,
    set: (value: string) => { fillStyle = value; },
  });
  return { ctx, strokes, fills };
}

beforeEach(() => {
  vi.clearAllMocks();
  addDecoratorMock.mockReturnValue(removeListenerMock);
});

describe('SketchCurvesDecoration', () => {
  it('projects world polylines to screen and draws dashed strokes', () => {
    const { viewport } = makeViewport();
    const polylines = [{ points: [Point3d.create(0, 0, 0), Point3d.create(2, 1, 0)] }];
    const deco = new SketchCurvesDecoration(viewport, polylines);
    expect(addDecoratorMock).toHaveBeenCalledWith(deco);

    const { context, addCanvasDecoration } = makeContext(viewport);
    deco.decorate(context);
    expect(addCanvasDecoration).toHaveBeenCalledTimes(1);

    const decoration = addCanvasDecoration.mock.calls[0][0] as { drawDecoration: (ctx: unknown) => void };
    const ctx = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      setLineDash: vi.fn(),
      strokeStyle: '',
      lineWidth: 0,
    };
    decoration.drawDecoration(ctx);
    expect(ctx.setLineDash).toHaveBeenCalledWith([5, 3]);
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(20, 10);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(vi.mocked(viewport.worldToView).mock.calls).toHaveLength(2);

    deco.dispose();
    expect(removeListenerMock).toHaveBeenCalledTimes(1);
  });

  it('活动草图欠约束=蓝色实线（Onshape live 采样 #1a1acc）', () => {
    const { viewport } = makeViewport();
    const deco = new SketchCurvesDecoration(
      viewport,
      [{ sketchId: 'sk-active', points: [Point3d.create(0, 0, 0), Point3d.create(1, 0, 0)] }],
      'sk-active',
    );
    const { context, addCanvasDecoration } = makeContext(viewport);
    deco.decorate(context);
    const decoration = addCanvasDecoration.mock.calls[0][0] as { drawDecoration: (ctx: unknown) => void };
    const ctx = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      setLineDash: vi.fn(),
      strokeStyle: '',
      lineWidth: 0,
      fillStyle: '',
      arc: vi.fn(),
      fill: vi.fn(),
    };
    decoration.drawDecoration(ctx);
    expect(ctx.strokeStyle).toBe('#1a1acc');
    expect(ctx.lineWidth).toBe(1.8);
    expect(ctx.setLineDash).toHaveBeenCalledWith([]);
  });

  it('全约束=黑色 / 失败=红色 / 构造=虚线', () => {
    const draw = (constraintState: 'constrained' | 'error', construction?: boolean): { strokeStyle: string; dashCalls: unknown[] } => {
      const { viewport } = makeViewport();
      const deco = new SketchCurvesDecoration(
        viewport,
        [{ sketchId: 'sk-active', points: [Point3d.create(0, 0, 0), Point3d.create(1, 0, 0)], ...(construction ? { construction: true } : {}) }],
        'sk-active',
        { constraintState },
      );
      const { context, addCanvasDecoration } = makeContext(viewport);
      deco.decorate(context);
      const decoration = addCanvasDecoration.mock.calls[0][0] as { drawDecoration: (ctx: unknown) => void };
      const dashCalls: unknown[] = [];
      const ctx = {
        beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
        setLineDash: vi.fn((d: unknown) => { dashCalls.push(d); }),
        strokeStyle: '', lineWidth: 0, fillStyle: '', arc: vi.fn(), fill: vi.fn(),
      };
      decoration.drawDecoration(ctx);
      return { strokeStyle: ctx.strokeStyle, dashCalls };
    };
    expect(draw('constrained').strokeStyle).toBe('#1f1f1f');
    expect(draw('error').strokeStyle).toBe('#c0392b');
    // 控制点绘制前会 setLineDash([])，故断言包含构造虚线调用而非最后一次调用值。
    expect(draw('constrained', true).dashCalls).toContainEqual([5, 3]);
    expect(draw('constrained', false).dashCalls).not.toContainEqual([5, 3]);
  });

  it('活动草图控制点=蓝色小圆点（world→screen 后 arc+fill）', () => {
    const { viewport } = makeViewport();
    const deco = new SketchCurvesDecoration(
      viewport,
      [{ sketchId: 'sk-active', points: [Point3d.create(0, 0, 0), Point3d.create(1, 0, 0)] }],
      'sk-active',
      {
        constraintState: 'underconstrained',
        controlPoints: [
          { sketchId: 'sk-active', position: Point3d.create(0, 0, 0) },
          { sketchId: 'other', position: Point3d.create(5, 5, 0) },
        ],
      },
    );
    const { context, addCanvasDecoration } = makeContext(viewport);
    deco.decorate(context);
    const decoration = addCanvasDecoration.mock.calls[0][0] as { drawDecoration: (ctx: unknown) => void };
    const ctx = {
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
      setLineDash: vi.fn(), strokeStyle: '', lineWidth: 0,
      fillStyle: '', arc: vi.fn(), fill: vi.fn(),
    };
    decoration.drawDecoration(ctx);
    // 只画活动草图的控制点（other 被过滤），半径 2.4。
    expect(ctx.arc).toHaveBeenCalledTimes(1);
    expect(ctx.arc).toHaveBeenCalledWith(0, 0, 2.4, 0, Math.PI * 2);
    expect(ctx.fillStyle).toBe('#1a1acc');
    expect(ctx.fill).toHaveBeenCalledTimes(1);
  });

  it('E5：被引用实体在活动草图叠画黄绿高亮（#e8f588 / 3.2），未引用/非活动草图不画', () => {
    const { viewport } = makeViewport();
    const line = [Point3d.create(0, 0, 0), Point3d.create(1, 0, 0)];
    const deco = new SketchCurvesDecoration(
      viewport,
      [
        { sketchId: 'sk-active', entityId: 7, points: line },
        { sketchId: 'sk-active', entityId: 8, points: [Point3d.create(0, 1, 0), Point3d.create(1, 1, 0)] },
        // 非活动草图的同 id 曲线不参与高亮。
        { sketchId: 'sk-other', entityId: 7, points: [Point3d.create(0, 2, 0), Point3d.create(1, 2, 0)] },
      ],
      'sk-active',
      { highlightedEntityIds: [7] },
    );
    expect(deco.highlightedEntityIds).toEqual([7]);

    const { context, addCanvasDecoration } = makeContext(viewport);
    deco.decorate(context);
    const decoration = addCanvasDecoration.mock.calls[0][0] as { drawDecoration: (ctx: unknown) => void };
    const { ctx, strokes } = makeRecordingCtx();
    decoration.drawDecoration(ctx);

    // 常规 pass 3 条 + 高亮 pass 1 条（entity 7 活动草图）。
    const highlight = strokes.filter((entry) => entry.style === '#e8f588');
    expect(highlight).toHaveLength(1);
    expect(highlight[0].width).toBe(3.2);
    expect(strokes).toHaveLength(4);
  });

  it('E5：高亮实体控制点=橙色 r3.6；普通控制点仍是蓝色 r2.4', () => {
    const { viewport } = makeViewport();
    const deco = new SketchCurvesDecoration(
      viewport,
      [{ sketchId: 'sk-active', entityId: 7, points: [Point3d.create(0, 0, 0), Point3d.create(1, 0, 0)] }],
      'sk-active',
      {
        highlightedEntityIds: [7],
        controlPoints: [
          { sketchId: 'sk-active', entityId: 7, position: Point3d.create(0, 0, 0) },
          { sketchId: 'sk-active', entityId: 8, position: Point3d.create(1, 0, 0) },
        ],
      },
    );
    const { context, addCanvasDecoration } = makeContext(viewport);
    deco.decorate(context);
    const decoration = addCanvasDecoration.mock.calls[0][0] as { drawDecoration: (ctx: unknown) => void };
    const { ctx, fills } = makeRecordingCtx();
    decoration.drawDecoration(ctx);

    expect(fills).toEqual([
      { style: '#f0b93f', radius: 3.6 },
      { style: '#1a1acc', radius: 2.4 },
    ]);
  });

  it('setHighlightedEntities 更新高亮集并 invalidateScene（setPolylines 选项同源）', () => {
    const { viewport, invalidate } = makeViewport();
    const deco = new SketchCurvesDecoration(viewport);
    deco.setHighlightedEntities([3, 4]);
    expect(deco.highlightedEntityIds).toEqual([3, 4]);
    expect(invalidate).toHaveBeenCalledTimes(1);

    deco.setPolylines([], undefined, { highlightedEntityIds: [9] });
    expect(deco.highlightedEntityIds).toEqual([9]);
    expect(invalidate).toHaveBeenCalledTimes(2);

    deco.setPolylines([]);
    expect(deco.highlightedEntityIds).toEqual([]);
    expect(invalidate).toHaveBeenCalledTimes(3);
  });

  it('setPolylines invalidates; empty set / non-spatial view draw nothing', () => {
    const { viewport, invalidate } = makeViewport();
    const deco = new SketchCurvesDecoration(viewport);
    deco.setPolylines([{ points: [Point3d.create(0, 0, 0), Point3d.create(1, 1, 1)] }]);
    expect(invalidate).toHaveBeenCalledTimes(1);

    const empty = makeContext(viewport);
    const decoEmpty = new SketchCurvesDecoration(viewport);
    decoEmpty.decorate(empty.context);
    expect(empty.addCanvasDecoration).not.toHaveBeenCalled();

    const nonSpatial = makeContext(viewport, false);
    deco.decorate(nonSpatial.context);
    expect(nonSpatial.addCanvasDecoration).not.toHaveBeenCalled();
  });
});
