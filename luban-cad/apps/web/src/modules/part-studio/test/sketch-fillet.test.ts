/**
 * 草图圆角纯逻辑单测（Onshape Fillet 首切片 2026-11-12）：
 * 角点识别、90°/45° 相切几何、半径过大/共线诚实拒绝、约束展开与旧角点
 * coincident 移除。
 */
import { describe, expect, it } from 'vitest';
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import {
  computeFilletGeometry,
  filletSketchCorner,
  findSketchFilletCorners,
  nextSketchId,
} from '../internal/sketch-fillet.js';

const RECT_ENTITIES: SketchEntityDto[] = [
  { kind: 'line', id: 11, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
  { kind: 'line', id: 12, p1: { x: 10, y: 0 }, p2: { x: 10, y: 10 } },
  { kind: 'line', id: 13, p1: { x: 10, y: 10 }, p2: { x: 0, y: 10 } },
  { kind: 'line', id: 14, p1: { x: 0, y: 10 }, p2: { x: 0, y: 0 } },
];

const RECT_CONSTRAINTS: SketchConstraintDto[] = [
  { kind: 'coincident', id: 101, refs: [{ entity: 11, part: 'end' }, { entity: 12, part: 'start' }] },
  { kind: 'coincident', id: 102, refs: [{ entity: 12, part: 'end' }, { entity: 13, part: 'start' }] },
  { kind: 'coincident', id: 103, refs: [{ entity: 13, part: 'end' }, { entity: 14, part: 'start' }] },
  { kind: 'coincident', id: 104, refs: [{ entity: 14, part: 'end' }, { entity: 11, part: 'start' }] },
];

function cornerAt(corners: ReturnType<typeof findSketchFilletCorners>, x: number, y: number) {
  return corners.find((corner) => Math.hypot(corner.point.x - x, corner.point.y - y) < 1e-9);
}

describe('findSketchFilletCorners', () => {
  it('矩形 4 角：按端点/coincident 识别，坐标取两端平均', () => {
    const corners = findSketchFilletCorners(RECT_ENTITIES, RECT_CONSTRAINTS);
    expect(corners).toHaveLength(4);
    expect(cornerAt(corners, 10, 0)).toMatchObject({
      a: { lineId: 11, part: 'end' }, b: { lineId: 12, part: 'start' },
    });
    expect(cornerAt(corners, 0, 0)).toMatchObject({
      a: { lineId: 11, part: 'start' }, b: { lineId: 14, part: 'end' },
    });
  });

  it('仅坐标重合（无 coincident 约束）也识别；投影线跳过', () => {
    const corners = findSketchFilletCorners([
      { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 5, y: 0 } },
      { kind: 'line', id: 2, p1: { x: 5, y: 0 }, p2: { x: 5, y: 5 } },
    ], []);
    expect(corners).toHaveLength(1);
    expect(corners[0]!.point).toEqual({ x: 5, y: 0 });

    const projected = findSketchFilletCorners([
      { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 5, y: 0 }, projected: { kind: 'projected', source: { kind: 'sketchEntity', sketchId: 's', entityId: 9 } } },
      { kind: 'line', id: 2, p1: { x: 5, y: 0 }, p2: { x: 5, y: 5 } },
    ], []);
    expect(projected).toHaveLength(0);
  });

  it('显式 point 实体端点/三线共点：首切片不支持（不产生角点）', () => {
    const explicit = findSketchFilletCorners([
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'line', id: 2, p1: 1, p2: { x: 5, y: 0 } },
      { kind: 'line', id: 3, p1: 1, p2: { x: 0, y: 5 } },
    ], []);
    expect(explicit).toHaveLength(0);

    const three = findSketchFilletCorners([
      ...RECT_ENTITIES,
      { kind: 'line', id: 15, p1: { x: 10, y: 0 }, p2: { x: 15, y: -5 } },
    ], RECT_CONSTRAINTS);
    expect(cornerAt(three, 10, 0)).toBeUndefined();
  });
});

describe('computeFilletGeometry', () => {
  it('90° 角 R2：切点 (8,0)/(10,2)、圆心 (8,2)、逆时针 90° 弧', () => {
    const corner = cornerAt(findSketchFilletCorners(RECT_ENTITIES, RECT_CONSTRAINTS), 10, 0)!;
    const result = computeFilletGeometry(corner, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { geometry } = result;
    expect(geometry.tangentA.x).toBeCloseTo(8, 9);
    expect(geometry.tangentA.y).toBeCloseTo(0, 9);
    expect(geometry.tangentB.x).toBeCloseTo(10, 9);
    expect(geometry.tangentB.y).toBeCloseTo(2, 9);
    expect(geometry.center.x).toBeCloseTo(8, 9);
    expect(geometry.center.y).toBeCloseTo(2, 9);
    expect(geometry.radius).toBe(2);
    expect(geometry.startAngle).toBeCloseTo(-Math.PI / 2, 9);
    expect(geometry.sweepAngle).toBeCloseTo(Math.PI / 2, 9);
  });

  it('45° 角：切距 r/tan(22.5°)，圆心在角平分线上', () => {
    const corners = findSketchFilletCorners([
      { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
      { kind: 'line', id: 2, p1: { x: 0, y: 0 }, p2: { x: 10, y: 10 } },
    ], []);
    const corner = corners[0]!;
    const result = computeFilletGeometry(corner, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const t = 2 / Math.tan(Math.PI / 8);
    expect(result.geometry.tangentA.x).toBeCloseTo(t, 9);
    expect(result.geometry.tangentA.y).toBeCloseTo(0, 9);
    expect(result.geometry.tangentB.x).toBeCloseTo(t / Math.SQRT2, 9);
    expect(result.geometry.tangentB.y).toBeCloseTo(t / Math.SQRT2, 9);
    expect(result.geometry.sweepAngle).toBeCloseTo(-(3 * Math.PI) / 4, 9);
  });

  it('半径超出线长 → radius-too-large；共线/非法半径 → degenerate/invalid-radius', () => {
    const corner = cornerAt(findSketchFilletCorners(RECT_ENTITIES, RECT_CONSTRAINTS), 10, 0)!;
    expect(computeFilletGeometry(corner, 20)).toEqual({ ok: false, reason: 'radius-too-large' });
    expect(computeFilletGeometry(corner, 0)).toEqual({ ok: false, reason: 'invalid-radius' });

    const collinear = findSketchFilletCorners([
      { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
      { kind: 'line', id: 2, p1: { x: 0, y: 0 }, p2: { x: -10, y: 0 } },
    ], []);
    expect(computeFilletGeometry(collinear[0]!, 1)).toEqual({ ok: false, reason: 'degenerate' });
  });
});

describe('filletSketchCorner', () => {
  it('矩形角 R2：两线端点回缩、插入 arc/coincident×2/tangent×2/radius，旧 coincident 移除', () => {
    const corner = cornerAt(findSketchFilletCorners(RECT_ENTITIES, RECT_CONSTRAINTS), 10, 0)!;
    const result = filletSketchCorner(
      RECT_ENTITIES, RECT_CONSTRAINTS, corner, 2, nextSketchId(RECT_ENTITIES, RECT_CONSTRAINTS),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.arcId).toBe(105);
    const arc = result.entities.find((entity) => entity.id === result.arcId);
    expect(arc?.kind).toBe('arc');
    const arcEntity = arc as Extract<SketchEntityDto, { kind: 'arc' }>;
    expect((arcEntity.center as { x: number }).x).toBeCloseTo(8, 9);
    expect((arcEntity.center as { y: number }).y).toBeCloseTo(2, 9);
    expect(arcEntity.radius).toBeCloseTo(2, 9);
    const line11 = result.entities.find((entity) => entity.id === 11) as Extract<SketchEntityDto, { kind: 'line' }>;
    expect(line11.p2).toMatchObject({});
    expect((line11.p2 as { x: number }).x).toBeCloseTo(8, 9);
    expect((line11.p2 as { y: number }).y).toBeCloseTo(0, 9);
    const line12 = result.entities.find((entity) => entity.id === 12) as Extract<SketchEntityDto, { kind: 'line' }>;
    expect((line12.p1 as { x: number }).x).toBeCloseTo(10, 9);
    expect((line12.p1 as { y: number }).y).toBeCloseTo(2, 9);

    expect(result.constraints.some((constraint) => constraint.id === 101)).toBe(false);
    expect(result.constraints.filter((constraint) => constraint.kind === 'coincident')).toHaveLength(5);
    expect(result.constraints.filter((constraint) => constraint.kind === 'tangent')).toEqual([
      { kind: 'tangent', id: 108, refs: [105, 11] },
      { kind: 'tangent', id: 109, refs: [105, 12] },
    ]);
    expect(result.constraints.find((constraint) => constraint.kind === 'radius')).toEqual({
      kind: 'radius', id: 110, refs: [105], value: 2,
    });
    expect(result.nextId).toBe(111);
  });

  it('半径过大/非法：实体与约束原样返回', () => {
    const corner = cornerAt(findSketchFilletCorners(RECT_ENTITIES, RECT_CONSTRAINTS), 10, 0)!;
    for (const [radius, reason] of [[20, 'radius-too-large'], [0, 'invalid-radius']] as const) {
      const result = filletSketchCorner(RECT_ENTITIES, RECT_CONSTRAINTS, corner, radius, 105);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.reason).toBe(reason);
      expect(result.entities).toEqual(RECT_ENTITIES);
      expect(result.constraints).toEqual(RECT_CONSTRAINTS);
    }
  });
});
