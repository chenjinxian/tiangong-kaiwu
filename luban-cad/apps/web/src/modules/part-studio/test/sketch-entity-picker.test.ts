/**
 * ADR-0018 S1b：草图实体屏幕空间命中（控制点优先 ≤6px，曲线 ≤5px）。
 */
import { describe, expect, it } from 'vitest';
import { Point3d } from '@itwin/core-geometry';
import type { SketchPickerGeometry } from '../internal/sketch-entity-picker.js';
import { curveDistance, distToSegment, hitTestSketchEntity } from '../internal/sketch-entity-picker.js';

const project = (p: Point3d): { x: number; y: number } => ({ x: p.x, y: p.y });

const GEOMETRY: SketchPickerGeometry = {
  polylines: [
    { entityId: 1, points: [Point3d.create(0, 0, 0), Point3d.create(10, 0, 0)] },
    {
      entityId: 2,
      points: [Point3d.create(0, 5, 0), Point3d.create(10, 5, 0), Point3d.create(10, 15, 0), Point3d.create(0, 5, 0)],
    },
  ],
  controlPoints: [
    { entityId: 1, kind: 'endpoint', position: Point3d.create(0, 0, 0) },
    { entityId: 1, kind: 'endpoint', position: Point3d.create(10, 0, 0) },
    { entityId: 3, kind: 'point', position: Point3d.create(20, 20, 0) },
  ],
};

describe('hitTestSketchEntity', () => {
  it('控制点优先：命中端点 0.5px 内即使曲线也近', () => {
    expect(hitTestSketchEntity(GEOMETRY, { x: 0.5, y: 0.2 }, project, 'sk')).toEqual({
      sketchId: 'sk', entityId: 1, part: 'handle',
    });
  });

  it('曲线本体：距线段 ≤5px → curve', () => {
    expect(hitTestSketchEntity(GEOMETRY, { x: 5, y: -4 }, project, 'sk')).toEqual({
      sketchId: 'sk', entityId: 1, part: 'curve',
    });
  });

  it('孤立点实体可命中；远处空白 → null', () => {
    expect(hitTestSketchEntity(GEOMETRY, { x: 20.4, y: 20.4 }, project, 'sk')).toEqual({
      sketchId: 'sk', entityId: 3, part: 'handle',
    });
    expect(hitTestSketchEntity(GEOMETRY, { x: 100, y: 100 }, project, 'sk')).toBeNull();
  });

  it('多段曲线取最近段（斜边）', () => {
    // 斜边 (10,5)->(10,15) 是竖线；点 (11,10) 距其 1px → entity 2 curve。
    expect(hitTestSketchEntity(GEOMETRY, { x: 11, y: 10 }, project, 'sk')).toEqual({
      sketchId: 'sk', entityId: 2, part: 'curve',
    });
  });
});

describe('distance helpers', () => {
  it('点到线段：端点外投影钳制', () => {
    expect(distToSegment({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distToSegment({ x: 5, y: 5 }, { x: 2, y: 2 }, { x: 2, y: 2 })).toBeCloseTo(Math.sqrt(18), 6);
  });

  it('折线取最小段距', () => {
    expect(curveDistance({ x: 0, y: 1 }, [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 },
    ])).toBe(1);
  });
});
