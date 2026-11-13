/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图相机**显式**命令（2026-11-13 Onshape live 修订）：
 * - 进入/退出草图不改相机（不定向、不自动取景、不快照回放）——live 证据
 *   `ui-evidence/sketch-camera-fit-20261113`：选平面后相机保持原样；
 * - 保留两个显式入口：「正视草图平面」（orientCameraToSketchPlane）与草图
 *   实体右键「缩放到合适大小」（fitCameraToSketch，仅该显式动作按实体范围）；
 * - 全局「缩放到合适大小」走可见内容取景（viewer fitViewToVisibleContent）。
 *
 * 不把 `front` 直接映射到 StandardViewId.Front——本模型 Front 帧 normal=+Y、
 * yDir=-Z，标准 Front 矩阵是镜像的 Back 朝向。无 viewport/2D 视图时 no-op。
 */
import { Matrix3d, Point3d, Range3d } from '@itwin/core-geometry';
import type { Viewport } from '@itwin/core-frontend';
import type { SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import { sketchPlaneFrameFrom } from '../tools/sketch/sketch-plane.js';

/** 程序化相机变更后通知订阅者（ViewCube 等）；core 的 setRotation/synch
 *  不保证触发 onViewChanged（2026-11-02 实测）。 */
function notifyViewChanged(viewport: Viewport): void {
  const event = (viewport as unknown as { onViewChanged?: { raiseEvent?: () => void } }).onViewChanged;
  if (event && typeof event.raiseEvent === 'function') event.raiseEvent();
}

/**
 * 草图实体的 2D 包围盒 → 世界范围（用于进入草图的取景）。
 * 解析 line/point/circle/arc/spline 的内联与点引用坐标；未解算实体忽略。
 * 无坐标返回 undefined（空草图/未加载）。
 */
export function sketchWorldRange(
  plane: SketchPlaneDto | null | undefined,
  entities: readonly SketchEntityDto[],
): Range3d | undefined {
  const points = new Map<number, { u: number; v: number }>();
  for (const e of entities) {
    if (e.kind === 'point' && e.x !== undefined && e.y !== undefined)
      points.set(e.id, { u: e.x, v: e.y });
  }
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  const add = (u: number, v: number): void => {
    if (!Number.isFinite(u) || !Number.isFinite(v)) return;
    uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
  };
  const resolve = (ref: number | { x: number; y: number }): { u: number; v: number } | undefined =>
    typeof ref === 'number' ? points.get(ref) : { u: ref.x, v: ref.y };
  const addCenterRadius = (ref: number | { x: number; y: number }, radius?: number): void => {
    const c = resolve(ref);
    if (!c) return;
    const r = radius !== undefined && radius >= 0 ? radius : 0;
    add(c.u - r, c.v - r); add(c.u + r, c.v + r);
  };

  for (const e of entities) {
    switch (e.kind) {
      case 'point':
        if (e.x !== undefined && e.y !== undefined) add(e.x, e.y);
        break;
      case 'line': {
        const a = resolve(e.p1), b = resolve(e.p2);
        if (a) add(a.u, a.v);
        if (b) add(b.u, b.v);
        break;
      }
      case 'circle':
      case 'arc':
        addCenterRadius(e.center, e.radius);
        break;
      case 'spline':
        for (const p of e.controlPoints) add(p.x, p.y);
        for (const p of e.fitPoints ?? []) add(p.x, p.y);
        break;
    }
  }
  if (!Number.isFinite(uMin)) return undefined;

  const frame = sketchPlaneFrameFrom(plane);
  const origin = Point3d.create(frame.origin.x, frame.origin.y, frame.origin.z);
  const range = new Range3d();
  for (const u of [uMin, uMax]) {
    for (const v of [vMin, vMax]) {
      const p = origin.plusScaled(frame.xDir, u).plusScaled(frame.yDir, v);
      range.extendPoint(p);
    }
  }
  return range;
}

/**
 * 进入草图后按草图实体范围取景（Onshape 语义：整张草图可见）。
 * 左侧留更大 padding：草图面板覆盖画布左侧，内容右移避免被遮挡。
 * 返回 false = 暂无可用实体（保持当前取景）。
 */
export function fitCameraToSketch(
  viewport: Viewport | undefined,
  plane: SketchPlaneDto | null | undefined,
  entities: readonly SketchEntityDto[],
): boolean {
  if (!viewport || typeof viewport.view.lookAtVolume !== 'function') return false;
  const range = sketchWorldRange(plane, entities);
  if (!range) return false;
  viewport.view.lookAtVolume(range, viewport.viewRect.aspect, {
    paddingPercent: { left: 0.22, right: 0.05, top: 0.08, bottom: 0.08 },
  });
  viewport.synchWithView?.({});
  notifyViewChanged(viewport);
  return true;
}

/** 按草图平面法向定向（正交）；缺省平面 = XY@z=0（Top 向）。 */
export function orientCameraToSketchPlane(
  viewport: Viewport | undefined,
  plane?: SketchPlaneDto | null,
): void {
  if (!viewport) return;
  const view = viewport.view;
  if (typeof view.setRotation !== 'function') return;
  const frame = sketchPlaneFrameFrom(plane);
  const rotation = Matrix3d.createRows(frame.xDir, frame.yDir, frame.normal);
  view.setRotation(rotation);
  if (typeof view.is3d === 'function' && view.is3d() && typeof view.turnCameraOff === 'function')
    view.turnCameraOff();
  viewport.synchWithView?.({});
  notifyViewChanged(viewport);
}
