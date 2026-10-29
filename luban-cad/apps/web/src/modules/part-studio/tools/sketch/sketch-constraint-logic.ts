/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * 草图约束/尺寸纯逻辑（M6-b T5）：槽位定义表、槽位接收判定、就近实体分辨、
 * 约束 id 分配——语义骨架移植自退役仓 apps/web/features/sketch/tools/
 * SketchAddConstraintTool.ts（M3-b T5，溯源注记）。
 *
 * **零 core-frontend 依赖**的裁决：SketchPanel（画布覆盖层）消费
 * nextConstraintId（dimensionCandidate 收值构造约束）与本模块的清单语义；
 * 若从 SketchAddConstraintTool 导入会把 `class extends PrimitiveTool` 的
 * 基类存在性强加给面板消费方（M6-a T5 懒引裁决的同款理由）。工具类
 * （SketchAddConstraintTool/SketchAddDimensionTool）从本模块导入并再导出，
 * 保持 M3-b 引用路径同构。
 *
 * v1 就近分辨简化（M3-b 保留）：point=命中点到点坐标距、line=点到线段距、
 * circle=到圆周距；并列序 距离 → kind 优先（point < circle < line）→ 数组序。
 * 端点规则：线段的最近点即端点时，线段距与端点 point 实体距精确相等，点
 * 实体凭 kind 优先获胜——线端附近永远拾到 POINT 实体。无解算坐标的实体
 * （x/y/radius 缺省）不参与分辨；arc 不参与 v1 分辨（无独立解算体）。
 */

import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import i18next from 'i18next';

/** v1 约束种类（SolverTypes 冻结联合中无值的 6 种；tangent/concentric 等不存在）。 */
export type SketchConstraintKind =
  | 'coincident'
  | 'horizontal'
  | 'vertical'
  | 'parallel'
  | 'perpendicular'
  | 'equal';

export type SketchEntityKind = SketchEntityDto['kind'];

/** 槽判定产出：ok=本次点击接收进槽；complete=满槽可提交；message=拒收文案。 */
export interface PickVerdict {
  ok: boolean;
  complete: boolean;
  message?: string;
}

/**
 * 槽形定义表（后端 SolverTypes.ts 冻结契约的逐字转写；每项=一种满槽 refs
 * 形态）：coincident=2 point；horizontal/vertical=1 line 或 2 point；
 * parallel/perpendicular=2 line；equal=2 line 或 2 circle（不得混搭——
 * 槽形按首槽种类锁定，天然排除混搭）。
 */
export const CONSTRAINT_SLOT_SHAPES: Record<
  SketchConstraintKind,
  readonly (readonly SketchEntityKind[])[]
> = {
  coincident: [['point', 'point']],
  horizontal: [['line'], ['point', 'point']],
  vertical: [['line'], ['point', 'point']],
  parallel: [['line', 'line']],
  perpendicular: [['line', 'line']],
  equal: [['line', 'line'], ['circle', 'circle']],
};

/** 拒收文案键（按种类回退通用键；槽位态专键在 acceptPick 内定位）。 */
const REJECT_KEYS: Record<SketchConstraintKind, string> = {
  coincident: 'partStudio.sketch.constraint.reject.coincidentNeedsPoint',
  horizontal: 'partStudio.sketch.constraint.reject.linearNeedsLineOrPoint',
  vertical: 'partStudio.sketch.constraint.reject.linearNeedsLineOrPoint',
  parallel: 'partStudio.sketch.constraint.reject.parallelNeedsLine',
  perpendicular: 'partStudio.sketch.constraint.reject.parallelNeedsLine',
  equal: 'partStudio.sketch.constraint.reject.equalNeedsLineOrCircle',
};

/**
 * 槽位接收判定（纯函数）：picked=已拾取实体种类序，next=本次点击实体种类。
 * 已拾取时槽形由首槽种类锁定；拒收**不消耗点击**（调用方保持拾取状态继续
 * 等待下一次合法输入）。
 */
export function acceptPick(kind: SketchConstraintKind, picked: SketchEntityKind[], next: SketchEntityKind): PickVerdict {
  const shapes = CONSTRAINT_SLOT_SHAPES[kind];
  const candidates = picked.length === 0 ? shapes : shapes.filter((shape) => shape[0] === picked[0]);
  for (const shape of candidates) {
    if (shape[picked.length] === next) {
      return { ok: true, complete: picked.length + 1 === shape.length };
    }
  }
  // 拒收文案按种类×槽位态定位：equal 已进入槽形（混搭）→ 专键；linear 类
  // 已进入点对式（第二槽非点）→ 专键；其余按种类回退通用键。
  const messageKey =
    kind === 'equal' && picked.length > 0
      ? 'partStudio.sketch.constraint.reject.equalNoMixing'
      : (kind === 'horizontal' || kind === 'vertical') && picked.length > 0
        ? 'partStudio.sketch.constraint.reject.linearPairNeedsPoint'
        : REJECT_KEYS[kind];
  const label = i18next.t(`partStudio.sketch.vocabulary.constraintKinds.${kind}`);
  const actual = i18next.t(`partStudio.sketch.vocabulary.entityKinds.${next}`);
  return {
    ok: false,
    complete: false,
    message: i18next.t(messageKey, { label, actual }),
  };
}

/** 分阶段提示键（满槽语义随槽形变化，每次点击后刷新；调用时翻译）。 */
export function pickPrompt(kind: SketchConstraintKind, picked: SketchEntityKind[]): { key: string; params?: Record<string, unknown> } {
  const label = i18next.t(`partStudio.sketch.vocabulary.constraintKinds.${kind}`);
  switch (kind) {
    case 'coincident':
      return picked.length === 0
        ? { key: 'partStudio.sketch.constraint.prompts.coincidentFirst' }
        : { key: 'partStudio.sketch.constraint.prompts.coincidentSecond' };
    case 'horizontal':
    case 'vertical':
      return picked.length === 0
        ? { key: 'partStudio.sketch.constraint.prompts.linearFirst', params: { label } }
        : { key: 'partStudio.sketch.constraint.prompts.linearPairSecond', params: { label } };
    case 'parallel':
    case 'perpendicular':
      return picked.length === 0
        ? { key: 'partStudio.sketch.constraint.prompts.pairFirst', params: { label } }
        : { key: 'partStudio.sketch.constraint.prompts.pairSecond', params: { label } };
    case 'equal':
      if (picked.length === 0) {
        return { key: 'partStudio.sketch.constraint.prompts.equalFirst' };
      }
      return {
        key: 'partStudio.sketch.constraint.prompts.equalSecond',
        params: { kind: i18next.t(`partStudio.sketch.vocabulary.entityKinds.${picked[0]}`) },
      };
  }
}

interface SolvedCoord { x: number; y: number }

/** 实体解算坐标索引：point id → (x,y)；circle id → {center, radius}（缺省即无解算值）。 */
function indexSolvedCoords(entities: SketchEntityDto[]): {
  points: Map<number, SolvedCoord>;
  circles: Map<number, { center: SolvedCoord; radius: number }>;
} {
  const points = new Map<number, SolvedCoord>();
  const circles = new Map<number, { center: SolvedCoord; radius: number }>();
  for (const e of entities) {
    if (e.kind === 'point' && e.x !== undefined && e.y !== undefined) {
      points.set(e.id, { x: e.x, y: e.y });
    }
  }
  for (const e of entities) {
    if (e.kind === 'circle' && e.radius !== undefined) {
      const center = points.get(e.center);
      if (center) circles.set(e.id, { center, radius: e.radius });
    }
  }
  return { points, circles };
}

/** 点到线段距（投影夹取到端点）。 */
function distToSegment(p: { u: number; v: number }, a: SolvedCoord, b: SolvedCoord): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.u - a.x) * abx + (p.v - a.y) * aby) / lenSq));
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  return Math.hypot(p.u - cx, p.v - cy);
}

/** 局部命中点 (u,v) → 就近实体 id；无解算坐标可分辨时返回 undefined（见文件头并列序）。 */
export function resolveNearestEntityId(entities: SketchEntityDto[], hit: { u: number; v: number }): number | undefined {
  const { points, circles } = indexSolvedCoords(entities);
  // kind 优先序：point=0、circle=1、line=2
  const kindPriority = (kind: SketchEntityKind): number => (kind === 'point' ? 0 : kind === 'circle' ? 1 : 2);
  let best: { id: number; dist: number; prio: number; index: number } | undefined;

  const consider = (id: number, dist: number, kind: SketchEntityKind, index: number): void => {
    const prio = kindPriority(kind);
    if (!best || dist < best.dist
      || (dist === best.dist && (prio < best.prio || (prio === best.prio && index < best.index)))) {
      best = { id, dist, prio, index };
    }
  };

  entities.forEach((e, index) => {
    if (e.kind === 'point') {
      const c = points.get(e.id);
      if (c) consider(e.id, Math.hypot(hit.u - c.x, hit.v - c.y), 'point', index);
    } else if (e.kind === 'line') {
      const p1 = points.get(e.p1);
      const p2 = points.get(e.p2);
      if (p1 && p2) consider(e.id, distToSegment(hit, p1, p2), 'line', index);
    } else if (e.kind === 'circle') {
      const c = circles.get(e.id);
      if (c) consider(e.id, Math.abs(Math.hypot(hit.u - c.center.x, hit.v - c.center.y) - c.radius), 'circle', index);
    }
  });

  return best?.id;
}

/** 下一个约束 id：实体与约束全局最大 +1（M3-b Task 4 同式，保证草图内 id 唯一）。 */
export function nextConstraintId(sketch: { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] }): number {
  let max = 0;
  for (const e of sketch.entities) max = Math.max(max, e.id);
  for (const c of sketch.constraints) max = Math.max(max, c.id);
  return max + 1;
}
