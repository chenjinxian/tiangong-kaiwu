/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图实体删除纯逻辑（ADR-0018 S1d，2026-11-12 Onshape 对拍）。
 *
 * 语义（live 证据：选中弧 → Delete 后弧消失、草图仍处于编辑态）：
 * - 删除选中曲线实体；引用它的约束一并移除（Onshape 删除图元会带走附着约束）。
 * - 选中点实体若仍被其它未删除实体引用（line p1/p2、circle/arc center）→ 整单拒收
 *   （blockedEntities），host 诚实提示，不产生悬挂引用；后端另有拒收兜底。
 * - 不改写剩余实体坐标（事实源仍由 updateSketch 提交后重解算）。
 */
import type { SketchEntityDto, SketchConstraintDto, SketchRef } from '@luban-cad/shared';

export interface SketchDeleteResult {
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
  /** 实际删除的实体 id（入参里不存在的 id 不计）。 */
  removedEntities: number[];
  /** 因引用被删实体而移除的约束 id。 */
  removedConstraints: number[];
  /** 仍被其它实体引用、不能删除的点实体 id（非空=整单拒收，原样返回）。 */
  blockedEntities: number[];
}

function refEntityId(ref: SketchRef | undefined): number | undefined {
  if (ref === undefined)
    return undefined;
  if (typeof ref === 'number')
    return ref;
  if ('entity' in ref)
    return ref.entity;
  return undefined;
}

/** 实体引用的点实体 id（内联点对象不占实体，返回 undefined）。 */
function entityPointRefs(entity: SketchEntityDto): number[] {
  const refs: number[] = [];
  const push = (ref: unknown): void => {
    if (typeof ref === 'number')
      refs.push(ref);
  };
  switch (entity.kind) {
    case 'line':
      push(entity.p1);
      push(entity.p2);
      break;
    case 'circle':
    case 'arc':
      push(entity.center);
      break;
    default:
      break;
  }
  return refs;
}

export function deleteSketchEntities(
  entities: readonly SketchEntityDto[],
  constraints: readonly SketchConstraintDto[],
  entityIds: readonly number[],
): SketchDeleteResult {
  const requested = new Set(entityIds);
  const existing = entities.filter((entity) => requested.has(entity.id));
  if (existing.length === 0) {
    return {
      entities: [...entities],
      constraints: [...constraints],
      removedEntities: [],
      removedConstraints: [],
      blockedEntities: [],
    };
  }
  const removedIds = new Set(existing.map((entity) => entity.id));
  const remaining = entities.filter((entity) => !removedIds.has(entity.id));

  // 点实体仍被剩余实体引用 → 拒收（删除曲线不受影响：曲线不被几何引用）。
  const stillReferenced = new Set<number>();
  for (const entity of remaining) {
    for (const ref of entityPointRefs(entity)) {
      if (removedIds.has(ref))
        stillReferenced.add(ref);
    }
  }
  const blockedEntities = existing
    .filter((entity) => entity.kind === 'point' && stillReferenced.has(entity.id))
    .map((entity) => entity.id);
  if (blockedEntities.length > 0) {
    return {
      entities: [...entities],
      constraints: [...constraints],
      removedEntities: [],
      removedConstraints: [],
      blockedEntities,
    };
  }

  const removedConstraints: number[] = [];
  const keptConstraints = constraints.filter((constraint) => {
    const hit = constraint.refs.some((ref) => {
      const id = refEntityId(ref);
      return id !== undefined && removedIds.has(id);
    });
    if (hit)
      removedConstraints.push(constraint.id);
    return !hit;
  });

  return {
    entities: remaining,
    constraints: keptConstraints,
    removedEntities: [...removedIds],
    removedConstraints,
    blockedEntities: [],
  };
}
