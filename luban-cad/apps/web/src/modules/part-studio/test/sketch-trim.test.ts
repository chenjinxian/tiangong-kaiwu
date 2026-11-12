/**
 * 草图修剪纯逻辑（Onshape 修剪首切片）：线段/圆/弧的区间移除与整删语义。
 */
import { describe, expect, it } from 'vitest';
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import { trimSketchAt } from '../internal/sketch-trim.js';

const H_LINE: SketchEntityDto = { kind: 'line', id: 11, p1: { x: -10, y: 0 }, p2: { x: 10, y: 0 } };
const V_LEFT: SketchEntityDto = { kind: 'line', id: 12, p1: { x: 2, y: -5 }, p2: { x: 2, y: 5 } };
const V_RIGHT: SketchEntityDto = { kind: 'line', id: 13, p1: { x: 8, y: -5 }, p2: { x: 8, y: 5 } };

const point = (entity: SketchEntityDto): { x: number; y: number } | null => {
  if (entity.kind !== 'line')
    return null;
  return typeof entity.p1 === 'number' ? null : entity.p1;
};

describe('trimSketchAt — 线段', () => {
  it('两条交叉线之间的中间段被移除，两侧保留（原 id + 新 id）', () => {
    const result = trimSketchAt([H_LINE, V_LEFT, V_RIGHT], [], 11, { x: 5, y: 0 });
    expect(result.ok).toBe(true);
    const lines = result.entities.filter((entity) => entity.kind === 'line' && (entity.id === 11 || entity.id > 13)) as Array<{ id: number; p1: { x: number; y: number }; p2: { x: number; y: number } }>;
    expect(lines.map((line) => line.id)).toEqual([11, 14]);
    expect(lines[0]!.p1).toEqual({ x: -10, y: 0 });
    expect(lines[0]!.p2).toEqual({ x: 2, y: 0 });
    expect(lines[1]!.p1).toEqual({ x: 8, y: 0 });
    expect(lines[1]!.p2).toEqual({ x: 10, y: 0 });
    expect(V_LEFT.p1).toEqual({ x: 2, y: -5 }); // 入参不改
  });

  it('无交点 → 整删该实体（Onshape 语义）', () => {
    const result = trimSketchAt([H_LINE], [], 11, { x: 0, y: 0 });
    expect(result.ok).toBe(true);
    expect(result.entities).toEqual([]);
    expect(result.removedEntityIds).toEqual([11]);
  });

  it('点击首段（起点到第一交点）→ 只保留其后一段', () => {
    const result = trimSketchAt([H_LINE, V_LEFT, V_RIGHT], [], 11, { x: 0, y: 0 });
    const lines = result.entities.filter((entity) => entity.kind === 'line' && (entity.id === 11 || entity.id > 13)) as Array<{ id: number; p1: { x: number; y: number }; p2: { x: number; y: number } }>;
    expect(lines).toHaveLength(1);
    expect(lines[0]!.id).toBe(11);
    expect(lines[0]!.p1).toEqual({ x: 2, y: 0 });
    expect(lines[0]!.p2).toEqual({ x: 10, y: 0 });
  });

  it('引用目标实体的约束被移除，其它约束保留', () => {
    const constraints: SketchConstraintDto[] = [
      { kind: 'horizontal', id: 1, refs: [11] },
      { kind: 'horizontal', id: 2, refs: [12] },
    ];
    const result = trimSketchAt([H_LINE, V_LEFT, V_RIGHT], constraints, 11, { x: 5, y: 0 });
    expect(result.constraints.map((constraint) => constraint.id)).toEqual([2]);
  });

  it('显式点引用（p1/p2 为点实体 id）同样解析', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: -10, y: 0 },
      { kind: 'point', id: 2, x: 10, y: 0 },
      { kind: 'line', id: 11, p1: 1, p2: 2 },
      V_LEFT,
      V_RIGHT,
    ];
    const result = trimSketchAt(entities, [], 11, { x: 5, y: 0 });
    const lines = result.entities.filter((entity) => entity.kind === 'line' && entity.id !== 12 && entity.id !== 13);
    expect(lines).toHaveLength(2);
    expect(point(lines[0]!)).toEqual({ x: -10, y: 0 });
  });

  it('spline → unsupported（不静默改数据）', () => {
    const spline: SketchEntityDto = {
      kind: 'spline', id: 3, controlPoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }, { x: 3, y: 1 }],
    };
    const result = trimSketchAt([spline], [], 3, { x: 1, y: 1 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unsupported');
    expect(result.entities).toEqual([spline]);
  });
});

describe('trimSketchAt — 圆/弧', () => {
  const circle: SketchEntityDto = { kind: 'circle', id: 21, center: { x: 0, y: 0 }, radius: 5 };
  const vertical: SketchEntityDto = { kind: 'line', id: 22, p1: { x: 0, y: -10 }, p2: { x: 0, y: 10 } };

  it('圆被直线切两半：点击右侧 → 保留左半弧', () => {
    const result = trimSketchAt([circle, vertical], [], 21, { x: 5, y: 0 });
    expect(result.ok).toBe(true);
    const arcs = result.entities.filter((entity) => entity.kind === 'arc') as Array<{ id: number; radius: number; startAngle: number; sweepAngle: number }>;
    expect(arcs).toHaveLength(1);
    expect(arcs[0]!.id).toBe(21);
    expect(arcs[0]!.radius).toBeCloseTo(5, 9);
    expect(arcs[0]!.startAngle).toBeCloseTo(Math.PI / 2, 6);
    expect(Math.abs(arcs[0]!.sweepAngle)).toBeCloseTo(Math.PI, 6);
  });

  it('圆无交点 → 整删', () => {
    const result = trimSketchAt([circle], [], 21, { x: 5, y: 0 });
    expect(result.removedEntityIds).toEqual([21]);
    expect(result.entities).toEqual([]);
  });

  it('弧被两条直线截断：移除中间段，保留两段弧', () => {
    const arc: SketchEntityDto = {
      kind: 'arc', id: 31, center: { x: 0, y: 0 }, radius: 1, startAngle: 0, sweepAngle: Math.PI,
    };
    const at60: SketchEntityDto = { kind: 'line', id: 32, p1: { x: 0.5, y: -2 }, p2: { x: 0.5, y: 2 } };
    const at90: SketchEntityDto = { kind: 'line', id: 33, p1: { x: 0, y: -2 }, p2: { x: 0, y: 2 } };
    const click = { x: Math.cos(75 * Math.PI / 180), y: Math.sin(75 * Math.PI / 180) };
    const result = trimSketchAt([arc, at60, at90], [], 31, click);
    const arcs = result.entities.filter((entity) => entity.kind === 'arc') as Array<{ id: number; startAngle: number; sweepAngle: number }>;
    expect(arcs).toHaveLength(2);
    expect(arcs[0]!.startAngle).toBeCloseTo(0, 6);
    expect(arcs[0]!.sweepAngle).toBeCloseTo(Math.PI / 3, 6);
    expect(arcs[1]!.startAngle).toBeCloseTo(Math.PI / 2, 6);
    expect(arcs[1]!.sweepAngle).toBeCloseTo(Math.PI / 2, 6);
  });
});
