/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * ViewCube 方向数学纯函数测试（2026-11-02）：eye 方向 → 世界→视图旋转、
 * CSS matrix3d 列主序、轨道旋转。
 */
import { describe, expect, it } from 'vitest';
import { Matrix3d, Vector3d } from '@itwin/core-geometry';
import {
  axisScreenDirections,
  cssMatrix3dFromRotation,
  DIMETRIC_DIRECTION,
  ISO_DIRECTION,
  orbitDirection,
  projectFaceLabels,
  TRIMETRIC_DIRECTION,
  viewRotationFromDirection,
} from '../internal/view-orientation.js';

function expectUnit(v: Vector3d): void {
  expect(v.magnitude()).toBeCloseTo(1, 10);
}

describe('view-orientation', () => {
  it('derives an orthonormal world→view rotation whose Z row is the eye direction', () => {
    const rotation = viewRotationFromDirection(ISO_DIRECTION)!;
    const expectedZ = ISO_DIRECTION.normalize()!;
    expect(rotation.rowZ().isExactEqual(expectedZ)).toBe(true);
    // 正交右手系：rowX ⟂ rowY ⟂ rowZ，且 rowX × rowY = rowZ。
    const x = rotation.rowX();
    const y = rotation.rowY();
    expect(x.dotProduct(y)).toBeCloseTo(0, 10);
    expect(x.dotProduct(expectedZ)).toBeCloseTo(0, 10);
    expect(y.dotProduct(expectedZ)).toBeCloseTo(0, 10);
    expectUnit(x);
    expectUnit(y);
    const cross = x.crossProduct(y)!;
    expect(cross.isExactEqual(expectedZ)).toBe(true);
  });

  it('falls back to a non-degenerate up for a top-down eye direction', () => {
    const rotation = viewRotationFromDirection(Vector3d.create(0, 0, 1))!;
    expect(rotation.rowZ().isExactEqual(Vector3d.unitZ())).toBe(true);
    // up=+Z 与 eye 同向退化，改用 +X 叉乘得到正交屏幕右轴。
    expect(rotation.rowX().isExactEqual(Vector3d.create(0, -1, 0))).toBe(true);
    expect(rotation.rowY().isExactEqual(Vector3d.unitX())).toBe(true);
  });

  it('returns undefined for a zero direction', () => {
    expect(viewRotationFromDirection(Vector3d.createZero())).toBeUndefined();
  });

  it('serializes a rotation as CSS matrix3d in column-major order with the Y-axis flip', () => {
    const rotation = Matrix3d.createRowValues(
      1, 2, 3,
      4, 5, 6,
      7, 8, 9,
    );
    // F·R·F（F=diag(1,-1,1)）翻转 row1/col1 的非对角项。
    expect(cssMatrix3dFromRotation(rotation)).toBe(
      'matrix3d(1,-4,7,0,-2,5,-8,0,3,-6,9,0,0,0,0,1)',
    );
  });

  it('maps the standard Front rotation so the Top face normal points screen-up', () => {
    // StandardViewId.Front（rows: X, Z, -Y）。
    const front = Matrix3d.createRowValues(1, 0, 0, 0, 0, 1, 0, -1, 0);
    expect(cssMatrix3dFromRotation(front)).toBe(
      'matrix3d(1,0,0,0,0,0,1,0,0,-1,0,0,0,0,0,1)',
    );
  });

  it('orbits a direction by yaw around world Z', () => {
    const next = orbitDirection(Vector3d.unitX(), Vector3d.unitY(), Math.PI / 2, 0)!;
    expect(next.x).toBeCloseTo(0, 10);
    expect(next.y).toBeCloseTo(1, 10);
    expect(next.z).toBeCloseTo(0, 10);
  });

  it('orbits a direction by pitch around the screen-right axis', () => {
    const next = orbitDirection(Vector3d.unitX(), Vector3d.unitY(), 0, Math.PI / 2)!;
    expect(next.x).toBeCloseTo(0, 10);
    expect(next.y).toBeCloseTo(0, 10);
    expect(next.z).toBeCloseTo(-1, 10);
  });

  it('defines distinct finite preset directions', () => {
    for (const dir of [ISO_DIRECTION, DIMETRIC_DIRECTION, TRIMETRIC_DIRECTION]) {
      expect(dir.magnitude()).toBeGreaterThan(0);
      expect(viewRotationFromDirection(dir)).toBeDefined();
    }
  });

  it('projects only the front-facing label for standard Top/Front rotations', () => {
    expect(projectFaceLabels(Matrix3d.identity).map((l) => l.id)).toEqual(['top']);

    const front = Matrix3d.createRowValues(1, 0, 0, 0, 0, 1, 0, -1, 0);
    expect(projectFaceLabels(front).map((l) => l.id)).toEqual(['front']);
  });

  it('projects the three visible faces in an isometric rotation', () => {
    const iso = viewRotationFromDirection(ISO_DIRECTION)!;
    const labels = projectFaceLabels(iso);
    expect(labels.map((l) => l.id).sort()).toEqual(['front', 'right', 'top']);
    for (const label of labels)
      expect(Math.hypot(label.x, label.y)).toBeGreaterThan(2);
    // 三个标签落在不同位置（Top 可在水平中央）。
    expect(new Set(labels.map((l) => `${Math.round(l.x)},${Math.round(l.y)}`)).size).toBe(3);
  });

  it('reports screen directions for the world axes (Onshape right-iso triad)', () => {
    const iso = viewRotationFromDirection(ISO_DIRECTION)!;
    const axes = axisScreenDirections(iso);
    // Onshape 右前上 iso：Z 向上、X 右下、Y 右上（CSS y 向下）。
    expect(axes.z[1]).toBeLessThan(0);
    expect(axes.x[1]).toBeGreaterThan(0);
    expect(axes.y[1]).toBeLessThan(0);
    expect(axes.x[0]).toBeGreaterThan(0);
    expect(axes.y[0]).toBeGreaterThan(0);
  });
});
