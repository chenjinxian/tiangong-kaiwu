/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图取点（2026-11-13 真栈修复）：光标 → 草图平面局部 (u,v)。
 *
 * 背景：草图进入不再自动把相机转为正视平面（Onshape parity，2026-11-13），
 * 此时 `BeButtonEvent.point` 是按视口光标深度面（缺省 XY@z=0）求得的**世界
 * 点，不落在草图平面**（Front 平面 + ISO 相机实测：v 恒 0 → 矩形/圆弧全部
 * 退化）。取点必须先由视口光标构造世界射线，与草图平面解析求交，再投影为
 * 局部坐标：
 *
 * - AccuSnap 热捕捉优先（吸附点来自草图几何，本就在平面上；端点精确并列）；
 * - 否则 viewToNpc(z=0/1) → npcToWorld 两端点构造射线 → 与平面求交；
 * - 视口缺失/射线与平面平行/无效数值 → 回退旧的 `ev.point` 投影（不崩死，
 *   与退化平面架缺省回退同口径）。
 *
 * 复用：SketchCreateTool / SketchPointTool / SketchAddConstraintTool
 *（pickHitLocal）共用此一实现，禁止各工具私写取点。
 */

import { Point3d, Vector3d } from '@itwin/core-geometry';
import type { BeButtonEvent, Viewport } from '@itwin/core-frontend';
import { IModelApp } from '@itwin/core-frontend';
import type { SketchPlaneFrame, SketchPoint2 } from './sketch-plane.js';

/** 视口光标射线与平面求交（世界点）。平行/退化返回 undefined。 */
export function intersectViewRayWithPlane(
  vp: Pick<Viewport, 'viewToNpc' | 'npcToWorld'>,
  viewPoint: { x: number; y: number },
  planeOrigin: Point3d,
  planeNormal: Vector3d,
): Point3d | undefined {
  const near = vp.npcToWorld(vp.viewToNpc(Point3d.create(viewPoint.x, viewPoint.y, 0)));
  const far = vp.npcToWorld(vp.viewToNpc(Point3d.create(viewPoint.x, viewPoint.y, 1)));
  const dir = Vector3d.createStartEnd(near, far);
  const denom = dir.dotProduct(planeNormal);
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-12)
    return undefined;
  const t = Vector3d.createStartEnd(near, planeOrigin).dotProduct(planeNormal) / denom;
  if (!Number.isFinite(t))
    return undefined;
  return near.plusScaled(dir, t);
}

/** 光标事件 → 草图平面局部 (u,v)（热捕捉优先，其次射线-平面求交，最后回退）。 */
export function pickSketchPlaneLocal(ev: BeButtonEvent, plane: SketchPlaneFrame): SketchPoint2 {
  const snap = IModelApp.accuSnap?.getCurrSnapDetail();
  if (snap && snap.isHot)
    return plane.toLocal(snap.adjustedPoint);
  const vp = ev.viewport ?? IModelApp.viewManager?.getFirstOpenView();
  if (vp) {
    const hit = intersectViewRayWithPlane(vp, ev.viewPoint, plane.origin, plane.normal);
    if (hit)
      return plane.toLocal(hit);
  }
  return plane.toLocal(ev.point);
}
