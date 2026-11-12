/**
 * AIRR 2026-11-12：草图线性阵列纯逻辑。
 * Onshape 近似口径：实例为独立几何副本（无“阵列关系”约束）。
 */
import { describe, expect, it } from 'vitest';
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import type { SketchEntitySelection } from '../internal/sketch-entity-picker.js';
import {
  buildSketchCircularPattern,
  buildSketchLinearPattern,
  buildSketchTransform,
  buildSketchTranslation,
  SKETCH_PATTERN_MAX_COUNT,
} from '../internal/sketch-pattern.js';

const circle = (id: number, cx: number, cy: number, radius = 0.005): SketchEntityDto => ({
  kind: 'circle', id, center: { x: cx, y: cy }, radius,
});
const curveSelection = (entityId: number): SketchEntitySelection => ({
  sketchId: 'sk', entityId, part: 'curve',
});

function at(result: ReturnType<typeof buildSketchLinearPattern>): Exclude<ReturnType<typeof buildSketchLinearPattern>, { ok: false }> {
  if (!result.ok)
    throw new Error(`unexpected failure: ${result.error}`);
  return result;
}

describe('buildSketchLinearPattern', () => {
  it('圆种子：count=3、spacing=20mm、方向 +X → 3 个圆，内部 radius 约束逐实例复制', () => {
    const entities: SketchEntityDto[] = [circle(11, 0, 0)];
    const constraints: SketchConstraintDto[] = [{ kind: 'radius', id: 101, refs: [11], value: 0.005 }];
    const result = at(buildSketchLinearPattern(entities, constraints, [curveSelection(11)], {
      directionRad: 0, spacingLocal: 0.02, count: 3,
    }));

    const circles = result.entities.filter((entity) => entity.kind === 'circle');
    expect(circles).toHaveLength(3);
    const centers = circles.map((entity) => entity.kind === 'circle' ? entity.center : undefined);
    expect(centers).toEqual([
      { x: 0, y: 0 },
      { x: 0.02, y: 0 },
      { x: 0.04, y: 0 },
    ]);
    const radiusConstraints = result.constraints.filter((constraint) => constraint.kind === 'radius');
    expect(radiusConstraints).toHaveLength(3);
    expect(new Set(radiusConstraints.map((constraint) => constraint.id)).size).toBe(3);
    expect(new Set(result.entities.map((entity) => entity.id)).size).toBe(result.entities.length);
    expect(result.instanceCurveIds).toHaveLength(3);
    expect(result.instanceCurveIds[0]).toEqual([11]);
  });

  it('显式 point 端点：副本点实体平移，line 数字引用指向副本点', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 0.01, y: 0 },
      { kind: 'line', id: 11, p1: 1, p2: 2 },
    ];
    const constraints: SketchConstraintDto[] = [
      { kind: 'horizontal', id: 101, refs: [11] },
      { kind: 'coincident', id: 102, refs: [{ entity: 11, part: 'start' }, 1] },
    ];
    const result = at(buildSketchLinearPattern(entities, constraints, [curveSelection(11)], {
      directionRad: 0, spacingLocal: 0.01, count: 2,
    }));

    const lines = result.entities.filter((entity): entity is Extract<SketchEntityDto, { kind: 'line' }> => entity.kind === 'line');
    expect(lines).toHaveLength(2);
    const copy = lines[1]!;
    expect(typeof copy.p1).toBe('number');
    expect(typeof copy.p2).toBe('number');
    const points = result.entities.filter((entity): entity is Extract<SketchEntityDto, { kind: 'point' }> => entity.kind === 'point');
    const copyPoint1 = points.find((point) => point.id === copy.p1);
    const copyPoint2 = points.find((point) => point.id === copy.p2);
    expect(copyPoint1).toMatchObject({ x: 0.01, y: 0 });
    expect(copyPoint2).toMatchObject({ x: 0.02, y: 0 });
  });

  it('内联点与样条控制点随实例平移；外部原点约束不复制', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'line', id: 11, p1: { x: 0, y: 0 }, p2: { x: 0.01, y: 0 } },
      {
        kind: 'spline', id: 12,
        controlPoints: [{ x: 0, y: 0.005 }, { x: 0.003, y: 0.008 }, { x: 0.006, y: 0.008 }, { x: 0.01, y: 0.005 }],
        fitPoints: [{ x: 0, y: 0.005 }, { x: 0.01, y: 0.005 }],
      },
    ];
    const constraints: SketchConstraintDto[] = [
      { kind: 'horizontal', id: 101, refs: [11] },
      { kind: 'coincident', id: 102, refs: [{ entity: 11, part: 'start' }, { origin: true }] },
    ];
    const result = at(buildSketchLinearPattern(entities, constraints, [curveSelection(11), curveSelection(12)], {
      directionRad: 0, spacingLocal: 0.004, count: 2,
    }));

    const copies = result.entities.filter((entity) => entity.kind === 'line' || entity.kind === 'spline');
    expect(copies).toHaveLength(4);
    const copiedLine = copies.filter((entity) => entity.kind === 'line')[1];
    expect(copiedLine?.kind === 'line' ? copiedLine.p1 : undefined).toEqual({ x: 0.004, y: 0 });
    const copiedSpline = copies.filter((entity) => entity.kind === 'spline')[1];
    expect(copiedSpline?.kind === 'spline' ? copiedSpline.controlPoints[0] : undefined).toEqual({ x: 0.004, y: 0.005 });
    expect(copiedSpline?.kind === 'spline' ? copiedSpline.fitPoints?.[1] : undefined).toEqual({ x: 0.014, y: 0.005 });
    // 外部原点关系在副本中丢弃；种子上的约束保留。
    const coincident = result.constraints.filter((constraint) => constraint.kind === 'coincident');
    expect(coincident).toHaveLength(1);
    expect(coincident[0]!.refs.some((ref) => typeof ref === 'object' && 'origin' in ref)).toBe(true);
  });

  it('方向角 90°：副本沿 +Y 平移', () => {
    const result = at(buildSketchLinearPattern([circle(11, 0, 0)], [], [curveSelection(11)], {
      directionRad: Math.PI / 2, spacingLocal: 0.01, count: 3,
    }));
    const centers = result.entities
      .filter((entity) => entity.kind === 'circle')
      .map((entity) => entity.kind === 'circle' ? entity.center as { x: number; y: number } : undefined);
    expect(centers[1]!.x).toBeCloseTo(0, 10);
    expect(centers[1]!.y).toBeCloseTo(0.01, 10);
    expect(centers[2]!.x).toBeCloseTo(0, 10);
    expect(centers[2]!.y).toBeCloseTo(0.02, 10);
  });

  it('校验：无曲线种子 / count 越界 / 间距非正 / 方向非法', () => {
    expect(buildSketchLinearPattern([circle(11, 0, 0)], [], [], { directionRad: 0, spacingLocal: 0.01, count: 3 }))
      .toEqual({ ok: false, error: 'no-selection' });
    expect(buildSketchLinearPattern([{ kind: 'point', id: 1, x: 0, y: 0 }], [], [curveSelection(1)], { directionRad: 0, spacingLocal: 0.01, count: 3 }))
      .toEqual({ ok: false, error: 'no-selection' });
    expect(buildSketchLinearPattern([circle(11, 0, 0)], [], [curveSelection(11)], { directionRad: 0, spacingLocal: 0.01, count: 1 }))
      .toEqual({ ok: false, error: 'invalid-count' });
    expect(buildSketchLinearPattern([circle(11, 0, 0)], [], [curveSelection(11)], { directionRad: 0, spacingLocal: 0.01, count: SKETCH_PATTERN_MAX_COUNT + 1 }))
      .toEqual({ ok: false, error: 'invalid-count' });
    expect(buildSketchLinearPattern([circle(11, 0, 0)], [], [curveSelection(11)], { directionRad: 0, spacingLocal: 0, count: 3 }))
      .toEqual({ ok: false, error: 'invalid-spacing' });
    expect(buildSketchLinearPattern([circle(11, 0, 0)], [], [curveSelection(11)], { directionRad: Number.NaN, spacingLocal: 0.01, count: 3 }))
      .toEqual({ ok: false, error: 'invalid-direction' });
  });

  it('点实体单独选择不算曲线种子', () => {
    expect(buildSketchLinearPattern(
      [{ kind: 'point', id: 1, x: 0, y: 0 }],
      [],
      [{ sketchId: 'sk', entityId: 1, part: 'curve' }],
      { directionRad: 0, spacingLocal: 0.01, count: 2 },
    )).toEqual({ ok: false, error: 'no-selection' });
  });
});

describe('buildSketchCircularPattern', () => {
  it('整周 3 实例：绕原点均分 120°，圆心旋转正确', () => {
    const result = buildSketchCircularPattern([circle(11, 0.02, 0)], [], [curveSelection(11)], {
      center: { u: 0, v: 0 }, count: 3, angleRad: Math.PI * 2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok)
      return;
    const centers = result.entities
      .filter((entity) => entity.kind === 'circle')
      .map((entity) => entity.kind === 'circle' ? entity.center as { x: number; y: number } : undefined);
    expect(centers).toHaveLength(3);
    expect(centers[0]!.x).toBeCloseTo(0.02, 10);
    expect(centers[0]!.y).toBeCloseTo(0, 10);
    expect(centers[1]!.x).toBeCloseTo(-0.01, 10);
    expect(centers[1]!.y).toBeCloseTo(0.02 * Math.sin(2 * Math.PI / 3), 10);
    expect(centers[2]!.x).toBeCloseTo(-0.01, 10);
    expect(centers[2]!.y).toBeCloseTo(0.02 * Math.sin(4 * Math.PI / 3), 10);
    expect(result.instanceCurveIds).toHaveLength(3);
  });

  it('部分角度 90°/3 实例：步长 45°；内部约束逐实例复制', () => {
    const constraints: SketchConstraintDto[] = [{ kind: 'radius', id: 101, refs: [11], value: 0.005 }];
    const result = buildSketchCircularPattern([circle(11, 0.02, 0)], constraints, [curveSelection(11)], {
      center: { u: 0, v: 0 }, count: 3, angleRad: Math.PI / 2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok)
      return;
    const centers = result.entities
      .filter((entity) => entity.kind === 'circle')
      .map((entity) => entity.kind === 'circle' ? entity.center as { x: number; y: number } : undefined);
    expect(centers[1]!.x).toBeCloseTo(0.02 * Math.cos(Math.PI / 4), 10);
    expect(centers[1]!.y).toBeCloseTo(0.02 * Math.sin(Math.PI / 4), 10);
    expect(centers[2]!.x).toBeCloseTo(0, 10);
    expect(centers[2]!.y).toBeCloseTo(0.02, 10);
    expect(result.constraints.filter((constraint) => constraint.kind === 'radius')).toHaveLength(3);
  });

  it('内联点随旋转；校验中心/角度/数量', () => {
    const inline = buildSketchCircularPattern(
      [{ kind: 'line', id: 11, p1: { x: 0.02, y: 0 }, p2: { x: 0.03, y: 0 } }],
      [],
      [curveSelection(11)],
      { center: { u: 0, v: 0 }, count: 2, angleRad: Math.PI },
    );
    expect(inline.ok).toBe(true);
    if (inline.ok) {
      const copy = inline.entities.filter((entity) => entity.kind === 'line')[1];
      expect(copy?.kind === 'line' ? copy.p1 : undefined).toEqual({ x: -0.02, y: expect.closeTo(0, 10) });
    }
    expect(buildSketchCircularPattern([circle(11, 0.02, 0)], [], [curveSelection(11)], {
      center: { u: Number.NaN, v: 0 }, count: 3, angleRad: Math.PI * 2,
    })).toEqual({ ok: false, error: 'invalid-center' });
    expect(buildSketchCircularPattern([circle(11, 0.02, 0)], [], [curveSelection(11)], {
      center: { u: 0, v: 0 }, count: 3, angleRad: 0,
    })).toEqual({ ok: false, error: 'invalid-angle' });
    expect(buildSketchCircularPattern([circle(11, 0.02, 0)], [], [curveSelection(11)], {
      center: { u: 0, v: 0 }, count: 1, angleRad: Math.PI,
    })).toEqual({ ok: false, error: 'invalid-count' });
  });
});

describe('buildSketchTranslation（变换平移首切片）', () => {
  it('内联点/样条控制点随选中曲线平移；共享点只移动一次；约束不变', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'line', id: 11, p1: { x: 0, y: 0 }, p2: { x: 0.01, y: 0 } },
      { kind: 'line', id: 12, p1: { x: 0.01, y: 0 }, p2: { x: 0.01, y: 0.01 } },
      { kind: 'circle', id: 13, center: { x: 0.02, y: 0 }, radius: 0.005 },
    ];
    const constraints: SketchConstraintDto[] = [{ kind: 'horizontal', id: 101, refs: [11] }];
    const result = buildSketchTranslation(entities, constraints, [curveSelection(11), curveSelection(12)], { u: 0.02, v: 0.01 });
    expect(result.ok).toBe(true);
    if (!result.ok)
      return;
    const lines = result.entities.filter((entity): entity is Extract<SketchEntityDto, { kind: 'line' }> => entity.kind === 'line');
    expect(lines[0]).toMatchObject({ p1: { x: 0.02, y: 0.01 }, p2: { x: 0.03, y: 0.01 } });
    expect(lines[1]).toMatchObject({ p1: { x: 0.03, y: 0.01 }, p2: { x: 0.03, y: 0.02 } });
    // 未选中的圆保持原位。
    const circleEntity = result.entities.find((entity) => entity.id === 13);
    expect(circleEntity).toMatchObject({ center: { x: 0.02, y: 0 } });
    expect(result.constraints).toEqual(constraints);
    expect(result.instanceCurveIds).toEqual([[11, 12]]);
  });

  it('显式 point 实体随引用曲线平移；未选中曲线不动', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 0.01, y: 0 },
      { kind: 'line', id: 11, p1: 1, p2: 2 },
      { kind: 'line', id: 12, p1: { x: 0, y: 0.02 }, p2: { x: 0.01, y: 0.02 } },
    ];
    const result = buildSketchTranslation(entities, [], [curveSelection(11)], { u: 0.005, v: 0.005 });
    expect(result.ok).toBe(true);
    if (!result.ok)
      return;
    expect(result.entities.find((entity) => entity.id === 1)).toMatchObject({ x: 0.005, y: 0.005 });
    expect(result.entities.find((entity) => entity.id === 2)).toMatchObject({ x: 0.015, y: 0.005 });
    expect(result.entities.find((entity) => entity.id === 12)).toMatchObject({ p1: { x: 0, y: 0.02 } });
  });

  it('校验：无曲线选中 / 非有限位移', () => {
    expect(buildSketchTranslation([circle(11, 0, 0)], [], [], { u: 1, v: 0 }))
      .toEqual({ ok: false, error: 'no-selection' });
    expect(buildSketchTranslation([circle(11, 0, 0)], [], [curveSelection(11)], { u: Number.NaN, v: 0 }))
      .toEqual({ ok: false, error: 'invalid-delta' });
  });
});

describe('buildSketchTransform（旋转/缩放）', () => {
  it('均匀缩放：圆心按基点缩放、圆半径同步缩放、内部半径尺寸同步放大', () => {
    const constraints: SketchConstraintDto[] = [{ kind: 'radius', id: 101, refs: [11], value: 0.01 }];
    const result = buildSketchTransform([circle(11, 0.02, 0, 0.01)], constraints, [curveSelection(11)], {
      translation: { u: 0, v: 0 },
      rotationRad: 0,
      scale: 2,
      origin: { u: 0, v: 0 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok)
      return;
    expect(result.entities.find((entity) => entity.id === 11)).toMatchObject({
      center: { x: 0.04, y: 0 },
      radius: 0.02,
    });
    expect(result.constraints.find((constraint) => constraint.id === 101)?.value).toBeCloseTo(0.02, 10);
  });

  it('绕基点旋转 90°：圆心旋转、半径不变', () => {
    const result = buildSketchTransform([circle(11, 0.02, 0, 0.01)], [], [curveSelection(11)], {
      translation: { u: 0, v: 0 },
      rotationRad: Math.PI / 2,
      scale: 1,
      origin: { u: 0, v: 0 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok)
      return;
    const circleEntity = result.entities.find((entity) => entity.id === 11);
    expect(circleEntity?.kind === 'circle' ? circleEntity.center : undefined).toMatchObject({ x: expect.closeTo(0, 10), y: expect.closeTo(0.02, 10) });
    expect(circleEntity?.kind === 'circle' ? circleEntity.radius : undefined).toBeCloseTo(0.01, 10);
  });

  it('先缩放、再旋转、再平移；内联点与样条控制点同一变换', () => {
    const entities: SketchEntityDto[] = [
      circle(11, 0.02, 0, 0.01),
      { kind: 'line', id: 12, p1: { x: 0.01, y: 0 }, p2: { x: 0.02, y: 0 } },
    ];
    const result = buildSketchTransform(entities, [], [curveSelection(11), curveSelection(12)], {
      translation: { u: 0.01, v: 0 },
      rotationRad: Math.PI / 2,
      scale: 2,
      origin: { u: 0, v: 0 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok)
      return;
    const circleEntity = result.entities.find((entity) => entity.id === 11);
    expect(circleEntity?.kind === 'circle' ? circleEntity.center : undefined).toMatchObject({ x: expect.closeTo(0.01, 10), y: expect.closeTo(0.04, 10) });
    expect(circleEntity?.kind === 'circle' ? circleEntity.radius : undefined).toBeCloseTo(0.02, 10);
    const line = result.entities.find((entity) => entity.id === 12);
    expect(line?.kind === 'line' ? line.p1 : undefined).toMatchObject({ x: expect.closeTo(0.01, 10), y: expect.closeTo(0.02, 10) });
    expect(line?.kind === 'line' ? line.p2 : undefined).toMatchObject({ x: expect.closeTo(0.01, 10), y: expect.closeTo(0.04, 10) });
  });

  it('圆弧旋转：圆心随基点旋转、startAngle 平移旋转角、sweep 与半径不变', () => {
    const arc: SketchEntityDto = {
      kind: 'arc', id: 11, center: { x: 0.02, y: 0 }, radius: 0.01,
      startAngle: 0, sweepAngle: Math.PI / 3,
    };
    const result = buildSketchTransform([arc], [], [curveSelection(11)], {
      translation: { u: 0, v: 0 },
      rotationRad: Math.PI / 2,
      scale: 1,
      origin: { u: 0, v: 0 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok)
      return;
    const transformed = result.entities.find((entity) => entity.id === 11);
    expect(transformed?.kind === 'arc' ? transformed.center : undefined)
      .toMatchObject({ x: expect.closeTo(0, 10), y: expect.closeTo(0.02, 10) });
    expect(transformed?.kind === 'arc' ? transformed.startAngle : undefined)
      .toBeCloseTo(Math.PI / 2, 10);
    expect(transformed?.kind === 'arc' ? transformed.sweepAngle : undefined)
      .toBeCloseTo(Math.PI / 3, 10);
    expect(transformed?.kind === 'arc' ? transformed.radius : undefined).toBeCloseTo(0.01, 10);
  });

  it('校验：缩放必须 >0、旋转有限', () => {
    expect(buildSketchTransform([circle(11, 0, 0)], [], [curveSelection(11)], {
      translation: { u: 0, v: 0 }, rotationRad: 0, scale: 0, origin: { u: 0, v: 0 },
    })).toEqual({ ok: false, error: 'invalid-scale' });
    expect(buildSketchTransform([circle(11, 0, 0)], [], [curveSelection(11)], {
      translation: { u: 0, v: 0 }, rotationRad: Number.NaN, scale: 1, origin: { u: 0, v: 0 },
    })).toEqual({ ok: false, error: 'invalid-rotation' });
  });
});
