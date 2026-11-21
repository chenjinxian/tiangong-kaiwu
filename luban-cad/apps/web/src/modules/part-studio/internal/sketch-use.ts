/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图「使用」纯逻辑（Onshape Use 首切片 2026-11-13）：
 * 把同一 Part Studio 内**其它草图**的 line/point/circle/arc 投影到当前草图，
 * 生成带 `projected` 标记的根实体。后端 `updateSketch` 会对携带标记的实体
 * 实时重投影（SketchProjection.resolveProjectedEntities），派生点/圆心由后端
 * 合成——本模块只负责选择/平面支持判定/根实体快照与 id 分配。
 *
 * 诚实边界：
 * - 2026-11-21 S1 起模型边（bodyEdge）走 externalRefs 通道；S1b 起平面面
 *   （bodyFace loops=outer）同通道（外环块长按后端 line=3/arc=2 口径）；PIERCE/
 *   INTERSECTED/SILHOUETTED 仍 `projection-unsupported`（gated，无假入口）；
 * - circle/arc 仅在平行平面间保形（非平行是椭圆，后端拒收）；
 * - 样条/投影源/自身 sketch 不入候选。
 */
import type {
  LubanTopologyId,
  SketchEntityDto,
  SketchExternalReferenceDto,
  SketchPlaneDto,
  SketchProjectedMarker,
  SketchProjectionStatusDto,
} from '@luban-cad/shared';
import { sketchPlaneFrameFrom } from '../tools/sketch/sketch-plane.js';

export type SketchUseError = 'unsupported-kind' | 'non-parallel' | 'degenerate-source' | 'no-id';

export type SketchUseBuildResult =
  | { ok: true; entity: SketchEntityDto }
  | { ok: false; error: SketchUseError };

export interface SketchUseSourceSketch {
  id: string;
  plane?: SketchPlaneDto;
  entities: readonly SketchEntityDto[];
}

const isPoint = (value: unknown): value is { x: number; y: number } =>
  !!value && typeof value === 'object'
  && typeof (value as { x?: unknown }).x === 'number'
  && typeof (value as { y?: unknown }).y === 'number';

function pointMap(entities: readonly SketchEntityDto[]): Map<number, { x: number; y: number }> {
  const map = new Map<number, { x: number; y: number }>();
  for (const entity of entities) {
    if (entity.kind === 'point' && typeof entity.x === 'number' && typeof entity.y === 'number')
      map.set(entity.id, { x: entity.x, y: entity.y });
  }
  return map;
}

function resolvePoint(
  ref: number | { x: number; y: number },
  points: ReadonlyMap<number, { x: number; y: number }>,
): { x: number; y: number } | undefined {
  return typeof ref === 'number' ? points.get(ref) : isPoint(ref) ? ref : undefined;
}

/**
 * 候选实体：线/点/圆/弧（样条后端不支持投影源）。
 * 2026-11-13：允许链式投影源（源本身是 projected；后端 loadSource 递归解析并
 * 带循环引用检测），但样条源仍拒收。
 */
export function isUsableSourceEntity(entity: SketchEntityDto): boolean {
  return entity.kind === 'line' || entity.kind === 'point' || entity.kind === 'circle' || entity.kind === 'arc';
}

/** 平行平面（含反向）——圆/弧投影保形的前提（与后端 PARALLEL_TOL 同口径）。 */
export function planesAreParallel(a?: SketchPlaneDto | null, b?: SketchPlaneDto | null): boolean {
  const fa = sketchPlaneFrameFrom(a);
  const fb = sketchPlaneFrameFrom(b);
  const dot = fa.normal.dotProduct(fb.normal);
  return Math.abs(Math.abs(dot) - 1) <= 1e-6;
}

/** 根实体 id：保证 id/id+1/id+2 均未被实体或约束占用（后端保留 +1/+2 给派生点）。 */
export function nextProjectedRootId(
  entities: readonly SketchEntityDto[],
  constraints: readonly { id: number }[],
): number | undefined {
  const used = new Set<number>();
  for (const entity of entities)
    used.add(entity.id);
  for (const constraint of constraints)
    used.add(constraint.id);
  let candidate = 1;
  for (const id of used)
    candidate = Math.max(candidate, id + 1);
  for (let attempt = 0; attempt < used.size + 4; attempt++) {
    if (!used.has(candidate) && !used.has(candidate + 1) && !used.has(candidate + 2))
      return candidate;
    candidate += 1;
  }
  return undefined;
}

function markerOf(source: SketchUseSourceSketch, entityId: number): SketchProjectedMarker {
  return { kind: 'projected', source: { kind: 'sketchEntity', sketchId: source.id, entityId } };
}

/**
 * 生成投影根实体（快照坐标；后端读取时按源当前解重投影覆盖）。
 * 圆/弧非平行平面诚实拒收（不折线化/不椭圆近似）。
 */
export function buildProjectedSketchEntity(
  source: SketchUseSourceSketch,
  entity: SketchEntityDto,
  target: { plane?: SketchPlaneDto; entities: readonly SketchEntityDto[]; constraints: readonly { id: number }[] },
): SketchUseBuildResult {
  if (!isUsableSourceEntity(entity))
    return { ok: false, error: 'unsupported-kind' };
  const rootId = nextProjectedRootId(target.entities, target.constraints);
  if (rootId === undefined)
    return { ok: false, error: 'no-id' };
  const srcFrame = sketchPlaneFrameFrom(source.plane);
  const tgtFrame = sketchPlaneFrameFrom(target.plane);
  const project = (point: { x: number; y: number }): { x: number; y: number } => {
    const local = tgtFrame.toLocal(srcFrame.toWorld({ u: point.x, v: point.y }));
    return { x: local.u, y: local.v };
  };
  const points = pointMap(source.entities);
  const marker = markerOf(source, entity.id);
  const construction = (entity as { construction?: boolean }).construction === true;

  switch (entity.kind) {
    case 'point': {
      if (typeof entity.x !== 'number' || typeof entity.y !== 'number')
        return { ok: false, error: 'degenerate-source' };
      const p = project({ x: entity.x, y: entity.y });
      return { ok: true, entity: { kind: 'point', id: rootId, x: p.x, y: p.y, projected: marker } };
    }
    case 'line': {
      const a = resolvePoint(entity.p1, points);
      const b = resolvePoint(entity.p2, points);
      if (!a || !b)
        return { ok: false, error: 'degenerate-source' };
      const pa = project(a);
      const pb = project(b);
      if (Math.hypot(pa.x - pb.x, pa.y - pb.y) <= 1e-12)
        return { ok: false, error: 'degenerate-source' };
      return {
        ok: true,
        entity: {
          kind: 'line', id: rootId, p1: pa, p2: pb, projected: marker,
          ...(construction ? { construction: true } : {}),
        },
      };
    }
    case 'circle': {
      const center = resolvePoint(entity.center, points);
      if (!center || typeof entity.radius !== 'number' || entity.radius <= 0)
        return { ok: false, error: 'degenerate-source' };
      if (!planesAreParallel(source.plane, target.plane))
        return { ok: false, error: 'non-parallel' };
      const c = project(center);
      return {
        ok: true,
        entity: {
          kind: 'circle', id: rootId, center: c, radius: entity.radius, projected: marker,
          ...(construction ? { construction: true } : {}),
        },
      };
    }
    case 'arc': {
      const center = resolvePoint(entity.center, points);
      if (!center || typeof entity.radius !== 'number' || entity.radius <= 0
        || typeof entity.startAngle !== 'number' || typeof entity.sweepAngle !== 'number')
        return { ok: false, error: 'degenerate-source' };
      if (!planesAreParallel(source.plane, target.plane))
        return { ok: false, error: 'non-parallel' };
      const r = entity.radius;
      const start = entity.startAngle;
      const sweep = entity.sweepAngle;
      const at = (angle: number): { x: number; y: number } => ({
        x: center.x + r * Math.cos(angle),
        y: center.y + r * Math.sin(angle),
      });
      const c = project(center);
      const s = project(at(start));
      const m = project(at(start + sweep / 2));
      const startAngle = Math.atan2(s.y - c.y, s.x - c.x);
      const cross = (s.x - c.x) * (m.y - c.y) - (s.y - c.y) * (m.x - c.x);
      const sweepAngle = (cross >= 0 ? 1 : -1) * Math.abs(sweep);
      return {
        ok: true,
        entity: {
          kind: 'arc', id: rootId, center: c, radius: r, startAngle, sweepAngle, projected: marker,
          ...(construction ? { construction: true } : {}),
        },
      };
    }
    default:
      return { ok: false, error: 'unsupported-kind' };
  }
}

// ---------------------------------------------------------------------------
// v1.85（S1 2026-11-21）：模型边 externalRefs 行构造 + 投影状态消息
// ---------------------------------------------------------------------------

export type SketchUseBodyPart = 'curve' | 'start' | 'end';
export type SketchUseBodyCurveKind = 'line' | 'arc';

/** 外部引用 id（与实体 id 不同命名空间）：表内最大 id + 1，空表从 1 起。 */
export function nextExternalRefId(refs: readonly SketchExternalReferenceDto[]): number {
  let max = 0;
  for (const ref of refs)
    max = Math.max(max, ref.id);
  return max + 1;
}

/**
 * 分配实体 id 块起点：块 `[start, start+slots-1]` 必须同时避开实体 id、约束 id
 * 与已有外部引用声明的 `entityIds`（后端按块保留派生端点/圆心槽位）。
 */
export function nextEntityBlockStart(
  entities: readonly SketchEntityDto[],
  constraints: readonly { id: number }[],
  refs: readonly SketchExternalReferenceDto[],
  slots: number,
): number | undefined {
  if (!Number.isInteger(slots) || slots <= 0)
    return undefined;
  const used = new Set<number>();
  for (const entity of entities)
    used.add(entity.id);
  for (const constraint of constraints)
    used.add(constraint.id);
  for (const ref of refs) {
    for (const id of ref.entityIds)
      used.add(id);
  }
  let candidate = 1;
  for (let attempt = 0; attempt < used.size + slots + 4; attempt++) {
    let free = true;
    for (let offset = 0; offset < slots; offset++) {
      if (used.has(candidate + offset)) {
        free = false;
        break;
      }
    }
    if (free)
      return candidate;
    candidate += 1;
  }
  return undefined;
}

/** 槽位：line 曲线 3（根 + 两端点）、arc 曲线 2（根 + 圆心）、端点 1。 */
export function bodyEdgeEntitySlots(part: SketchUseBodyPart, curveKind: SketchUseBodyCurveKind): number {
  if (part !== 'curve')
    return 1;
  return curveKind === 'line' ? 3 : 2;
}

export interface BuildBodyEdgeExternalRefRowArgs {
  id: number;
  bodyKey: string;
  topologyRef: LubanTopologyId;
  part: SketchUseBodyPart;
  curveKind: SketchUseBodyCurveKind;
  entities: readonly SketchEntityDto[];
  constraints: readonly { id: number }[];
  externalRefs: readonly SketchExternalReferenceDto[];
}

/**
 * 模型边拾取 → 持久外部引用行（`kind=project` 曲线 / `projectEndpoint` 端点）。
 * 块分配失败诚实返回 `no-entity-block`（不猜 id、不覆盖既有实体）。
 */
export function buildBodyEdgeExternalRefRow(
  args: BuildBodyEdgeExternalRefRowArgs,
): SketchExternalReferenceDto | { ok: false; error: 'no-entity-block' } {
  const slots = bodyEdgeEntitySlots(args.part, args.curveKind);
  const start = nextEntityBlockStart(args.entities, args.constraints, args.externalRefs, slots);
  if (start === undefined)
    return { ok: false, error: 'no-entity-block' };
  const entityIds = Array.from({ length: slots }, (_, offset) => start + offset);
  return {
    id: args.id,
    kind: args.part === 'curve' ? 'project' : 'projectEndpoint',
    source: {
      kind: 'bodyEdge',
      bodyId: args.bodyKey,
      topologyRef: args.topologyRef,
      ...(args.part === 'curve' ? {} : { part: args.part }),
    },
    entityIds,
  };
}

/** 面外环实体块上限（防御性：异常块长不得静默截断或退化为长时间搜索）。 */
export const MAX_BODY_FACE_BLOCK_IDS = 4096;

export interface BuildBodyFaceExternalRefRowArgs {
  id: number;
  bodyKey: string;
  topologyRef: LubanTopologyId;
  /** 外环实体块长（后端口径：line=3、arc/circle=2 逐曲线累加）。 */
  blockLength: number;
  entities: readonly SketchEntityDto[];
  constraints: readonly { id: number }[];
  externalRefs: readonly SketchExternalReferenceDto[];
}

/**
 * 模型面拾取 → 持久外部引用行（`kind=project` 外环投影，v1.85 bodyFace 契约）。
 * 恰好分配 `blockLength` 个连续实体 id；块分配失败/块长非法或超限诚实返回
 * `no-entity-block`（不猜 id、不覆盖既有实体、不静默截断）。
 */
export function buildBodyFaceExternalRefRow(
  args: BuildBodyFaceExternalRefRowArgs,
): SketchExternalReferenceDto | { ok: false; error: 'no-entity-block' } {
  if (!Number.isInteger(args.blockLength)
    || args.blockLength <= 0
    || args.blockLength > MAX_BODY_FACE_BLOCK_IDS)
    return { ok: false, error: 'no-entity-block' };
  const start = nextEntityBlockStart(args.entities, args.constraints, args.externalRefs, args.blockLength);
  if (start === undefined)
    return { ok: false, error: 'no-entity-block' };
  return {
    id: args.id,
    kind: 'project',
    source: {
      kind: 'bodyFace',
      bodyId: args.bodyKey,
      topologyRef: args.topologyRef,
      loops: 'outer',
    },
    entityIds: Array.from({ length: args.blockLength }, (_, offset) => start + offset),
  };
}

/** PIERCE 行构造失败原因（locale-neutral；调用方映射通用失败提示）。 */
export type BuildPierceExternalRefError = 'invalid-local-entity';

export interface BuildPierceExternalRefRowArgs {
  /** 外部引用 id（`nextExternalRefId` 分配；与实体 id 不同命名空间）。 */
  id: number;
  bodyKey: string;
  topologyRef: LubanTopologyId;
  /** 被钉住的本地 point 实体 id（后端按该实体展开隐藏固定交点 + coincident）。 */
  localEntityId: number;
  entities: readonly SketchEntityDto[];
  externalRefs: readonly SketchExternalReferenceDto[];
}

/**
 * PIERCE 拾取 → 持久外部引用行（S2 2026-11-21）：`kind="pierce"`、
 * `source=bodyEdge/part:"curve"`、`entityIds: []`（无派生曲线实体）、
 * `localEntityId` 指向本地 **point** 实体。
 *
 * 校验失败诚实返回 `invalid-local-entity`（不猜 id、不创建实体、不返回空载荷）：
 * - `localEntityId` 必须是正整数（实体 id 命名空间）；
 * - 必须存在、`kind: "point"`、且不是投影实体（后端 PIERCE 只钉本地点）。
 * 既有 `externalRefs` 原样保留（调用方追加本行；本函数不分配任何实体 id 块）。
 */
export function buildPierceExternalRefRow(
  args: BuildPierceExternalRefRowArgs,
): SketchExternalReferenceDto | { ok: false; error: BuildPierceExternalRefError } {
  const { localEntityId } = args;
  if (!Number.isInteger(localEntityId) || localEntityId <= 0)
    return { ok: false, error: 'invalid-local-entity' };
  const entity = args.entities.find((candidate) => candidate.id === localEntityId);
  if (!entity || entity.kind !== 'point' || entity.projected !== undefined)
    return { ok: false, error: 'invalid-local-entity' };
  return {
    id: args.id,
    kind: 'pierce',
    source: {
      kind: 'bodyEdge',
      bodyId: args.bodyKey,
      topologyRef: args.topologyRef,
      part: 'curve',
    },
    entityIds: [],
    localEntityId,
  };
}

/** 投影失败错误码 → i18n 键（`partStudio.sketch.` 前缀由调用方拼接）。 */
export function projectionErrorI18nKey(code: SketchProjectionStatusDto['errors'][number]['code']): string {
  switch (code) {
    case 'projection-non-exact':
      return 'projectionNonExact';
    case 'projection-source-missing':
    case 'projection-source-ambiguous':
    case 'projection-snapshot-missing':
    case 'projection-snapshot-stale':
      return 'projectionSourceMissing';
    case 'projection-degenerate':
      return 'projectionDegenerate';
    default:
      return 'projectionFailed';
  }
}

/**
 * 读面投影失败 → 最小提示文案（去重后按错误码映射；未知 code / 空 errors
 * 兜底 `projectionFailed`；多条不同原因以 `; ` 连接）。
 */
export function projectionFailureMessage(
  t: (key: string, options?: Record<string, unknown>) => string,
  projection: SketchProjectionStatusDto,
): string {
  const keys = new Set<string>();
  for (const error of projection.errors)
    keys.add(projectionErrorI18nKey(error.code));
  if (keys.size === 0)
    return t('partStudio.sketch.projectionFailed');
  return [...keys].map((key) => t(`partStudio.sketch.${key}`)).join('; ');
}
