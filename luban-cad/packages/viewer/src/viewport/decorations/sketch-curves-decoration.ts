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
/**
 * 活动草图曲线颜色（Onshape live 2026-11-12 像素采样）：
 * - 欠约束 rgb(26,26,204)≈#1a1acc（实测线/圆）；全约束黑 #1f1f1f；
 * - 求解失败/冲突红（诚实指示，样式待 live 复核）。
 */
const ACTIVE_UNDERCONSTRAINED_STYLE = '#1a1acc';
const ACTIVE_CONSTRAINED_STYLE = '#1f1f1f';
const ACTIVE_ERROR_STYLE = '#c0392b';
/** 控制点：蓝色小圆点（Onshape live：端点/圆心/弧起止中点/样条控制点）。 */
const CONTROL_POINT_STYLE = '#1a1acc';
const CONTROL_POINT_RADIUS = 2.4;
/**
 * 2026-11-15 E5（Onshape live 悬停非尺寸约束 glyph）：被引用曲线黄绿色
 * 高亮（dpr-2 裁切像素采样 rgb(232,245,136)≈#e8f588）+ 控制点橙色圆点
 * （rgb(240,185,63)≈#f0b93f，与圆角悬停标记同一橙色族）。仅显示层。
 */
const HIGHLIGHTED_CURVE_STYLE = '#e8f588';
const HIGHLIGHTED_CURVE_WIDTH = 3.2;
const HIGHLIGHTED_CONTROL_POINT_STYLE = '#f0b93f';
const HIGHLIGHTED_CONTROL_POINT_RADIUS = 3.6;
/** 封闭面域填充：Onshape live 像素采样 rgb(228,230,233)。 */
const REGION_FILL_STYLE = 'rgb(228, 230, 233)';

export type SketchConstraintState = 'underconstrained' | 'constrained' | 'error';

/** 一条草图曲线（sketchId 用于区分活动草图样式）。 */
export interface SketchCurveGeometry {
  points: readonly Point3d[];
  sketchId?: string;
  /** 草图实体 id（约束 glyph 悬停高亮按它匹配；缺省不参与高亮）。 */
  entityId?: number;
  /** v1.23（ADR-0004）：构造曲线在活动草图内也画虚线。 */
  construction?: boolean;
}

/** 活动草图控制点（世界坐标；只画活动草图的）。 */
export interface SketchControlPointGeometry {
  position: Point3d;
  sketchId?: string;
  /** 所属草图实体 id（高亮时控制点变橙色；缺省保持常规蓝色）。 */
  entityId?: number;
}

/**
 * 活动草图封闭面域填充（ADR-0018 S1f；Onshape live 像素 rgb(228,230,233)）：
 * 外环+孔环世界折线，evenodd 填充；只画活动草图。
 */
export interface SketchRegionFillGeometry {
  outer: readonly Point3d[];
  holes?: readonly (readonly Point3d[])[];
}

export interface SketchCurveOptions {
  /** 活动草图求解状态（缺省 underconstrained——旧调用的历史行为按蓝色）。 */
  constraintState?: SketchConstraintState;
  /** 活动草图控制点。 */
  controlPoints?: readonly SketchControlPointGeometry[];
  /** 活动草图封闭面域填充。 */
  regionFills?: readonly SketchRegionFillGeometry[];
  /**
   * 2026-11-15 E5：约束 glyph 悬停高亮的实体 id 集（显示层，仅活动草图生效）。
   * 空/缺省 = 无高亮（与旧调用等价）。
   */
  highlightedEntityIds?: readonly number[];
}

function activeStrokeStyle(state: SketchConstraintState): string {
  switch (state) {
    case 'constrained':
      return ACTIVE_CONSTRAINED_STYLE;
    case 'error':
      return ACTIVE_ERROR_STYLE;
    default:
      return ACTIVE_UNDERCONSTRAINED_STYLE;
  }
}

/** 世界折线 → 屏幕折线并描边（当前 strokeStyle/lineWidth/lineDash 由调用方设定）。 */
function strokeWorldPolyline(
  ctx: CanvasRenderingContext2D,
  vp: ScreenViewport,
  points: readonly Point3d[],
): boolean {
  ctx.beginPath();
  let started = false;
  for (const world of points) {
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
  if (!started)
    return false;
  ctx.stroke();
  return true;
}

export class SketchCurvesDecoration {
  private readonly _viewport: ScreenViewport;
  private _polylines: readonly SketchCurveGeometry[] = [];
  private _activeSketchId?: string;
  private _constraintState: SketchConstraintState = 'underconstrained';
  private _controlPoints: readonly SketchControlPointGeometry[] = [];
  private _regionFills: readonly SketchRegionFillGeometry[] = [];
  private _highlightedEntityIds: readonly number[] = [];
  private readonly _removeListener?: () => void;

  public constructor(
    viewport: ScreenViewport,
    polylines: readonly SketchCurveGeometry[] = [],
    activeSketchId?: string,
    options?: SketchCurveOptions,
  ) {
    this._viewport = viewport;
    this._polylines = polylines;
    this._activeSketchId = activeSketchId;
    this._constraintState = options?.constraintState ?? 'underconstrained';
    this._controlPoints = options?.controlPoints ?? [];
    this._regionFills = options?.regionFills ?? [];
    this._highlightedEntityIds = options?.highlightedEntityIds ?? [];
    this._removeListener = IModelApp.viewManager.addDecorator(this);
  }

  public setPolylines(
    polylines: readonly SketchCurveGeometry[],
    activeSketchId?: string,
    options?: SketchCurveOptions,
  ): void {
    this._polylines = polylines;
    this._activeSketchId = activeSketchId;
    this._constraintState = options?.constraintState ?? 'underconstrained';
    this._controlPoints = options?.controlPoints ?? [];
    this._regionFills = options?.regionFills ?? [];
    this._highlightedEntityIds = options?.highlightedEntityIds ?? [];
    this._viewport.invalidateScene();
  }

  /** 2026-11-15 E5：约束 glyph 悬停高亮实体集（显示层；更新即重绘）。 */
  public setHighlightedEntities(ids: readonly number[]): void {
    this._highlightedEntityIds = ids;
    this._viewport.invalidateScene();
  }

  /** 当前高亮实体集（测试/观测面）。 */
  public get highlightedEntityIds(): readonly number[] {
    return this._highlightedEntityIds;
  }

  public dispose(): void {
    this._removeListener?.();
  }

  public decorate(context: DecorateContext): void {
    const vp = context.viewport;
    if (!vp.view.isSpatialView())
      return;
    if (this._polylines.length === 0 && this._controlPoints.length === 0 && this._regionFills.length === 0)
      return;

    context.addCanvasDecoration({
      drawDecoration: (ctx) => {
        // ADR-0018 S1f：先铺封闭面域浅灰填充（evenodd 让孔环镂空），再画曲线/控制点。
        if (this._activeSketchId !== undefined && this._regionFills.length > 0) {
          ctx.setLineDash([]);
          ctx.fillStyle = REGION_FILL_STYLE;
          for (const fill of this._regionFills) {
            ctx.beginPath();
            let started = false;
            for (const world of fill.outer) {
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
            if (!started)
              continue;
            ctx.closePath();
            for (const hole of fill.holes ?? []) {
              let holeStarted = false;
              for (const world of hole) {
                const view = vp.worldToView(world);
                if (!Number.isFinite(view.x) || !Number.isFinite(view.y))
                  continue;
                if (holeStarted)
                  ctx.lineTo(view.x, view.y);
                else {
                  ctx.moveTo(view.x, view.y);
                  holeStarted = true;
                }
              }
              if (holeStarted)
                ctx.closePath();
            }
            ctx.fill('evenodd');
          }
        }
        for (const polyline of this._polylines) {
          if (polyline.points.length < 2)
            continue;
          const active = this._activeSketchId !== undefined && polyline.sketchId === this._activeSketchId;
          ctx.strokeStyle = active ? activeStrokeStyle(this._constraintState) : SKETCH_CURVE_STYLE;
          ctx.lineWidth = active ? 1.8 : 1.1;
          ctx.setLineDash(active && !polyline.construction ? [] : SKETCH_CURVE_DASH);
          strokeWorldPolyline(ctx, vp, polyline.points);
        }
        // 2026-11-15 E5：约束 glyph 悬停高亮——活动草图中命中实体集的曲线
        // 在常规绘制之后叠画黄绿粗线（只显示，不参与拾取/选择）。
        const highlighted = this._highlightedEntityIds.length > 0
          ? new Set(this._highlightedEntityIds)
          : undefined;
        if (highlighted && this._activeSketchId !== undefined) {
          for (const polyline of this._polylines) {
            if (polyline.points.length < 2)
              continue;
            if (polyline.sketchId !== this._activeSketchId
              || polyline.entityId === undefined
              || !highlighted.has(polyline.entityId))
              continue;
            ctx.strokeStyle = HIGHLIGHTED_CURVE_STYLE;
            ctx.lineWidth = HIGHLIGHTED_CURVE_WIDTH;
            ctx.setLineDash([]);
            strokeWorldPolyline(ctx, vp, polyline.points);
          }
        }
        // Onshape live：活动草图控制点=蓝色小圆点（端点/圆心/弧起止中点/样条控制点）。
        if (this._activeSketchId === undefined)
          return;
        ctx.setLineDash([]);
        for (const controlPoint of this._controlPoints) {
          if (controlPoint.sketchId !== undefined && controlPoint.sketchId !== this._activeSketchId)
            continue;
          const view = vp.worldToView(controlPoint.position);
          if (!Number.isFinite(view.x) || !Number.isFinite(view.y))
            continue;
          // E5：被约束引用的实体控制点 = 橙色大圆点（live #f0b93f / r≈3.6）。
          const hot = controlPoint.entityId !== undefined && highlighted?.has(controlPoint.entityId) === true;
          ctx.fillStyle = hot ? HIGHLIGHTED_CONTROL_POINT_STYLE : CONTROL_POINT_STYLE;
          ctx.beginPath();
          ctx.arc(view.x, view.y, hot ? HIGHLIGHTED_CONTROL_POINT_RADIUS : CONTROL_POINT_RADIUS, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    });
  }
}
