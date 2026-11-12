/**
 * ADR-0018 S1c：草图拖拽纯逻辑（屏幕→局部位移、实体平移、控制点/弧端点）。
 */
import { describe, expect, it } from 'vitest';
import type { SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import { applySketchDrag, screenDeltaToLocal } from '../internal/sketch-drag.js';

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

const LINE: SketchEntityDto[] = [
  { kind: 'point', id: 1, x: 0, y: 0 },
  { kind: 'point', id: 2, x: 10, y: 0 },
  { kind: 'line', id: 11, p1: 1, p2: 2 },
];

describe('applySketchDrag', () => {
  it('拖线本体：两端点一起平移（引用点实体）', () => {
    const next = applySketchDrag(LINE, { entityId: 11, part: 'curve' }, 2, 3) as Array<Record<string, unknown>>;
    const p1 = next.find((e) => e.id === 1)!;
    const p2 = next.find((e) => e.id === 2)!;
    expect([p1.x, p1.y]).toEqual([2, 3]);
    expect([p2.x, p2.y]).toEqual([12, 3]);
    // 入参不被修改。
    expect((LINE[0] as { x: number }).x).toBe(0);
  });

  it('拖线端点 handleIndex=1：只动 p2', () => {
    const next = applySketchDrag(LINE, { entityId: 11, part: 'handle', handleIndex: 1 }, 0, -4) as Array<Record<string, unknown>>;
    expect([next.find((e) => e.id === 1)!.x, next.find((e) => e.id === 1)!.y]).toEqual([0, 0]);
    expect([next.find((e) => e.id === 2)!.x, next.find((e) => e.id === 2)!.y]).toEqual([10, -4]);
  });

  it('拖共享点实体：引用它的线随动', () => {
    const next = applySketchDrag(LINE, { entityId: 1, part: 'handle', handleIndex: 0 }, 1, 1) as Array<Record<string, unknown>>;
    expect([next.find((e) => e.id === 1)!.x, next.find((e) => e.id === 1)!.y]).toEqual([1, 1]);
    expect(next.find((e) => e.id === 11)).toBeDefined();
  });

  it('圆：拖圆心移动；样条控制点索引', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'circle', id: 1, center: { x: 0, y: 0 }, radius: 5 },
      { kind: 'spline', id: 2, fitPoints: [], controlPoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }, { x: 3, y: 1 }] },
    ];
    const circle = applySketchDrag(entities, { entityId: 1, part: 'curve' }, 2, -1) as Array<Record<string, unknown>>;
    expect(circle[0]!.center).toEqual({ x: 2, y: -1 });
    const spline = applySketchDrag(entities, { entityId: 2, part: 'handle', handleIndex: 2 }, 0, 2) as Array<Record<string, unknown>>;
    expect((spline[1]!.controlPoints as Array<{ x: number; y: number }>)[2]).toEqual({ x: 2, y: 2 });
    expect((spline[1]!.controlPoints as Array<{ x: number; y: number }>)[1]).toEqual({ x: 1, y: 1 });
  });

  it('圆弧终点拖动改扫角（圆心/半径不动）', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'arc', id: 1, center: { x: 0, y: 0 }, radius: 1, startAngle: 0, sweepAngle: Math.PI / 2 },
    ];
    // 终点 (0,1) 拖到 (1,1)：角度 45°，扫角 45°。
    const next = applySketchDrag(entities, { entityId: 1, part: 'handle', handleIndex: 3 }, 1, 0) as Array<Record<string, unknown>>;
    expect(next[0]!.radius).toBe(1);
    expect(next[0]!.center).toEqual({ x: 0, y: 0 });
    expect(next[0]!.sweepAngle).toBeCloseTo(Math.PI / 4, 6);
  });

  it('目标不存在 → 原样克隆', () => {
    const next = applySketchDrag(LINE, { entityId: 999, part: 'curve' }, 5, 5);
    expect(next).toEqual(LINE);
  });
});

describe('screenDeltaToLocal', () => {
  const viewport = {
    worldToView: (p: { x: number; y: number; z?: number }) => ({ x: p.x * 10, y: p.y * 10 }),
  } as never;

  it('XY 平面：屏幕 (20,0) → 局部 (2,0)', () => {
    expect(screenDeltaToLocal(viewport, XY_PLANE, 20, 0)).toEqual({ du: 2, dv: 0 });
    expect(screenDeltaToLocal(viewport, XY_PLANE, 0, 30)).toEqual({ du: 0, dv: 3 });
  });

  it('退化投影（轴共线）→ null', () => {
    const degenerate = { worldToView: () => ({ x: 0, y: 0 }) } as never;
    expect(screenDeltaToLocal(degenerate, XY_PLANE, 5, 5)).toBeNull();
  });
});
