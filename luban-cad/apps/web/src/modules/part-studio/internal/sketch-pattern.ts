/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图线性阵列纯逻辑（2026-11-12 Onshape canvas gizmo 首切片，AIRR
 * `docs/superpowers/specs/2026-11-12-sketch-linear-pattern-airr.md`）。
 *
 * Onshape 的草图阵列是 canvas manipulator（橙色种子 + 蓝色预览 + 方向/间距/
 * 计数手柄），不是参数对话框。本文件只做几何生成：
 * - 种子集 = 选中曲线 + 直接引用的显式 point（与复制/粘贴同口径）；
 * - 每个实例为独立副本（新 id + 内部约束重映射），按草图局部方向/间距平移；
 * - 外部几何/原点约束不复制（不把副本锁到原几何）；
 * - **近似登记**：shared 无“阵列关系”约束 kind，实例是独立几何副本，
 *   改种子不会联动更新实例（Onshape 历史阵列关系后续切片）。
 */
import type {
  SketchConstraintDto,
  SketchEntityDto,
  SketchPointDto,
} from '@luban-cad/shared';
import type { SketchEntitySelection } from './sketch-entity-picker.js';
import {
  collectSketchCopySet,
  instantiateSketchCopy,
} from './sketch-clipboard.js';

export interface SketchLinearPatternOptions {
  /** 草图局部方向角（弧度，0=+u / 草图 X 轴）。 */
  directionRad: number;
  /** 相邻实例间距（**草图局部契约单位=米**，>0；UI 的 mm → /1000）。 */
  spacingLocal: number;
  /** 总实例数（含种子，2..100）。 */
  count: number;
}

export interface SketchCircularPatternOptions {
  /** 旋转中心（草图局部契约单位=米）。 */
  center: { u: number; v: number };
  /** 总实例数（含种子，2..100）。 */
  count: number;
  /** 总角度（弧度，0<angle<=2π；2π=整周均分）。 */
  angleRad: number;
}

export type SketchPatternError =
  | 'no-selection'
  | 'invalid-count'
  | 'invalid-spacing'
  | 'invalid-direction'
  | 'invalid-center'
  | 'invalid-angle';

export type SketchLinearPatternResult =
  | {
    ok: true;
    /** 完整草图（原实体 + 各实例副本）。 */
    entities: SketchEntityDto[];
    constraints: SketchConstraintDto[];
    /** 每个实例的曲线 id（[0]=种子曲线）。 */
    instanceCurveIds: number[][];
  }
  | { ok: false; error: SketchPatternError };

export const SKETCH_PATTERN_MIN_COUNT = 2;
export const SKETCH_PATTERN_MAX_COUNT = 100;

function translateRef(
  ref: number | SketchPointDto,
  du: number,
  dv: number,
): number | SketchPointDto {
  return typeof ref === 'number' ? ref : { x: ref.x + du, y: ref.y + dv };
}

/** 平移单个副本实体：点实体改 x/y；内联点引用随动；数字引用由点实体平移覆盖。 */
function translateEntity(entity: SketchEntityDto, du: number, dv: number): void {
  switch (entity.kind) {
    case 'point':
      entity.x = (entity.x ?? 0) + du;
      entity.y = (entity.y ?? 0) + dv;
      return;
    case 'line':
      entity.p1 = translateRef(entity.p1, du, dv);
      entity.p2 = translateRef(entity.p2, du, dv);
      return;
    case 'circle':
    case 'arc':
      entity.center = translateRef(entity.center, du, dv);
      return;
    case 'spline':
      entity.controlPoints = entity.controlPoints.map((point) => translateRef(point, du, dv) as SketchPointDto);
      if (entity.fitPoints)
        entity.fitPoints = entity.fitPoints.map((point) => translateRef(point, du, dv) as SketchPointDto);
      return;
  }
}

function nextFreeId(
  entities: readonly SketchEntityDto[],
  constraints: readonly SketchConstraintDto[],
): number {
  let nextId = 1;
  for (const entity of entities)
    nextId = Math.max(nextId, entity.id + 1);
  for (const constraint of constraints)
    nextId = Math.max(nextId, constraint.id + 1);
  return nextId;
}

/**
 * 构建线性阵列（含种子）。失败返回错误码，调用方不得提交任何改动。
 */
export function buildSketchLinearPattern(
  entities: readonly SketchEntityDto[],
  constraints: readonly SketchConstraintDto[],
  selection: readonly SketchEntitySelection[],
  options: SketchLinearPatternOptions,
): SketchLinearPatternResult {
  if (!Number.isFinite(options.directionRad))
    return { ok: false, error: 'invalid-direction' };
  if (!Number.isFinite(options.spacingLocal) || options.spacingLocal <= 0)
    return { ok: false, error: 'invalid-spacing' };
  if (!Number.isInteger(options.count)
    || options.count < SKETCH_PATTERN_MIN_COUNT
    || options.count > SKETCH_PATTERN_MAX_COUNT)
    return { ok: false, error: 'invalid-count' };

  const seed = collectSketchCopySet(entities, constraints, selection);
  const seedCurveIds = [...new Set(
    selection.filter((entry) => entry.part === 'curve').map((entry) => entry.entityId),
  )].filter((id) => seed.entities.some((entity) => entity.id === id && entity.kind !== 'point'));
  if (seed.curveCount === 0 || seedCurveIds.length === 0)
    return { ok: false, error: 'no-selection' };

  const u = Math.cos(options.directionRad);
  const v = Math.sin(options.directionRad);
  let nextId = nextFreeId(entities, constraints);
  const addedEntities: SketchEntityDto[] = [];
  const addedConstraints: SketchConstraintDto[] = [];
  const instanceCurveIds: number[][] = [seedCurveIds];

  for (let index = 1; index < options.count; index++) {
    const instance = instantiateSketchCopy(seed.entities, seed.constraints, nextId);
    if (!instance)
      return { ok: false, error: 'no-selection' };
    nextId = instance.nextId;
    const du = u * options.spacingLocal * index;
    const dv = v * options.spacingLocal * index;
    for (const entity of instance.entities)
      translateEntity(entity, du, dv);
    addedEntities.push(...instance.entities);
    addedConstraints.push(...instance.constraints);
    instanceCurveIds.push(instance.curveIds);
  }

  return {
    ok: true,
    entities: [...entities, ...addedEntities],
    constraints: [...constraints, ...addedConstraints],
    instanceCurveIds,
  };
}

function rotateRef(
  ref: number | SketchPointDto,
  center: { u: number; v: number },
  cos: number,
  sin: number,
): number | SketchPointDto {
  if (typeof ref === 'number')
    return ref;
  const dx = ref.x - center.u;
  const dy = ref.y - center.v;
  return { x: center.u + dx * cos - dy * sin, y: center.v + dx * sin + dy * cos };
}

function rotateEntity(
  entity: SketchEntityDto,
  center: { u: number; v: number },
  cos: number,
  sin: number,
): void {
  switch (entity.kind) {
    case 'point': {
      const x = (entity.x ?? 0) - center.u;
      const y = (entity.y ?? 0) - center.v;
      entity.x = center.u + x * cos - y * sin;
      entity.y = center.v + x * sin + y * cos;
      return;
    }
    case 'line':
      entity.p1 = rotateRef(entity.p1, center, cos, sin);
      entity.p2 = rotateRef(entity.p2, center, cos, sin);
      return;
    case 'circle':
    case 'arc':
      entity.center = rotateRef(entity.center, center, cos, sin);
      return;
    case 'spline':
      entity.controlPoints = entity.controlPoints.map((point) => rotateRef(point, center, cos, sin) as SketchPointDto);
      if (entity.fitPoints)
        entity.fitPoints = entity.fitPoints.map((point) => rotateRef(point, center, cos, sin) as SketchPointDto);
      return;
  }
}

/**
 * 环形阵列（Onshape canvas gizmo 同族；整周均分 step=2π/count，部分角度
 * step=angle/(count-1)）。实例同样为独立几何副本。
 */
export function buildSketchCircularPattern(
  entities: readonly SketchEntityDto[],
  constraints: readonly SketchConstraintDto[],
  selection: readonly SketchEntitySelection[],
  options: SketchCircularPatternOptions,
): SketchLinearPatternResult {
  if (!Number.isFinite(options.center.u) || !Number.isFinite(options.center.v))
    return { ok: false, error: 'invalid-center' };
  if (!Number.isFinite(options.angleRad) || options.angleRad <= 0 || options.angleRad > Math.PI * 2 + 1e-9)
    return { ok: false, error: 'invalid-angle' };
  if (!Number.isInteger(options.count)
    || options.count < SKETCH_PATTERN_MIN_COUNT
    || options.count > SKETCH_PATTERN_MAX_COUNT)
    return { ok: false, error: 'invalid-count' };

  const seed = collectSketchCopySet(entities, constraints, selection);
  const seedCurveIds = [...new Set(
    selection.filter((entry) => entry.part === 'curve').map((entry) => entry.entityId),
  )].filter((id) => seed.entities.some((entity) => entity.id === id && entity.kind !== 'point'));
  if (seed.curveCount === 0 || seedCurveIds.length === 0)
    return { ok: false, error: 'no-selection' };

  const fullCircle = Math.abs(options.angleRad - Math.PI * 2) <= 1e-9;
  const step = fullCircle ? options.angleRad / options.count : options.angleRad / (options.count - 1);
  let nextId = nextFreeId(entities, constraints);
  const addedEntities: SketchEntityDto[] = [];
  const addedConstraints: SketchConstraintDto[] = [];
  const instanceCurveIds: number[][] = [seedCurveIds];

  for (let index = 1; index < options.count; index++) {
    const instance = instantiateSketchCopy(seed.entities, seed.constraints, nextId);
    if (!instance)
      return { ok: false, error: 'no-selection' };
    nextId = instance.nextId;
    const angle = step * index;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const entity of instance.entities)
      rotateEntity(entity, options.center, cos, sin);
    addedEntities.push(...instance.entities);
    addedConstraints.push(...instance.constraints);
    instanceCurveIds.push(instance.curveIds);
  }

  return {
    ok: true,
    entities: [...entities, ...addedEntities],
    constraints: [...constraints, ...addedConstraints],
    instanceCurveIds,
  };
}
