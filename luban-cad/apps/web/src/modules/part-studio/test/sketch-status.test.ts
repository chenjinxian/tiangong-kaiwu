/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图状态读数纯逻辑（2026-11-15 E4/S4b）：固定 mm 3 位小数格式 +
 * `store.canvas.selection`/活动草图 DTO → 单条选中曲线长度/半径。
 */
import { describe, expect, it } from 'vitest';
import type { SketchEntityDto } from '@luban-cad/shared';
import {
  formatStatusLength,
  formatStatusNumber,
  formatStatusPoint,
  resolveSketchStatusLength,
  type SketchStatusSelectionEntry,
} from '../internal/sketch-status.js';

function sketch(entities: SketchEntityDto[]): { id: string; entities: SketchEntityDto[] } {
  return { id: 'sk-1', entities };
}

function select(entityId: number, overrides: Partial<SketchStatusSelectionEntry> = {}): SketchStatusSelectionEntry {
  return { sketchId: 'sk-1', entityId, part: 'curve', ...overrides };
}

describe('formatStatusNumber / formatStatusPoint / formatStatusLength', () => {
  it('3 位小数（固定 mm），负值与 -0.000 归一', () => {
    expect(formatStatusNumber(1.23456)).toBe('1.235');
    expect(formatStatusNumber(-2)).toBe('-2.000');
    expect(formatStatusNumber(0.0004)).toBe('0.000');
    expect(formatStatusNumber(-0.0001)).toBe('0.000');
    expect(formatStatusNumber(Number.NaN)).toBe('?');
    expect(formatStatusNumber(Number.POSITIVE_INFINITY)).toBe('?');
  });

  it('点：Onshape 同构的逐坐标单位后缀（固定 mm，不跟随文档英寸）', () => {
    expect(formatStatusPoint({ x: 1.23456, y: -2, z: 0.0004 })).toBe(
      'X 1.235 mm Y -2.000 mm Z 0.000 mm',
    );
  });

  it('长度：`<3 位小数> mm`', () => {
    expect(formatStatusLength(12.3456)).toBe('12.346 mm');
    expect(formatStatusLength(0)).toBe('0.000 mm');
    expect(formatStatusLength(Number.NaN)).toBe('? mm');
  });
});

describe('resolveSketchStatusLength（唯一选择权威 + 活动草图 DTO）', () => {
  // 2026-11-15：草图 DTO 局部坐标是米（20 mm = 0.02），读数固定 mm → ×1000。
  it('单选线（内联端点）→ 长度（米制 DTO ×1000 → mm）', () => {
    const active = sketch([
      { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 0.003, y: 0.004 } },
    ]);
    expect(resolveSketchStatusLength(active, [select(1)])).toEqual({ kind: 'length', valueMm: 5 });
  });

  it('单选线 20 mm（0.02 m）→ 20 mm；点实体数值引用同样 ×1000', () => {
    const active = sketch([
      { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 0.02, y: 0 } },
    ]);
    expect(resolveSketchStatusLength(active, [select(1)])).toEqual({ kind: 'length', valueMm: 20 });
    const referenced = sketch([
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 0.006, y: 0.008 },
      { kind: 'line', id: 3, p1: 1, p2: 2 },
    ]);
    expect(resolveSketchStatusLength(referenced, [select(3)])).toEqual({ kind: 'length', valueMm: 10 });
  });

  it('单选圆/弧（有 radius）→ 半径；无 radius 不显示', () => {
    const active = sketch([
      { kind: 'circle', id: 1, center: 2, radius: 0.0025 },
      { kind: 'point', id: 2, x: 0, y: 0 },
      { kind: 'arc', id: 3, center: 2, radius: 0.004 },
    ]);
    expect(resolveSketchStatusLength(active, [select(1)])).toEqual({ kind: 'radius', valueMm: 2.5 });
    expect(resolveSketchStatusLength(active, [select(3)])).toEqual({ kind: 'radius', valueMm: 4 });
    expect(resolveSketchStatusLength(sketch([
      { kind: 'circle', id: 4, center: { x: 0, y: 0 } },
    ]), [select(4)])).toBeNull();
  });

  it('非长度实体（点/样条）/实体缺失 → null（不伪造读数）', () => {
    const active = sketch([
      { kind: 'point', id: 1, x: 1, y: 2 },
      { kind: 'spline', id: 2, controlPoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] },
    ]);
    expect(resolveSketchStatusLength(active, [select(1)])).toBeNull();
    expect(resolveSketchStatusLength(active, [select(2)])).toBeNull();
    expect(resolveSketchStatusLength(active, [select(99)])).toBeNull();
  });

  it('多选 / 控制点选择 / 跨草图 / 非曲线选择 → null', () => {
    const active = sketch([
      { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 0.001, y: 0 } },
      { kind: 'line', id: 2, p1: { x: 0, y: 0.001 }, p2: { x: 0.001, y: 0.001 } },
    ]);
    expect(resolveSketchStatusLength(active, [select(1), select(2)])).toBeNull();
    expect(resolveSketchStatusLength(active, [
      select(1, { part: 'handle', handleIndex: 0 }),
    ])).toBeNull();
    expect(resolveSketchStatusLength(active, [select(1, { sketchId: 'sk-2' })])).toBeNull();
    expect(resolveSketchStatusLength(active, [
      { sketchId: 'sk-1', entityId: 1, sketchPart: 'handle', handleIndex: 1 },
    ])).toBeNull();
    // store.canvas.selection 形态（sketchPart）曲线本体仍接受。
    expect(resolveSketchStatusLength(active, [
      { sketchId: 'sk-1', entityId: 1, sketchPart: 'curve' },
    ])).toEqual({ kind: 'length', valueMm: 1 });
  });

  it('无活动草图 / 空选择 → null', () => {
    expect(resolveSketchStatusLength(undefined, [select(1)])).toBeNull();
    expect(resolveSketchStatusLength(null, [])).toBeNull();
    expect(resolveSketchStatusLength(sketch([]), [])).toBeNull();
  });
});
