/**
 * 单线 imprint 面切分候选搜索（ADR-0006 D2）纯函数单测。
 *
 * 覆盖材料侧切分、面外凹口（void）、线段不在面附近、面法向反向时侧向仍按
 * 草图坐标系解释（keepPoint 由 resolver 负责消歧）。
 */
import { expect, test } from '@playwright/test';
import {
  findSplitFaceCandidates,
  frameOf,
  sketchLineWorld,
  type SplitFaceHandle,
} from './imprint-split-resolver.js';
import type { SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';

const yZeroPlane: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: -1, z: 0 },
  xDir: { x: 1, y: 0, z: 0 },
};

function lineFace(
  bodyKey: string,
  subEntityId: number,
  normal: [number, number, number],
  points: ReadonlyArray<readonly [number, number]>,
): SplitFaceHandle {
  return {
    bodyKey,
    subEntityId,
    normal,
    range: { low: [0, 0, 0], high: [1, 1, 1] },
    loops: [points.map((point, index) => {
      const next = points[(index + 1) % points.length]!;
      return { kind: 'line' as const, p0: [point[0], 0, point[1]] as [number, number, number], p1: [next[0], 0, next[1]] as [number, number, number] };
    })],
  };
}

function lineEntity(id: number, p1: [number, number], p2: [number, number]): SketchEntityDto[] {
  return [
    { kind: 'point', id: 100 + id, x: p1[0], y: p1[1] },
    { kind: 'point', id: 200 + id, x: p2[0], y: p2[1] },
    { kind: 'line', id, p1: 100 + id, p2: 200 + id },
  ];
}

test.describe('imprint split resolver（D2）', () => {
  test('面内对角线 → material 候选；右侧/左侧面积正', () => {
    const frame = frameOf(yZeroPlane)!;
    const face = lineFace('body', 1, [0, 1, 0], [[0, 0], [20, 0], [20, 20], [0, 20]]);
    const candidates = findSplitFaceCandidates(
      [face], frame, { x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 20 }, 1, 'body',
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.mode).toBe('material');
    expect(candidates[0]!.keepSide).toBe('left');
    expect(candidates[0]!.leftArea).toBeCloseTo(200, 6);
    expect(candidates[0]!.rightArea).toBeCloseTo(200, 6);
  });

  test('面外凹口线 → void 候选（L 形面 + 线两端在边界）', () => {
    const frame = frameOf(yZeroPlane)!;
    const face = lineFace('body', 2, [0, 1, 0], [[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]]);
    const candidates = findSplitFaceCandidates(
      [face], frame, { x: 20, y: 0, z: 10 }, { x: 10, y: 0, z: 20 }, 1, 'body',
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.mode).toBe('void');
    expect(candidates[0]!.keepSide).toBe('left');
  });

  test('线段远离面 → 无候选；错误 bodyKey → 无候选', () => {
    const frame = frameOf(yZeroPlane)!;
    const face = lineFace('body', 3, [0, 1, 0], [[0, 0], [20, 0], [20, 20], [0, 20]]);
    expect(findSplitFaceCandidates(
      [face], frame, { x: 100, y: 0, z: 100 }, { x: 110, y: 0, z: 110 }, 1, 'body',
    )).toHaveLength(0);
    expect(findSplitFaceCandidates(
      [face], frame, { x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 20 }, 1, 'other',
    )).toHaveLength(0);
  });

  test('面法向反向不翻转草图侧向（keepPoint 在 resolver 侧换算）', () => {
    const frame = frameOf(yZeroPlane)!;
    const face = lineFace('body', 4, [0, -1, 0], [[0, 0], [20, 0], [20, 20], [0, 20]]);
    const candidates = findSplitFaceCandidates(
      [face], frame, { x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 20 }, 1, 'body',
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.keepSide).toBe('left');
  });

  test('sketchLineWorld：指向点实体 + 平面框架 → 世界端点', () => {
    const line = sketchLineWorld(yZeroPlane, lineEntity(1, [10, 20], [30, 40]), 1);
    expect(line).toEqual({
      start: { x: 10, y: 0, z: 20 },
      end: { x: 30, y: 0, z: 40 },
    });
    expect(sketchLineWorld(yZeroPlane, lineEntity(1, [10, 20], [30, 40]), 999)).toBeUndefined();
  });
});
