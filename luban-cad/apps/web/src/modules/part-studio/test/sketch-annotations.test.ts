/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图视口标注（Onshape live）：活动草图的 length/distance/radius 约束 →
 * 世界系标注（尺寸线锚点 + 标注侧向 + 文本）。纯函数测试，不依赖 IModelApp。
 */
import { describe, expect, it } from 'vitest';
import type { SketchConstraintDto, SketchDto, SketchEntityDto } from '@luban-cad/shared';
import {
  buildSketchDimensionAnnotations,
  formatSketchDimensionValue,
  resolveDimensionLabelValue,
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
  it('长度类最多 2 位小数、去尾零（live W18：25.98062 → 25.98；无单位后缀）', () => {
    expect(formatSketchDimensionValue(82.55)).toBe('82.55');
    expect(formatSketchDimensionValue(19.05)).toBe('19.05');
    expect(formatSketchDimensionValue(50.8)).toBe('50.8');
    expect(formatSketchDimensionValue(25.98062)).toBe('25.98');
    expect(formatSketchDimensionValue(52.4002)).toBe('52.4');
    expect(formatSketchDimensionValue(15.875)).toBe('15.88');
    // live 2026-11-16 实采：输入 28.575 → 标注 28.58（十进制 half-up，
    // 非 JS toFixed 的二进制 down）；见 decimal-format.ts。
    expect(formatSketchDimensionValue(28.575)).toBe('28.58');
    expect(formatSketchDimensionValue(76.2)).toBe('76.2');
    // decimals=0 的防御：不能把整数尾零裁掉（90 → "9"）。
    expect(formatSketchDimensionValue(90, 0)).toBe('90');
    expect(formatSketchDimensionValue(90.4, 0)).toBe('90');
    expect(formatSketchDimensionValue(44.45)).toBe('44.45');
    expect(formatSketchDimensionValue(undefined)).toBe('?');
    expect(formatSketchDimensionValue(Number.NaN)).toBe('?');
  });

  it('角度调用方传 3 位小数（live 88.4961608° → 88.496），仍去尾零', () => {
    expect(formatSketchDimensionValue(88.4961608, 3)).toBe('88.496');
    expect(formatSketchDimensionValue(90, 3)).toBe('90');
    expect(formatSketchDimensionValue(45.5, 3)).toBe('45.5');
    expect(formatSketchDimensionValue(Number.POSITIVE_INFINITY, 3)).toBe('?');
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

  it('angle：两线交点 + 远端点射线，文本按度数显示（契约为弧度）', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'line', id: 4, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
      { kind: 'line', id: 5, p1: { x: 0, y: 0 }, p2: { x: 0, y: 10 } },
    ];
    const annotations = buildSketchDimensionAnnotations(sketch(entities, [
      { kind: 'angle', id: 102, refs: [4, 5], value: Math.PI / 2 },
    ]));
    expect(annotations).toHaveLength(1);
    const dim = annotations[0]!;
    expect(dim).toMatchObject({ kind: 'angular', id: 'dimension-102', text: '90°' });
    if (dim.kind !== 'angular') throw new Error('应为角度尺寸');
    expect(dim.vertex.x).toBeCloseTo(0, 6);
    expect(dim.vertex.y).toBeCloseTo(0, 6);
    expect(dim.a.x).toBeCloseTo(10, 6);
    expect(dim.a.y).toBeCloseTo(0, 6);
    expect(dim.b.x).toBeCloseTo(0, 6);
    expect(dim.b.y).toBeCloseTo(10, 6);
  });

  it('angle：平行线无交点 → 跳过（不猜测）', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'line', id: 4, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
      { kind: 'line', id: 5, p1: { x: 0, y: 5 }, p2: { x: 10, y: 5 } },
    ];
    const annotations = buildSketchDimensionAnnotations(sketch(entities, [
      { kind: 'angle', id: 103, refs: [4, 5], value: Math.PI / 3 },
    ]));
    expect(annotations).toEqual([]);
  });

  it('angle：标签最多 3 位小数（live W18：88.496°）', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'line', id: 4, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
      { kind: 'line', id: 5, p1: { x: 0, y: 0 }, p2: { x: 2, y: 10 } },
    ];
    const annotations = buildSketchDimensionAnnotations(sketch(entities, [
      { kind: 'angle', id: 104, refs: [4, 5], value: 88.4961608 * Math.PI / 180 },
    ]));
    expect(annotations).toHaveLength(1);
    expect(annotations[0]).toMatchObject({ kind: 'angular', id: 'dimension-104', text: '88.496°' });
  });

  it('diameter：圆心 + 圆上点，⌀ 前缀文本（v1.23 ADR-0004）', () => {
    const entities: SketchEntityDto[] = [
      ...baseLines,
      { kind: 'circle', id: 4, center: { x: 10, y: 0 }, radius: 10 },
    ];
    const annotations = buildSketchDimensionAnnotations(sketch(entities, [
      { kind: 'diameter', id: 103, refs: [4], value: 20 },
    ]));
    expect(annotations).toHaveLength(1);
    const dim = annotations[0]!;
    expect(dim).toMatchObject({ kind: 'radial', id: 'dimension-103', text: '⌀20' });
    if (dim.kind !== 'radial') throw new Error('应为径向尺寸');
    expect(dim.center.x).toBeCloseTo(10, 6);
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
    // 半径与长度同精度（live W18：最多 2 位小数）。
    expect(dim).toMatchObject({ kind: 'radial', id: 'dimension-102', text: 'R15.88' });
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

// ── ADR-0020 §2.6 D1（S2）：`显示表达式` 投影（缺省 true = 表达式原文）──────
describe('buildSketchDimensionAnnotations：显示表达式开关', () => {
  const lineEntities: SketchEntityDto[] = [
    { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 20, y: 0 } },
  ];

  it('length：driving + expression → 原文（无单位/前缀）；关闭 → 既有数值格式', () => {
    const constraints: SketchConstraintDto[] = [
      { kind: 'length', id: 300, refs: [1], value: 20, expression: '#width' },
    ];
    expect(buildSketchDimensionAnnotations(sketch(lineEntities, constraints))[0])
      .toMatchObject({ text: '#width' });
    expect(buildSketchDimensionAnnotations(sketch(lineEntities, constraints), { showExpressions: true })[0])
      .toMatchObject({ text: '#width' });
    expect(buildSketchDimensionAnnotations(sketch(lineEntities, constraints), { showExpressions: false })[0])
      .toMatchObject({ text: '20' });
  });

  it('radius/diameter：表达式原文不附加 R/⌀；关闭显示既有前缀格式', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'circle', id: 4, center: { x: 10, y: 0 }, radius: 6 },
      { kind: 'arc', id: 5, center: { x: 0, y: 0 }, radius: 7, startAngle: 0, sweepAngle: Math.PI / 2 },
    ];
    const constraints: SketchConstraintDto[] = [
      { kind: 'radius', id: 301, refs: [5], value: 7, expression: '#r' },
      { kind: 'diameter', id: 302, refs: [4], value: 12, expression: '#d' },
    ];
    expect(buildSketchDimensionAnnotations(sketch(entities, constraints))
      .map((annotation) => annotation.text)).toEqual(['#r', '#d']);
    expect(buildSketchDimensionAnnotations(sketch(entities, constraints), { showExpressions: false })
      .map((annotation) => annotation.text)).toEqual(['R7', '⌀12']);
  });

  it('angle：表达式原文不附加 °；关闭显示度数格式', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'line', id: 4, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
      { kind: 'line', id: 5, p1: { x: 0, y: 0 }, p2: { x: 0, y: 10 } },
    ];
    const constraints: SketchConstraintDto[] = [
      { kind: 'angle', id: 303, refs: [4, 5], value: Math.PI / 2, expression: '#ang' },
    ];
    expect(buildSketchDimensionAnnotations(sketch(entities, constraints))[0])
      .toMatchObject({ text: '#ang' });
    expect(buildSketchDimensionAnnotations(sketch(entities, constraints), { showExpressions: false })[0])
      .toMatchObject({ text: '90°' });
  });

  it('driven 不受开关影响：始终显示当前几何实测值（表达式不覆盖）', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 30, y: 0 } },
    ];
    const constraints: SketchConstraintDto[] = [
      { kind: 'length', id: 304, refs: [1], value: 20, expression: '#width', driven: true },
    ];
    expect(buildSketchDimensionAnnotations(sketch(entities, constraints), { showExpressions: true })[0])
      .toMatchObject({ text: '30' });
    expect(buildSketchDimensionAnnotations(sketch(entities, constraints), { showExpressions: false })[0])
      .toMatchObject({ text: '30' });
  });

  it('无 expression：开关不影响（既有数值格式）', () => {
    const constraints: SketchConstraintDto[] = [
      { kind: 'length', id: 305, refs: [1], value: 20 },
    ];
    expect(buildSketchDimensionAnnotations(sketch(lineEntities, constraints))[0])
      .toMatchObject({ text: '20' });
    expect(buildSketchDimensionAnnotations(sketch(lineEntities, constraints), { showExpressions: true })[0])
      .toMatchObject({ text: '20' });
  });
});

// ── W31-A（2026-11-17 从动/参考尺寸）：driven 标签显示当前几何测量值 ─────────
describe('resolveDimensionLabelValue（driven 显示层投影）', () => {
  const lengthConstraint = (extra: Partial<SketchConstraintDto> = {}): SketchConstraintDto => ({
    kind: 'length', id: 1, refs: [1], ...extra,
  });

  it('driving 恒用存储值（测量值不参与）', () => {
    expect(resolveDimensionLabelValue(lengthConstraint({ value: 20 }), 30)).toBe(20);
    expect(resolveDimensionLabelValue(lengthConstraint({ value: 20, driven: false }), 30)).toBe(20);
  });

  it('driven 优先当前几何测量值（存储值可能过期）', () => {
    expect(resolveDimensionLabelValue(lengthConstraint({ value: 20, driven: true }), 30)).toBe(30);
    // driven 不要求存储值存在（后端允许无 value 的参考尺寸）。
    expect(resolveDimensionLabelValue(lengthConstraint({ driven: true }), 30)).toBe(30);
  });

  it('driven 测量不可得/非有限 → 回退存储值；两者皆无 → undefined（不猜）', () => {
    expect(resolveDimensionLabelValue(lengthConstraint({ value: 20, driven: true }), undefined)).toBe(20);
    expect(resolveDimensionLabelValue(lengthConstraint({ value: 20, driven: true }), Number.NaN)).toBe(20);
    expect(resolveDimensionLabelValue(lengthConstraint({ driven: true }), undefined)).toBeUndefined();
    expect(resolveDimensionLabelValue(lengthConstraint(), 30)).toBeUndefined();
  });
});

describe('buildSketchDimensionAnnotations：driven 尺寸标签几何实测', () => {
  it('length：driven 用线长实测（存储值 20 过期 → 显示 30）；driving 仍用存储值', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 30, y: 0 } },
    ];
    const driven = buildSketchDimensionAnnotations(sketch(entities, [
      { kind: 'length', id: 200, refs: [1], value: 20, driven: true },
    ]));
    expect(driven[0]).toMatchObject({ kind: 'linear', id: 'dimension-200', text: '30' });
    // driven 与 driving 标签形状/字段一致：无括号/无前缀。
    expect(driven[0]!.text).not.toMatch(/[()[\]]/);

    const driving = buildSketchDimensionAnnotations(sketch(entities, [
      { kind: 'length', id: 201, refs: [1], value: 20 },
    ]));
    expect(driving[0]).toMatchObject({ kind: 'linear', id: 'dimension-201', text: '20' });
  });

  it('distance：driven 点-点距离实测；无存储值也可显示', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 6, y: 8 },
    ];
    const annotations = buildSketchDimensionAnnotations(sketch(entities, [
      { kind: 'distance', id: 202, refs: [1, 2], driven: true },
    ]));
    expect(annotations[0]).toMatchObject({ kind: 'linear', id: 'dimension-202', text: '10' });
  });

  it('distance：driven 平行线垂距实测（存储值过期 → 用 19.05）', () => {
    const annotations = buildSketchDimensionAnnotations(sketch(baseLines, [
      { kind: 'distance', id: 203, refs: [1, 2], value: 5, driven: true },
    ]));
    expect(annotations[0]).toMatchObject({ kind: 'linear', id: 'dimension-203', text: '19.05' });
  });

  it('radius/diameter：driven 用圆/弧实测半径（diameter=2×半径）', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'circle', id: 4, center: { x: 10, y: 0 }, radius: 6 },
      { kind: 'arc', id: 5, center: { x: 0, y: 0 }, radius: 7, startAngle: 0, sweepAngle: Math.PI / 2 },
    ];
    const annotations = buildSketchDimensionAnnotations(sketch(entities, [
      { kind: 'radius', id: 204, refs: [4], value: 99, driven: true },
      { kind: 'diameter', id: 205, refs: [4], value: 99, driven: true },
      { kind: 'radius', id: 206, refs: [5], value: 99, driven: true },
    ]));
    expect(annotations.map((annotation) => annotation.text)).toEqual(['R6', '⌀12', 'R7']);
    // driven 与 driving 同一前缀/格式（无括号、无「REF」类前缀）。
    for (const text of annotations.map((annotation) => annotation.text))
      expect(text).not.toMatch(/[()[\]]|REF|ref/i);
  });

  it('angle：driven 用两线实测夹角（度，3 位去尾零）；driving 仍用存储弧度', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'line', id: 4, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
      { kind: 'line', id: 5, p1: { x: 0, y: 0 }, p2: { x: 5, y: 5 * Math.sqrt(3) } },
    ];
    const driven = buildSketchDimensionAnnotations(sketch(entities, [
      { kind: 'angle', id: 207, refs: [4, 5], value: Math.PI / 2, driven: true },
    ]));
    expect(driven[0]).toMatchObject({ kind: 'angular', id: 'dimension-207', text: '60°' });

    const driving = buildSketchDimensionAnnotations(sketch(entities, [
      { kind: 'angle', id: 208, refs: [4, 5], value: Math.PI / 2 },
    ]));
    expect(driving[0]).toMatchObject({ kind: 'angular', id: 'dimension-208', text: '90°' });
  });

  it('angle：driven 钝角 120° 不做锐角补角化（标注射线口径）', () => {
    // 评审复现用例：A=(0,0)->(10,0)，B=(0,0)->(-5,8.660254) = 120° 夹角。
    // 标注弧取远端点射线（A 右向、B 左上向），文字必须与弧一致。
    const entities: SketchEntityDto[] = [
      { kind: 'line', id: 4, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
      { kind: 'line', id: 5, p1: { x: 0, y: 0 }, p2: { x: -5, y: 8.660254 } },
    ];
    const driven = buildSketchDimensionAnnotations(sketch(entities, [
      { kind: 'angle', id: 210, refs: [4, 5], value: 2 * Math.PI / 3, driven: true },
    ]));
    expect(driven[0]).toMatchObject({ kind: 'angular', id: 'dimension-210', text: '120°' });
    if (driven[0]!.kind !== 'angular') throw new Error('应为角度尺寸');
    // 弧射线：a 指向 A 远端点 (10,0)，b 指向 B 远端点 (-5,8.660254)。
    expect(driven[0]!.a.x).toBeCloseTo(10, 6);
    expect(driven[0]!.a.y).toBeCloseTo(0, 6);
    expect(driven[0]!.b.x).toBeCloseTo(-5, 6);
    expect(driven[0]!.b.y).toBeCloseTo(8.660254, 6);

    const driving = buildSketchDimensionAnnotations(sketch(entities, [
      { kind: 'angle', id: 211, refs: [4, 5], value: 2 * Math.PI / 3 },
    ]));
    expect(driving[0]).toMatchObject({ kind: 'angular', id: 'dimension-211', text: '120°' });
  });

  it('driven 不可测（平行线角度无交点）→ 跳过，不猜', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'line', id: 4, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
      { kind: 'line', id: 5, p1: { x: 0, y: 5 }, p2: { x: 10, y: 5 } },
    ];
    const annotations = buildSketchDimensionAnnotations(sketch(entities, [
      { kind: 'angle', id: 209, refs: [4, 5], value: Math.PI / 3, driven: true },
    ]));
    expect(annotations).toEqual([]);
  });
});

// ADR-0023（2026-11-20）：slotWidth 单宽度尺寸标注——ring 显示 Ø（跨环带），
// concentric 显示线性宽度（live circle-slot.dxf 为线性）。
describe('buildSketchDimensionAnnotations：slotWidth（ADR-0023）', () => {
  it('ring：跨首段外/内边界中点，⌀ 前缀（live ring-slot.dxf）', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'line', id: 5, p1: { x: 0, y: 0 }, p2: { x: 40, y: 0 } },
      { kind: 'line', id: 6, p1: { x: 40, y: 0 }, p2: { x: 0, y: 30 } },
      { kind: 'line', id: 7, p1: { x: 0, y: 30 }, p2: { x: 0, y: 0 } },
      { kind: 'line', id: 18, p1: { x: 0, y: -10 }, p2: { x: 40, y: -10 } },
      { kind: 'line', id: 19, p1: { x: 40, y: -10 }, p2: { x: -10, y: 40 } },
      { kind: 'line', id: 20, p1: { x: -10, y: 40 }, p2: { x: -10, y: -10 } },
      { kind: 'line', id: 14, p1: { x: 10, y: 10 }, p2: { x: 30, y: 10 } },
      { kind: 'line', id: 15, p1: { x: 30, y: 10 }, p2: { x: 20, y: 20 } },
      { kind: 'line', id: 16, p1: { x: 20, y: 20 }, p2: { x: 10, y: 10 } },
    ];
    const annotations = buildSketchDimensionAnnotations(sketch(entities, [{
      kind: 'slotWidth', slotMode: 'ring', id: 170,
      refs: [5, 6, 7, 18, 19, 20, 14, 15, 16], value: 20,
    }]));
    expect(annotations).toHaveLength(1);
    const dim = annotations[0]!;
    expect(dim).toMatchObject({ kind: 'linear', id: 'dimension-170', text: '⌀20' });
    if (dim.kind !== 'linear') throw new Error('应为线性尺寸');
    expect(dim.a.x).toBeCloseTo(20, 6);
    expect(dim.a.y).toBeCloseTo(-10, 6);
    expect(dim.b.x).toBeCloseTo(20, 6);
    expect(dim.b.y).toBeCloseTo(10, 6);
  });

  it('ring 弧边界（v1.84）：同心弧角中点径向跨带，⌀ 前缀（live 闭合 line+arc 环）', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'line', id: 6, p1: { x: 10, y: 0 }, p2: { x: -10, y: 0 } },
      { kind: 'line', id: 7, p1: { x: 10, y: -10 }, p2: { x: -10, y: -10 } },
      { kind: 'line', id: 8, p1: { x: 10, y: 10 }, p2: { x: -10, y: 10 } },
      { kind: 'arc', id: 5, center: { x: 0, y: 0 }, radius: 10, startAngle: 0, sweepAngle: Math.PI },
      { kind: 'arc', id: 10, center: { x: 0, y: 0 }, radius: 40, startAngle: 0, sweepAngle: Math.PI },
      { kind: 'arc', id: 12, center: { x: 0, y: 0 }, radius: 20, startAngle: 0, sweepAngle: Math.PI },
    ];
    const annotations = buildSketchDimensionAnnotations(sketch(entities, [{
      kind: 'slotWidth', slotMode: 'ring', id: 175,
      refs: [5, 6, 10, 7, 12, 8], value: 20,
    }]));
    expect(annotations).toHaveLength(1);
    const dim = annotations[0]!;
    expect(dim).toMatchObject({ kind: 'linear', id: 'dimension-175', text: '⌀20' });
    if (dim.kind !== 'linear') throw new Error('应为线性尺寸');
    // 外弧 0→180° 角中点 90°：跨带线段 (0,40)→(0,20)。
    expect(dim.a.x).toBeCloseTo(0, 6);
    expect(dim.a.y).toBeCloseTo(40, 6);
    expect(dim.b.x).toBeCloseTo(0, 6);
    expect(dim.b.y).toBeCloseTo(20, 6);
  });

  it('concentric：内/外圆 45° 对应点跨环带，文本为线性宽度（无 ⌀）', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'circle', id: 10, center: { x: 0, y: 0 }, radius: 30 },
      { kind: 'circle', id: 11, center: { x: 0, y: 0 }, radius: 20 },
      { kind: 'circle', id: 12, center: { x: 0, y: 0 }, radius: 40 },
    ];
    const annotations = buildSketchDimensionAnnotations(sketch(entities, [{
      kind: 'slotWidth', slotMode: 'concentric', id: 171,
      refs: [10, 11, 12], value: 20,
    }]));
    expect(annotations).toHaveLength(1);
    const dim = annotations[0]!;
    expect(dim).toMatchObject({ kind: 'linear', id: 'dimension-171', text: '20' });
    if (dim.kind !== 'linear') throw new Error('应为线性尺寸');
    const s = Math.SQRT1_2;
    expect(dim.a.x).toBeCloseTo(20 * s, 6);
    expect(dim.a.y).toBeCloseTo(20 * s, 6);
    expect(dim.b.x).toBeCloseTo(40 * s, 6);
    expect(dim.b.y).toBeCloseTo(40 * s, 6);
  });

  it('driven ring 用实测环带宽（外侧/内侧边界垂距），不信任存储值', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'line', id: 5, p1: { x: 0, y: 0 }, p2: { x: 40, y: 0 } },
      { kind: 'line', id: 6, p1: { x: 40, y: 0 }, p2: { x: 0, y: 30 } },
      { kind: 'line', id: 7, p1: { x: 0, y: 30 }, p2: { x: 0, y: 0 } },
      { kind: 'line', id: 18, p1: { x: 0, y: -12.5 }, p2: { x: 40, y: -12.5 } },
      { kind: 'line', id: 19, p1: { x: 40, y: -12.5 }, p2: { x: -12.5, y: 42.5 } },
      { kind: 'line', id: 20, p1: { x: -12.5, y: 42.5 }, p2: { x: -12.5, y: -12.5 } },
      { kind: 'line', id: 14, p1: { x: 10, y: 7.5 }, p2: { x: 30, y: 7.5 } },
      { kind: 'line', id: 15, p1: { x: 30, y: 7.5 }, p2: { x: 20, y: 17.5 } },
      { kind: 'line', id: 16, p1: { x: 20, y: 17.5 }, p2: { x: 10, y: 7.5 } },
    ];
    const annotations = buildSketchDimensionAnnotations(sketch(entities, [{
      kind: 'slotWidth', slotMode: 'ring', id: 172,
      refs: [5, 6, 7, 18, 19, 20, 14, 15, 16], value: 20, driven: true,
    }]));
    expect(annotations[0]).toMatchObject({ kind: 'linear', id: 'dimension-172', text: '⌀20' });
  });

  it('缺 slotMode / 引用不可解析 → 不产出标注（不猜）', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'line', id: 5, p1: { x: 0, y: 0 }, p2: { x: 40, y: 0 } },
    ];
    expect(buildSketchDimensionAnnotations(sketch(entities, [{
      kind: 'slotWidth', id: 173, refs: [5], value: 20,
    }]))).toEqual([]);
    expect(buildSketchDimensionAnnotations(sketch(entities, [{
      kind: 'slotWidth', slotMode: 'concentric', id: 174, refs: [5, 6, 7], value: 20,
    }]))).toEqual([]);
  });
});
