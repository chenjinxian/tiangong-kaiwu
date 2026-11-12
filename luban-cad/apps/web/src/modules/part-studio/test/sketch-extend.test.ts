/**
 * 草图延伸纯逻辑（Onshape Extend 首切片）：
 * 点击侧端点沿远离另一端点方向延伸到最近线/圆/弧边界；无边界/不支持不动数据。
 */
import { describe, expect, it } from 'vitest';
import type { SketchEntityDto } from '@luban-cad/shared';
import { extendSketchAt, extendSketchTo } from '../internal/sketch-extend.js';

interface P { x: number; y: number }

const line = (id: number, a: P, b: P): SketchEntityDto => ({ kind: 'line', id, p1: a, p2: b });

function linePoints(entity: SketchEntityDto): [P, P] | null {
  if (entity.kind !== 'line' || typeof entity.p1 === 'number' || typeof entity.p2 === 'number')
    return null;
  return [entity.p1, entity.p2];
}

describe('extendSketchAt — 线到线', () => {
  it('点击右端点 → 延伸到最近竖线边界', () => {
    const target = line(1, { x: 0, y: 0 }, { x: 5, y: 0 });
    const boundary = line(2, { x: 10, y: -5 }, { x: 10, y: 5 });
    const result = extendSketchAt([target, boundary], 1, { x: 4.8, y: 0 });
    expect(result.ok).toBe(true);
    const [a, b] = linePoints(result.entities.find((entity) => entity.id === 1)!)!;
    expect(a).toEqual({ x: 0, y: 0 });
    expect(b).toEqual({ x: 10, y: 0 });
  });

  it('点击左端点 → 向左延伸到边界（方向随点击侧）', () => {
    const target = line(1, { x: 0, y: 0 }, { x: 5, y: 0 });
    const boundary = line(2, { x: -8, y: -5 }, { x: -8, y: 5 });
    const result = extendSketchAt([target, boundary], 1, { x: 0.2, y: 0 });
    const [a] = linePoints(result.entities.find((entity) => entity.id === 1)!)!;
    expect(a).toEqual({ x: -8, y: 0 });
  });

  it('多个边界取最近交点', () => {
    const target = line(1, { x: 0, y: 0 }, { x: 5, y: 0 });
    const near = line(2, { x: 8, y: -5 }, { x: 8, y: 5 });
    const far = line(3, { x: 20, y: -5 }, { x: 20, y: 5 });
    const result = extendSketchAt([target, near, far], 1, { x: 5, y: 0 });
    const [, b] = linePoints(result.entities.find((entity) => entity.id === 1)!)!;
    expect(b).toEqual({ x: 8, y: 0 });
  });

  it('边界线段不含交点（延长线上但超出段范围）→ 不采用', () => {
    const target = line(1, { x: 0, y: 0 }, { x: 5, y: 0 });
    const short = line(2, { x: 10, y: 2 }, { x: 10, y: 5 });
    const result = extendSketchAt([target, short], 1, { x: 5, y: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no-boundary');
  });

  it('无边界 → no-boundary 且数据不变', () => {
    const target = line(1, { x: 0, y: 0 }, { x: 5, y: 0 });
    const result = extendSketchAt([target], 1, { x: 5, y: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no-boundary');
    expect(result.entities).toEqual([target]);
  });

  it('显式点实体端点：移动点实体（共享点语义）', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 5, y: 0 },
      { kind: 'line', id: 3, p1: 1, p2: 2 },
      line(4, { x: 12, y: -5 }, { x: 12, y: 5 }),
    ];
    const result = extendSketchAt(entities, 3, { x: 4.9, y: 0 });
    expect(result.ok).toBe(true);
    const moved = result.entities.find((entity) => entity.id === 2) as { x?: number; y?: number };
    expect(moved.x).toBeCloseTo(12, 9);
    expect(moved.y).toBeCloseTo(0, 9);
    // 共享线仍引用该点。
    expect(result.entities.find((entity) => entity.id === 3)).toMatchObject({ p1: 1, p2: 2 });
  });

  it('圆边界：取沿射线方向最近的正交点', () => {
    const target = line(1, { x: 0, y: 0 }, { x: 5, y: 0 });
    const circle: SketchEntityDto = { kind: 'circle', id: 2, center: { x: 10, y: 0 }, radius: 5 };
    const result = extendSketchAt([target, circle], 1, { x: 5, y: 0 });
    const [, b] = linePoints(result.entities.find((entity) => entity.id === 1)!)!;
    // 圆与射线交于 x=5（当前端点，t≈0 忽略）和 x=15。
    expect(b.x).toBeCloseTo(15, 9);
    expect(b.y).toBeCloseTo(0, 9);
  });

  it('弧边界只在弧扫角范围内生效', () => {
    const target = line(1, { x: 0, y: 0 }, { x: 5, y: 0 });
    const arcOutside: SketchEntityDto = {
      kind: 'arc', id: 2, center: { x: 10, y: 0 }, radius: 5, startAngle: Math.PI / 2, sweepAngle: Math.PI,
    };
    expect(extendSketchAt([target, arcOutside], 1, { x: 5, y: 0 }).ok).toBe(false);
    const arcInside: SketchEntityDto = {
      kind: 'arc', id: 3, center: { x: 10, y: 0 }, radius: 5, startAngle: -Math.PI / 2, sweepAngle: Math.PI,
    };
    const result = extendSketchAt([target, arcInside], 1, { x: 5, y: 0 });
    expect(result.ok).toBe(true);
    const [, b] = linePoints(result.entities.find((entity) => entity.id === 1)!)!;
    expect(b.x).toBeCloseTo(15, 9);
  });

  it('非直线源（圆/弧/样条）→ unsupported（不静默改数据）', () => {
    const circle: SketchEntityDto = { kind: 'circle', id: 1, center: { x: 0, y: 0 }, radius: 5 };
    const result = extendSketchAt([circle], 1, { x: 5, y: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unsupported');
    expect(result.entities).toEqual([circle]);
  });
});

describe('extendSketchTo — Onshape 两相（第二击边界或自由点）', () => {
  const target = line(1, { x: 0, y: 0 }, { x: 5, y: 0 });
  const near = line(2, { x: 8, y: -5 }, { x: 8, y: 5 });
  const far = line(3, { x: 20, y: -5 }, { x: 20, y: 5 });

  it('第二击命中指定边界 → 只延伸到该边界（即使更远）', () => {
    const result = extendSketchTo([target, near, far], 1, { x: 5, y: 0 }, {
      point: { x: 20, y: 0 }, boundaryId: 3,
    });
    expect(result.ok).toBe(true);
    const [, b] = linePoints(result.entities.find((entity) => entity.id === 1)!)!;
    expect(b).toEqual({ x: 20, y: 0 });
  });

  it('第二击自由点 → 投影到延伸射线（未被吸附到边界）', () => {
    const result = extendSketchTo([target], 1, { x: 5, y: 0 }, { point: { x: 12, y: 3 } });
    expect(result.ok).toBe(true);
    const [, b] = linePoints(result.entities.find((entity) => entity.id === 1)!)!;
    expect(b.x).toBeCloseTo(12, 9);
    expect(b.y).toBeCloseTo(0, 9);
  });

  it('自由点在端点反方向 → invalid 且数据不变', () => {
    const result = extendSketchTo([target], 1, { x: 5, y: 0 }, { point: { x: 2, y: 0 } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid');
    expect(result.entities).toEqual([target]);
  });

  it('第二击仍是目标本身 → invalid；命中边界但无段内交点 → no-boundary', () => {
    expect(extendSketchTo([target], 1, { x: 5, y: 0 }, { point: { x: 6, y: 0 }, boundaryId: 1 }).ok).toBe(false);
    const outside = line(4, { x: 10, y: 2 }, { x: 10, y: 5 });
    const result = extendSketchTo([target, outside], 1, { x: 5, y: 0 }, { point: { x: 10, y: 0 }, boundaryId: 4 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no-boundary');
  });
});

describe('extendSketchTo — 弧源（扫角延伸）', () => {
  const arc: SketchEntityDto = {
    kind: 'arc', id: 21, center: { x: 0, y: 0 }, radius: 5, startAngle: 0, sweepAngle: Math.PI / 2,
  };

  it('CCW 弧终点延伸到线边界 → 扫角增长保持起点', () => {
    const boundary = line(22, { x: -5, y: -1 }, { x: -5, y: 1 });
    const result = extendSketchTo([arc, boundary], 21, { x: 0, y: 5 }, { point: { x: -5, y: 0 }, boundaryId: 22 });
    expect(result.ok).toBe(true);
    const updated = result.entities.find((entity) => entity.id === 21) as { startAngle: number; sweepAngle: number };
    expect(updated.startAngle).toBeCloseTo(0, 9);
    expect(updated.sweepAngle).toBeCloseTo(Math.PI, 9);
  });

  it('弧起点延伸到边界 → 起点回退、终点不动', () => {
    const boundary = line(23, { x: -1, y: -5 }, { x: 1, y: -5 });
    const result = extendSketchTo([arc, boundary], 21, { x: 5, y: 0 }, { point: { x: 0, y: -5 }, boundaryId: 23 });
    expect(result.ok).toBe(true);
    const updated = result.entities.find((entity) => entity.id === 21) as { startAngle: number; sweepAngle: number };
    expect(updated.startAngle).toBeCloseTo(-Math.PI / 2, 9);
    expect(updated.sweepAngle).toBeCloseTo(Math.PI, 9);
  });

  it('第二击空白点 → 投影到圆周（自由端点）', () => {
    const target = { x: 5 * Math.cos(3 * Math.PI / 4), y: 5 * Math.sin(3 * Math.PI / 4) };
    const result = extendSketchTo([arc], 21, { x: 0, y: 5 }, { point: { x: target.x, y: target.y } });
    expect(result.ok).toBe(true);
    const updated = result.entities.find((entity) => entity.id === 21) as { startAngle: number; sweepAngle: number };
    expect(updated.startAngle).toBeCloseTo(0, 9);
    expect(updated.sweepAngle).toBeCloseTo(3 * Math.PI / 4, 9);
  });

  it('弧无边界 → no-boundary；边界线不与圆相交 → no-boundary', () => {
    expect(extendSketchAt([arc], 21, { x: 0, y: 5 }).ok).toBe(false);
    const outside = line(24, { x: 6, y: -1 }, { x: 6, y: 1 });
    const result = extendSketchTo([arc, outside], 21, { x: 0, y: 5 }, { point: { x: 6, y: 0 }, boundaryId: 24 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no-boundary');
  });
});
