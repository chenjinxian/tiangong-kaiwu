/**
 * 草图图元复制/粘贴纯逻辑（Onshape live 2026-11-12：复制后出现粘贴；副本原位）。
 * 覆盖：内部约束重映射、显式 point 端点自包含、外部约束跳过、重复粘贴 id 唯一。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import {
  clearSketchClipboard,
  copySketchEntities,
  hasSketchClipboard,
  pasteSketchClipboard,
} from '../internal/sketch-clipboard.js';
import type { SketchEntitySelection } from '../internal/sketch-entity-picker.js';

const SKETCH_ID = 'sketch-1';

const RECT: SketchEntityDto[] = [
  { kind: 'line', id: 11, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
  { kind: 'line', id: 12, p1: { x: 10, y: 0 }, p2: { x: 10, y: 10 } },
  { kind: 'line', id: 13, p1: { x: 10, y: 10 }, p2: { x: 0, y: 10 } },
  { kind: 'line', id: 14, p1: { x: 0, y: 10 }, p2: { x: 0, y: 0 } },
];
const RECT_CONSTRAINTS: SketchConstraintDto[] = [
  { kind: 'coincident', id: 21, refs: [{ entity: 11, part: 'end' }, { entity: 12, part: 'start' }] },
  { kind: 'coincident', id: 22, refs: [{ entity: 12, part: 'end' }, { entity: 13, part: 'start' }] },
  { kind: 'coincident', id: 23, refs: [{ entity: 13, part: 'end' }, { entity: 14, part: 'start' }] },
  { kind: 'coincident', id: 24, refs: [{ entity: 14, part: 'end' }, { entity: 11, part: 'start' }] },
  { kind: 'horizontal', id: 25, refs: [11] },
  { kind: 'horizontal', id: 26, refs: [13] },
  { kind: 'vertical', id: 27, refs: [12] },
  { kind: 'vertical', id: 28, refs: [14] },
];

const curveSelection = (ids: number[]): SketchEntitySelection[] =>
  ids.map((entityId) => ({ sketchId: SKETCH_ID, entityId, part: 'curve' as const }));

beforeEach(() => clearSketchClipboard());

describe('copySketchEntities / pasteSketchClipboard', () => {
  it('矩形 4 线整体复制/粘贴：内部约束全部重映射，坐标不变，原件不动', () => {
    const copied = copySketchEntities(RECT, RECT_CONSTRAINTS, curveSelection([11, 12, 13, 14]));
    expect(copied).toBe(4);
    expect(hasSketchClipboard()).toBe(true);

    const pasted = pasteSketchClipboard(RECT, RECT_CONSTRAINTS);
    expect(pasted.ok).toBe(true);
    if (!pasted.ok) return;
    expect(pasted.entities).toHaveLength(8);
    expect(pasted.constraints).toHaveLength(16);
    expect(pasted.pastedCurveIds).toHaveLength(4);
    expect(new Set(pasted.pastedEntityIds).size).toBe(4);
    // 新约束只引用新实体 id，不引用原 11..14。
    const oldIds = new Set([11, 12, 13, 14]);
    for (const constraint of pasted.constraints.slice(RECT_CONSTRAINTS.length)) {
      for (const ref of constraint.refs)
        expect(typeof ref === 'number' ? oldIds.has(ref) : 'entity' in ref ? oldIds.has(ref.entity) : false).toBe(false);
      expect(constraint.id).toBeGreaterThan(28);
    }
    // 副本几何与原件一致（原位）。
    const pastedLines = pasted.entities.filter((entity) => pasted.pastedCurveIds.includes(entity.id));
    expect(pastedLines).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      const source = RECT[i] as Extract<SketchEntityDto, { kind: 'line' }>;
      const copy = pastedLines[i] as Extract<SketchEntityDto, { kind: 'line' }>;
      expect(copy.p1).toEqual(source.p1);
      expect(copy.p2).toEqual(source.p2);
    }
    // 原件保持不变。
    expect(pasted.entities.slice(0, RECT.length)).toEqual(RECT);
  });

  it('显式 point 端点自动并入复制集；引用外部点的约束不复制', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 3, x: 5, y: 5 },
      { kind: 'line', id: 2, p1: 1, p2: { x: 10, y: 0 } },
    ];
    const constraints: SketchConstraintDto[] = [
      { kind: 'coincident', id: 10, refs: [1, 3] },
      { kind: 'horizontal', id: 11, refs: [2] },
    ];
    expect(copySketchEntities(entities, constraints, curveSelection([2]))).toBe(1);
    const pasted = pasteSketchClipboard(entities, constraints);
    expect(pasted.ok).toBe(true);
    if (!pasted.ok) return;
    // 新增 point+line；coincident(1,3) 引用外部点 3 → 跳过；horizontal 保留。
    expect(pasted.entities).toHaveLength(5);
    expect(pasted.constraints).toHaveLength(3);
    const newLine = pasted.entities.find((entity) => entity.kind === 'line' && entity.id !== 2);
    expect(newLine).toBeDefined();
    if (!newLine || newLine.kind !== 'line') return;
    const pointRef = newLine.p1;
    expect(typeof pointRef).toBe('number');
    if (typeof pointRef !== 'number') return;
    const newPoint = pasted.entities.find((entity) => entity.kind === 'point' && entity.id === pointRef);
    expect(newPoint).toMatchObject({ x: 0, y: 0 });
    const horizontals = pasted.constraints.filter((constraint) => constraint.kind === 'horizontal');
    expect(horizontals).toHaveLength(2);
    expect(horizontals[1]).toMatchObject({ kind: 'horizontal', refs: [newLine.id] });
  });

  it('连续粘贴两次 id 唯一；清空/无选择时行为诚实', () => {
    copySketchEntities(RECT, RECT_CONSTRAINTS, curveSelection([11]));
    const first = pasteSketchClipboard(RECT, RECT_CONSTRAINTS);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = pasteSketchClipboard(first.entities, first.constraints);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const allIds = [
      ...second.entities.map((entity) => `e${entity.id}`),
      ...second.constraints.map((constraint) => `c${constraint.id}`),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(second.entities).toHaveLength(RECT.length + 2);

    clearSketchClipboard();
    expect(copySketchEntities(RECT, RECT_CONSTRAINTS, [])).toBe(0);
    expect(hasSketchClipboard()).toBe(false);
    expect(pasteSketchClipboard(RECT, RECT_CONSTRAINTS)).toEqual({ ok: false, reason: 'empty' });
  });
});
