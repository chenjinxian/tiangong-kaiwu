/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * DatumPlanesDecoration（2026-11-02）：三平面 + Origin 绘制、逐项可见性、
 * dispose 反注册、非空间视图 no-op。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecorateContext, ScreenViewport } from '@itwin/core-frontend';

const { addDecoratorMock, removeListenerMock } = vi.hoisted(() => {
  const remove = vi.fn();
  return { addDecoratorMock: vi.fn((_decorator: unknown) => remove), removeListenerMock: remove };
});

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: { viewManager: { addDecorator: addDecoratorMock } },
  GraphicType: { WorldDecoration: 1, WorldOverlay: 2 },
}));

import { DatumPlanesDecoration } from '../decorations/datum-planes-decoration.js';

function makeViewport(): { viewport: ScreenViewport; invalidate: ReturnType<typeof vi.fn> } {
  const invalidate = vi.fn();
  const viewport = {
    view: {
      getExtents: () => ({ x: 100, y: 100, z: 100 }),
      isSpatialView: () => true,
    },
    worldToView: vi.fn(() => ({ x: 10, y: 20 })),
    invalidateScene: invalidate,
  } as unknown as ScreenViewport;
  return { viewport, invalidate };
}

function makeContext(viewport: ScreenViewport, isSpatial = true): {
  context: DecorateContext;
  createGraphicBuilder: ReturnType<typeof vi.fn>;
  addDecorationFromBuilder: ReturnType<typeof vi.fn>;
  addCanvasDecoration: ReturnType<typeof vi.fn>;
  builders: Array<{
    setSymbology: ReturnType<typeof vi.fn>;
    addShape: ReturnType<typeof vi.fn>;
    addLineString: ReturnType<typeof vi.fn>;
  }>;
} {
  const queue = Array.from({ length: 3 }, () => ({
    setSymbology: vi.fn(),
    addShape: vi.fn(),
    addLineString: vi.fn(),
  }));
  const builders = [...queue];
  const addCanvasDecoration = vi.fn();
  const createGraphicBuilder = vi.fn(() => queue.shift());
  const addDecorationFromBuilder = vi.fn();
  const context = {
    viewport: { ...viewport, view: { ...viewport.view, isSpatialView: () => isSpatial } },
    createGraphicBuilder,
    addDecorationFromBuilder,
    addCanvasDecoration,
  } as unknown as DecorateContext;
  return { context, createGraphicBuilder, addDecorationFromBuilder, addCanvasDecoration, builders };
}

beforeEach(() => {
  vi.clearAllMocks();
  addDecoratorMock.mockReturnValue(removeListenerMock);
});

describe('DatumPlanesDecoration', () => {
  it('registers and draws three planes + origin labels', () => {
    const { viewport } = makeViewport();
    const deco = new DatumPlanesDecoration(viewport, { origin: true, top: true, front: true, right: true });
    expect(addDecoratorMock).toHaveBeenCalledWith(deco);
    const context = makeContext(viewport);
    deco.decorate(context.context);
    // 3 planes → 3 builders; labels Top/Front/Right + Origin overlay = 4 canvas decorations.
    expect(context.addCanvasDecoration).toHaveBeenCalledTimes(4);
    expect(context.addDecorationFromBuilder).toHaveBeenCalledTimes(3);
    // Onshape 基准面有边框：每面 fill(addShape) + 1 条闭合折线(addLineString)。
    for (const builder of context.builders) {
      expect(builder.addShape).toHaveBeenCalledTimes(1);
      expect(builder.addLineString).toHaveBeenCalledTimes(1);
      const loop = builder.addLineString.mock.calls[0]?.[0] as unknown[];
      expect(loop).toHaveLength(5);
      expect(loop[0]).toBe(loop[4]);
    }
    deco.dispose();
    expect(removeListenerMock).toHaveBeenCalledTimes(1);
  });

  it('hides individual planes without re-registering', () => {
    const { viewport, invalidate } = makeViewport();
    const deco = new DatumPlanesDecoration(viewport, { origin: true, top: true, front: true, right: true });
    deco.setVisibility({ origin: true, top: false, front: true, right: true });
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(addDecoratorMock).toHaveBeenCalledTimes(1);
    const context = makeContext(viewport);
    deco.decorate(context.context);
    expect(context.addDecorationFromBuilder).toHaveBeenCalledTimes(2);
    expect(context.addCanvasDecoration).toHaveBeenCalledTimes(3); // Front/Right labels + origin
    deco.setVisibility({ origin: true, top: false, front: true, right: true });
    expect(invalidate).toHaveBeenCalledTimes(1); // unchanged → no extra invalidation
  });

  it('no-ops for non-spatial views', () => {
    const { viewport } = makeViewport();
    const deco = new DatumPlanesDecoration(viewport, { origin: true, top: true, front: true, right: true });
    const context = makeContext(viewport, false);
    deco.decorate(context.context);
    expect(context.createGraphicBuilder).not.toHaveBeenCalled();
    expect(context.addCanvasDecoration).not.toHaveBeenCalled();
  });
});
