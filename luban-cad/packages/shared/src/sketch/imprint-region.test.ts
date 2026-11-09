import { describe, expect, it } from 'vitest';
import type { SketchEntityDto, SketchRegionDto } from '../rpc/LubanFeatureRpcInterface.js';
import {
  imprintEdgeSideFromSign,
  pickImprintRegionByEdgeSide,
  resolveImprintEdgeGeometry,
  type ImprintEdgeGeometry,
} from './imprint-region.js';

const square = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
];

const edge: ImprintEdgeGeometry = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };

const region = (partial: Partial<SketchRegionDto> & Pick<SketchRegionDto, 'area' | 'outerEntityIds'>): SketchRegionDto => partial;

describe('imprintEdgeSideFromSign', () => {
  it('Onshape +1/−1 = 有向边左/右侧', () => {
    expect(imprintEdgeSideFromSign(1)).toBe('left');
    expect(imprintEdgeSideFromSign(-1)).toBe('right');
    expect(imprintEdgeSideFromSign(0)).toBeUndefined();
    expect(imprintEdgeSideFromSign(undefined)).toBeUndefined();
    expect(imprintEdgeSideFromSign(Number.NaN)).toBeUndefined();
  });
});

describe('pickImprintRegionByEdgeSide', () => {
  const upper = region({
    area: 100,
    outerEntityIds: [1],
    outerBoundary: square(0, 0, 10, 10),
  });
  const lower = region({
    area: 1000,
    outerEntityIds: [1],
    outerBoundary: square(0, -100, 10, 0),
  });

  it('按边侧而不是面积选面（+1 上侧小面，−1 下侧大面）', () => {
    expect(pickImprintRegionByEdgeSide([upper, lower], 1, edge, 'left')).toEqual({
      regionIndex: 0, basis: 'outer', area: 100,
    });
    expect(pickImprintRegionByEdgeSide([upper, lower], 1, edge, 'right')).toEqual({
      regionIndex: 1, basis: 'outer', area: 1000,
    });
  });

  it('孔边界：右侧为材料面，左侧（孔内）不猜', () => {
    const holed = region({
      area: 96,
      outerEntityIds: [10],
      holeEntityIds: [1],
      outerBoundary: square(0, 0, 10, 10),
      holeBoundaries: [square(4, 4, 6, 6)],
    });
    const holeEdge: ImprintEdgeGeometry = { start: { x: 4, y: 4 }, end: { x: 6, y: 4 } };
    expect(pickImprintRegionByEdgeSide([holed], 1, holeEdge, 'left')).toBeUndefined();
    expect(pickImprintRegionByEdgeSide([holed], 1, holeEdge, 'right')).toEqual({
      regionIndex: 0, basis: 'hole', area: 96,
    });
  });

  it('同侧多候选（边被分割）返回 undefined，不按面积猜', () => {
    const leftA = region({ area: 50, outerEntityIds: [1], outerBoundary: square(0, 0, 5, 10) });
    const leftB = region({ area: 50, outerEntityIds: [1], outerBoundary: square(5, 0, 10, 10) });
    expect(pickImprintRegionByEdgeSide([leftA, leftB], 1, edge, 'left')).toBeUndefined();
  });

  it('边界缺失/无邻接/空输入返回 undefined', () => {
    expect(pickImprintRegionByEdgeSide(undefined, 1, edge, 'left')).toBeUndefined();
    expect(pickImprintRegionByEdgeSide([region({ area: 1, outerEntityIds: [2] })], 1, edge, 'left')).toBeUndefined();
    expect(pickImprintRegionByEdgeSide([region({ area: 1, outerEntityIds: [1] })], 1, edge, 'left')).toBeUndefined();
  });
});

describe('resolveImprintEdgeGeometry', () => {
  const entities: SketchEntityDto[] = [
    { kind: 'point', id: 10, x: 0, y: 0 },
    { kind: 'point', id: 11, x: 10, y: 0 },
    { kind: 'line', id: 1, p1: 10, p2: 11 },
    { kind: 'line', id: 2, p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 } },
    { kind: 'arc', id: 3, center: { x: 0, y: 0 }, radius: 5, startAngle: 0, sweepAngle: Math.PI / 2 },
  ];

  it('解析 line 端点（数字 id 与内联坐标）', () => {
    expect(resolveImprintEdgeGeometry(entities, 1)).toEqual({
      start: { x: 0, y: 0 }, end: { x: 10, y: 0 },
    });
  });

  it('零长 line / spline / 不存在返回 undefined（不拿弦线冒充）', () => {
    expect(resolveImprintEdgeGeometry(entities, 2)).toBeUndefined();
    expect(resolveImprintEdgeGeometry(entities, 99)).toBeUndefined();
  });

  it('arc/circle 返回中点附近、与参数方向一致的小弦', () => {
    const arc = resolveImprintEdgeGeometry(entities, 3);
    expect(arc).toBeDefined();
    expect(Math.sqrt(arc!.start.x ** 2 + arc!.start.y ** 2)).toBeCloseTo(5, 6);
    expect(Math.sqrt(arc!.end.x ** 2 + arc!.end.y ** 2)).toBeCloseTo(5, 6);
    expect(arc!.end.y).toBeGreaterThan(arc!.start.y); // CCW（sweep +π/2 的中点切线）

    const circleEntity: SketchEntityDto = {
      kind: 'circle', id: 4, center: { x: 10, y: 10 }, radius: 4,
    };
    const circle = resolveImprintEdgeGeometry([circleEntity], 4);
    expect(circle).toBeDefined();
    const centerDistance = (p: { x: number; y: number }) => Math.sqrt((p.x - 10) ** 2 + (p.y - 10) ** 2);
    expect(centerDistance(circle!.start)).toBeCloseTo(4, 6);
    expect(centerDistance(circle!.end)).toBeCloseTo(4, 6);
    expect(circle!.end.y).toBeGreaterThan(circle!.start.y); // 整圆按 CCW
  });
});

describe('pickImprintRegionByEdgeSide（曲线边）', () => {
  it('圆孔边界：右侧为材料面，左侧（孔内）不猜', () => {
    const circlePolygon = (cx: number, cy: number, r: number) => {
      const points: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < 64; i++) {
        const a = (2 * Math.PI * i) / 64;
        points.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
      }
      return points;
    };
    const holed = region({
      area: 400 - Math.PI * 16,
      outerEntityIds: [10],
      holeEntityIds: [4],
      outerBoundary: square(0, 0, 20, 20),
      holeBoundaries: [circlePolygon(10, 10, 4)],
    });
    const circleEntity: SketchEntityDto = {
      kind: 'circle', id: 4, center: { x: 10, y: 10 }, radius: 4,
    };
    const circleEdge = resolveImprintEdgeGeometry([circleEntity], 4)!;
    expect(pickImprintRegionByEdgeSide([holed], 4, circleEdge, 'left')).toBeUndefined();
    expect(pickImprintRegionByEdgeSide([holed], 4, circleEdge, 'right')).toEqual({
      regionIndex: 0, basis: 'hole', area: 400 - Math.PI * 16,
    });
  });
});
