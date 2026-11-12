/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图图元复制/粘贴（Onshape live 2026-11-12：右键「复制草图图元」后菜单出现
 * 「粘贴草图图元」，粘贴的副本落在原位并选中）。
 *
 * 语义（首切片）：
 * - 复制集 = 选中曲线 + 它们直接引用的显式 point 实体（端点/圆心），保证副本
 *   自包含；只收录**所有 ref 都落在复制集内**的约束（跨外部几何/草图原点
 *   的关系不复制，避免粘贴后把副本锁到原几何）。
 * - 粘贴时实体/约束统一重映射为新 id；副本坐标不变（原位），投影标记剥离为
 *   普通几何；宿主一次 updateSketch 提交（可撤销），成功后选中粘贴曲线。
 * - 剪贴板是页面会话内模块态（不持久化、不跨 reload）；跨草图粘贴按目标草图
 *   局部坐标落位（首切片不按世界系变换）。
 */
import type { SketchConstraintDto, SketchEntityDto, SketchRef } from '@luban-cad/shared';
import type { SketchEntitySelection } from './sketch-entity-picker.js';

interface SketchClipboard {
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
}

let clipboard: SketchClipboard | null = null;

/** 剪贴板是否有可粘贴几何（仅 point 不算）。 */
export function hasSketchClipboard(): boolean {
  return clipboard !== null && clipboard.entities.some((entity) => entity.kind !== 'point');
}

/** 测试/会话清理。 */
export function clearSketchClipboard(): void {
  clipboard = null;
}

function cloneEntity(entity: SketchEntityDto): SketchEntityDto {
  const clone = JSON.parse(JSON.stringify(entity)) as SketchEntityDto;
  delete (clone as { projected?: unknown }).projected;
  return clone;
}

export function refPointIds(entity: SketchEntityDto): number[] {
  if (entity.kind === 'line')
    return [entity.p1, entity.p2].filter((ref): ref is number => typeof ref === 'number');
  if (entity.kind === 'circle' || entity.kind === 'arc')
    return typeof entity.center === 'number' ? [entity.center] : [];
  return [];
}

function refEntityId(ref: SketchRef): number | undefined {
  return typeof ref === 'number' ? ref : 'entity' in ref ? ref.entity : undefined;
}

/** 自包含复制集（剪贴板与阵列共用）：选中曲线 + 直接引用 point + 内部约束。 */
export interface SketchCopySet {
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
  /** 复制集里的曲线条数（0=没有可复制曲线）。 */
  curveCount: number;
}

/**
 * 收集选中曲线的自包含复制集（不写剪贴板）。显式 point 端点/圆心自动并入；
 * 只收录所有 ref 都落在复制集内的约束（跨外部几何/原点关系不复制）。
 */
export function collectSketchCopySet(
  entities: readonly SketchEntityDto[],
  constraints: readonly SketchConstraintDto[],
  selection: readonly SketchEntitySelection[],
): SketchCopySet {
  const requested = new Set(
    selection.filter((entry) => entry.part === 'curve').map((entry) => entry.entityId),
  );
  if (requested.size === 0)
    return { entities: [], constraints: [], curveCount: 0 };
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const curveCount = [...requested].filter((id) => byId.get(id)?.kind !== 'point').length;
  if (curveCount === 0)
    return { entities: [], constraints: [], curveCount: 0 };

  // 自动并入被引用显式 point（一轮足够：point 不再引用其它实体）。
  const copied = new Set(requested);
  for (const id of requested) {
    const entity = byId.get(id);
    if (!entity)
      continue;
    for (const pointId of refPointIds(entity)) {
      if (byId.get(pointId)?.kind === 'point')
        copied.add(pointId);
    }
  }

  const copiedEntities = entities
    .filter((entity) => copied.has(entity.id))
    .map((entity) => cloneEntity(entity));
  const copiedConstraints = constraints
    .filter((constraint) => constraint.refs.every((ref) => {
      const id = refEntityId(ref);
      return id !== undefined && copied.has(id);
    }))
    .map((constraint) => JSON.parse(JSON.stringify(constraint)) as SketchConstraintDto);

  return { entities: copiedEntities, constraints: copiedConstraints, curveCount };
}

/**
 * 复制选中曲线到会话剪贴板。返回复制的曲线实体数（0=未覆盖剪贴板）。
 */
export function copySketchEntities(
  entities: readonly SketchEntityDto[],
  constraints: readonly SketchConstraintDto[],
  selection: readonly SketchEntitySelection[],
): number {
  const copied = collectSketchCopySet(entities, constraints, selection);
  if (copied.curveCount === 0)
    return 0;
  clipboard = { entities: copied.entities, constraints: copied.constraints };
  return copied.curveCount;
}

export type SketchPasteResult =
  | {
    ok: true;
    entities: SketchEntityDto[];
    constraints: SketchConstraintDto[];
    pastedEntityIds: number[];
    pastedCurveIds: number[];
  }
  | { ok: false; reason: 'empty' | 'invalid-clipboard' };

function remapPointRef(
  ref: number | { x: number; y: number },
  idMap: ReadonlyMap<number, number>,
): number | { x: number; y: number } | undefined {
  if (typeof ref !== 'number')
    return ref;
  return idMap.get(ref);
}

export interface SketchCopyInstance {
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
  /** 下一个可用 id（供多实例连续分配）。 */
  nextId: number;
  idMap: ReadonlyMap<number, number>;
  /** 本实例曲线 id（不含 point）。 */
  curveIds: number[];
}

/**
 * 把一组自包含复制集实例化为新 id（不追加到目标草图）。线/圆心引用后序 point
 * 采用两遍映射；任何数字引用缺失 → undefined（调用方不得提交）。
 */
export function instantiateSketchCopy(
  sources: readonly SketchEntityDto[],
  sourceConstraints: readonly SketchConstraintDto[],
  startId: number,
): SketchCopyInstance | undefined {
  let nextId = startId;
  const idMap = new Map<number, number>();
  for (const source of sources)
    idMap.set(source.id, nextId++);

  const copied: SketchEntityDto[] = [];
  for (const source of sources) {
    const clone = cloneEntity(source);
    clone.id = idMap.get(source.id)!;
    if (clone.kind === 'line') {
      const p1 = remapPointRef(clone.p1, idMap);
      const p2 = remapPointRef(clone.p2, idMap);
      if (p1 === undefined || p2 === undefined)
        return undefined;
      clone.p1 = p1;
      clone.p2 = p2;
    } else if (clone.kind === 'circle' || clone.kind === 'arc') {
      const center = remapPointRef(clone.center, idMap);
      if (center === undefined)
        return undefined;
      clone.center = center;
    }
    copied.push(clone);
  }

  const copiedConstraints: SketchConstraintDto[] = [];
  for (const source of sourceConstraints) {
    const refs: SketchRef[] = [];
    let valid = true;
    for (const ref of source.refs) {
      if (typeof ref === 'number') {
        const mapped = idMap.get(ref);
        if (mapped === undefined) {
          valid = false;
          break;
        }
        refs.push(mapped);
      } else if ('origin' in ref) {
        valid = false;
        break;
      } else {
        const mapped = idMap.get(ref.entity);
        if (mapped === undefined) {
          valid = false;
          break;
        }
        refs.push({ ...ref, entity: mapped });
      }
    }
    if (!valid)
      continue;
    copiedConstraints.push({ ...source, id: nextId++, refs });
  }

  return {
    entities: copied,
    constraints: copiedConstraints,
    nextId,
    idMap,
    curveIds: copied.filter((entity) => entity.kind !== 'point').map((entity) => entity.id),
  };
}

/**
 * 把剪贴板粘贴到目标草图（原位）。失败不产生任何实体（返回 invalid-clipboard
 * 时调用方不得提交）；成功返回完整实体/约束与新 id 列表。
 */
export function pasteSketchClipboard(
  entities: readonly SketchEntityDto[],
  constraints: readonly SketchConstraintDto[],
): SketchPasteResult {
  if (!clipboard || !clipboard.entities.some((entity) => entity.kind !== 'point'))
    return { ok: false, reason: 'empty' };

  let nextId = 1;
  for (const entity of entities)
    nextId = Math.max(nextId, entity.id + 1);
  for (const constraint of constraints)
    nextId = Math.max(nextId, constraint.id + 1);

  const instance = instantiateSketchCopy(clipboard.entities, clipboard.constraints, nextId);
  if (!instance)
    return { ok: false, reason: 'invalid-clipboard' };

  return {
    ok: true,
    entities: [...entities, ...instance.entities],
    constraints: [...constraints, ...instance.constraints],
    pastedEntityIds: instance.entities.map((entity) => entity.id),
    pastedCurveIds: instance.curveIds,
  };
}
