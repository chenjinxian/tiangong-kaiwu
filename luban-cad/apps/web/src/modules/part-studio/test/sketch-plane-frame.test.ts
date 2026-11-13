/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图平面框纯几何（2026-11-13 Onshape live f4/f5）：四角以平面原点为中心、
 * 尺寸随内容范围自适应。
 */
import { describe, expect, it } from 'vitest';
import { Point3d, Range3d } from '@itwin/core-geometry';
import type { SketchPlaneDto } from '@luban-cad/shared';
import {
  SKETCH_FRAME_MIN_HALF_SIZE_MM,
  SKETCH_FRAME_SCALE,
  sketchPlaneFrameCorners,
  sketchPlaneFrameHalfSize,
} from '../internal/sketch-plane-frame.js';

const FRONT: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  xDir: { x: 1, y: 0, z: 0 },
};

describe('sketchPlaneFrameCorners', () => {
  it('基准面：以前视平面原点为中心的方框四角（y=0）', () => {
    const corners = sketchPlaneFrameCorners(FRONT, 10)!;
    expect(corners).toHaveLength(4);
    for (const corner of corners) {
      expect(corner.y).toBeCloseTo(0, 9);
      expect(Math.max(Math.abs(corner.x), Math.abs(corner.z))).toBeCloseTo(10, 9);
    }
    expect(corners.map((c) => `${c.x},${c.z}`).sort()).toEqual(
      ['-10,-10', '-10,10', '10,-10', '10,10'].sort(),
    );
  });

  it('xDir 不正交时按法向正交化（不扭曲框）', () => {
    const corners = sketchPlaneFrameCorners(
      { ...FRONT, xDir: { x: 1, y: 1, z: 0 } },
      10,
    )!;
    for (const corner of corners) {
      expect(corner.y).toBeCloseTo(0, 9);
    }
  });

  it('退化平面（normal 为零向量）返回 undefined', () => {
    expect(sketchPlaneFrameCorners({ ...FRONT, normal: { x: 0, y: 0, z: 0 } }, 10))
      .toBeUndefined();
  });

  it('自定义原点：框围绕平面原点而非世界原点', () => {
    const corners = sketchPlaneFrameCorners({ ...FRONT, origin: { x: 50, y: 20, z: 30 } }, 5)!;
    const xs = corners.map((c) => c.x);
    const zs = corners.map((c) => c.z);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(50, 9);
    expect((Math.min(...zs) + Math.max(...zs)) / 2).toBeCloseTo(30, 9);
    for (const corner of corners)
      expect(corner.y).toBeCloseTo(20, 9);
  });
});

describe('sketchPlaneFrameHalfSize', () => {
  it('取范围在平面内最大投影 × 系数', () => {
    const range = Range3d.create(Point3d.create(-20, -5, -30), Point3d.create(40, 5, 10));
    // u 最大 40、v(z) 最大 30 → 半尺寸 = 40 * 1.5。
    expect(sketchPlaneFrameHalfSize(FRONT, range)).toBeCloseTo(40 * SKETCH_FRAME_SCALE, 6);
  });

  it('空范围返回 undefined', () => {
    expect(sketchPlaneFrameHalfSize(FRONT, new Range3d())).toBeUndefined();
  });

  it('极小草图有保底半尺寸', () => {
    const range = Range3d.create(Point3d.create(-0.00001, 0, 0), Point3d.create(0.00001, 0, 0));
    expect(sketchPlaneFrameHalfSize(FRONT, range)).toBe(SKETCH_FRAME_MIN_HALF_SIZE_MM);
  });
});
