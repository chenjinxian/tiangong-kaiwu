/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * 特征对话框的面/草图面域视图拾取（2026-11-02 Onshape live）：把草图面域的
 * 有序外环/孔环（shared v1.20）投影到屏幕，命中测试切换选中；同时给每个面域
 * 一个保证命中的屏幕点（演示/e2e 真实点击）。
 */
import type { ScreenViewport } from '@itwin/core-frontend';
import type { SketchPlaneDto, SketchRegionDto } from '@luban-cad/shared';
import { sketchPlaneFrameFrom } from '../tools/sketch/sketch-plane.js';
import { pointInPolygon, type ScreenPoint } from './plane-picker.js';

export interface ProfileSketch {
  id: string;
  label: string;
  plane?: SketchPlaneDto;
  regions: readonly SketchRegionDto[];
}

export interface ProfilePick {
  sketchId: string;
  regionIndex: number;
}

export interface RegionScreenLoops {
  outer: ScreenPoint[];
  holes: ScreenPoint[][];
}

function projectLoop(viewport: ScreenViewport, plane: SketchPlaneDto | undefined, loop: readonly { x: number; y: number }[]): ScreenPoint[] {
  const frame = sketchPlaneFrameFrom(plane);
  return loop.map((p) => {
    const world = frame.toWorld({ u: p.x, v: p.y });
    const v = viewport.worldToView(world);
    return { x: v.x, y: v.y };
  });
}

export function projectRegion(viewport: ScreenViewport, sketch: ProfileSketch, region: SketchRegionDto): RegionScreenLoops | undefined {
  if (!region.outerBoundary || region.outerBoundary.length < 3) return undefined;
  return {
    outer: projectLoop(viewport, sketch.plane, region.outerBoundary),
    holes: (region.holeBoundaries ?? []).map((loop) => projectLoop(viewport, sketch.plane, loop)),
  };
}

export function pointInRegion(point: ScreenPoint, loops: RegionScreenLoops): boolean {
  if (!pointInPolygon(point, loops.outer)) return false;
  return !loops.holes.some((hole) => hole.length >= 3 && pointInPolygon(point, hole));
}

/** 命中面域；同屏重叠时取面积更小（更具体）者。 */
export function pickProfileAt(
  viewport: ScreenViewport,
  sketches: readonly ProfileSketch[],
  point: ScreenPoint,
): ProfilePick | undefined {
  let best: { pick: ProfilePick; area: number } | undefined;
  for (const sketch of sketches) {
    sketch.regions.forEach((region, regionIndex) => {
      const loops = projectRegion(viewport, sketch, region);
      if (!loops || !pointInRegion(point, loops)) return;
      const area = region.area ?? 0;
      if (!best || area < best.area) best = { pick: { sketchId: sketch.id, regionIndex }, area };
    });
  }
  return best?.pick;
}

/** 每个面域一个保证命中自己的屏幕点（优先对话框/工具条之外的区域）。 */
export function profilePickPoints(
  viewport: ScreenViewport,
  sketches: readonly ProfileSketch[],
): Array<ProfilePick & ScreenPoint> {
  const rect = viewport.viewRect;
  const safe = (p: ScreenPoint): boolean => p.x > 340
    && p.x < rect.width - 100
    && p.y > 80
    && p.y < rect.height - 80;
  const result: Array<ProfilePick & ScreenPoint> = [];
  for (const sketch of sketches) {
    sketch.regions.forEach((region, regionIndex) => {
      const loops = projectRegion(viewport, sketch, region);
      if (!loops) return;
      const xs = loops.outer.map((p) => p.x);
      const ys = loops.outer.map((p) => p.y);
      const left = Math.min(...xs), right = Math.max(...xs);
      const top = Math.min(...ys), bottom = Math.max(...ys);
      let found: ScreenPoint | undefined;
      // 17×17 采样：细窄环带也能找到安全内部点；找不到就明确不产点，
      // 绝不把画布外兜底点交给演示/e2e 去点击（X-14）。
      const steps = 17;
      outer: for (let i = 1; i < steps; i++) {
        for (let j = 1; j < steps; j++) {
          const p = {
            x: left + ((right - left) * i) / steps,
            y: top + ((bottom - top) * j) / steps,
          };
          if (pointInRegion(p, loops) && safe(p)) {
            found = p;
            break outer;
          }
        }
      }
      if (found) result.push({ sketchId: sketch.id, regionIndex, ...found });
    });
  }
  return result;
}
