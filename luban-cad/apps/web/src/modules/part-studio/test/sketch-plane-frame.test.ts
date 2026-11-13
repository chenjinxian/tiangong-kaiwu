/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图平面框纯几何（2026-11-13 Onshape live 二轮实测 + 用户复核）：
 * 以平面原点为中心的固定长方形（半宽 2× 基准面、半高 1.15× 基准面）；
 * 内容超出时对称扩张；不是内容包围盒、不是正方形。
 */
import { describe, expect, it } from 'vitest';
import { Point3d, Range3d } from '@itwin/core-geometry';
import type { SketchPlaneDto } from '@luban-cad/shared';
import {
  SKETCH_FRAME_CONTENT_MARGIN_RATIO,
  SKETCH_FRAME_HEIGHT_RATIO,
  SKETCH_FRAME_WIDTH_RATIO,
  sketchPlaneFrameRect,
} from '../internal/sketch-plane-frame.js';

const FRONT: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  xDir: { x: 1, y: 0, z: 0 },
};

function extents(corners: ReturnType<typeof sketchPlaneFrameRect>): { width: number; height: number } {
  const xs = corners!.map((corner) => corner.x);
  const zs = corners!.map((corner) => corner.z);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...zs) - Math.min(...zs),
  };
}

describe('sketchPlaneFrameRect（live 实测固定长方形）', () => {
  it('空内容：以平面原点为中心的固定长方形（半宽 2×/半高 1.15× 基准面，不是正方形）', () => {
    const datumHalf = 150;
    const corners = sketchPlaneFrameRect(FRONT, datumHalf)!;
    expect(corners).toHaveLength(4);
    for (const corner of corners) {
      expect(corner.y).toBeCloseTo(0, 9);
    }
    const { width, height } = extents(corners);
    expect(width).toBeCloseTo(2 * datumHalf * SKETCH_FRAME_WIDTH_RATIO, 6); // 600
    expect(height).toBeCloseTo(2 * datumHalf * SKETCH_FRAME_HEIGHT_RATIO, 6); // 345
    expect(width).toBeGreaterThan(height * 1.5);
    // 以原点为中心（对称）。
    expect(Math.min(...corners.map((corner) => corner.x))).toBeCloseTo(-width / 2, 6);
    expect(Math.min(...corners.map((corner) => corner.z))).toBeCloseTo(-height / 2, 6);
  });

  it('内容小于最小框：框不缩小（仍为基准面比例）', () => {
    const range = Range3d.create(Point3d.create(-20, 0, -10), Point3d.create(20, 0, 10));
    const corners = sketchPlaneFrameRect(FRONT, 150, range)!;
    const { width, height } = extents(corners);
    expect(width).toBeCloseTo(600, 6);
    expect(height).toBeCloseTo(345, 6);
  });

  it('内容超出最小框：对称扩张到包住内容（每边 +8%）', () => {
    const range = Range3d.create(Point3d.create(-400, 0, -100), Point3d.create(400, 0, 100));
    const corners = sketchPlaneFrameRect(FRONT, 150, range)!;
    const { width, height } = extents(corners);
    const grow = 1 + SKETCH_FRAME_CONTENT_MARGIN_RATIO;
    expect(width).toBeCloseTo(2 * 400 * grow, 6); // 864 > 600
    expect(height).toBeCloseTo(345, 6); // v 方向 100×1.08=108 < 172.5 → 保持最小
    // 扩张仍以原点为中心。
    expect(Math.min(...corners.map((corner) => corner.x))).toBeCloseTo(-400 * grow, 6);
  });

  it('内容偏在一侧：仍以原点为中心对称扩张（不贴内容平移）', () => {
    const range = Range3d.create(Point3d.create(300, 0, -10), Point3d.create(320, 0, 10));
    const corners = sketchPlaneFrameRect(FRONT, 150, range)!;
    const xs = corners.map((corner) => corner.x);
    expect(Math.min(...xs)).toBeCloseTo(-320 * (1 + SKETCH_FRAME_CONTENT_MARGIN_RATIO), 6);
    expect(Math.max(...xs)).toBeCloseTo(320 * (1 + SKETCH_FRAME_CONTENT_MARGIN_RATIO), 6);
  });

  it('空范围/退化点按固定最小框处理（不返回 undefined）', () => {
    const datumHalf = 10;
    const empty = sketchPlaneFrameRect(FRONT, datumHalf, new Range3d())!;
    const point = sketchPlaneFrameRect(
      FRONT,
      datumHalf,
      Range3d.create(Point3d.create(1, 0, 2), Point3d.create(1, 0, 2)),
    )!;
    const expected = {
      width: 2 * datumHalf * SKETCH_FRAME_WIDTH_RATIO,
      height: 2 * datumHalf * SKETCH_FRAME_HEIGHT_RATIO,
    };
    expect(extents(empty)).toEqual({ width: expect.closeTo(expected.width, 6), height: expect.closeTo(expected.height, 6) });
    expect(extents(point)).toEqual({ width: expect.closeTo(expected.width, 6), height: expect.closeTo(expected.height, 6) });
  });

  it('退化平面（normal 为零向量）返回 undefined', () => {
    expect(sketchPlaneFrameRect({ ...FRONT, normal: { x: 0, y: 0, z: 0 } }, 150)).toBeUndefined();
  });

  it('Top 平面（normal Z）：u=x、v=y，框落在 XY 平面', () => {
    const top: SketchPlaneDto = {
      origin: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      xDir: { x: 1, y: 0, z: 0 },
    };
    const corners = sketchPlaneFrameRect(top, 100)!;
    for (const corner of corners) {
      expect(corner.z).toBeCloseTo(0, 9);
    }
    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(200 * SKETCH_FRAME_WIDTH_RATIO, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(200 * SKETCH_FRAME_HEIGHT_RATIO, 6);
  });
});
