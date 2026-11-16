/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 绘制中数值标签纯几何（2026-11-16 E6/S5 + W12 + W15 Onshape live）：
 * 矩形宽/高边段（草图局部）、直线长度边段、圆直径与三点圆弧半径点标签
 * 位置（视口），以及视口标签布局（中点法向外移 + 正立旋转）。
 */
import { describe, expect, it } from 'vitest';
import {
  SKETCH_EDGE_LABEL_OFFSET_PX,
  layoutSketchEdgeLabel,
  sketchArcPointLabelCenter,
  sketchLineEdgeSegment,
  sketchPointLabelCenter,
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

describe('sketchLineEdgeSegment（直线长度标签边段；W12）', () => {
  it('右向拖动：端点保持 anchor→cursor（标签落在线上方）', () => {
    const segment = sketchLineEdgeSegment({ x: 100, y: 100 }, { x: 200, y: 140 });
    expect(segment).toEqual({ start: { x: 100, y: 100 }, end: { x: 200, y: 140 } });
    // 单条边标签（内部参考点=自身中点）时法线不翻转：右向边偏移到屏幕上方。
    const layout = layoutSketchEdgeLabel(segment.start, segment.end, {
      x: (segment.start.x + segment.end.x) / 2,
      y: (segment.start.y + segment.end.y) / 2,
    });
    expect(layout!.y).toBeLessThan((100 + 140) / 2);
  });

  it('左向拖动：交换端点使标签仍落在线上方（中点/旋转不变）', () => {
    const rightward = sketchLineEdgeSegment({ x: 100, y: 100 }, { x: 200, y: 100 });
    const leftward = sketchLineEdgeSegment({ x: 200, y: 100 }, { x: 100, y: 100 });
    expect(leftward).toEqual(rightward);
    const layout = layoutSketchEdgeLabel(leftward.start, leftward.end);
    expect(layout!.x).toBe(150);
    expect(layout!.y).toBe(100 - SKETCH_EDGE_LABEL_OFFSET_PX);
    expect(layout!.angleDeg).toBe(0);
  });

  it('竖线：向下拖动保持、向上拖动交换（标签固定落在线右侧）', () => {
    const down = sketchLineEdgeSegment({ x: 50, y: 100 }, { x: 50, y: 200 });
    const up = sketchLineEdgeSegment({ x: 50, y: 200 }, { x: 50, y: 100 });
    expect(down).toEqual({ start: { x: 50, y: 100 }, end: { x: 50, y: 200 } });
    expect(up).toEqual(down);
  });
});

describe('sketchPointLabelCenter（点标签中心；W12）', () => {
  it('圆心→光标的中点（直径读数落在半径段中途）', () => {
    expect(sketchPointLabelCenter({ x: 100, y: 100 }, { x: 160, y: 140 })).toEqual({ x: 130, y: 120 });
  });

  it('光标回到圆心：中点=圆心（退化半径由工具侧拒绝发标签）', () => {
    expect(sketchPointLabelCenter({ x: 80, y: 60 }, { x: 80, y: 60 })).toEqual({ x: 80, y: 60 });
  });
});

describe('sketchArcPointLabelCenter（三点圆弧 R 标签中心；W15）', () => {
  it('弧角向中点沿「圆心→中点」方向外移 offset（live：R 读数贴弧外侧）', () => {
    const point = sketchArcPointLabelCenter({ x: 0, y: 0 }, { x: 0, y: 100 });
    expect(point).toEqual({ x: 0, y: 100 + SKETCH_EDGE_LABEL_OFFSET_PX });
  });

  it('方向退化（圆心与角向中点投影重合）回退到中点本身，不产生 NaN', () => {
    const point = sketchArcPointLabelCenter({ x: 10, y: 20 }, { x: 10, y: 20 });
    expect(point).toEqual({ x: 10, y: 20 });
  });

  it('斜向弧：单位方向外移，自定义 offset 可用', () => {
    const point = sketchArcPointLabelCenter({ x: 0, y: 0 }, { x: 3, y: 4 }, 10);
    expect(point.x).toBeCloseTo(9, 12);
    expect(point.y).toBeCloseTo(12, 12);
  });
});
