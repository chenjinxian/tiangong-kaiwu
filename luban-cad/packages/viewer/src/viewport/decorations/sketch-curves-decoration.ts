/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 非编辑态草图曲线叠加（2026-11-02 Onshape 视觉对齐）：屏幕空间灰色虚线，
 * 不做深度遮挡（Onshape 建模时草图曲线可穿透实体显示）。折线由调用方从
 * FeatureTreeEntry.params（v1.7 草图自带 entities+plane）采样成世界坐标。
 */
import {
  type DecorateContext,
  IModelApp,
  type ScreenViewport,
} from '@itwin/core-frontend';
import { Point3d } from '@itwin/core-geometry';

const SKETCH_CURVE_STYLE = 'rgba(150, 157, 164, 0.82)';
const SKETCH_CURVE_DASH = [5, 3];
/** 活动草图（编辑中）橙色实线（Onshape live：橙色描边、无虚线）。 */
const ACTIVE_SKETCH_STYLE = '#ff9f2f';

/** 一条草图曲线（sketchId 用于区分活动草图样式）。 */
export interface SketchCurveGeometry {
  points: readonly Point3d[];
  sketchId?: string;
}

export class SketchCurvesDecoration {
  private readonly _viewport: ScreenViewport;
  private _polylines: readonly SketchCurveGeometry[] = [];
  private _activeSketchId?: string;
  private readonly _removeListener?: () => void;

  public constructor(
    viewport: ScreenViewport,
    polylines: readonly SketchCurveGeometry[] = [],
    activeSketchId?: string,
  ) {
    this._viewport = viewport;
    this._polylines = polylines;
    this._activeSketchId = activeSketchId;
    this._removeListener = IModelApp.viewManager.addDecorator(this);
  }

  public setPolylines(polylines: readonly SketchCurveGeometry[], activeSketchId?: string): void {
    this._polylines = polylines;
    this._activeSketchId = activeSketchId;
    this._viewport.invalidateScene();
  }

  public dispose(): void {
    this._removeListener?.();
  }

  public decorate(context: DecorateContext): void {
    const vp = context.viewport;
    if (!vp.view.isSpatialView() || this._polylines.length === 0)
      return;

    context.addCanvasDecoration({
      drawDecoration: (ctx) => {
        for (const polyline of this._polylines) {
          if (polyline.points.length < 2)
            continue;
          const active = this._activeSketchId !== undefined && polyline.sketchId === this._activeSketchId;
          ctx.strokeStyle = active ? ACTIVE_SKETCH_STYLE : SKETCH_CURVE_STYLE;
          ctx.lineWidth = active ? 1.8 : 1.1;
          ctx.setLineDash(active ? [] : SKETCH_CURVE_DASH);
          ctx.beginPath();
          let started = false;
          for (const world of polyline.points) {
            const view = vp.worldToView(world);
            if (!Number.isFinite(view.x) || !Number.isFinite(view.y))
              continue;
            if (started)
              ctx.lineTo(view.x, view.y);
            else {
              ctx.moveTo(view.x, view.y);
              started = true;
            }
          }
          if (started)
            ctx.stroke();
        }
      },
    });
  }
}
