/**
 * 草图圆角纯逻辑单测（Onshape Fillet 首切片 2026-11-12）：
 * 角点识别、90°/45° 相切几何、半径过大/共线诚实拒绝、约束展开与旧角点
 * coincident 移除。
 */
import { describe, expect, it } from 'vitest';
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import {
  computeFilletGeometry,
  computeFilletLineArcGeometry,
  filletSketchCorner,
  filletSketchLineArcCorner,
  filletSketchLinePair,
  findSketchFilletCorners,
  findSketchLineArcCorners,
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

  it('显式 point 端点角点：识别 → 两线分离为内联点 + 孤儿 point 清理；仍被约束引用则保留', () => {
    const explicitEntities: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'line', id: 2, p1: 1, p2: { x: 5, y: 0 } },
      { kind: 'line', id: 3, p1: 1, p2: { x: 0, y: 5 } },
    ];
    const explicit = findSketchFilletCorners(explicitEntities, []);
    expect(explicit).toHaveLength(1);
    expect(explicit[0]).toMatchObject({
      a: { lineId: 2, part: 'start' }, b: { lineId: 3, part: 'start' },
    });
    const filleted = filletSketchCorner(
      explicitEntities, [], explicit[0]!, 2, nextSketchId(explicitEntities, []),
    );
    expect(filleted.ok).toBe(true);
    if (filleted.ok) {
      expect(filleted.entities.some((entity) => entity.id === 1 && entity.kind === 'point')).toBe(false);
      const line2 = filleted.entities.find((entity) => entity.id === 2) as Extract<SketchEntityDto, { kind: 'line' }>;
      expect((line2.p1 as { x: number }).x).toBeCloseTo(2, 9);
      expect((line2.p1 as { y: number }).y).toBeCloseTo(0, 9);
      const line3 = filleted.entities.find((entity) => entity.id === 3) as Extract<SketchEntityDto, { kind: 'line' }>;
      expect((line3.p1 as { x: number }).x).toBeCloseTo(0, 9);
      expect((line3.p1 as { y: number }).y).toBeCloseTo(2, 9);
    }

    // point 1 仍被一条 distance 约束引用 → 不能删除。
    const sharedEntities: SketchEntityDto[] = [
      ...explicitEntities,
      { kind: 'point', id: 4, x: 5, y: 5 },
    ];
    const sharedConstraints: SketchConstraintDto[] = [
      { kind: 'distance', id: 50, refs: [1, 4], value: 7 },
    ];
    const sharedCorner = findSketchFilletCorners(sharedEntities, sharedConstraints)[0]!;
    const shared = filletSketchCorner(sharedEntities, sharedConstraints, sharedCorner, 2, 51);
    expect(shared.ok).toBe(true);
    if (shared.ok)
      expect(shared.entities.some((entity) => entity.id === 1 && entity.kind === 'point')).toBe(true);

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

describe('filletSketchLinePair（Onshape 两曲线选择）', () => {
  const GAP_LINES: SketchEntityDto[] = [
    { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
    { kind: 'line', id: 2, p1: { x: 0, y: 1 }, p2: { x: 0, y: 11 } },
  ];

  it('不相连 L 形两线：延长交点 (0,0) 处 R5，两线近端点回缩到切点', () => {
    const result = filletSketchLinePair(GAP_LINES, [], 1, 2, 5, 100);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.arcId).toBe(100);
    expect(result.geometry.tangentA.x).toBeCloseTo(5, 9);
    expect(result.geometry.tangentA.y).toBeCloseTo(0, 9);
    expect(result.geometry.tangentB.x).toBeCloseTo(0, 9);
    expect(result.geometry.tangentB.y).toBeCloseTo(5, 9);
    expect(result.geometry.center.x).toBeCloseTo(5, 9);
    expect(result.geometry.center.y).toBeCloseTo(5, 9);
    const lineA = result.entities.find((entity) => entity.id === 1) as Extract<SketchEntityDto, { kind: 'line' }>;
    expect((lineA.p1 as { x: number }).x).toBeCloseTo(5, 9);
    expect((lineA.p1 as { y: number }).y).toBeCloseTo(0, 9);
    const lineB = result.entities.find((entity) => entity.id === 2) as Extract<SketchEntityDto, { kind: 'line' }>;
    expect((lineB.p1 as { x: number }).x).toBeCloseTo(0, 9);
    expect((lineB.p1 as { y: number }).y).toBeCloseTo(5, 9);
    expect(result.constraints.filter((constraint) => constraint.kind === 'tangent')).toHaveLength(2);
    expect(result.constraints.find((constraint) => constraint.kind === 'radius')).toMatchObject({ value: 5 });
  });

  it('间隙大于切距 → outside-segment；平行 → degenerate；近端点显式 point 可分离，孤儿点清理', () => {
    const gapTooLarge = filletSketchLinePair([
      { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
      { kind: 'line', id: 2, p1: { x: 0, y: 6 }, p2: { x: 0, y: 16 } },
    ], [], 1, 2, 5, 100);
    expect(gapTooLarge.ok).toBe(false);
    if (!gapTooLarge.ok) expect(gapTooLarge.reason).toBe('outside-segment');

    const parallel = filletSketchLinePair([
      { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
      { kind: 'line', id: 2, p1: { x: 0, y: 1 }, p2: { x: 10, y: 1 } },
    ], [], 1, 2, 5, 100);
    expect(parallel.ok).toBe(false);
    if (!parallel.ok) expect(parallel.reason).toBe('degenerate');

    const explicit = filletSketchLinePair([
      { kind: 'point', id: 9, x: 0, y: 0 },
      { kind: 'line', id: 1, p1: 9, p2: { x: 10, y: 0 } },
      { kind: 'line', id: 2, p1: { x: 0, y: 1 }, p2: { x: 0, y: 11 } },
    ], [], 1, 2, 5, 100);
    expect(explicit.ok).toBe(true);
    if (explicit.ok) {
      expect(explicit.entities.some((entity) => entity.id === 9 && entity.kind === 'point')).toBe(false);
      const line1 = explicit.entities.find((entity) => entity.id === 1) as Extract<SketchEntityDto, { kind: 'line' }>;
      expect((line1.p1 as { x: number }).x).toBeCloseTo(5, 9);
      expect((line1.p1 as { y: number }).y).toBeCloseTo(0, 9);
    }
  });

  it('交点在两线段内部（十字交叉）→ outside-segment（不猜四解）', () => {
    const crossing = filletSketchLinePair([
      { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
      { kind: 'line', id: 2, p1: { x: 5, y: -5 }, p2: { x: 5, y: 5 } },
    ], [], 1, 2, 2, 100);
    expect(crossing.ok).toBe(false);
    if (!crossing.ok) expect(crossing.reason).toBe('outside-segment');
  });
});

describe('直线-圆弧圆角（Onshape Fillet 第三模式）', () => {
  const LINE_ARC: SketchEntityDto[] = [
    { kind: 'line', id: 11, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
    { kind: 'arc', id: 12, center: { x: 5, y: 0 }, radius: 5, startAngle: Math.PI, sweepAngle: Math.PI / 2 },
  ];

  it('识别线-弧共享端点角点；90° 切向夹角 R2 的曲率修正切点', () => {
    const corners = findSketchLineArcCorners(LINE_ARC, []);
    expect(corners).toHaveLength(1);
    expect(corners[0]).toMatchObject({
      line: { lineId: 11, part: 'start' },
      arc: { arcId: 12, part: 'start' },
    });
    const computed = computeFilletLineArcGeometry(corners[0]!, 2);
    expect(computed.ok).toBe(true);
    if (!computed.ok) return;
    const g = computed.geometry;
    // 候选圆心=偏移线 y=−2 与源圆同心圆 R−r=3 的交点：x=5−√5（内切）。
    expect(g.tangentLine.x).toBeCloseTo(5 - Math.sqrt(5), 9);
    expect(g.tangentLine.y).toBeCloseTo(0, 9);
    expect(g.center.x).toBeCloseTo(5 - Math.sqrt(5), 9);
    expect(g.center.y).toBeCloseTo(-2, 9);
    expect(g.tangentArc.x).toBeCloseTo(5 - (5 * Math.sqrt(5)) / 3, 9);
    expect(g.tangentArc.y).toBeCloseTo(-10 / 3, 9);
    expect(g.arcDelta).toBeCloseTo(Math.PI + Math.atan2(-10 / 3, -(5 * Math.sqrt(5)) / 3), 9);
    expect(g.arcStartAngle).toBeCloseTo(Math.PI + g.arcDelta, 9);
    expect(g.arcSweepAngle).toBeCloseTo(Math.PI / 2 - g.arcDelta, 9);
    expect(g.startAngle).toBeCloseTo(Math.PI / 2, 9);
    expect(g.sweepAngle).toBeCloseTo(2.30052398, 6);
    expect(g.lineDistance).toBeCloseTo(5 - Math.sqrt(5), 9);
  });

  it('应用：线端点回缩、源弧收窄、插入圆角+coincident×2/tangent×2/radius', () => {
    const corner = findSketchLineArcCorners(LINE_ARC, [])[0]!;
    const result = filletSketchLineArcCorner(
      LINE_ARC, [], corner, 2, nextSketchId(LINE_ARC, []),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.arcId).toBe(13);
    const line = result.entities.find((entity) => entity.id === 11) as Extract<SketchEntityDto, { kind: 'line' }>;
    expect((line.p1 as { x: number }).x).toBeCloseTo(5 - Math.sqrt(5), 9);
    expect((line.p1 as { y: number }).y).toBeCloseTo(0, 9);
    const sourceArc = result.entities.find((entity) => entity.id === 12) as Extract<SketchEntityDto, { kind: 'arc' }>;
    expect(sourceArc.startAngle).toBeCloseTo(result.geometry.arcStartAngle, 9);
    expect(sourceArc.sweepAngle).toBeCloseTo(result.geometry.arcSweepAngle, 9);
    expect(result.constraints.filter((constraint) => constraint.kind === 'coincident')).toHaveLength(2);
    expect(result.constraints.filter((constraint) => constraint.kind === 'tangent')).toEqual([
      { kind: 'tangent', id: 16, refs: [13, 11] },
      { kind: 'tangent', id: 17, refs: [13, 12] },
    ]);
    expect(result.constraints.find((constraint) => constraint.kind === 'radius')).toEqual({
      kind: 'radius', id: 18, refs: [13], value: 2,
    });
    expect(result.nextId).toBe(19);
  });

  it('相切角/过大半径/显式点线端点：退化拒收；显式点分离并清理孤儿', () => {
    // 直线在 (0,0) 与圆相切（半径方向水平、切向竖直）：整段光滑，无有效圆角。
    const tangentArc: SketchEntityDto[] = [
      { kind: 'line', id: 11, p1: { x: 0, y: 0 }, p2: { x: 0, y: 10 } },
      { kind: 'arc', id: 12, center: { x: 5, y: 0 }, radius: 5, startAngle: Math.PI, sweepAngle: Math.PI / 2 },
    ];
    const tangentCorner = findSketchLineArcCorners(tangentArc, [])[0]!;
    expect(computeFilletLineArcGeometry(tangentCorner, 2)).toEqual({ ok: false, reason: 'degenerate' });

    const corner = findSketchLineArcCorners(LINE_ARC, [])[0]!;
    expect(computeFilletLineArcGeometry(corner, 20)).toEqual({ ok: false, reason: 'outside-segment' });

    const explicit: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'line', id: 11, p1: 1, p2: { x: 10, y: 0 } },
      { kind: 'arc', id: 12, center: { x: 5, y: 0 }, radius: 5, startAngle: Math.PI, sweepAngle: Math.PI / 2 },
    ];
    const explicitCorner = findSketchLineArcCorners(explicit, [])[0]!;
    expect(explicitCorner.line).toMatchObject({ lineId: 11, part: 'start' });
    const applied = filletSketchLineArcCorner(explicit, [], explicitCorner, 2, 13);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.entities.some((entity) => entity.id === 1 && entity.kind === 'point')).toBe(false);
      const line = applied.entities.find((entity) => entity.id === 11) as Extract<SketchEntityDto, { kind: 'line' }>;
      expect((line.p1 as { x: number }).x).toBeCloseTo(5 - Math.sqrt(5), 9);
    }
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
