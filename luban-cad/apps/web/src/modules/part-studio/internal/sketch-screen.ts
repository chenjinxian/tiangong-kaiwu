/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 脚本工具共用：屏幕点（view 坐标）→ 草图局部 (u,v)。
 * 相机 NPC 射线与草图平面求交（Trim/Extend 等点击局部点的工具共用一份，
 * 避免每个工具复制投影几何）。
 */
import type { ScreenViewport } from '@itwin/core-frontend';
import { Plane3dByOriginAndUnitNormal, Point3d, Ray3d, Vector3d } from '@itwin/core-geometry';
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
  // 官方 view→NPC 转换（NPC 原点左下、y 向上；手工把 view y 当 NPC 会上下镜像）。
  const npc = viewport.viewToNpc(Point3d.create(point.x, point.y, 0));
  const near = viewport.npcToWorld({ x: npc.x, y: npc.y, z: 0 });
  const far = viewport.npcToWorld({ x: npc.x, y: npc.y, z: 1 });
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
