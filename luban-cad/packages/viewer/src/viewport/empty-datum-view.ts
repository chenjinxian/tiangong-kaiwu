/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 空 Part Studio 默认取景（2026-11-12 Onshape 对齐）：模型没有任何几何范围时，
 * 不再停在 baseline 视图（target 在 projectExtents 中心，原点偏下、基准面被裁），
 * 而是按 Onshape Home 朝向把三基准面立方取景——原点居中、三面留边可见。
 *
 * 单一事实源：朝向与范围来自 `@luban-cad/shared` 的 RENDER_DEFAULTS；视图仍是
 * 标准 ViewState（旋转 + lookAtVolume），不引入第二套相机状态。
 */

import { RENDER_DEFAULTS } from '@luban-cad/shared';
import type { ScreenViewport } from '@itwin/core-frontend';
import { Point3d, Range3d, Vector3d } from '@itwin/core-geometry';
import { datumPlaneHalfSize } from './decorations/datum-planes-decoration.js';

/** 三基准面并集（以原点为中心的立方体；面是立方体的三个中截面）。 */
export function datumPlanesRange(halfSize: number): Range3d {
  return Range3d.create(
    Point3d.create(-halfSize, -halfSize, -halfSize),
    Point3d.create(halfSize, halfSize, halfSize),
  );
}

/** Onshape Home 眼点方向（从 target 指向相机；方位角自 -Y 向 +X）。 */
export function defaultHomeEyeDirection(): Vector3d {
  const { azimuthDeg, elevationDeg } = RENDER_DEFAULTS.defaultViewOrientation;
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  const cosEl = Math.cos(el);
  return Vector3d.create(
    Math.sin(az) * cosEl,
    -Math.cos(az) * cosEl,
    Math.sin(el),
  )!;
}

interface OrbitableView {
  is3d?: () => boolean;
  isCameraOn?: boolean;
  lookAt?: (args: {
    eyePoint: Point3d;
    targetPoint: Point3d;
    upVector: Vector3d;
  }) => unknown;
  turnCameraOff?: () => void;
  lookAtVolume?: (volume: Range3d, aspect?: number, options?: unknown) => unknown;
}

/**
 * 把当前视图改为 Onshape Home 视角并取景三基准面。
 * @returns true = 已写入相机；false = 视图不支持（2D/缺 API）。
 */
export function lookAtDatumPlanes(viewport: ScreenViewport): boolean {
  const view = viewport.view as unknown as OrbitableView;
  if (view.is3d?.() !== true || typeof view.lookAt !== 'function' || typeof view.lookAtVolume !== 'function')
    return false;

  const halfSize = datumPlaneHalfSize(viewport);
  const eyeDir = defaultHomeEyeDirection();
  const eyeDistance = halfSize * 4;
  const eyePoint = Point3d.create(
    eyeDir.x * eyeDistance,
    eyeDir.y * eyeDistance,
    eyeDir.z * eyeDistance,
  );

  const wasCameraOn = view.isCameraOn === true;
  const status = view.lookAt({
    eyePoint,
    targetPoint: Point3d.createZero(),
    upVector: Vector3d.unitZ(),
  });
  // ViewStatus.Success === 0；失败时保留原视角（不写半套相机）。
  if (typeof status === 'number' && status !== 0)
    return false;
  // lookAt 会以透视姿态建立视角；默认正交显示设置下恢复正交（尊重用户已开透视）。
  if (!wasCameraOn && typeof view.turnCameraOff === 'function')
    view.turnCameraOff();

  const aspect = viewport.viewRect?.aspect;
  // 5% 留白：live 空 Part Studio 的基准面轮廓约占视口高度 75%（Offsets 像素对拍）。
  view.lookAtVolume(datumPlanesRange(halfSize), aspect && aspect > 0 ? aspect : 1, {
    paddingPercent: 0.05,
  });
  viewport.synchWithView({});
  return true;
}
