/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图曲线世界折线采样（2026-11-02）：矩形/圆/弧/贝塞尔/平面变换/抑制跳过。
 */
import { describe, expect, it } from 'vitest';
import type { FeatureTreeEntry, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import { sketchControlPointsToWorld, sketchEntriesToWorldPolylines } from '../internal/sketch-curves.js';

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

function entry(entities: SketchEntityDto[], plane: SketchPlaneDto = XY_PLANE, suppressed = false): FeatureTreeEntry {
  return { id: 'sk-1', featureType: 'sketch', orderKey: 0, suppressed, status: 0, params: { entities, constraints: [], plane } };
}

const RECT: SketchEntityDto[] = [
  { kind: 'point', id: 1, x: 0, y: 0 },
  { kind: 'point', id: 2, x: 2, y: 0 },
  { kind: 'line', id: 3, p1: 1, p2: 2 },
  { kind: 'point', id: 4, x: 2, y: 0 },
  { kind: 'point', id: 5, x: 2, y: 1 },
  { kind: 'line', id: 6, p1: 4, p2: 5 },
  { kind: 'point', id: 7, x: 2, y: 1 },
  { kind: 'point', id: 8, x: 0, y: 1 },
  { kind: 'line', id: 9, p1: 7, p2: 8 },
  { kind: 'point', id: 10, x: 0, y: 1 },
  { kind: 'point', id: 11, x: 0, y: 0 },
  { kind: 'line', id: 12, p1: 10, p2: 11 },
];

describe('sketchEntriesToWorldPolylines', () => {
  it('矩形 → 4 条世界线段（XY 平面）', () => {
    const polylines = sketchEntriesToWorldPolylines([entry(RECT)]);
    expect(polylines).toHaveLength(4);
    expect(polylines.map((p) => p.points.length)).toEqual([2, 2, 2, 2]);
    expect(polylines[0]!.points[0]!.toJSON()).toEqual([0, 0, 0]);
    expect(polylines[0]!.points[1]!.toJSON()).toEqual([2, 0, 0]);
    expect(polylines[1]!.points[0]!.toJSON()).toEqual([2, 0, 0]);
    expect(polylines[1]!.points[1]!.toJSON()).toEqual([2, 1, 0]);
  });

  it('suppressed 草图 / 空 entities / 非 sketch 行一律跳过', () => {
    expect(sketchEntriesToWorldPolylines([entry(RECT, XY_PLANE, true)])).toEqual([]);
    expect(sketchEntriesToWorldPolylines([{ ...entry([]), params: {} }])).toEqual([]);
    expect(sketchEntriesToWorldPolylines([{ ...entry(RECT), featureType: 'extrude' }])).toEqual([]);
  });

  it('圆/弧采样闭合端点，贝塞尔按 32 段采样', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'circle', id: 1, center: { x: 0, y: 0 }, radius: 2 },
      { kind: 'arc', id: 2, center: { x: 0, y: 0 }, radius: 1, startAngle: 0, sweepAngle: Math.PI / 2 },
      { kind: 'spline', id: 3, controlPoints: [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 0 }] },
    ];
    const polylines = sketchEntriesToWorldPolylines([entry(entities)]);
    expect(polylines).toHaveLength(3);
    const circle = polylines[0]!;
    expect(circle.points.length).toBeGreaterThan(40);
    expect(circle.points[0]!.x).toBeCloseTo(2, 6);
    expect(circle.points.at(-1)!.x).toBeCloseTo(2, 6);
    const arc = polylines[1]!;
    expect(arc.points[0]!.toJSON()).toEqual([1, 0, 0]);
    expect(arc.points.at(-1)!.x).toBeCloseTo(0, 6);
    expect(arc.points.at(-1)!.y).toBeCloseTo(1, 6);
    const spline = polylines[2]!;
    expect(spline.points).toHaveLength(33);
    expect(spline.points[0]!.toJSON()).toEqual([0, 0, 0]);
    expect(spline.points.at(-1)!.toJSON()).toEqual([4, 0, 0]);
  });

  it('非 XY 平面：Front 平面局部 (u,v) 映射到世界 (x,0,-z)（右手架 yDir=normal×xDir）', () => {
    const plane: SketchPlaneDto = {
      origin: { x: 1, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      xDir: { x: 1, y: 0, z: 0 },
    };
    const polylines = sketchEntriesToWorldPolylines([entry([
      { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 2, y: 3 } },
    ], plane)]);
    expect(polylines[0]!.points[0]!.toJSON()).toEqual([1, 0, 0]);
    expect(polylines[0]!.points[1]!.toJSON()).toEqual([3, 0, -3]);
  });
});

describe('sketchControlPointsToWorld', () => {
  it('矩形：点实体与线端点同坐标去重 → 4 个角点', () => {
    const points = sketchControlPointsToWorld(RECT, XY_PLANE);
    expect(points).toHaveLength(4);
    expect(points.map((p) => p.position.toJSON())).toEqual([
      [0, 0, 0], [2, 0, 0], [2, 1, 0], [0, 1, 0],
    ]);
    expect(points.every((p) => p.kind === 'point')).toBe(true);
  });

  it('圆=圆心；弧=圆心+起/中/终；样条=控制点', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'circle', id: 1, center: { x: 0, y: 0 }, radius: 2 },
      { kind: 'arc', id: 2, center: { x: 5, y: 0 }, radius: 1, startAngle: 0, sweepAngle: Math.PI / 2 },
      { kind: 'spline', id: 3, controlPoints: [{ x: 0, y: 5 }, { x: 1, y: 6 }, { x: 3, y: 6 }, { x: 4, y: 5 }] },
    ];
    const points = sketchControlPointsToWorld(entities, XY_PLANE);
    expect(points.map((p) => p.kind)).toEqual([
      'center', 'center', 'endpoint', 'endpoint', 'endpoint', 'control', 'control', 'control', 'control',
    ]);
    expect(points[1]!.position.toJSON()).toEqual([5, 0, 0]);
    expect(points[2]!.position.x).toBeCloseTo(6, 6);
    expect(points[3]!.position.x).toBeCloseTo(5 + Math.SQRT1_2, 6);
    expect(points[4]!.position.y).toBeCloseTo(1, 6);
  });

  it('非 XY 平面：控制点同样走平面变换', () => {
    const plane: SketchPlaneDto = {
      origin: { x: 1, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      xDir: { x: 1, y: 0, z: 0 },
    };
    const points = sketchControlPointsToWorld([{ kind: 'point', id: 1, x: 2, y: 3 }], plane);
    expect(points[0]!.position.toJSON()).toEqual([3, 0, -3]);
  });
});
