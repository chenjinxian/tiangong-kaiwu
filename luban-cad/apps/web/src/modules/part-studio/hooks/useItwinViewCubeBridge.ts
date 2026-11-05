/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 官方 iTwin `CubeNavigationAid` ↔ 裸 `ScreenViewport` 事件桥（2026-11-05
 * 评估接入）。官方 cube 在 AppUI 里由 `ViewportComponent` 接管：
 *   cube --setCubeMatrix--> ViewportComponent --旋转 frustum--> viewport
 *   viewport --onViewChanged--> ViewportComponent --setViewMatrix--> cube
 * luban-cad 的视口是裸 `ScreenViewport`（无 ViewportComponent），因此在应用层
 * 原样移植这两条官方链路（`@itwin/imodel-components-react` ViewportComponent
 * 的 getRotatePoint / handleCubeRotationChangeEvent / handleViewChanged）。
 *
 * 只做接线，不改 cube 内部行为；官方 component 负责普通/角视图命中、拖拽、
 * ±90° 箭头、吸附和 0.4s 轴角插值动画。
 */
import * as React from 'react';
import { NpcCenter } from '@itwin/core-common';
import { Transform, type Point3d } from '@itwin/core-geometry';
import {
  IModelApp,
  ToolSettings,
  type ScreenViewport,
  type Viewport,
} from '@itwin/core-frontend';
import {
  ViewportComponentEvents,
  type CubeRotationChangeEventArgs,
} from '@itwin/imodel-components-react';

export function useItwinViewCubeBridge(viewport?: ScreenViewport | null): void {
  // 官方 getRotatePoint 的目标点缓存：tentative point > 上次目标（仍在视口
  // 中心 50% 区域）> 最近可见几何 > view target/center。旋转中心不稳会让模型
  // 在连续点击时漂移，缓存语义与官方一致。
  const targetPointRef = React.useRef<Point3d | null>(null);

  React.useEffect(() => {
    if (!viewport
      || typeof viewport.view?.getRotation !== 'function'
      || typeof viewport.onViewChanged?.addListener !== 'function') {
      return;
    }
    targetPointRef.current = null;

    const getRotatePoint = (vp: ScreenViewport): Point3d => {
      const lastTargetPoint = targetPointRef.current;
      const tentativePoint = IModelApp.tentativePoint;
      if (tentativePoint.isActive) return tentativePoint.getPoint();

      if (null !== lastTargetPoint) {
        const testPt = vp.worldToView(lastTargetPoint);
        const viewRect = vp.viewRect.clone();
        viewRect.scaleAboutCenter(0.25, 0.25);
        if (viewRect.containsPoint(testPt)) return lastTargetPoint;
        targetPointRef.current = null;
      }

      const visiblePoint = vp.pickNearestVisibleGeometry(
        vp.npcToWorld(NpcCenter),
        vp.pixelsFromInches(ToolSettings.viewToolPickRadiusInches),
      );
      targetPointRef.current = visiblePoint ?? vp.view.getTargetPoint();
      return targetPointRef.current ?? vp.view.getCenter();
    };

    const handleCubeRotationChangeEvent = (args: CubeRotationChangeEventArgs): void => {
      if (viewport.rotation.isAlmostEqual(args.rotMatrix)) return;

      const inverse = args.rotMatrix.transpose(); // cube rotation is world→view
      const center = getRotatePoint(viewport);
      const targetMatrix = inverse.multiplyMatrixMatrix(viewport.view.getRotation());
      const worldTransform = Transform.createFixedPointAndMatrix(center, targetMatrix);
      const frustum = viewport.getWorldFrustum();
      frustum.multiply(worldTransform);
      viewport.view.setupFromFrustum(frustum);
      viewport.synchWithView({ noSaveInUndo: !args.complete });
    };

    const handleViewChanged = (vp: Viewport): void => {
      if (vp !== viewport) return;
      if (!vp.iModel.isOpen && !vp.iModel.isBlank) return;
      // 官方用 setTimeout 合并到下一轮事件循环，避免 cube 在自身动画期间被
      // 回写打断（cube 只在 animation===1 且非 dragging 时接受）。
      ViewportComponentEvents.setViewMatrix(vp);
    };

    ViewportComponentEvents.onCubeRotationChangeEvent.addListener(handleCubeRotationChangeEvent);
    viewport.onViewChanged.addListener(handleViewChanged);
    return () => {
      ViewportComponentEvents.onCubeRotationChangeEvent.removeListener(handleCubeRotationChangeEvent);
      viewport.onViewChanged.removeListener(handleViewChanged);
      targetPointRef.current = null;
    };
  }, [viewport]);
}
