/**
 * 草图「穿透」纯逻辑（S2 UI 2026-11-21）：两步拾取决策——
 * 1) 草图点只接受持久非投影 point 实体（线端点引用点实体可以；圆心/隐藏原点
 *    与投影点拒收；隐藏原点与显式点同坐标时改选显式点）；
 * 2) 模型边只收 `part="curve"` 的 line/arc 屏幕最邻近命中（≤ HIT_CURVE_PX），
 *    样条/端点候选不参与。
 */
import { describe, expect, it } from 'vitest';
import type { SketchEntityDto } from '@luban-cad/shared';
import {
  acceptPiercePointPick,
  pickPierceEdge,
  pierceStepPrompt,
  resolvePiercePointPick,
  toPierceHit,
} from '../tools/sketch/sketch-pierce-logic.js';
import type { SketchPick } from '../tools/sketch/sketch-constraint-logic.js';
import type { SketchUseBodyCandidate } from '../internal/sketch-use-candidates.js';
import { HIT_CURVE_PX } from '../internal/sketch-entity-picker.js';

const entities: SketchEntityDto[] = [
  { kind: 'point', id: 1, x: 0, y: 0 },
  { kind: 'point', id: 2, x: 10, y: 0 },
  { kind: 'line', id: 3, p1: 1, p2: 2 },
];

const projectedPoint: SketchEntityDto = {
  kind: 'point', id: 4, x: 5, y: 5,
  projected: { kind: 'projected', source: { kind: 'sketchEntity', sketchId: 's', entityId: 9 } },
};

const pickOf = (ref: SketchPick['ref'], kind: SketchPick['kind'], entityId?: number): SketchPick =>
  ({ ref, kind, entityId });

describe('acceptPiercePointPick', () => {
  it('持久 point 实体（数字 ref）接受', () => {
    expect(acceptPiercePointPick(entities, pickOf(2, 'point', 2)))
      .toEqual({ ok: true, entityId: 2 });
  });

  it('无命中 / 非点（线、圆）/ 对象引用点（原点、圆心）拒收', () => {
    expect(acceptPiercePointPick(entities, undefined)).toEqual({ ok: false, reason: 'no-pick' });
    expect(acceptPiercePointPick(entities, pickOf(3, 'line', 3)))
      .toEqual({ ok: false, reason: 'not-point' });
    expect(acceptPiercePointPick(entities, pickOf({ origin: true }, 'point')))
      .toEqual({ ok: false, reason: 'not-point' });
    expect(acceptPiercePointPick(entities, pickOf({ entity: 3, part: 'center' }, 'point', 3)))
      .toEqual({ ok: false, reason: 'not-point' });
  });

  it('数字 ref 但实体不存在/不是点/是投影点 → 拒收', () => {
    expect(acceptPiercePointPick(entities, pickOf(99, 'point', 99)))
      .toEqual({ ok: false, reason: 'not-point' });
    expect(acceptPiercePointPick(entities, pickOf(3, 'point', 3)))
      .toEqual({ ok: false, reason: 'not-point' });
    expect(acceptPiercePointPick([projectedPoint], pickOf(4, 'point', 4)))
      .toEqual({ ok: false, reason: 'not-point' });
  });
});

describe('resolvePiercePointPick', () => {
  it('点击草图点接受（就近分辨同约束工具；点与线端点并列时点实体胜）', () => {
    expect(resolvePiercePointPick(entities, { x: 10, y: 0 }))
      .toEqual({ ok: true, entityId: 2 });
  });

  it('点击线本体（整体最近为线）→ 非点拒收', () => {
    expect(resolvePiercePointPick(entities, { x: 5, y: 0 }))
      .toEqual({ ok: false, reason: 'not-point' });
  });

  it('隐藏原点与显式点同坐标（原点 prio 恒胜）→ 改选显式点实体', () => {
    expect(resolvePiercePointPick(entities, { x: 0, y: 0 }))
      .toEqual({ ok: true, entityId: 1 });
  });

  it('只有隐藏原点（无显式点）→ 拒收（PIERCE 必须挂持久点实体）', () => {
    expect(resolvePiercePointPick([], { x: 0, y: 0 }))
      .toEqual({ ok: false, reason: 'not-point' });
  });

  it('投影点不可作 PIERCE 本地实体', () => {
    expect(resolvePiercePointPick([projectedPoint], { x: 5, y: 5 }))
      .toEqual({ ok: false, reason: 'not-point' });
  });
});

// ---------------------------------------------------------------------------
// 模型边拾取
// ---------------------------------------------------------------------------

let subEntitySeed = 1;
function edgeCandidate(over: Partial<SketchUseBodyCandidate> = {}): SketchUseBodyCandidate {
  const id = subEntitySeed++;
  return {
    kind: 'edge',
    bodyKey: 'body-a',
    subEntityId: id,
    topologyRef: { nodeId: 1, entityId: id },
    part: 'curve',
    curveKind: 'line',
    curve: { kind: 'line', p0: [0, 0, 0], p1: [10, 0, 0] },
    ...over,
  };
}

const projectFlat = (world: readonly [number, number, number]): { x: number; y: number } =>
  ({ x: world[0], y: world[1] });

const arcCurve = {
  kind: 'arc' as const,
  center: [0, 0, 0] as [number, number, number],
  radius: 10,
  normal: [0, 0, 1] as [number, number, number],
  start: [10, 0, 0] as [number, number, number],
  end: [0, 10, 0] as [number, number, number],
  sweepRadians: Math.PI / 2,
};

describe('pickPierceEdge', () => {
  it('直线边命中（≤ HIT_CURVE_PX 屏幕距离）', () => {
    const line = edgeCandidate();
    expect(pickPierceEdge([line], { x: 5, y: HIT_CURVE_PX }, projectFlat)).toBe(line);
    expect(pickPierceEdge([line], { x: 5, y: 40 }, projectFlat)).toBeUndefined();
  });

  it('圆弧边命中（弧采样屏幕距离）', () => {
    const arc = edgeCandidate({
      curveKind: 'arc',
      curve: arcCurve,
    });
    // (0,10) 是弧终点；(7.07,7.07) 是弧中点附近。
    expect(pickPierceEdge([arc], { x: 0, y: 10 }, projectFlat)).toBe(arc);
    expect(pickPierceEdge([arc], { x: 7.1, y: 7.1 }, projectFlat)).toBe(arc);
    expect(pickPierceEdge([arc], { x: 20, y: 20 }, projectFlat)).toBeUndefined();
  });

  it('最近候选获胜；端点/样条（非 curve）候选不参与', () => {
    const near = edgeCandidate({ curve: { kind: 'line', p0: [0, 1, 0], p1: [10, 1, 0] } });
    const far = edgeCandidate({ curve: { kind: 'line', p0: [0, 4, 0], p1: [10, 4, 0] } });
    expect(pickPierceEdge([far, near], { x: 5, y: 1.2 }, projectFlat)).toBe(near);
    const endpointCandidate = edgeCandidate({ part: 'start' });
    expect(pickPierceEdge([endpointCandidate], { x: 0, y: 0 }, projectFlat)).toBeUndefined();
    const splineCandidate = edgeCandidate({
      curveKind: 'arc',
      curve: { kind: 'other', geometryType: 'BsplineCurve' },
    });
    expect(pickPierceEdge([splineCandidate], { x: 0, y: 0 }, projectFlat)).toBeUndefined();
  });

  it('空候选/超过自定义阈值返回 undefined（不静默 no-op）', () => {
    expect(pickPierceEdge([], { x: 0, y: 0 }, projectFlat)).toBeUndefined();
    const line = edgeCandidate();
    expect(pickPierceEdge([line], { x: 5, y: 8 }, projectFlat, 2)).toBeUndefined();
  });
});

describe('阶段提示/命中参数', () => {
  it('未拾取点=point；已拾取点=edge；悬停边=edgeHover', () => {
    expect(pierceStepPrompt(false)).toBe('point');
    expect(pierceStepPrompt(true)).toBe('edge');
    expect(pierceStepPrompt(true, true)).toBe('edgeHover');
  });

  it('SketchPoint2(u,v) → 就近分辨入参({x,y})', () => {
    expect(toPierceHit({ u: 3, v: 4 })).toEqual({ x: 3, y: 4 });
  });
});
