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

  it('active sketch curves draw solid orange (editing sketch overlay)', () => {
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
    };
    decoration.drawDecoration(ctx);
    expect(ctx.strokeStyle).toBe('#ff9f2f');
    expect(ctx.lineWidth).toBe(1.8);
    expect(ctx.setLineDash).toHaveBeenCalledWith([]);
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
