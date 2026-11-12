/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 脚本工具共用：屏幕点（view 坐标）→ 草图局部 (u,v)。
 * 相机 NPC 射线与草图平面求交（Trim/Extend 等点击局部点的工具共用一份，
 * 避免每个工具复制投影几何）。
 */
import type { ScreenViewport } from '@itwin/core-frontend';
import { Plane3dByOriginAndUnitNormal, Ray3d, Vector3d } from '@itwin/core-geometry';
import type { SketchPlaneDto } from '@luban-cad/shared';
import { sketchPlaneFrameFrom } from '../tools/sketch/sketch-plane.js';

export function screenToSketchLocal(
  viewport: ScreenViewport,
  planeDto: SketchPlaneDto | undefined,
  point: { x: number; y: number },
): { u: number; v: number } | undefined {
  const rect = viewport.viewRect;
  if (!rect || rect.width <= 0 || rect.height <= 0)
    return undefined;
  const npcX = (point.x - rect.left) / rect.width;
  const npcY = (point.y - rect.top) / rect.height;
  const near = viewport.npcToWorld({ x: npcX, y: npcY, z: 0 });
  const far = viewport.npcToWorld({ x: npcX, y: npcY, z: 1 });
  const frame = sketchPlaneFrameFrom(planeDto);
  const plane = Plane3dByOriginAndUnitNormal.create(frame.origin, frame.normal);
  if (!plane)
    return undefined;
  const ray = Ray3d.create(near, Vector3d.createStartEnd(near, far));
  const fraction = ray.intersectionWithPlane(plane);
  if (fraction === undefined)
    return undefined;
  const local = frame.toLocal(ray.fractionToPoint(fraction));
  return Number.isFinite(local.u) && Number.isFinite(local.v) ? local : undefined;
}
