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

function refPointIds(entity: SketchEntityDto): number[] {
  if (entity.kind === 'line')
    return [entity.p1, entity.p2].filter((ref): ref is number => typeof ref === 'number');
  if (entity.kind === 'circle' || entity.kind === 'arc')
    return typeof entity.center === 'number' ? [entity.center] : [];
  return [];
}

function refEntityId(ref: SketchRef): number | undefined {
  return typeof ref === 'number' ? ref : 'entity' in ref ? ref.entity : undefined;
}

/**
 * 复制选中曲线到会话剪贴板。返回复制的曲线实体数（0=未覆盖剪贴板）。
 * 显式 point 端点/圆心自动并入复制集；约束仅保留内部关系。
 */
export function copySketchEntities(
  entities: readonly SketchEntityDto[],
  constraints: readonly SketchConstraintDto[],
  selection: readonly SketchEntitySelection[],
): number {
  const requested = new Set(
    selection.filter((entry) => entry.part === 'curve').map((entry) => entry.entityId),
  );
  if (requested.size === 0)
    return 0;
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const curveCount = [...requested].filter((id) => byId.get(id)?.kind !== 'point').length;
  if (curveCount === 0)
    return 0;

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

  clipboard = { entities: copiedEntities, constraints: copiedConstraints };
  return curveCount;
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

  // 两遍：先为全部实体落新 id（线/圆心可能引用后序 point），再重映射副本。
  const idMap = new Map<number, number>();
  for (const source of clipboard.entities)
    idMap.set(source.id, nextId++);

  const pasted: SketchEntityDto[] = [];
  for (const source of clipboard.entities) {
    const clone = cloneEntity(source);
    clone.id = idMap.get(source.id)!;
    if (clone.kind === 'line') {
      const p1 = remapPointRef(clone.p1, idMap);
      const p2 = remapPointRef(clone.p2, idMap);
      if (p1 === undefined || p2 === undefined)
        return { ok: false, reason: 'invalid-clipboard' };
      clone.p1 = p1;
      clone.p2 = p2;
    } else if (clone.kind === 'circle' || clone.kind === 'arc') {
      const center = remapPointRef(clone.center, idMap);
      if (center === undefined)
        return { ok: false, reason: 'invalid-clipboard' };
      clone.center = center;
    }
    pasted.push(clone);
  }

  const pastedConstraints: SketchConstraintDto[] = [];
  for (const source of clipboard.constraints) {
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
    pastedConstraints.push({ ...source, id: nextId++, refs });
  }

  return {
    ok: true,
    entities: [...entities, ...pasted],
    constraints: [...constraints, ...pastedConstraints],
    pastedEntityIds: pasted.map((entity) => entity.id),
    pastedCurveIds: pasted.filter((entity) => entity.kind !== 'point').map((entity) => entity.id),
  };
}
