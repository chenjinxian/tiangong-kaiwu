/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图相机行为（M6-a 后补，2026-11-02；旧实现见 Git 历史
 * `f9bff06bce:luban-cad/apps/web/features/sketch/view/sketchModeView.ts`）：
 * - 进入草图：按真实 SketchPlaneDto 坐标架把视口旋转到平面法向（screen right =
 *   frame.xDir、screen up = frame.yDir），关透视相机；不把 `front` 直接映射到
 *   StandardViewId.Front——本模型 Front 帧 normal=+Y、yDir=-Z，标准 Front 矩阵
 *   是镜像的 Back 朝向。
 * - 退出草图：恢复进入前的旋转（透视时恢复 eye/center/up 位姿）。
 *
 * 无 viewport/2D 视图时 no-op；capture 只读，不改变现场。
 */
import { Matrix3d, Point3d, Range3d, Vector3d } from '@itwin/core-geometry';
import type { Viewport } from '@itwin/core-frontend';
import type { SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import { sketchPlaneFrameFrom } from '../tools/sketch/sketch-plane.js';

export interface SketchCameraSnapshot {
  rotation: Matrix3d;
  cameraOn: boolean;
  /** 正交相机取景（origin/extents 一并恢复，否则退出草图会停在草图缩放）。 */
  origin?: Point3d;
  extents?: Vector3d;
  eye?: Point3d;
  center?: Point3d;
  up?: Vector3d;
}

/** 程序化相机变更后通知订阅者（ViewCube 等）；core 的 setRotation/synch
 *  不保证触发 onViewChanged（2026-11-02 实测）。 */
function notifyViewChanged(viewport: Viewport): void {
  const event = (viewport as unknown as { onViewChanged?: { raiseEvent?: () => void } }).onViewChanged;
  if (event && typeof event.raiseEvent === 'function') event.raiseEvent();
}

/** 捕获进入草图前的视口相机（矩阵/点位均克隆，独立于后续变化）。 */
export function captureSketchCamera(viewport: Viewport | undefined): SketchCameraSnapshot | undefined {
  if (!viewport) return undefined;
  const view = viewport.view;
  // 结构测试的 partial 视口替身可能没有相机 API——无相机语义时 no-op。
  if (typeof view.getRotation !== 'function') return undefined;
  const rotation = view.getRotation();
  if (!rotation) return undefined;
  const snapshot: SketchCameraSnapshot = {
    rotation: rotation.clone(),
    cameraOn: false,
  };
  if (typeof view.getOrigin === 'function' && typeof view.getExtents === 'function') {
    snapshot.origin = view.getOrigin().clone();
    snapshot.extents = view.getExtents().clone();
  }
  if (typeof view.is3d === 'function' && view.is3d()) {
    snapshot.cameraOn = Boolean(view.isCameraOn);
    if (view.isCameraOn && typeof view.getEyePoint === 'function'
      && typeof view.getCenter === 'function') {
      snapshot.eye = view.getEyePoint().clone();
      snapshot.center = view.getCenter().clone();
      snapshot.up = rotation.rowY().clone();
    }
  }
  return snapshot;
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

/** 恢复进入草图前的相机（相机开 → lookAt 回放完整位姿；否则只回旋转）。 */
export function restoreSketchCamera(
  viewport: Viewport | undefined,
  snapshot: SketchCameraSnapshot | undefined,
): void {
  if (!viewport || !snapshot) return;
  const view = viewport.view;
  if (snapshot.cameraOn && typeof view.is3d === 'function' && view.is3d()
    && typeof view.lookAt === 'function' && snapshot.eye && snapshot.center && snapshot.up) {
    view.lookAt({
      eyePoint: snapshot.eye,
      targetPoint: snapshot.center,
      upVector: snapshot.up,
    });
  } else {
    if (typeof view.setRotation === 'function') view.setRotation(snapshot.rotation);
    if (snapshot.origin && typeof view.setOrigin === 'function') view.setOrigin(snapshot.origin);
    if (snapshot.extents && typeof view.setExtents === 'function') view.setExtents(snapshot.extents);
  }
  viewport.synchWithView?.({});
  notifyViewChanged(viewport);
}
