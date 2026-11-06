/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 特征实时预览几何（2026-11-02 Onshape 对齐）：extrude 双副本+侧面/端盖、
 * symmetric 双向、面域边界过滤；revolve 绕草图内轴旋转（全周/部分角/无轴）；
 * 面域橙环由平面图面提取（复杂带孔面无法重建时不伪造填充）。
 */
import { describe, expect, it } from 'vitest';
import type { SketchEntityDto, SketchPlaneDto, SketchRegionDto } from '@luban-cad/shared';
import {
  buildExtrudePreview,
  buildRevolvePreview,
} from '../internal/feature-preview.js';

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

const SQUARE: SketchEntityDto[] = [
  { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 2, y: 0 } },
  { kind: 'line', id: 2, p1: { x: 2, y: 0 }, p2: { x: 2, y: 1 } },
  { kind: 'line', id: 3, p1: { x: 2, y: 1 }, p2: { x: 0, y: 1 } },
  { kind: 'line', id: 4, p1: { x: 0, y: 1 }, p2: { x: 0, y: 0 } },
];
const SQUARE_REGION: SketchRegionDto = {
  area: 2,
  outerEntityIds: [1, 2, 3, 4],
  outerBoundary: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }],
};
const EMPTY = { quads: [], lines: [], fillLoops: [], capLoops: [], selectionEdges: [] };

describe('buildExtrudePreview', () => {
  it('矩形沿 +Z 拉伸：侧面四边形 + 底/顶端盖 + 橙色选中面环', () => {
    const preview = buildExtrudePreview(SQUARE, XY_PLANE, [SQUARE_REGION], 10, false);
    // 每条开口边界 = 底/顶副本 + 两端竖直棱 = 4 条线；4 条边界 → 16。
    expect(preview.lines).toHaveLength(16);
    expect(preview.quads).toHaveLength(4);
    expect(preview.fillLoops).toHaveLength(1); // 选中面域橙环（草图平面）
    expect(preview.capLoops).toHaveLength(2); // 底/顶灰色端盖
    expect(preview.selectionEdges).toHaveLength(4); // 橙色边界轮廓
    expect(preview.lines[0]![0]!.toJSON()).toEqual([0, 0, 0]);
    expect(preview.lines[1]![0]!.toJSON()).toEqual([0, 0, 10]);
    expect(preview.quads[0]!.map((p) => p.toJSON())).toEqual([
      [0, 0, 0],
      [2, 0, 0],
      [2, 0, 10],
      [0, 0, 10],
    ]);
    expect(preview.fillLoops[0]![0]!.isAlmostEqual(preview.fillLoops[0]!.at(-1)!, 1e-9)).toBe(false);
  });

  it('symmetric 沿法向 ±d/2；负距离取反向', () => {
    const preview = buildExtrudePreview(SQUARE, XY_PLANE, [SQUARE_REGION], 10, true);
    expect(preview.lines[0]![0]!.z).toBeCloseTo(-5, 9);
    expect(preview.lines[1]![0]!.z).toBeCloseTo(5, 9);
    const backward = buildExtrudePreview(SQUARE, XY_PLANE, [SQUARE_REGION], -6, false);
    expect(backward.lines[0]![0]!.z).toBeCloseTo(0, 9);
    expect(backward.lines[1]![0]!.z).toBeCloseTo(-6, 9);
    // v1.24：第二方向（缺省主方向相反侧）扩展预览包络 [-5, 10]。
    const second = buildExtrudePreview(SQUARE, XY_PLANE, [SQUARE_REGION], 10, false, 0, -5);
    expect(second.lines[0]![0]!.z).toBeCloseTo(-5, 9);
    expect(second.lines[1]![0]!.z).toBeCloseTo(10, 9);
    // v1.22：起始偏移沿法向平移整个预览体（symmetric 以偏移后的中面为中心）。
    const offset = buildExtrudePreview(SQUARE, XY_PLANE, [SQUARE_REGION], 10, false, 3);
    expect(offset.lines[0]![0]!.z).toBeCloseTo(3, 9);
    expect(offset.lines[1]![0]!.z).toBeCloseTo(13, 9);
    const offsetSymmetric = buildExtrudePreview(SQUARE, XY_PLANE, [SQUARE_REGION], 10, true, 3);
    expect(offsetSymmetric.lines[0]![0]!.z).toBeCloseTo(-2, 9);
    expect(offsetSymmetric.lines[1]![0]!.z).toBeCloseTo(8, 9);
  });

  it('按面域外环过滤实体；单边无法闭环 → 只有橙色轮廓，不伪造填充', () => {
    const preview = buildExtrudePreview(
      SQUARE,
      XY_PLANE,
      [{ area: 1, outerEntityIds: [2] }],
      5,
      false,
    );
    expect(preview.lines).toHaveLength(4);
    expect(preview.quads).toHaveLength(1);
    expect(preview.selectionEdges).toHaveLength(1);
    expect(preview.fillLoops).toHaveLength(0);
    expect(preview.capLoops).toHaveLength(0);
    expect(preview.quads[0]![0]!.toJSON()).toEqual([2, 0, 0]);
    expect(buildExtrudePreview(SQUARE, XY_PLANE, [SQUARE_REGION], 0, false)).toEqual(EMPTY);
    expect(buildExtrudePreview(SQUARE, XY_PLANE, [], 5, false)).toEqual(EMPTY);
  });

  it('草图平面非 XY 时沿平面法向拉伸（Front 平面 → +Y）', () => {
    const front: SketchPlaneDto = {
      origin: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      xDir: { x: 1, y: 0, z: 0 },
    };
    const preview = buildExtrudePreview(SQUARE, front, [SQUARE_REGION], 3, false);
    expect(preview.lines[1]![0]!.toJSON()).toEqual([0, 3, 0]);
  });
});

describe('buildRevolvePreview', () => {
  const PROFILE: SketchEntityDto[] = [
    { kind: 'line', id: 1, p1: { x: 1, y: 0 }, p2: { x: 2, y: 0 } },
    { kind: 'line', id: 2, p1: { x: 0, y: 0 }, p2: { x: 0, y: 1 } },
  ];
  const OPEN_REGION: SketchRegionDto = { area: 1, outerEntityIds: [1] };

  it('绕草图内竖直线全周旋转：48 段四边形，环形线稀疏', () => {
    const preview = buildRevolvePreview(PROFILE, XY_PLANE, [OPEN_REGION], 2, Math.PI * 2);
    expect(preview.quads).toHaveLength(48);
    expect(preview.lines).toHaveLength(6); // 0 / 8 / 16 / 24 / 32 / 40（末环与首环重合已去）
    expect(preview.fillLoops).toHaveLength(0); // 开口线无闭合面 → 不伪造
    expect(preview.capLoops).toHaveLength(0); // 全周无端盖
    expect(preview.selectionEdges).toHaveLength(1);
    const step = Math.PI / 24;
    const corners = preview.quads[0]!;
    expect(corners[0]!.toJSON()).toEqual([1, 0, 0]);
    expect(corners[1]!.toJSON()).toEqual([2, 0, 0]);
    expect(corners[2]!.x).toBeCloseTo(2 * Math.cos(step), 9);
    expect(corners[2]!.z).toBeCloseTo(-2 * Math.sin(step), 9);
    expect(corners[3]!.x).toBeCloseTo(Math.cos(step), 9);
    expect(corners[3]!.z).toBeCloseTo(-Math.sin(step), 9);
  });

  it('部分角只生成对应弧段；无轴/零角度返回空', () => {
    const preview = buildRevolvePreview(PROFILE, XY_PLANE, [OPEN_REGION], 2, Math.PI / 2);
    expect(preview.quads).toHaveLength(12);
    expect(preview.lines).toHaveLength(3);
    expect(preview.fillLoops).toHaveLength(0);
    expect(preview.capLoops).toHaveLength(0);
    expect(buildRevolvePreview(PROFILE, XY_PLANE, [OPEN_REGION], undefined, Math.PI)).toEqual(EMPTY);
    expect(buildRevolvePreview(PROFILE, XY_PLANE, [OPEN_REGION], 2, 0)).toEqual(EMPTY);
  });

  it('闭合面域部分角旋转：橙色选中轮廓 + 终止面灰盖', () => {
    const AXIS_AND_SQUARE: SketchEntityDto[] = [
      ...SQUARE,
      { kind: 'line', id: 5, p1: { x: 0, y: 0 }, p2: { x: 0, y: 1 } },
    ];
    const preview = buildRevolvePreview(
      AXIS_AND_SQUARE,
      XY_PLANE,
      [SQUARE_REGION],
      5,
      Math.PI / 2,
    );
    expect(preview.fillLoops).toHaveLength(1);
    expect(preview.fillLoops[0]![0]!.isAlmostEqual(preview.fillLoops[0]!.at(-1)!, 1e-9)).toBe(false);
    expect(preview.capLoops).toHaveLength(1);
    expect(preview.quads).toHaveLength(48);
    expect(preview.selectionEdges).toHaveLength(4);
  });

  it('只旋转选中面域边界（轴实体不入预览）', () => {
    const preview = buildRevolvePreview(PROFILE, XY_PLANE, [{ area: 1, outerEntityIds: [2] }], 2, Math.PI * 2);
    expect(preview.quads).toHaveLength(0); // 轴自身无面域边界 → 零四边形
    expect(preview.lines).toHaveLength(0);
    expect(preview.fillLoops).toHaveLength(0);
    expect(preview.selectionEdges).toHaveLength(0);
  });
});
