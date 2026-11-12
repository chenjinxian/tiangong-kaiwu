/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * DatumPlanesDecoration（2026-11-02 Onshape 默认几何图元对齐）：
 * 在原点绘制 Top(XY) / Front(XZ) / Right(YZ) 三个浅蓝半透明矩形 + Origin 圆心；
 * 标签用 canvas overlay 保持屏幕可读、沿平面顶边旋转。
 *
 * 平面尺寸取 `RENDER_DEFAULTS.emptyViewRangeMm`（模型单位），不随缩放实时变化；
 * 首个产体特征后由 UI 隐藏三平面。
 */
import { RENDER_DEFAULTS } from '@luban-cad/shared';
import { ColorDef } from '@itwin/core-common';
import {
  type DecorateContext,
  GraphicType,
  IModelApp,
  type ScreenViewport,
} from '@itwin/core-frontend';
import { Point3d, Vector3d } from '@itwin/core-geometry';

export interface DatumPlaneVisibility {
  origin: boolean;
  top: boolean;
  front: boolean;
  right: boolean;
}

// Onshape live（2026-11-12 像素采样）：单层合成 ≈ rgb(246,248,250)，
// 边框核心 ≈ rgb(182,200,223)（1 CSS px 抗锯齿），标签 ≈ #1651b0。
// 基线色 rgb(210,220,230) @ alpha 0.2 在白色首帧上逐层叠加吻合。
const PLANE_FILL = ColorDef.create(0xe6dcd2).withAlpha(51); // TBGR of rgb(210,220,230)
const PLANE_EDGE = ColorDef.create(0xdfc8b6); // TBGR of rgb(182,200,223)
const LABEL_COLOR = 'rgba(22,81,176,0.95)';
// 标签字号按 live 投影宽度比（Front 文本 ≈78 physical px @ DPR2）取 16px。
const LABEL_FONT = '600 16px "Segoe UI", "Microsoft YaHei", sans-serif';

function corners(x: number, y: number, z: number): Point3d[] {
  return [
    Point3d.create(x, y, z), Point3d.create(-x, y, z),
    Point3d.create(-x, -y, z), Point3d.create(x, -y, z),
  ];
}

/** 默认基准面 id（与 apps/web DatumId 的平面子集一致）。 */
export type DatumPlaneId = 'top' | 'front' | 'right';

export interface DatumPlaneGeometry {
  id: DatumPlaneId;
  /** 世界系四角（闭合顺序，不重复首点）。 */
  points: Point3d[];
  labelPoint: Point3d;
  normal: Vector3d;
}

/**
 * 平面半尺寸（模型单位）。固定自 `RENDER_DEFAULTS.emptyViewRangeMm`：空 Part
 * Studio 的默认取景立方体与三基准面同口径，取景/拾取/装饰不再随相机缩放漂移。
 * `viewport` 参数保留为公开 API（调用方多处使用）。
 */
export function datumPlaneHalfSize(_viewport: ScreenViewport): number {
  return Math.max(8, RENDER_DEFAULTS.emptyViewRangeMm);
}

/**
 * 三基准面世界几何（草图平面对话框视口拾取与视口装饰共用同一口径）：
 * Top=XY(normal Z)、Front=XZ(normal Y)、Right=YZ(normal X)。
 */
export function datumPlaneGeometries(viewport: ScreenViewport): DatumPlaneGeometry[] {
  const s = datumPlaneHalfSize(viewport);
  return [
    { id: 'top', points: corners(s, s, 0), labelPoint: Point3d.create(-s * 0.86, s * 0.86, 0), normal: Vector3d.unitZ() },
    {
      id: 'front',
      points: [Point3d.create(-s, 0, -s), Point3d.create(s, 0, -s), Point3d.create(s, 0, s), Point3d.create(-s, 0, s)],
      labelPoint: Point3d.create(-s * 0.86, 0, s * 0.86),
      normal: Vector3d.unitY(),
    },
    {
      id: 'right',
      points: [Point3d.create(0, -s, -s), Point3d.create(0, s, -s), Point3d.create(0, s, s), Point3d.create(0, -s, s)],
      labelPoint: Point3d.create(0, -s * 0.86, s * 0.86),
      normal: Vector3d.unitX(),
    },
  ];
}

export class DatumPlanesDecoration {
  private readonly _viewport: ScreenViewport;
  private readonly _halfSize: number;
  private _visibility: DatumPlaneVisibility;
  private readonly _removeListener?: () => void;

  public constructor(viewport: ScreenViewport, visibility: DatumPlaneVisibility) {
    this._viewport = viewport;
    this._visibility = { ...visibility };
    this._halfSize = datumPlaneHalfSize(viewport);
    this._removeListener = IModelApp.viewManager.addDecorator(this);
  }

  public setVisibility(visibility: DatumPlaneVisibility): void {
    if (visibility.origin === this._visibility.origin && visibility.top === this._visibility.top
      && visibility.front === this._visibility.front && visibility.right === this._visibility.right)
      return;
    this._visibility = { ...visibility };
    this._viewport.invalidateScene();
  }

  public dispose(): void {
    this._removeListener?.();
  }

  private drawPlane(context: DecorateContext, axis: 'top' | 'front' | 'right', label: string): void {
    const s = this._halfSize;
    const builder = context.createGraphicBuilder(GraphicType.WorldOverlay);
    // weight 2 = 2 device px（与 DPR2 下 Onshape 边框带宽一致；weight 1 实测只有 1px）。
    builder.setSymbology(PLANE_EDGE, PLANE_FILL, 2);
    let pts: Point3d[];
    let labelWorld: Point3d;
    switch (axis) {
      case 'top':
        pts = corners(s, s, 0);
        labelWorld = Point3d.create(-s * 0.86, s * 0.86, 0);
        break;
      case 'front':
        pts = [Point3d.create(-s, 0, -s), Point3d.create(s, 0, -s), Point3d.create(s, 0, s), Point3d.create(-s, 0, s)];
        labelWorld = Point3d.create(-s * 0.86, 0, s * 0.86);
        break;
      default:
        pts = [Point3d.create(0, -s, -s), Point3d.create(0, s, -s), Point3d.create(0, s, s), Point3d.create(0, -s, s)];
        labelWorld = Point3d.create(0, -s * 0.86, s * 0.86);
        break;
    }
    // addShape 只填充不描边；Onshape 的每个基准面都有 1px 蓝灰边框，单独补线。
    builder.addShape(pts);
    builder.addLineString([...pts, pts[0]!]);
    context.addDecorationFromBuilder(builder);
    // Onshape live（2026-11-12）：标签贴在平面**屏幕最上方的边**的左端、沿边书写
    // （随平面透视旋转，不是水平屏幕文字）。
    const view = pts.map((point) => context.viewport.worldToView(point));
    let topEdge = 0;
    let topMidY = Number.POSITIVE_INFINITY;
    for (let i = 0; i < view.length; i++) {
      const a = view[i]!;
      const b = view[(i + 1) % view.length]!;
      const midY = (a.y + b.y) / 2;
      if (midY < topMidY) {
        topMidY = midY;
        topEdge = i;
      }
    }
    let a = view[topEdge]!;
    let b = view[(topEdge + 1) % view.length]!;
    let angle = Math.atan2(b.y - a.y, b.x - a.x);
    if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
      // 文字保持可读方向（不倒置）：换边端点，角度转 180°。
      const swap = a; a = b; b = swap;
      angle += Math.PI;
    }
    const cx = view.reduce((sum, point) => sum + point.x, 0) / view.length;
    const cy = view.reduce((sum, point) => sum + point.y, 0) / view.length;
    const inward = Math.hypot(cx - a.x, cy - a.y) || 1;
    const position = {
      x: a.x + ((cx - a.x) / inward) * 6,
      y: a.y + ((cy - a.y) / inward) * 6,
    };
    void labelWorld;
    this.addLabel(context, position, angle, label);
  }

  private addLabel(context: DecorateContext, position: { x: number; y: number }, angle: number, text: string): void {
    context.addCanvasDecoration({
      position,
      drawDecoration: (ctx) => {
        ctx.save();
        ctx.translate(0, 0);
        ctx.rotate(angle);
        ctx.font = LABEL_FONT;
        ctx.fillStyle = LABEL_COLOR;
        ctx.textBaseline = 'top';
        ctx.fillText(text, 4, 3);
        ctx.restore();
      },
    });
  }

  public decorate(context: DecorateContext): void {
    const vp = context.viewport;
    if (!vp.view.isSpatialView()) return;
    if (this._visibility.top) this.drawPlane(context, 'top', 'Top');
    if (this._visibility.front) this.drawPlane(context, 'front', 'Front');
    if (this._visibility.right) this.drawPlane(context, 'right', 'Right');
    if (this._visibility.origin) {
      const pos = vp.worldToView(Point3d.createZero());
      context.addCanvasDecoration({
        position: pos,
        drawDecoration: (ctx) => {
          ctx.beginPath();
          ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(31,31,31,0.9)';
          ctx.lineWidth = 1.3;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, 1.3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(31,31,31,0.9)';
          ctx.fill();
        },
      });
    }
  }
}

