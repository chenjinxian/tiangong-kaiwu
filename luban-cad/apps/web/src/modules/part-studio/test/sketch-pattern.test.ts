/**
 * AIRR 2026-11-12：草图线性阵列纯逻辑。
 * Onshape 近似口径：实例为独立几何副本（无“阵列关系”约束）。
 */
import { describe, expect, it } from 'vitest';
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import type { SketchEntitySelection } from '../internal/sketch-entity-picker.js';
import {
  buildSketchLinearPattern,
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
