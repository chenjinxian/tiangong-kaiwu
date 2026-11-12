/**
 * ADR-0018 S1d：草图实体删除纯逻辑（附着约束级联、点实体被引用拒收）。
 */
import { describe, expect, it } from 'vitest';
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import { deleteSketchEntities } from '../internal/sketch-delete.js';

const LINE: SketchEntityDto = { kind: 'line', id: 11, p1: { x: -10, y: 0 }, p2: { x: 10, y: 0 } };
const CIRCLE: SketchEntityDto = { kind: 'circle', id: 21, center: { x: 0, y: 15 }, radius: 4 };

describe('deleteSketchEntities', () => {
  it('删曲线 → 实体移除、引用它的约束级联移除、其它实体保留', () => {
    const constraints: SketchConstraintDto[] = [
      { kind: 'horizontal', id: 1, refs: [11] },
      { kind: 'radius', id: 2, refs: [21], value: 4 },
    ];
    const result = deleteSketchEntities([LINE, CIRCLE], constraints, [11]);
    expect(result.entities).toEqual([CIRCLE]);
    expect(result.constraints).toEqual([constraints[1]]);
    expect(result.removedEntities).toEqual([11]);
    expect(result.removedConstraints).toEqual([1]);
    expect(result.blockedEntities).toEqual([]);
    // 入参不被修改。
    expect(LINE.p1).toEqual({ x: -10, y: 0 });
  });

  it('结构化引用（{entity,part}）同样级联移除；origin 引用不受影响', () => {
    const constraints: SketchConstraintDto[] = [
      { kind: 'distance', id: 3, refs: [{ entity: 21, part: 'center' }, 11], value: 5 },
      { kind: 'fixed', id: 4, refs: [{ origin: true }] },
    ];
    const result = deleteSketchEntities([LINE, CIRCLE], constraints, [11]);
    expect(result.removedConstraints).toEqual([3]);
    expect(result.constraints.map((constraint) => constraint.id)).toEqual([4]);
  });

  it('点实体仍被剩余线引用 → 整单拒收且零变更', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'line', id: 11, p1: 1, p2: { x: 10, y: 0 } },
    ];
    const result = deleteSketchEntities(entities, [], [1]);
    expect(result.entities).toEqual(entities);
    expect(result.blockedEntities).toEqual([1]);
    expect(result.removedEntities).toEqual([]);
  });

  it('删除线后其端点显式点实体成为孤立点：不被拒收（不级联删点）', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'line', id: 11, p1: 1, p2: { x: 10, y: 0 } },
    ];
    const result = deleteSketchEntities(entities, [], [11]);
    expect(result.entities).toEqual([entities[0]]);
    expect(result.blockedEntities).toEqual([]);
  });

  it('不存在的 id → 原样返回', () => {
    const result = deleteSketchEntities([LINE], [], [999]);
    expect(result.entities).toEqual([LINE]);
    expect(result.removedEntities).toEqual([]);
  });

  it('删除 projected 根实体 → 同源派生点一并清理（不留孤儿）', () => {
    const source = { kind: 'sketchEntity' as const, sketchId: 'src', entityId: 7 };
    const projected: SketchEntityDto[] = [
      { kind: 'point', id: 42, x: 0, y: 0, projected: { kind: 'projected', source, derived: true } },
      { kind: 'circle', id: 41, center: 42, radius: 1, projected: { kind: 'projected', source } },
      { kind: 'line', id: 51, p1: { x: 0, y: 0 }, p2: { x: 5, y: 0 } },
    ];
    const result = deleteSketchEntities(projected, [], [41]);
    expect(result.entities).toEqual([projected[2]]);
    expect(result.removedEntities.sort((a, b) => a - b)).toEqual([41, 42]);
    expect(result.blockedEntities).toEqual([]);
  });
});
