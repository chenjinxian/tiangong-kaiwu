/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图相机生命周期（2026-11-02）：进入草图捕获快照并按 SketchPlaneDto 定向；
 * 平面晚到/切换时重定向；退出草图恢复进入前相机。只在 plan-studio Session
 * 单点挂载（与 viewport 同层），无 viewport 时 no-op。
 */
import { useEffect, useRef } from 'react';
import type { Viewport } from '@itwin/core-frontend';
import type { SketchDto, SketchPlaneDto } from '@luban-cad/shared';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import {
  captureSketchCamera,
  fitCameraToSketch,
  orientCameraToSketchPlane,
  restoreSketchCamera,
  type SketchCameraSnapshot,
} from '../canvas/sketch-camera.js';

const planeKey = (plane: SketchPlaneDto | null | undefined): string => plane
  ? `${plane.origin.x},${plane.origin.y},${plane.origin.z};${plane.normal.x},${plane.normal.y},${plane.normal.z};${plane.xDir.x},${plane.xDir.y},${plane.xDir.z}`
  : 'default';

export function useSketchCamera(
  viewport: Viewport | null | undefined,
  activeSketch?: SketchDto,
): void {
  const isActive = usePartStudioStore((s) => s.sketch.isActive);
  const activeSketchId = usePartStudioStore((s) => s.sketch.activeSketchId);
  const activePlane = usePartStudioStore((s) => s.sketch.activeSketchPlane);
  const snapshotRef = useRef<SketchCameraSnapshot | null>(null);
  const planeKeyRef = useRef<string | null>(null);
  // 每次进入/切平面只取景一次；后续编辑不抢相机（避免画到一半镜头跳）。
  const fittedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!viewport) return;
    if (isActive) {
      if (!snapshotRef.current)
        snapshotRef.current = captureSketchCamera(viewport) ?? null;
      const key = planeKey(activePlane);
      if (planeKeyRef.current !== key) {
        orientCameraToSketchPlane(viewport, activePlane);
        planeKeyRef.current = key;
        fittedKeyRef.current = null;
      }
      // 首次读到活动草图时决定是否取景：已有实体（编辑既有草图）→ fit；空草图
      // （新建）→ 只定向不 fit，且标记完成——之后用户画的实体不得抢相机。
      if (activeSketch && activeSketch.id === activeSketchId && fittedKeyRef.current !== key) {
        if (activeSketch.entities.length > 0)
          fitCameraToSketch(viewport, activePlane ?? activeSketch.plane, activeSketch.entities);
        fittedKeyRef.current = key;
      }
      return;
    }
    if (snapshotRef.current) {
      restoreSketchCamera(viewport, snapshotRef.current);
      snapshotRef.current = null;
      planeKeyRef.current = null;
      fittedKeyRef.current = null;
    }
  }, [viewport, isActive, activeSketchId, activePlane, activeSketch]);
}
