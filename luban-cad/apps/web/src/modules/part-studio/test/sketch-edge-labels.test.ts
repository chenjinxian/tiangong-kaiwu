/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 绘制中贴边数值标签纯几何（2026-11-16 E6/S5 Onshape live）：矩形宽/高
 * 边段（草图局部）与视口标签布局（中点外移 + 正立旋转）。
 */
import { describe, expect, it } from 'vitest';
import {
  SKETCH_EDGE_LABEL_OFFSET_PX,
  layoutSketchEdgeLabel,
  sketchRectangleEdgeSegments,
} from '../tools/sketch/sketch-edge-labels.js';

describe('sketchRectangleEdgeSegments（矩形拖拽宽/高边段）', () => {
  it('拐角矩形：宽边 = 首角点 → (cursor.u, 首角点.v)，高边续到 cursor', () => {
    const edges = sketchRectangleEdgeSegments('rectangle', { u: 0, v: 0 }, { u: 10, v: 5 });
    expect(edges.width).toEqual({ start: { u: 0, v: 0 }, end: { u: 10, v: 0 } });
    expect(edges.height).toEqual({ start: { u: 10, v: 0 }, end: { u: 10, v: 5 } });
  });

  it('中心矩形：首点=中心，边段从反射对角点起算（宽度仍=2·半宽）', () => {
    const edges = sketchRectangleEdgeSegments('centerRectangle', { u: 0, v: 0 }, { u: 10, v: 5 });
    expect(edges.width).toEqual({ start: { u: -10, v: -5 }, end: { u: 10, v: -5 } });
    expect(edges.height).toEqual({ start: { u: 10, v: -5 }, end: { u: 10, v: 5 } });
  });
});

describe('layoutSketchEdgeLabel（边中点沿法线外移 + 正立旋转）', () => {
  it('水平边：中点上方 offset，角度 0', () => {
    const layout = layoutSketchEdgeLabel({ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 150, y: 150 });
    expect(layout).toBeDefined();
    expect(layout!.x).toBe(150);
    expect(layout!.y).toBe(100 - SKETCH_EDGE_LABEL_OFFSET_PX);
    expect(layout!.angleDeg).toBe(0);
  });

  it('竖直左边：法线背离矩形内部 → 落在边外（左）侧，角度 90', () => {
    const layout = layoutSketchEdgeLabel({ x: 100, y: 100 }, { x: 100, y: 200 }, { x: 150, y: 150 });
    expect(layout).toBeDefined();
    expect(layout!.x).toBe(100 - SKETCH_EDGE_LABEL_OFFSET_PX);
    expect(layout!.y).toBe(150);
    expect(layout!.angleDeg).toBeCloseTo(90, 9);
  });

  it('竖直边 ±90° 都归一到 +90°（向上/向下拖拽得到同一旋转）', () => {
    const downward = layoutSketchEdgeLabel({ x: 100, y: 100 }, { x: 100, y: 200 });
    const upward = layoutSketchEdgeLabel({ x: 100, y: 200 }, { x: 100, y: 100 });
    expect(downward).toBeDefined();
    expect(upward).toBeDefined();
    expect(downward!.angleDeg).toBeCloseTo(90, 9);
    expect(upward!.angleDeg).toBeCloseTo(90, 9);
  });

  it('对角边：角度 45°，中点沿法线偏移', () => {
    const layout = layoutSketchEdgeLabel({ x: 0, y: 0 }, { x: 40, y: 40 });
    expect(layout).toBeDefined();
    expect(layout!.angleDeg).toBeCloseTo(45, 9);
    expect(layout!.x).toBeCloseTo(20 + 4 * Math.SQRT2, 9);
    expect(layout!.y).toBeCloseTo(20 - 4 * Math.SQRT2, 9);
  });

  it('反向对角边：−135° 加 180° 翻正为 45°（文字不颠倒）', () => {
    const forward = layoutSketchEdgeLabel({ x: 0, y: 0 }, { x: 40, y: 40 });
    const reversed = layoutSketchEdgeLabel({ x: 40, y: 40 }, { x: 0, y: 0 });
    expect(reversed).toBeDefined();
    expect(reversed!.angleDeg).toBeCloseTo(forward!.angleDeg, 9);
    expect(reversed!.angleDeg).toBeCloseTo(45, 9);
  });

  it('135° 边翻正为 −45°', () => {
    const layout = layoutSketchEdgeLabel({ x: 0, y: 0 }, { x: -40, y: 40 });
    expect(layout!.angleDeg).toBeCloseTo(-45, 9);
  });

  it('零长度边：不渲染歧义标签', () => {
    expect(layoutSketchEdgeLabel({ x: 10, y: 10 }, { x: 10, y: 10 })).toBeUndefined();
  });
});
