/**
 * ADR-0018 / Onshape 鼠标交互（2026-11-12）：
 * 草图框选方向语义——左→右窗口（完全包含）、右→左交叉（相交即选）。
 */
import { describe, expect, it } from 'vitest';
import { Point3d } from '@itwin/core-geometry';
import type { SketchPickerGeometry } from '../internal/sketch-entity-picker.js';
import {
  pointInScreenBox,
  segmentIntersectsScreenBox,
  selectSketchEntitiesInScreenBox,
  sketchBoxFromScreenPoints,
} from '../internal/sketch-box-select.js';

const project = (p: Point3d): { x: number; y: number } => ({ x: p.x, y: p.y });
const line = (entityId: number, points: readonly [number, number][]): SketchPickerGeometry['polylines'][number] => ({
  entityId,
  points: points.map(([x, y]) => Point3d.create(x, y, 0)),
});

const GEOMETRY: SketchPickerGeometry = {
  polylines: [
    line(1, [[0, 0], [10, 0]]),
    line(2, [[20, 0], [40, 0]]),
    line(3, [[-10, 10], [100, 10]]),
  ],
  controlPoints: [
    { entityId: 4, kind: 'point', position: Point3d.create(50, 50, 0) },
    { entityId: 4, kind: 'point', position: Point3d.create(50, 50, 0) },
    { entityId: 1, kind: 'endpoint', position: Point3d.create(0, 0, 0) },
  ],
};

describe('sketchBoxFromScreenPoints', () => {
  it('左→右为窗口；右→左为交叉；矩形规范化', () => {
    expect(sketchBoxFromScreenPoints({ x: 5, y: 8 }, { x: 20, y: 30 })).toEqual({
      box: { left: 5, top: 8, right: 20, bottom: 30 },
      mode: 'window',
    });
    expect(sketchBoxFromScreenPoints({ x: 20, y: 30 }, { x: 5, y: 8 })).toEqual({
      box: { left: 5, top: 8, right: 20, bottom: 30 },
      mode: 'crossing',
    });
  });
});

describe('矩形/线段相交', () => {
  const box = { left: 0, top: 0, right: 10, bottom: 10 };

  it('点包含含边界', () => {
    expect(pointInScreenBox({ x: 0, y: 0 }, box)).toBe(true);
    expect(pointInScreenBox({ x: 10, y: 10 }, box)).toBe(true);
    expect(pointInScreenBox({ x: 10.1, y: 10 }, box)).toBe(false);
  });

  it('端点在框外但线段穿过框 → 相交', () => {
    expect(segmentIntersectsScreenBox({ x: -5, y: 5 }, { x: 15, y: 5 }, box)).toBe(true);
  });

  it('线段完全在框外 → 不相交', () => {
    expect(segmentIntersectsScreenBox({ x: -5, y: -5 }, { x: -1, y: -1 }, box)).toBe(false);
    expect(segmentIntersectsScreenBox({ x: 11, y: 0 }, { x: 20, y: 10 }, box)).toBe(false);
  });
});

describe('selectSketchEntitiesInScreenBox', () => {
  const box = { left: -1, top: -1, right: 11, bottom: 1 };

  it('窗口选择：只有完全位于框内的实体入选', () => {
    const picked = selectSketchEntitiesInScreenBox(GEOMETRY, project, box, 'window', 'sk');
    expect(picked).toEqual([{ sketchId: 'sk', entityId: 1, part: 'curve' }]);
  });

  it('交叉选择：穿过框的实体也入选', () => {
    const crossingBox = { left: -1, top: -1, right: 11, bottom: 11 };
    const picked = selectSketchEntitiesInScreenBox(GEOMETRY, project, crossingBox, 'crossing', 'sk');
    expect(picked.map((entry) => entry.entityId)).toEqual([1, 3]);
  });

  it('点实体按点框选，且重复控制点只产生一条选择', () => {
    const pointBox = { left: 45, top: 45, right: 55, bottom: 55 };
    const picked = selectSketchEntitiesInScreenBox(GEOMETRY, project, pointBox, 'window', 'sk');
    expect(picked).toEqual([{ sketchId: 'sk', entityId: 4, part: 'curve' }]);
  });

  it('空框（起点=终点）在窗口模式下不选任何实体', () => {
    const empty = { left: 20, top: 20, right: 20, bottom: 20 };
    expect(selectSketchEntitiesInScreenBox(GEOMETRY, project, empty, 'window', 'sk')).toEqual([]);
  });
});
