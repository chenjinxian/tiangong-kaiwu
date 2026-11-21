/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图「穿透」（Sketch.Constraint.Pierce）纯逻辑（S2 UI 2026-11-21）：
 * 两步拾取决策与会话/视口解耦，jsdom 可直接测。
 *
 * - 第一步：草图点拾取。复用统一 `resolveNearestPick`（约束/尺寸工具同款就近
 *   分辨），但 PIERCE 的 `localEntityId` 必须指向**持久 point 实体**（后端
 *   隐藏 fixed 交点 + coincident 挂在它上面）：线端点/圆心/隐藏原点都不是持久
 *   点实体，一律拒收（不猜、不新建点）。隐藏原点在同坐标时按 prio 0 恒胜，
 *   与显式点重合时改选显式点实体（距离并列才回退，不改变“点优先”口径）。
 * - 第二步：模型边拾取。候选来自 Use 同款只读通道（`loadSketchUseBodyCandidates`），
 *   仅 `part === "curve"` 的 line/arc 精确曲线参与；屏幕空间最邻近且 ≤
 *   `HIT_CURVE_PX`（与 Use 覆盖层同一命中半径）。样条/椭圆等 `other` 曲线
 *   不采样、不近似（点击它们得到通用「一些图元无法使用。」提示）。
 */
import type { SketchEntityDto, SketchRef } from '@luban-cad/shared';
import { resolveNearestPick } from './sketch-constraint-logic.js';
import type { SketchPick } from './sketch-constraint-logic.js';
import { curveDistance, HIT_CURVE_PX } from '../../internal/sketch-entity-picker.js';
import { bodyEdgeCurvePolyline } from '../../internal/sketch-use-candidates.js';
import type { SketchUseBodyCandidate } from '../../internal/sketch-use-candidates.js';
import type { SketchPoint2 } from './sketch-plane.js';

/** 点拾取判定结果（reason 由调用方映射 i18n 提示，不携带文案）。 */
export type PiercePointResult =
  | { ok: true; entityId: number }
  | { ok: false; reason: 'no-pick' | 'not-point' };

/** 一次 `resolveNearestPick` 产出的点类命中是否可作 PIERCE 的本地实体。 */
export function acceptPiercePointPick(
  entities: readonly SketchEntityDto[],
  pick: SketchPick | undefined,
): PiercePointResult {
  if (!pick)
    return { ok: false, reason: 'no-pick' };
  if (pick.kind !== 'point')
    return { ok: false, reason: 'not-point' };
  // 只有数字 ref（= 持久 point 实体 id）可落库；origin/inline 点/圆心对象引用
  // 都不是持久点实体（line 端点若引用点实体，ref 同样是该点实体 id）。
  const ref = pick.ref;
  if (typeof ref !== 'number')
    return { ok: false, reason: 'not-point' };
  const entity = entities.find((candidate) => candidate.id === ref);
  if (!entity || entity.kind !== 'point' || entity.projected !== undefined)
    return { ok: false, reason: 'not-point' };
  return { ok: true, entityId: ref };
}

function isOriginRef(ref: SketchRef): boolean {
  return typeof ref === 'object' && ref !== null
    && (ref as { origin?: unknown }).origin === true;
}

function nearestExplicitPoint(
  entities: readonly SketchEntityDto[],
  hit: { x: number; y: number },
): { id: number; dist: number } | undefined {
  let best: { id: number; dist: number } | undefined;
  for (const entity of entities) {
    if (entity.kind !== 'point' || entity.projected !== undefined)
      continue;
    if (typeof entity.x !== 'number' || typeof entity.y !== 'number')
      continue;
    const dist = Math.hypot(hit.x - entity.x, hit.y - entity.y);
    if (!best || dist < best.dist)
      best = { id: entity.id, dist };
  }
  return best;
}

/**
 * 草图点拾取（第一步）：就近分辨 + PIERCE 本地实体门禁。
 * 隐藏原点与显式点同坐标（并列）时改选显式点实体——否则后端 `localEntityId`
 * 无处可挂；其它 origin 命中（附近没有显式点）诚实拒收。
 */
export function resolvePiercePointPick(
  entities: SketchEntityDto[],
  hit: { x: number; y: number },
): PiercePointResult {
  const pick = resolveNearestPick(entities, hit);
  const accepted = acceptPiercePointPick(entities, pick);
  if (accepted.ok)
    return accepted;
  if (pick?.kind === 'point' && isOriginRef(pick.ref)) {
    const originDist = Math.hypot(hit.x, hit.y);
    const nearest = nearestExplicitPoint(entities, hit);
    if (nearest && nearest.dist <= originDist + 1e-9)
      return { ok: true, entityId: nearest.id };
  }
  return accepted;
}

/**
 * 模型边拾取（第二步）：`part === "curve"` 候选的屏幕折线最邻近命中
 * （line/arc 精确采样；`other` 曲线不参与）。超过 `maxDistance`（缺省
 * `HIT_CURVE_PX`）返回 undefined（调用方给通用失败提示，不静默 no-op）。
 */
export function pickPierceEdge(
  candidates: readonly SketchUseBodyCandidate[],
  point: { x: number; y: number },
  project: (world: readonly [number, number, number]) => { x: number; y: number },
  maxDistance: number = HIT_CURVE_PX,
): SketchUseBodyCandidate | undefined {
  let best: { candidate: SketchUseBodyCandidate; distance: number } | undefined;
  for (const candidate of candidates) {
    if (candidate.part !== 'curve')
      continue;
    const polyline = bodyEdgeCurvePolyline(candidate.curve);
    if (polyline.length < 2)
      continue;
    const distance = curveDistance(point, polyline.map(project));
    if (distance <= maxDistance && (best === undefined || distance < best.distance))
      best = { candidate, distance };
  }
  return best?.candidate;
}

/** 两步提示（工具发布到 sketch-tool-feedback；纯数据便于测试/审计）。 */
export type PierceStepPrompt = 'point' | 'edge' | 'edgeHover';

/** 当前拾取阶段 → 提示种类（第一步完成后进入边拾取）。 */
export function pierceStepPrompt(pointPicked: boolean, edgeHovered = false): PierceStepPrompt {
  if (!pointPicked)
    return 'point';
  return edgeHovered ? 'edgeHover' : 'edge';
}

/** SketchPoint2 → 就近分辨入参（语义命名，避免调用方写错字段）。 */
export function toPierceHit(point: SketchPoint2): { x: number; y: number } {
  return { x: point.u, y: point.v };
}
