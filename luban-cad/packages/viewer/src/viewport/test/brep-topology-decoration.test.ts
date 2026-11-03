/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * BrepTopologyDecoration（2026-11-03）：完整 BRep 拓扑边/顶点叠加层的
 * 纯几何解析、缓存失效、空集/非空间视图 no-op 与 dispose 反注册。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecorateContext, ScreenViewport } from '@itwin/core-frontend';
import { ElementGeometry, type ElementGeometryDataEntry, ElementGeometryOpcode } from '@itwin/core-common';
import { LineString3d, Point3d, Vector3d } from '@itwin/core-geometry';

const { addDecoratorMock, removeListenerMock, invalidateCachedDecorationsMock } = vi.hoisted(() => {
  const remove = vi.fn();
  return {
    addDecoratorMock: vi.fn((_decorator: unknown) => remove),
    removeListenerMock: remove,
    invalidateCachedDecorationsMock: vi.fn(),
  };
});

vi.mock('@itwin/core-frontend', () => ({
  GraphicType: { Scene: 1, WorldOverlay: 2 },
  IModelApp: {
    viewManager: {
      addDecorator: addDecoratorMock,
      invalidateCachedDecorationsAllViews: invalidateCachedDecorationsMock,
    },
  },
}));

import {
  BrepTopologyDecoration,
  collectBrepEdgeCurves,
} from '../decorations/brep-topology-decoration.js';

function lineEntry(): ElementGeometryDataEntry {
  const builder = new ElementGeometry.Builder();
  builder.appendGeometryQuery(LineString3d.create(
    Point3d.create(0, 0, 0),
    Point3d.create(10, 0, 0),
    Point3d.create(10, 10, 0),
  ));
  return builder.entries[0];
}

function makeViewport(): ScreenViewport {
  return {
    view: {
      isSpatialView: () => true,
      getZVector: () => Vector3d.unitZ(),
    },
    getPixelSizeAtPoint: () => 0.5,
    worldToView: (p: Point3d) => ({ x: p.x * 10, y: p.y * 10, z: 0 }),
    invalidateDecorations: vi.fn(),
    invalidateScene: vi.fn(),
  } as unknown as ScreenViewport;
}

function makeContext(viewport: ScreenViewport, isSpatial = true): {
  context: DecorateContext;
  addDecorationFromBuilder: ReturnType<typeof vi.fn>;
  addCanvasDecoration: ReturnType<typeof vi.fn>;
  builder: { setSymbology: ReturnType<typeof vi.fn>; addCurvePrimitive: ReturnType<typeof vi.fn> };
} {
  const addDecorationFromBuilder = vi.fn();
  const addCanvasDecoration = vi.fn();
  const builder = { setSymbology: vi.fn(), addCurvePrimitive: vi.fn() };
  const context = {
    viewport: { ...viewport, view: { ...viewport.view, isSpatialView: () => isSpatial } },
    createGraphic: vi.fn(() => builder),
    addDecorationFromBuilder,
    addCanvasDecoration,
  } as unknown as DecorateContext;
  return { context, addDecorationFromBuilder, addCanvasDecoration, builder };
}

beforeEach(() => {
  vi.clearAllMocks();
  addDecoratorMock.mockReturnValue(removeListenerMock);
});

describe('collectBrepEdgeCurves', () => {
  it('parses ElementGeometry entries into curve primitives (one per topological edge)', () => {
    const curves: unknown[] = [];
    const count = collectBrepEdgeCurves(
      [{ key: 'body:1', entry: lineEntry(), range: { low: [0, 0, 0], high: [10, 10, 0] } }],
      (curve) => curves.push(curve),
    );
    expect(count).toBe(1);
    expect(curves).toHaveLength(1);
  });

  it('skips malformed entries instead of throwing', () => {
    const curves: unknown[] = [];
    const count = collectBrepEdgeCurves(
      [{ key: 'body:bad', entry: { opcode: ElementGeometryOpcode.CurvePrimitive, data: new Uint8Array(0) } }],
      (curve) => curves.push(curve),
    );
    expect(count).toBe(0);
    expect(curves).toHaveLength(0);
  });
});

describe('BrepTopologyDecoration', () => {
  it('registers/unregisters and invalidates cached decorations on topology/style changes', () => {
    const viewport = makeViewport();
    const deco = new BrepTopologyDecoration(viewport);
    expect(addDecoratorMock).toHaveBeenCalledWith(deco);
    expect(deco.useCachedDecorations).toBe(true);

    deco.setTopology({ edges: [], vertices: [] });
    expect(invalidateCachedDecorationsMock).toHaveBeenCalledWith(deco);

    invalidateCachedDecorationsMock.mockClear();
    deco.setOptions({ edgeColor: '#222222' });
    expect(invalidateCachedDecorationsMock).toHaveBeenCalledWith(deco);

    deco.dispose();
    expect(removeListenerMock).toHaveBeenCalledTimes(1);
  });

  it('draws all topology edges in a single scene graphic with per-edge depth offset', () => {
    const viewport = makeViewport();
    const deco = new BrepTopologyDecoration(viewport, {
      showEdges: true,
      showVertices: false,
      edgeColor: '#2b2b2b',
      edgeWidthPx: 2,
    });
    deco.setTopology({
      edges: [{ key: 'body:1', entry: lineEntry(), range: { low: [0, 0, 0], high: [10, 10, 0] } }],
      vertices: [],
    });
    const { context, addDecorationFromBuilder, builder } = makeContext(viewport);
    deco.decorate(context);
    expect(builder.addCurvePrimitive).toHaveBeenCalledTimes(1);
    expect(addDecorationFromBuilder).toHaveBeenCalledWith(builder);
  });

  it('vertex mode draws all vertices as screen dots; empty/non-spatial views are no-ops', () => {
    const viewport = makeViewport();
    const deco = new BrepTopologyDecoration(viewport, {
      showEdges: false,
      showVertices: true,
      edgeColor: '#2b2b2b',
      edgeWidthPx: 2,
    });
    deco.setTopology({ edges: [], vertices: [{ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }] });
    const { context, addCanvasDecoration } = makeContext(viewport);
    deco.decorate(context);
    expect(addCanvasDecoration).toHaveBeenCalledTimes(1);
    const decoration = addCanvasDecoration.mock.calls[0][0] as { drawDecoration: (ctx: unknown) => void };
    const ctx = {
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
    };
    decoration.drawDecoration(ctx);
    expect(ctx.arc).toHaveBeenCalledTimes(2);

    const empty = new BrepTopologyDecoration(viewport, {
      showEdges: true,
      showVertices: true,
      edgeColor: '#2b2b2b',
      edgeWidthPx: 2,
    });
    const emptyContext = makeContext(viewport);
    empty.decorate(emptyContext.context);
    expect(emptyContext.addDecorationFromBuilder).not.toHaveBeenCalled();
    expect(emptyContext.addCanvasDecoration).not.toHaveBeenCalled();

    const nonSpatial = makeContext(viewport, false);
    deco.decorate(nonSpatial.context);
    expect(nonSpatial.addCanvasDecoration).not.toHaveBeenCalled();
  });
});
