/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * Onshape 单尺寸工具（Sketch.Dimension）推断单测：同一个按钮，按拾取实体动态
 * 决定 length / radius / distance（不再有长度/半径下拉）。
 */
import { describe, expect, it } from 'vitest';
import type { SketchEntityDto } from '@luban-cad/shared';
import {
  inferDimensionCompletion,
} from '../tools/sketch/sketch-dimension-logic.js';
import { resolveNearestPick } from '../tools/sketch/sketch-constraint-logic.js';
import type { SketchPick } from '../tools/sketch/sketch-constraint-logic.js';

const pick = (kind: SketchPick['kind'], entityId: number): SketchPick => ({
  kind,
  ref: { entity: entityId, part: kind === 'line' ? 'start' : kind === 'point' ? 'start' : 'center' } as never,
  entityId,
});

describe('inferDimensionCompletion（单尺寸按钮动态推断）', () => {
  it('线 + 放置点击 → 长度', () => {
    expect(inferDimensionCompletion([pick('line', 1)], true)).toMatchObject({
      kind: 'length',
      refs: [{ entity: 1, part: 'start' }],
      entityIds: [1],
    });
  });

  it('圆弧 + 放置点击 → 半径', () => {
    expect(inferDimensionCompletion([pick('arc', 2)], true)).toMatchObject({
      kind: 'radius',
      entityIds: [2],
    });
  });

  it('线 + 第二条线 → 距离；点 + 线 → 距离', () => {
    expect(inferDimensionCompletion([pick('line', 1), pick('line', 2)], false)).toMatchObject({
      kind: 'distance',
      entityIds: [1, 2],
    });
    expect(inferDimensionCompletion([pick('point', 3), pick('line', 4)], false)).toMatchObject({
      kind: 'distance',
      entityIds: [3, 4],
    });
  });

  it('单点 + 放置 → 不产生尺寸（点没有单独尺寸）', () => {
    expect(inferDimensionCompletion([pick('point', 1)], true)).toMatchObject({ kind: 'invalid' });
  });

  it('未放置的单线/单弧 → pending；空拾取 → pending', () => {
    expect(inferDimensionCompletion([pick('line', 1)], false)).toMatchObject({ kind: 'pending' });
    expect(inferDimensionCompletion([pick('arc', 1)], false)).toMatchObject({ kind: 'pending' });
    expect(inferDimensionCompletion([], true)).toMatchObject({ kind: 'pending' });
  });

  it('同一实体再点（放置回原实体）→ 长度/半径', () => {
    expect(inferDimensionCompletion([pick('line', 1), pick('line', 1)], false)).toMatchObject({ kind: 'length' });
    expect(inferDimensionCompletion([pick('arc', 2), pick('arc', 2)], false)).toMatchObject({ kind: 'radius' });
  });

  it('拾取半径：空白放置点击不被「最近实体」吸附（maxDistance）', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'line', id: 2, p1: { x: 20, y: 0 }, p2: { x: 30, y: 0 } },
    ];
    // 近线 -> line；远处空白 -> undefined（放置语义），而非永远吸附最近实体。
    expect(resolveNearestPick(entities, { x: 25, y: 1 }, 5)).toMatchObject({ kind: 'line', entityId: 2 });
    expect(resolveNearestPick(entities, { x: 150, y: 72 }, 5)).toBeUndefined();
    // 缺省 maxDistance=∞ 保持旧「就近」语义。
    expect(resolveNearestPick(entities, { x: 150, y: 72 })).toMatchObject({ entityId: 2 });
  });

  it('两个圆/弧 → 不支持（invalid），避免生成假距离', () => {
    expect(inferDimensionCompletion([pick('circle', 1), pick('circle', 2)], false)).toMatchObject({ kind: 'invalid' });
  });
});
