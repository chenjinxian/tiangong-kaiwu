/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图状态读数：光标世界点订阅（2026-11-15 E4/S4b Onshape live）。
 *
 * 数据源 = iTwin 画布 `pointermove` + 既有 `sketch-pick.intersectViewRayWithPlane`
 * （光标射线 ∩ 活动草图平面）；局部点再经 `SketchPlaneFrame` 回世界（显式走
 * 平面坐标架，保证点落在草图平面上）。仅草图模式启用（enabled=false 时零
 * 监听、零状态）。
 *
 * 性能口径（不做全局状态机、不进 zustand）：
 * - pointermove 只记最新视口坐标，`requestAnimationFrame` 合帧；
 * - 与上一次 3 位小数显示值相同的点不 setState（光标亚微米移动不触发重渲染）；
 * - 指针离开画布/取消/禁用/卸载即清空读数。
 */

import * as React from 'react';
import type { ScreenViewport } from '@itwin/core-frontend';
import type { SketchPlaneDto } from '@luban-cad/shared';
import { intersectViewRayWithPlane } from '../tools/sketch/sketch-pick.js';
import { sketchPlaneFrameFrom } from '../tools/sketch/sketch-plane.js';
import { formatStatusNumber, type SketchStatusPoint } from '../internal/sketch-status.js';

interface ViewPoint {
  x: number;
  y: number;
}

function statusKey(point: SketchStatusPoint): string {
  return `${formatStatusNumber(point.x)}|${formatStatusNumber(point.y)}|${formatStatusNumber(point.z)}`;
}

export function useSketchCursorPoint(
  viewport: ScreenViewport | null | undefined,
  plane: SketchPlaneDto | null | undefined,
  enabled: boolean,
): SketchStatusPoint | null {
  const [point, setPoint] = React.useState<SketchStatusPoint | null>(null);
  const frame = React.useMemo(() => sketchPlaneFrameFrom(plane), [plane]);

  React.useEffect(() => {
    if (!enabled || !viewport || !viewport.canvas) {
      setPoint(null);
      return;
    }
    const canvas = viewport.canvas;
    let raf = 0;
    let pendingView: ViewPoint | null = null;
    let lastKey: string | null = null;

    const clearIfSet = (): void => {
      if (lastKey === null)
        return;
      lastKey = null;
      setPoint(null);
    };

    const flush = (): void => {
      raf = 0;
      const view = pendingView;
      pendingView = null;
      if (!view)
        return;
      const hit = intersectViewRayWithPlane(viewport, view, frame.origin, frame.normal);
      if (!hit) {
        // 视线与草图平面平行（edge-on）：无法给出诚实坐标，清空而非保留旧值。
        clearIfSet();
        return;
      }
      // 草图局部 → 世界（与绘制工具/装饰同一坐标架）。
      const world = frame.toWorld(frame.toLocal(hit));
      if (!Number.isFinite(world.x) || !Number.isFinite(world.y) || !Number.isFinite(world.z)) {
        clearIfSet();
        return;
      }
      // iTwin 世界坐标为米；读数固定 mm。
      const next: SketchStatusPoint = { x: world.x * 1000, y: world.y * 1000, z: world.z * 1000 };
      const key = statusKey(next);
      if (key === lastKey)
        return;
      lastKey = key;
      setPoint(next);
    };

    const onMove = (event: PointerEvent): void => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height)
        return;
      pendingView = { x, y };
      if (raf === 0)
        raf = window.requestAnimationFrame(flush);
    };

    const clear = (): void => {
      pendingView = null;
      if (raf !== 0) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
      lastKey = null;
      setPoint(null);
    };

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', clear);
    canvas.addEventListener('pointercancel', clear);
    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', clear);
      canvas.removeEventListener('pointercancel', clear);
      if (raf !== 0)
        window.cancelAnimationFrame(raf);
    };
  }, [enabled, viewport, frame]);

  return point;
}
