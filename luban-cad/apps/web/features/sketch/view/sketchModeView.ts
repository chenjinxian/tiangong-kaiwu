/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * 草图模式视口行为（M3-b T6.5）：进入草图 → 俯视对齐（XY 平面）+ 栅格强制开；
 * 退出 → 视角/栅格原样恢复。
 *
 * - 俯视对齐沿用 ViewCube 同款机制（setStandardRotation(StandardViewId.Top) + 3d 正交化
 *   + synchWithView）——保持视图中心/比例，只改朝向（Onshape 草图态惯例）。
 * - 视角快照 = 旋转矩阵 + 相机位姿（透视时补 eye/center/up）。退出恢复：相机开 →
 *   lookAt 回放（透视位姿完整回环）；否则 setRotation 回放（正交视图的 origin/delta
 *   不动，中心/比例天然保持）。
 * - 栅格「还原到进入前的值」而非强制关：进入前开着的栅格退出后仍开
 *   （setGridDisplayed 返回前值即恢复依据）。
 */

import { Matrix3d, Point3d, Vector3d } from '@itwin/core-geometry';
import { StandardViewId, type Viewport } from '@itwin/core-frontend';

/** 进入草图模式时的视角快照（退出恢复用） */
export interface SketchViewSnapshot {
  /** 视图旋转矩阵（世界 → 视图） */
  rotation: Matrix3d;
  /** 进入前是否透视相机 */
  cameraOn: boolean;
  /** 透视相机眼点（cameraOn 时存在） */
  eye?: Point3d;
  /** 视图中心（cameraOn 时存在，lookAt 的 targetPoint） */
  center?: Point3d;
  /** 视图上方向（cameraOn 时存在；= 旋转矩阵 rowY） */
  up?: Vector3d;
}

/** 捕获当前视角快照（进入草图模式前调用；矩阵/点位均克隆，独立于后续视口变化） */
export function captureSketchView(viewport: Viewport): SketchViewSnapshot {
  const view = viewport.view;
  const rotation = view.getRotation();
  const snapshot: SketchViewSnapshot = {
    rotation: rotation.clone(),
    cameraOn: false,
  };
  // isCameraOn 仅 ViewState3d 提供（2d 视图无相机概念）——3d 才读取/补位姿
  if (view.is3d()) {
    snapshot.cameraOn = view.isCameraOn;
    if (view.isCameraOn) {
      snapshot.eye = view.getEyePoint().clone();
      snapshot.center = view.getCenter().clone();
      snapshot.up = rotation.rowY().clone();
    }
  }
  return snapshot;
}

/** 俯视对齐（XY 平面）+ 3d 正交化（ViewCube 同机制，中心/比例保持） */
export function applySketchTopView(viewport: Viewport): void {
  viewport.setStandardRotation(StandardViewId.Top);
  const view = viewport.view;
  if (view.is3d()) {
    view.turnCameraOff();
  }
  viewport.synchWithView({});
}

/** 恢复快照：相机开 → lookAt 回放 eye/center/up；否则 setRotation 回放 */
export function restoreSketchView(viewport: Viewport, snapshot: SketchViewSnapshot): void {
  const view = viewport.view;
  if (snapshot.cameraOn && view.is3d() && snapshot.eye && snapshot.center && snapshot.up) {
    view.lookAt({
      eyePoint: snapshot.eye,
      targetPoint: snapshot.center,
      upVector: snapshot.up,
    });
  } else {
    view.setRotation(snapshot.rotation);
  }
  viewport.synchWithView({});
}

/**
 * 设置栅格显示；返回设置前的栅格状态。状态未变不触发重绘。
 * 调用方在「进入」时记录返回值、「退出」时按记录值还原（还原而非强制关）。
 */
export function setGridDisplayed(viewport: Viewport, on: boolean): boolean {
  const wasOn = viewport.viewFlags.grid;
  if (wasOn !== on) {
    viewport.viewFlags = viewport.viewFlags.with('grid', on);
    viewport.invalidateScene();
  }
  return wasOn;
}
