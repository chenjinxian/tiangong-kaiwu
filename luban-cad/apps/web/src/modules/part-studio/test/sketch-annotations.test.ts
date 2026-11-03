/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图视口标注（Onshape live）：活动草图的 length/distance/radius 约束 →
 * 世界系标注（尺寸线锚点 + 标注侧向 + 文本）。纯函数测试，不依赖 IModelApp。
 */
import { describe, expect, it } from 'vitest';
import type { SketchDto, SketchEntityDto } from '@luban-cad/shared';
import {
  buildSketchDimensionAnnotations,
  formatSketchDimensionValue,
} from '../internal/sketch-annotations.js';

function sketch(entities: SketchEntityDto[], constraints: SketchDto['constraints']): SketchDto {
  return {
    id: 'sk-1',
    entities,
    constraints,
    solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
  };
}

const baseLines: SketchEntityDto[] = [
  { kind: 'line', id: 1, p1: { x: -41.275, y: 9.525 }, p2: { x: 41.275, y: 9.525 } },
  { kind: 'line', id: 2, p1: { x: -41.275, y: -9.525 }, p2: { x: 41.275, y: -9.525 } },
  // 远下方的点把草图包围盒中心拉到 base 下方：顶边标注应朝上（远离中心）。
  { kind: 'point', id: 3, x: 0, y: -66.675 },
];

describe('formatSketchDimensionValue', () => {
  it('保留设计精度、去掉无意义尾零（Onshape 无单位后缀）', () => {
    expect(formatSketchDimensionValue(82.55)).toBe('82.55');
    expect(formatSketchDimensionValue(19.05)).toBe('19.05');
    expect(formatSketchDimensionValue(50.8)).toBe('50.8');
    expect(formatSketchDimensionValue(52.4002)).toBe('52.4002');
    expect(formatSketchDimensionValue(15.875)).toBe('15.875');
    expect(formatSketchDimensionValue(76.2)).toBe('76.2');
    expect(formatSketchDimensionValue(44.45)).toBe('44.45');
    expect(formatSketchDimensionValue(undefined)).toBe('?');
  });
});

describe('buildSketchDimensionAnnotations', () => {
  it('length：线两端点 + 文本，标注侧远离草图中心', () => {
    const annotations = buildSketchDimensionAnnotations(sketch(baseLines, [
      { kind: 'length', id: 100, refs: [1], value: 82.55 },
    ]));
    expect(annotations).toHaveLength(1);
    const dim = annotations[0]!;
    expect(dim).toMatchObject({ kind: 'linear', id: 'dimension-100', text: '82.55' });
    if (dim.kind !== 'linear') throw new Error('应为线性尺寸');
    expect(dim.a.x).toBeCloseTo(-41.275, 6);
    expect(dim.a.y).toBeCloseTo(9.525, 6);
    expect(dim.b.x).toBeCloseTo(41.275, 6);
    expect(dim.b.y).toBeCloseTo(9.525, 6);
    // 草图中心在下方 → 顶边尺寸标注朝上。
    expect(dim.side.y).toBeGreaterThan(0);
  });

  it('distance：平行线取重叠区中点对，尺寸沿垂线；文本取约束值', () => {
    const annotations = buildSketchDimensionAnnotations(sketch(baseLines, [
      { kind: 'distance', id: 101, refs: [1, 2], value: 19.05 },
    ]));
    expect(annotations).toHaveLength(1);
    const dim = annotations[0]!;
    if (dim.kind !== 'linear') throw new Error('应为线性尺寸');
    expect(dim.text).toBe('19.05');
    expect(dim.a.x).toBeCloseTo(0, 6);
    expect(dim.b.x).toBeCloseTo(0, 6);
    expect(dim.a.y).toBeCloseTo(9.525, 6);
    expect(dim.b.y).toBeCloseTo(-9.525, 6);
    // 垂线方向无唯一远离侧（中点在中心线上）→ 确定性取 +x。
    expect(dim.side.x).toBeGreaterThan(0);
  });

  it('radius：圆心 + 弧中角点，R 前缀文本', () => {
    const entities: SketchEntityDto[] = [
      ...baseLines,
      { kind: 'arc', id: 4, center: { x: 57.15, y: -27.0002 }, radius: 15.875, startAngle: 0, sweepAngle: Math.PI / 2 },
    ];
    const annotations = buildSketchDimensionAnnotations(sketch(entities, [
      { kind: 'radius', id: 102, refs: [4], value: 15.875 },
    ]));
    expect(annotations).toHaveLength(1);
    const dim = annotations[0]!;
    expect(dim).toMatchObject({ kind: 'radial', id: 'dimension-102', text: 'R15.875' });
    if (dim.kind !== 'radial') throw new Error('应为径向尺寸');
    expect(dim.center.x).toBeCloseTo(57.15, 6);
    expect(dim.center.y).toBeCloseTo(-27.0002, 6);
    expect(dim.point.x).toBeCloseTo(57.15 + 15.875 * Math.SQRT1_2, 5);
    expect(dim.point.y).toBeCloseTo(-27.0002 + 15.875 * Math.SQRT1_2, 5);
  });

  it('平行线投影不重叠：在缺口正中取垂线锚点（不是端点连线）', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'line', id: 1, p1: { x: -41.275, y: 9.525 }, p2: { x: 41.275, y: 9.525 } },
      { kind: 'line', id: 2, p1: { x: 57.15, y: -42.8752 }, p2: { x: 85.725, y: -42.8752 } },
    ];
    const annotations = buildSketchDimensionAnnotations(sketch(entities, [
      { kind: 'distance', id: 110, refs: [1, 2], value: 52.4002 },
    ]));
    const dim = annotations[0]!;
    if (dim.kind !== 'linear') throw new Error('应为线性尺寸');
    // 缺口 = 41.275..57.15，正中 x = 49.2125；两锚点必须同 x（垂直尺寸线）。
    expect(dim.a.x).toBeCloseTo(49.2125, 6);
    expect(dim.b.x).toBeCloseTo(49.2125, 6);
    expect(dim.a.y).toBeCloseTo(9.525, 6);
    expect(dim.b.y).toBeCloseTo(-42.8752, 6);
  });

  it('点-线 distance：投影到无限长直线（垂足可在段外）', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 85.725, y: -52.3875 },
      { kind: 'line', id: 2, p1: { x: 41.275, y: -9.525 }, p2: { x: 41.275, y: 9.525 } },
    ];
    const annotations = buildSketchDimensionAnnotations(sketch(entities, [
      { kind: 'distance', id: 111, refs: [1, 2], value: 44.45 },
    ]));
    const dim = annotations[0]!;
    if (dim.kind !== 'linear') throw new Error('应为线性尺寸');
    expect(dim.a.x).toBeCloseTo(85.725, 6);
    expect(dim.a.y).toBeCloseTo(-52.3875, 6);
    expect(dim.b.x).toBeCloseTo(41.275, 6);
    expect(dim.b.y).toBeCloseTo(-52.3875, 6);
  });

  it('点-线 distance：取点到线的垂足；结构化子实体引用可解析', () => {
    const annotations = buildSketchDimensionAnnotations(sketch(baseLines, [
      { kind: 'distance', id: 103, refs: [{ origin: true }, { entity: 1, part: 'start' }], value: 123 },
    ]));
    expect(annotations).toHaveLength(1);
    const dim = annotations[0]!;
    if (dim.kind !== 'linear') throw new Error('应为线性尺寸');
    expect(dim.a.x).toBeCloseTo(0, 6);
    expect(dim.a.y).toBeCloseTo(0, 6);
    expect(dim.b.x).toBeCloseTo(-41.275, 6);
    expect(dim.b.y).toBeCloseTo(9.525, 6);
  });

  it('未解析/非尺寸约束跳过，不抛错', () => {
    const annotations = buildSketchDimensionAnnotations(sketch(baseLines, [
      { kind: 'horizontal', id: 104, refs: [1] },
      { kind: 'length', id: 105, refs: [999], value: 1 },
      { kind: 'distance', id: 106, refs: [], value: 1 },
    ]));
    expect(annotations).toEqual([]);
  });
});
