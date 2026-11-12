/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 活动草图非尺寸约束 glyph（Onshape live，2026-11-12）：
 * 屏幕空间小方块（约 18px，固定像素大小，不随相机缩放），内含约束符号。
 * 锚点由 web 层从草图约束解析成世界坐标（与尺寸标注同源）；本装饰器只负责
 * 投影、碰撞避让与制图样式，因此与草图求解/数据契约解耦。
 *
 * live 证据（私有 `ui-evidence/sketch-constraint-glyphs-20261112/`）：
 * Postman / Top View Drivetrain Reference Sketch 86 约束——⊥ / ∥ / = / — / |
 * / 中点（—•—）/ 重合（X）/ 镜像（双形+虚线轴）；glyph 成排聚在实体附近，
 * 选中时方块浅蓝底（截图 10-postman-sketch1.png）。
 */
import {
  type DecorateContext,
  IModelApp,
  type ScreenViewport,
} from '@itwin/core-frontend';
import type { Point3d } from '@itwin/core-geometry';

/** 已采集 live 证据的约束 glyph 种类（数据契约的更多 kind 后续按证据补）。 */
export type SketchConstraintGlyphKind =
  | 'coincident'
  | 'horizontal'
  | 'vertical'
  | 'parallel'
  | 'perpendicular'
  | 'equal'
  | 'midpoint'
  | 'mirror'
  | 'tangent'
  | 'concentric'
  | 'fixed'
  | 'offset';

export interface SketchConstraintGlyphAnnotation {
  /** `constraint-<constraintId>`（与尺寸标注 `dimension-<id>` 同源口径）。 */
  id: string;
  kind: SketchConstraintGlyphKind;
  /** glyph 应出现的世界锚点（草图局部几何 → 世界）。 */
  position: Point3d;
}

export const CONSTRAINT_GLYPH_SIZE = 18;
const GLYPH_OFFSET_Y = -16;
const GLYPH_STEP_X = CONSTRAINT_GLYPH_SIZE + 2;

const BOX_FILL = 'rgba(251, 250, 248, 0.96)';
const BOX_STROKE = 'rgba(57, 65, 74, 0.72)';
const SYMBOL_STROKE = '#39414a';

interface ScreenPoint { x: number; y: number }
interface ScreenRect { left: number; top: number; right: number; bottom: number }

function rectsOverlap(a: ScreenRect, b: ScreenRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function boxRect(center: ScreenPoint): ScreenRect {
  const half = CONSTRAINT_GLYPH_SIZE / 2;
  return { left: center.x - half, top: center.y - half, right: center.x + half, bottom: center.y + half };
}

export interface SketchConstraintGlyphLayout {
  annotation: SketchConstraintGlyphAnnotation;
  center: ScreenPoint;
  rect: ScreenRect;
}

/**
 * 纯布局（无绘制）：绘制层与拾取层共用。锚点上移 16px 放置方块；与已占位
 * 方块重叠时向右平移一格（Onshape 同款成排排列）。
 */
export function layoutSketchConstraintGlyphs(
  annotations: readonly SketchConstraintGlyphAnnotation[],
  vp: Pick<ScreenViewport, 'worldToView'>,
): SketchConstraintGlyphLayout[] {
  const occupied: ScreenRect[] = [];
  const layout: SketchConstraintGlyphLayout[] = [];
  for (const annotation of annotations) {
    const view = vp.worldToView(annotation.position);
    if (![view.x, view.y].every(Number.isFinite))
      continue;
    let center = { x: view.x, y: view.y + GLYPH_OFFSET_Y };
    for (let attempt = 0; attempt < 24; attempt++) {
      const rect = boxRect(center);
      if (!occupied.some((other) => rectsOverlap(rect, other)))
        break;
      center = { x: center.x + GLYPH_STEP_X, y: center.y };
    }
    const rect = boxRect(center);
    occupied.push(rect);
    layout.push({ annotation, center, rect });
  }
  return layout;
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
}

/** 在方块中心绘制约束符号（坐标相对中心；笔画 1.2px 深灰）。 */
export function drawConstraintGlyphSymbol(
  ctx: CanvasRenderingContext2D,
  kind: SketchConstraintGlyphKind,
  cx: number,
  cy: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = SYMBOL_STROKE;
  ctx.fillStyle = SYMBOL_STROKE;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([]);
  switch (kind) {
    case 'horizontal':
      line(ctx, -5.5, 0, 5.5, 0);
      break;
    case 'vertical':
      line(ctx, 0, -5.5, 0, 5.5);
      break;
    case 'perpendicular':
      line(ctx, -5.5, 4, 5.5, 4);
      line(ctx, 0, -5.5, 0, 4);
      break;
    case 'parallel':
      line(ctx, -5, 4, -1, -4);
      line(ctx, 1, 4, 5, -4);
      break;
    case 'equal':
      line(ctx, -4.5, -2.4, 4.5, -2.4);
      line(ctx, -4.5, 2.4, 4.5, 2.4);
      break;
    case 'coincident':
      line(ctx, -4.6, -4.6, 4.6, 4.6);
      line(ctx, -4.6, 4.6, 4.6, -4.6);
      break;
    case 'midpoint':
      line(ctx, -6.5, 0, -2.6, 0);
      line(ctx, 2.6, 0, 6.5, 0);
      ctx.beginPath();
      ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'mirror':
      ctx.setLineDash([2, 1.6]);
      line(ctx, 0, -6, 0, 6);
      ctx.setLineDash([]);
      line(ctx, -1.8, -4, -6, 0);
      line(ctx, -6, 0, -1.8, 4);
      line(ctx, 1.8, -4, 6, 0);
      line(ctx, 6, 0, 1.8, 4);
      break;
    case 'tangent':
      ctx.beginPath();
      ctx.arc(0, 2, 4.2, Math.PI, Math.PI * 2);
      ctx.stroke();
      line(ctx, -6, -2.2, 6, -2.2);
      break;
    case 'concentric':
      circle(ctx, 0, 0, 2.2);
      circle(ctx, 0, 0, 5.2);
      break;
    case 'fixed':
      ctx.beginPath();
      ctx.rect(-4.2, -1, 8.4, 6.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -1, 2.6, Math.PI, Math.PI * 2);
      ctx.stroke();
      break;
    case 'offset':
      ctx.beginPath();
      ctx.arc(0, 3.5, 5, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 3.5, 7.5, Math.PI, Math.PI * 2);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/**
 * 活动草图约束 glyph 装饰器。锚点为空/非空间视图 no-op；setGlyphs 重新
 * invalidate（约束变化时由 React effect 调用）。
 */
export class SketchConstraintGlyphsDecoration {
  private readonly _viewport: ScreenViewport;
  private _glyphs: readonly SketchConstraintGlyphAnnotation[];
  private readonly _removeListener?: () => void;

  public constructor(
    viewport: ScreenViewport,
    glyphs: readonly SketchConstraintGlyphAnnotation[] = [],
  ) {
    this._viewport = viewport;
    this._glyphs = [...glyphs];
    this._removeListener = IModelApp.viewManager.addDecorator(this);
  }

  public setGlyphs(glyphs: readonly SketchConstraintGlyphAnnotation[]): void {
    this._glyphs = [...glyphs];
    this._viewport.invalidateScene();
  }

  public dispose(): void {
    this._removeListener?.();
  }

  public decorate(context: DecorateContext): void {
    const vp = context.viewport;
    if (!vp.view.isSpatialView() || this._glyphs.length === 0)
      return;

    context.addCanvasDecoration({
      drawDecoration: (ctx) => this.draw(ctx, vp),
    });
  }

  private draw(ctx: CanvasRenderingContext2D, vp: ScreenViewport): void {
    const layout = layoutSketchConstraintGlyphs(this._glyphs, vp);
    ctx.save();
    ctx.setLineDash([]);
    for (const item of layout) {
      const { left, top, right, bottom } = item.rect;
      const size = right - left;
      ctx.fillStyle = BOX_FILL;
      ctx.strokeStyle = BOX_STROKE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(left, top, size, bottom - top);
      ctx.fill();
      ctx.stroke();
      drawConstraintGlyphSymbol(ctx, item.annotation.kind, item.center.x, item.center.y);
    }
    ctx.restore();
  }
}
