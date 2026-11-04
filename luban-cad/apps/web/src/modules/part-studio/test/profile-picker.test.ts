// src/modules/part-studio/test/profile-picker.test.ts
//
// 2026-11-02 Onshape live：拉伸/旋转对话框的「在视口中点击草图面域」拾取层。
// 纯函数验收：面域投影（外环/孔环）、命中（孔洞挖空、小面积优先）、每个面域
// 的保证命中屏幕点（避开左侧对话框安全区，且自命中）。真实鼠标事件链由
// tutorial2 e2e 覆盖。
import { describe, expect, it } from 'vitest';
import type { ScreenViewport } from '@itwin/core-frontend';
import type { SketchPlaneDto, SketchRegionDto } from '@luban-cad/shared';
import {
  pickProfileAt,
  pointInRegion,
  profilePickPoints,
  projectRegion,
  type ProfileSketch,
} from '../internal/profile-picker.js';

const TOP_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

/** 俯视 20px/mm 的伪视口：世界 (x,y,0) → 屏幕 (x*20+300, -y*20+300)。 */
const viewport = {
  viewRect: { width: 900, height: 650 },
  worldToView: (p: { x: number; y: number }) => ({ x: p.x * 20 + 300, y: -p.y * 20 + 300 }),
} as unknown as ScreenViewport;

function square(size: number, offset = 0): { x: number; y: number }[] {
  const end = offset + size;
  return [
    { x: offset, y: offset },
    { x: end, y: offset },
    { x: end, y: end },
    { x: offset, y: end },
  ];
}

const sketch: ProfileSketch = {
  id: 'sk-1',
  label: '草图 1',
  plane: TOP_PLANE,
  regions: [{
    area: 100,
    outerEntityIds: [1],
    outerBoundary: square(10),
    holeBoundaries: [[
      { x: 2, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 8 }, { x: 2, y: 8 },
    ]],
  }],
};

describe('特征对话框面域视口拾取（Onshape live）', () => {
  it('projectRegion：外环/孔环按草图平面投影到屏幕', () => {
    const loops = projectRegion(viewport, sketch, sketch.regions[0]!);
    expect(loops?.outer).toEqual([
      { x: 300, y: 300 },
      { x: 500, y: 300 },
      { x: 500, y: 100 },
      { x: 300, y: 100 },
    ]);
    expect(loops?.holes[0]).toHaveLength(4);
  });

  it('命中：孔洞内不算面域；环带内命中', () => {
    const region = sketch.regions[0]!;
    const loops = projectRegion(viewport, sketch, region)!;
    const world = (x: number, y: number) => ({ x: x * 20 + 300, y: -y * 20 + 300 });
    expect(pointInRegion(world(1, 1), loops)).toBe(true);
    expect(pointInRegion(world(5, 5), loops)).toBe(false); // 孔洞
    expect(pointInRegion(world(11, 11), loops)).toBe(false); // 外
    expect(pickProfileAt(viewport, [sketch], world(1, 1))).toEqual({ sketchId: 'sk-1', regionIndex: 0 });
    expect(pickProfileAt(viewport, [sketch], world(5, 5))).toBeUndefined();
  });

  it('重叠面域：取面积更小（更具体）者', () => {
    const big: ProfileSketch = {
      id: 'big',
      label: '大',
      plane: TOP_PLANE,
      regions: [{ area: 400, outerEntityIds: [1], outerBoundary: square(20) }],
    };
    const small: ProfileSketch = {
      id: 'small',
      label: '小',
      plane: TOP_PLANE,
      regions: [{ area: 4, outerEntityIds: [2], outerBoundary: square(2, 4) }],
    };
    // 世界 (5,5) = 小方框中心，同时在 0..20 大框内。
    const point = { x: 5 * 20 + 300, y: -5 * 20 + 300 };
    expect(pointInRegion(point, projectRegion(viewport, small, small.regions[0]!)!)).toBe(true);
    expect(pointInRegion(point, projectRegion(viewport, big, big.regions[0]!)!)).toBe(true);
    expect(pickProfileAt(viewport, [big, small], point)).toEqual({ sketchId: 'small', regionIndex: 0 });
  });

  it('profilePickPoints：每面域一个安全屏幕点，且该点回拾到自己', () => {
    const points = profilePickPoints(viewport, [sketch]);
    expect(points).toHaveLength(1);
    const point = points[0]!;
    expect(point.sketchId).toBe('sk-1');
    expect(point.regionIndex).toBe(0);
    // 避开左侧特征对话框（x>340）。
    expect(point.x).toBeGreaterThan(340);
    expect(pickProfileAt(viewport, [sketch], point)).toEqual({ sketchId: 'sk-1', regionIndex: 0 });
  });

  it('面域完全在安全区外 → 不返回兜底点（X-14）', () => {
    const offscreen: ProfileSketch = {
      ...sketch,
      regions: [{
        area: 100,
        outerEntityIds: [1],
        // 世界 x=1000 → 屏幕 x=20300，远在 900px 视口之外。
        outerBoundary: square(10, 1000),
      }],
    };
    expect(profilePickPoints(viewport, [offscreen])).toEqual([]);
  });

  it('面域在左侧对话框下方（x 不安全）→ 不产点', () => {
    const underDialog: ProfileSketch = {
      ...sketch,
      regions: [{
        area: 100,
        outerEntityIds: [1],
        // 世界 x=-16..-6 → 屏幕 -20..180，整块在左侧对话框下方；
        // 世界 y=-16..-6 → 屏幕 620..420，纵向可点，但 x 不安全 → 无点。
        outerBoundary: square(10, -16),
      }],
    };
    expect(profilePickPoints(viewport, [underDialog])).toEqual([]);
  });

  it('无 outerBoundary（旧后端/退化面域）→ 不投影、不可拾取、不产点', () => {
    const legacy: SketchRegionDto = { area: 1, outerEntityIds: [1] };
    const legacySketch: ProfileSketch = { ...sketch, regions: [legacy] };
    expect(projectRegion(viewport, legacySketch, legacy)).toBeUndefined();
    expect(pickProfileAt(viewport, [legacySketch], { x: 400, y: 200 })).toBeUndefined();
    expect(profilePickPoints(viewport, [legacySketch])).toEqual([]);
  });
});
