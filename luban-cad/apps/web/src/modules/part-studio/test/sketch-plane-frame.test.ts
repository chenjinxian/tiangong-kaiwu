/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图平面框纯几何（2026-11-13 Onshape live f4/f5 + 用户复核）：
 * - 有内容（草图/模型范围）时 = 贴合内容、每边略大的**长方形**（不是正方形）；
 * - 无内容时回退以平面原点为中心的方框（空场景基准面尺寸）。
 */
import { describe, expect, it } from 'vitest';
import { Point3d, Range3d } from '@itwin/core-geometry';
import type { SketchPlaneDto } from '@luban-cad/shared';
import {
  SKETCH_FRAME_MARGIN_RATIO,
  SKETCH_FRAME_MIN_MARGIN_MM,
  sketchPlaneFrameCorners,
  sketchPlaneFrameRect,
} from '../internal/sketch-plane-frame.js';

const FRONT: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  xDir: { x: 1, y: 0, z: 0 },
};

describe('sketchPlaneFrameCorners（空场景方框回退）', () => {
  it('基准面：以前视平面原点为中心的方框四角（y=0）', () => {
    const corners = sketchPlaneFrameCorners(FRONT, 10)!;
    expect(corners).toHaveLength(4);
    for (const corner of corners) {
      expect(corner.y).toBeCloseTo(0, 9);
      expect(Math.max(Math.abs(corner.x), Math.abs(corner.z))).toBeCloseTo(10, 9);
    }
  });

  it('退化平面（normal 为零向量）返回 undefined', () => {
    expect(sketchPlaneFrameCorners({ ...FRONT, normal: { x: 0, y: 0, z: 0 } }, 10)).toBeUndefined();
  });
});

describe('sketchPlaneFrameRect（内容自适应长方形，用户 2026-11-13 复核）', () => {
  it('40×10 的长方内容 → 长方形框（宽度按比例，高度取最小留白），不是正方形', () => {
    const range = Range3d.create(Point3d.create(-20, 0, -5), Point3d.create(20, 0, 5));
    const corners = sketchPlaneFrameRect(FRONT, range)!;
    expect(corners).toHaveLength(4);
    for (const corner of corners) {
      expect(corner.y).toBeCloseTo(0, 9);
    }
    const xs = corners.map((corner) => corner.x);
    const zs = corners.map((corner) => corner.z);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...zs) - Math.min(...zs);
    // u 方向留白 = 40 × 8% = 3.2；v 方向 10 × 8% = 0.8 → 取最小 2mm。
    expect(width).toBeCloseTo(40 + 2 * 40 * SKETCH_FRAME_MARGIN_RATIO, 6);
    expect(height).toBeCloseTo(10 + 2 * SKETCH_FRAME_MIN_MARGIN_MM, 6);
    expect(width).toBeGreaterThan(height * 2);
  });

  it('贴合内容位置（不强制以平面原点为中心）', () => {
    const range = Range3d.create(Point3d.create(10, 0, 0), Point3d.create(30, 0, 5));
    const corners = sketchPlaneFrameRect(FRONT, range)!;
    const xs = corners.map((corner) => corner.x);
    const zs = corners.map((corner) => corner.z);
    // u：宽 20 → 8% = 1.6 < 最小留白 2 → 10 − 2 .. 30 + 2；v：0 − 2 .. 5 + 2。
    expect(Math.min(...xs)).toBeCloseTo(10 - SKETCH_FRAME_MIN_MARGIN_MM, 6);
    expect(Math.max(...xs)).toBeCloseTo(30 + SKETCH_FRAME_MIN_MARGIN_MM, 6);
    expect(Math.min(...zs)).toBeCloseTo(0 - SKETCH_FRAME_MIN_MARGIN_MM, 6);
    expect(Math.max(...zs)).toBeCloseTo(5 + SKETCH_FRAME_MIN_MARGIN_MM, 6);
  });

  it('正方形内容 → 正方形框（仍每边略大于内容）', () => {
    const range = Range3d.create(Point3d.create(-10, 0, -10), Point3d.create(10, 0, 10));
    const corners = sketchPlaneFrameRect(FRONT, range)!;
    const xs = corners.map((corner) => corner.x);
    const zs = corners.map((corner) => corner.z);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...zs) - Math.min(...zs);
    // 20 × 8% = 1.6 < 最小留白 2 → 每边 2mm。
    const margin = Math.max(SKETCH_FRAME_MIN_MARGIN_MM, 20 * SKETCH_FRAME_MARGIN_RATIO);
    expect(width).toBeCloseTo(20 + 2 * margin, 6);
    expect(height).toBeCloseTo(20 + 2 * margin, 6);
    expect(width).toBeCloseTo(height, 6);
    expect(width).toBeGreaterThan(20);
  });

  it('空范围/退化点返回 undefined（调用方回退基准面方框）', () => {
    expect(sketchPlaneFrameRect(FRONT, new Range3d())).toBeUndefined();
    const point = Range3d.create(Point3d.create(1, 0, 2), Point3d.create(1, 0, 2));
    expect(sketchPlaneFrameRect(FRONT, point)).toBeUndefined();
  });

  it('退化平面返回 undefined', () => {
    const range = Range3d.create(Point3d.create(-5, 0, -5), Point3d.create(5, 0, 5));
    expect(sketchPlaneFrameRect({ ...FRONT, normal: { x: 0, y: 0, z: 0 } }, range)).toBeUndefined();
  });
});
