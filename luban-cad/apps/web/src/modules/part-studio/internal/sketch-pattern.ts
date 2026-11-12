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

export type SketchPatternError =
  | 'no-selection'
  | 'invalid-count'
  | 'invalid-spacing'
  | 'invalid-direction';

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
