/**
 * 草图修剪纯逻辑（Onshape 修剪首切片）：线段/圆/弧的区间移除与整删语义。
 */
import { describe, expect, it } from 'vitest';
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import { splitSketchAt, trimSketchAt } from '../internal/sketch-trim.js';

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

  it('非四次贝塞尔/周期样条 → unsupported（不静默改数据）', () => {
    const quintic: SketchEntityDto = {
      kind: 'spline', id: 3,
      controlPoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }, { x: 3, y: 1 }, { x: 4, y: 0 }],
    };
    expect(trimSketchAt([quintic], [], 3, { x: 1, y: 1 }).reason).toBe('unsupported');
    const periodic: SketchEntityDto = {
      kind: 'spline', id: 4, periodic: true,
      controlPoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }, { x: 3, y: 1 }],
    };
    expect(trimSketchAt([periodic], [], 4, { x: 1, y: 1 }).reason).toBe('unsupported');
    const projected: SketchEntityDto = {
      kind: 'spline', id: 5,
      controlPoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }, { x: 3, y: 1 }],
      projected: { kind: 'projected', source: { kind: 'sketchEntity', sketchId: 's', entityId: 1 } },
    };
    expect(trimSketchAt([projected], [], 5, { x: 1, y: 1 }).reason).toBe('unsupported');
  });
});

describe('trimSketchAt — 三次贝塞尔样条（Onshape Trim 支持 Bezier）', () => {
  // 共线控制点 0/3/6/9 → x(t)=9t，便于断言 de Casteljau 分裂点。
  const straightSpline = (id = 3): SketchEntityDto => ({
    kind: 'spline', id, controlPoints: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 6, y: 0 }, { x: 9, y: 0 }],
  });
  const controlPoint = (entity: SketchEntityDto | undefined, index: number): { x: number; y: number } | undefined =>
    entity?.kind === 'spline' ? entity.controlPoints[index] : undefined;

  it('两条切割线之间：中间段移除，两侧保留（原 id + 新 id，控制点精确分裂）', () => {
    const spline = straightSpline();
    const result = trimSketchAt([spline, V_LEFT, V_RIGHT], [], 3, { x: 5, y: 0 });
    expect(result.ok).toBe(true);
    const pieces = result.entities.filter((entity) => entity.kind === 'spline');
    expect(pieces.map((piece) => piece.id)).toEqual([3, 14]);
    expect(controlPoint(pieces[0], 0)).toEqual({ x: 0, y: 0 });
    expect(controlPoint(pieces[0], 3)!.x).toBeCloseTo(2, 6);
    expect(controlPoint(pieces[1], 0)!.x).toBeCloseTo(8, 6);
    expect(controlPoint(pieces[1], 3)!.x).toBeCloseTo(9, 6);
    expect(result.constraints).toEqual([]);
  });

  it('点击首段 → 移除起点到第一交点，保留其余；引用样条的约束移除、其它保留', () => {
    const constraints: SketchConstraintDto[] = [
      { kind: 'fixed', id: 1, refs: [3] },
      { kind: 'horizontal', id: 2, refs: [12] },
    ];
    const result = trimSketchAt([straightSpline(), V_LEFT, V_RIGHT], constraints, 3, { x: 1, y: 0 });
    const pieces = result.entities.filter((entity) => entity.kind === 'spline');
    expect(pieces).toHaveLength(1);
    expect(pieces[0]!.id).toBe(3);
    expect(controlPoint(pieces[0], 0)!.x).toBeCloseTo(2, 6);
    expect(controlPoint(pieces[0], 3)!.x).toBeCloseTo(9, 6);
    expect(result.constraints.map((constraint) => constraint.id)).toEqual([2]);
  });

  it('无交点 → 整删样条；圆作为切割边 → 样条与圆均可修剪', () => {
    expect(trimSketchAt([straightSpline()], [], 3, { x: 4.5, y: 0 }).removedEntityIds).toEqual([3]);

    const circle: SketchEntityDto = { kind: 'circle', id: 21, center: { x: 4.5, y: 0 }, radius: 1 };
    const splineTrim = trimSketchAt([straightSpline(), circle], [], 3, { x: 4.5, y: 0 });
    expect(splineTrim.entities.filter((entity) => entity.kind === 'spline')).toHaveLength(2);

    // 圆被样条切割：点击上方 → 保留下方圆弧。
    const circleTrim = trimSketchAt([straightSpline(), circle], [], 21, { x: 4.5, y: 1 });
    const arcs = circleTrim.entities.filter((entity) => entity.kind === 'arc');
    expect(arcs).toHaveLength(1);
    expect(circleTrim.removedEntityIds).toEqual([]);
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

describe('splitSketchAt — 分割（Onshape 修剪 ▾ → 分割）', () => {
  it('线段中点分割：两段共享新显式点，原 id 留给第一段', () => {
    const constraints: SketchConstraintDto[] = [
      { kind: 'horizontal', id: 1, refs: [11] },
      { kind: 'horizontal', id: 2, refs: [12] },
    ];
    const result = splitSketchAt([H_LINE, V_LEFT, V_RIGHT], constraints, 11, { x: 0, y: 0 });
    expect(result.ok).toBe(true);
    const lines = result.entities.filter((entity) => entity.kind === 'line' && (entity.id === 11 || entity.id > 13)) as Array<{ id: number; p1: number | { x: number; y: number }; p2: number | { x: number; y: number } }>;
    expect(lines).toHaveLength(2);
    expect(lines[0]!.id).toBe(11);
    expect(lines[1]!.id).toBeGreaterThan(13);
    expect(result.pointId).toBeGreaterThan(13);
    const splitPoint = result.entities.find((entity) => entity.kind === 'point' && entity.id === result.pointId);
    expect(splitPoint).toMatchObject({ kind: 'point', x: 0, y: 0 });
    expect(lines[0]!.p1).toEqual({ x: -10, y: 0 });
    expect(lines[0]!.p2).toBe(result.pointId);
    expect(lines[1]!.p1).toBe(result.pointId);
    expect(lines[1]!.p2).toEqual({ x: 10, y: 0 });
    // 引用被分割实体的约束移除，其它保留。
    expect(result.constraints.map((constraint) => constraint.id)).toEqual([2]);
    // id 唯一。
    expect(new Set(result.entities.map((entity) => entity.id)).size).toBe(result.entities.length);
  });

  it('显式点引用保持：第一段 p1、第二段 p2 仍指向原端点实体', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: -10, y: 0 },
      { kind: 'point', id: 2, x: 10, y: 0 },
      { kind: 'line', id: 11, p1: 1, p2: 2 },
    ];
    const result = splitSketchAt(entities, [], 11, { x: 4, y: 0 });
    const lines = result.entities.filter((entity) => entity.kind === 'line') as Array<{ id: number; p1: number; p2: number }>;
    expect(lines[0]!.p1).toBe(1);
    expect(lines[0]!.p2).toBe(result.pointId);
    expect(lines[1]!.p1).toBe(result.pointId);
    expect(lines[1]!.p2).toBe(2);
  });

  it('端点附近点击 / 单点圆 / 投影样条 → no-change/needs-second-point/unsupported', () => {
    expect(splitSketchAt([H_LINE], [], 11, { x: -10, y: 0 }).reason).toBe('no-change');
    const circle: SketchEntityDto = { kind: 'circle', id: 21, center: { x: 0, y: 0 }, radius: 5 };
    expect(splitSketchAt([circle], [], 21, { x: 5, y: 0 }).reason).toBe('needs-second-point');
    const projected: SketchEntityDto = {
      kind: 'line', id: 12, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 },
      projected: { kind: 'projected', source: { kind: 'sketchEntity', sketchId: 's', entityId: 1 } },
    };
    expect(splitSketchAt([projected], [], 12, { x: 5, y: 0 }).reason).toBe('unsupported');
  });

  it('闭合曲线（圆）两点分割：两段弧首尾相接、扫角之和 = 2π', () => {
    const circle: SketchEntityDto = { kind: 'circle', id: 21, center: { x: 0, y: 0 }, radius: 5 };
    const result = splitSketchAt([circle], [], 21, { x: 5, y: 0 }, { x: -5, y: 0 });
    expect(result.ok).toBe(true);
    const arcs = result.entities.filter((entity) => entity.kind === 'arc') as Array<{ id: number; radius: number; startAngle: number; sweepAngle: number }>;
    expect(arcs).toHaveLength(2);
    expect(arcs[0]!.id).toBe(21);
    expect(arcs[0]!.startAngle).toBeCloseTo(0, 6);
    expect(arcs[0]!.sweepAngle).toBeCloseTo(Math.PI, 6);
    expect(arcs[1]!.startAngle).toBeCloseTo(Math.PI, 6);
    expect(arcs[1]!.sweepAngle).toBeCloseTo(Math.PI, 6);
    expect(arcs[0]!.sweepAngle + arcs[1]!.sweepAngle).toBeCloseTo(Math.PI * 2, 6);
    // 两点重合 → no-change。
    expect(splitSketchAt([circle], [], 21, { x: 5, y: 0 }, { x: 5, y: 0 }).reason).toBe('no-change');
  });

  it('圆弧中点分割：两段弧角度首尾相接、半径/圆心不变', () => {
    const arc: SketchEntityDto = {
      kind: 'arc', id: 31, center: { x: 0, y: 0 }, radius: 10, startAngle: 0, sweepAngle: Math.PI,
    };
    const result = splitSketchAt([arc], [], 31, { x: 0, y: 10 });
    expect(result.ok).toBe(true);
    const arcs = result.entities.filter((entity) => entity.kind === 'arc') as Array<{ id: number; radius: number; startAngle: number; sweepAngle: number }>;
    expect(arcs).toHaveLength(2);
    expect(arcs[0]!.id).toBe(31);
    expect(arcs[0]!.startAngle).toBeCloseTo(0, 6);
    expect(arcs[0]!.sweepAngle).toBeCloseTo(Math.PI / 2, 6);
    expect(arcs[1]!.startAngle).toBeCloseTo(Math.PI / 2, 6);
    expect(arcs[1]!.sweepAngle).toBeCloseTo(Math.PI / 2, 6);
    expect(arcs[1]!.radius).toBeCloseTo(10, 9);
  });

  it('三次贝塞尔样条中点分割：de Casteljau 精确两段、控制点首尾相接', () => {
    const spline: SketchEntityDto = {
      kind: 'spline', id: 3, controlPoints: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 6, y: 0 }, { x: 9, y: 0 }],
    };
    const result = splitSketchAt([spline], [], 3, { x: 4.5, y: 0 });
    expect(result.ok).toBe(true);
    const splines = result.entities.filter((entity) => entity.kind === 'spline') as Array<{ id: number; controlPoints: Array<{ x: number; y: number }> }>;
    expect(splines).toHaveLength(2);
    expect(splines[0]!.id).toBe(3);
    expect(splines[0]!.controlPoints.map((control) => control.x)).toEqual([0, 1.5, 3, 4.5]);
    expect(splines[1]!.controlPoints.map((control) => control.x)).toEqual([4.5, 6, 7.5, 9]);
  });
});
