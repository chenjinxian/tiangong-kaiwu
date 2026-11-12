/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 活动草图尺寸标注（Onshape live，2026-11-02）：屏幕空间绘制尺寸线/延长线/
 * 箭头/数值。锚点由 web 层从草图约束解析成世界坐标（SketchDto → 局部几何 →
 * 世界）；本装饰器只负责投影与制图样式，因此与草图求解/数据契约解耦。
 *
 * Onshape 口径：标注不随相机缩放变粗变细（尺寸线 1px、文字 12px、箭头 8px）；
 * 标注放在几何外侧，侧向由调用方给的世界方向决定；文字沿尺寸线旋转但永不
 * 倒置；半径用 R 前缀 + 圆心→弧点引线。
 *
 * 2026-11-12（ADR-0018 S1e）：布局抽成纯函数 `layoutSketchDimensions` /
 * `sketchDimensionLabels`，绘制与视口数值拾取（双击改值）共用同一份屏幕几何。
 */
import {
  type DecorateContext,
  IModelApp,
  type ScreenViewport,
} from '@itwin/core-frontend';
import { Geometry, type Point3d, type Vector3d } from '@itwin/core-geometry';

export interface SketchLinearDimensionAnnotation {
  kind: 'linear';
  id: string;
  /** 被测两点（世界系）。 */
  a: Point3d;
  b: Point3d;
  /** 草图面内世界方向：从被标注几何指向尺寸线应放置的一侧。 */
  side: Vector3d;
  text: string;
}

export interface SketchRadialDimensionAnnotation {
  kind: 'radial';
  id: string;
  /** 圆心（世界系）。 */
  center: Point3d;
  /** 圆弧上的引线落点（世界系）。 */
  point: Point3d;
  /** 草图面内世界方向：引线/文字朝圆弧外侧。 */
  side: Vector3d;
  text: string;
}

/** 角度尺寸（两线夹角；Onshape 显示度数值，value 在 shared 中为弧度）。 */
export interface SketchAngularDimensionAnnotation {
  kind: 'angular';
  id: string;
  /** 两线交点（世界系）。 */
  vertex: Point3d;
  /** 两条射线上的世界点（决定屏幕方向；通常取远离顶点的一端）。 */
  a: Point3d;
  b: Point3d;
  text: string;
}

export type SketchDimensionAnnotation = SketchLinearDimensionAnnotation | SketchRadialDimensionAnnotation | SketchAngularDimensionAnnotation;

const LINE_COLOR = 'rgba(57, 65, 74, 0.92)';
const TEXT_COLOR = '#39414a';
const HALO_COLOR = 'rgba(250, 249, 245, 0.94)';
const EXT_GAP = 3;
const EXT_OVERSHOOT = 4;
const DIM_OFFSET = 34;
const STACK_STEP = 22;
const ARROW_LENGTH = 8;
const ARROW_HALF_WIDTH = 3;
const FONT = '12px "Segoe UI", "Microsoft YaHei", sans-serif';

interface ScreenPoint { x: number; y: number }
interface ScreenRect { left: number; top: number; right: number; bottom: number }

function normalize(x: number, y: number): ScreenPoint | undefined {
  const len = Geometry.hypotenuseXY(x, y);
  if (!Number.isFinite(len) || len < 1e-6) return undefined;
  return { x: x / len, y: y / len };
}

function rectsOverlap(a: ScreenRect, b: ScreenRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function labelRect(center: ScreenPoint, angle: number, text: string): ScreenRect {
  const width = Math.max(18, text.length * 7 + 8);
  const height = 16;
  // 粗估旋转后的包围盒（仅用于防止标注互相叠字）。
  const c = Math.abs(Math.cos(angle));
  const s = Math.abs(Math.sin(angle));
  const w = width * c + height * s;
  const h = width * s + height * c;
  return { left: center.x - w / 2, top: center.y - h / 2, right: center.x + w / 2, bottom: center.y + h / 2 };
}

/** 沿尺寸线方向画实心箭头（tip 在端点，指向尺寸线外侧）。 */
function drawArrow(ctx: CanvasRenderingContext2D, tip: ScreenPoint, direction: ScreenPoint): void {
  const perp = { x: -direction.y, y: direction.x };
  const base = { x: tip.x - direction.x * ARROW_LENGTH, y: tip.y - direction.y * ARROW_LENGTH };
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(base.x + perp.x * ARROW_HALF_WIDTH, base.y + perp.y * ARROW_HALF_WIDTH);
  ctx.lineTo(base.x - perp.x * ARROW_HALF_WIDTH, base.y - perp.y * ARROW_HALF_WIDTH);
  ctx.closePath();
  ctx.fillStyle = LINE_COLOR;
  ctx.fill();
}

/** 文字沿尺寸线方向书写，归一化到 [-90°, 90°] 防止倒置。 */
function readableAngle(dx: number, dy: number): number {
  let angle = Math.atan2(dy, dx);
  if (angle > Math.PI / 2) angle -= Math.PI;
  else if (angle < -Math.PI / 2) angle += Math.PI;
  return angle;
}

/** 线性尺寸布局（屏幕空间；labelCenter=数值可点击中心）。 */
export interface SketchLinearDimensionLayout {
  kind: 'linear';
  annotation: SketchLinearDimensionAnnotation;
  sa: ScreenPoint;
  sb: ScreenPoint;
  lineDir: ScreenPoint;
  sideDir: ScreenPoint;
  da: ScreenPoint;
  db: ScreenPoint;
  labelCenter: ScreenPoint;
  angle: number;
}

/** 半径/直径尺寸布局（屏幕空间）。 */
export interface SketchRadialDimensionLayout {
  kind: 'radial';
  annotation: SketchRadialDimensionAnnotation;
  sc: ScreenPoint;
  sp: ScreenPoint;
  outward: ScreenPoint;
  leaderEnd: ScreenPoint;
  labelCenter: ScreenPoint;
  angle: number;
}

/** 角度尺寸布局（屏幕空间；arcStart→arcEnd 为屏幕方向角）。 */
export interface SketchAngularDimensionLayout {
  kind: 'angular';
  annotation: SketchAngularDimensionAnnotation;
  sv: ScreenPoint;
  /** 屏幕系弧半径（px）。 */
  radius: number;
  startAngle: number;
  sweepAngle: number;
  arcStart: ScreenPoint;
  arcEnd: ScreenPoint;
  labelCenter: ScreenPoint;
  angle: number;
}

export type SketchDimensionLayout = SketchLinearDimensionLayout | SketchRadialDimensionLayout | SketchAngularDimensionLayout;

/** 数值标签命中区（未旋转包围盒；拾取层双击改值用）。 */
export interface SketchDimensionLabel {
  id: string;
  kind: 'linear' | 'radial' | 'angular';
  text: string;
  center: ScreenPoint;
  angle: number;
  rect: ScreenRect;
}

function layoutLinear(
  annotation: SketchLinearDimensionAnnotation,
  vp: Pick<ScreenViewport, 'worldToView'>,
  occupied: ScreenRect[],
): SketchLinearDimensionLayout | undefined {
  const sa = vp.worldToView(annotation.a);
  const sb = vp.worldToView(annotation.b);
  if (![sa.x, sa.y, sb.x, sb.y].every(Number.isFinite)) return undefined;

  const lineDir = normalize(sb.x - sa.x, sb.y - sa.y);
  if (!lineDir) return undefined;

  const sidePoint = vp.worldToView(annotation.a.plus(annotation.side));
  let sideDir = normalize(sidePoint.x - sa.x, sidePoint.y - sa.y);
  if (!sideDir) sideDir = { x: -lineDir.y, y: lineDir.x };
  if (sideDir.x * lineDir.x + sideDir.y * lineDir.y > 0.5) {
    // 侧向与尺寸线方向退化（探针太短/方向共线）：取垂线。
    sideDir = { x: -lineDir.y, y: lineDir.x };
  }

  let offset = DIM_OFFSET;
  let da = { x: sa.x + sideDir.x * offset, y: sa.y + sideDir.y * offset };
  let db = { x: sb.x + sideDir.x * offset, y: sb.y + sideDir.y * offset };
  let labelCenter = {
    x: (da.x + db.x) / 2 + sideDir.x * 9,
    y: (da.y + db.y) / 2 + sideDir.y * 9,
  };
  const angle = readableAngle(db.x - da.x, db.y - da.y);
  for (let attempt = 0; attempt < 5; attempt++) {
    const rect = labelRect(labelCenter, angle, annotation.text);
    if (!occupied.some((other) => rectsOverlap(rect, other))) break;
    offset += STACK_STEP;
    da = { x: sa.x + sideDir.x * offset, y: sa.y + sideDir.y * offset };
    db = { x: sb.x + sideDir.x * offset, y: sb.y + sideDir.y * offset };
    labelCenter = {
      x: (da.x + db.x) / 2 + sideDir.x * 9,
      y: (da.y + db.y) / 2 + sideDir.y * 9,
    };
  }
  occupied.push(labelRect(labelCenter, angle, annotation.text));
  return { kind: 'linear', annotation, sa, sb, lineDir, sideDir, da, db, labelCenter, angle };
}

function layoutRadial(
  annotation: SketchRadialDimensionAnnotation,
  vp: Pick<ScreenViewport, 'worldToView'>,
  occupied: ScreenRect[],
): SketchRadialDimensionLayout | undefined {
  const sc = vp.worldToView(annotation.center);
  const sp = vp.worldToView(annotation.point);
  if (![sc.x, sc.y, sp.x, sp.y].every(Number.isFinite)) return undefined;

  const radial = normalize(sp.x - sc.x, sp.y - sc.y);
  if (!radial) return undefined;
  const sidePoint = vp.worldToView(annotation.point.plus(annotation.side));
  const sideDir = normalize(sidePoint.x - sp.x, sidePoint.y - sp.y);
  const outward = sideDir && sideDir.x * radial.x + sideDir.y * radial.y >= 0 ? sideDir : radial;

  let leaderEnd = { x: sp.x + outward.x * 44, y: sp.y + outward.y * 44 };
  let labelCenter = { x: leaderEnd.x + outward.x * 12, y: leaderEnd.y + outward.y * 12 };
  const angle = readableAngle(outward.x, outward.y);
  for (let attempt = 0; attempt < 5; attempt++) {
    const rect = labelRect(labelCenter, angle, annotation.text);
    if (!occupied.some((other) => rectsOverlap(rect, other))) break;
    leaderEnd = { x: leaderEnd.x + outward.x * STACK_STEP, y: leaderEnd.y + outward.y * STACK_STEP };
    labelCenter = { x: labelCenter.x + outward.x * STACK_STEP, y: labelCenter.y + outward.y * STACK_STEP };
  }
  occupied.push(labelRect(labelCenter, angle, annotation.text));
  return { kind: 'radial', annotation, sc, sp, outward, leaderEnd, labelCenter, angle };
}

const ANGULAR_RADIUS = 38;
const ANGULAR_STACK_STEP = 10;

function layoutAngular(
  annotation: SketchAngularDimensionAnnotation,
  vp: Pick<ScreenViewport, 'worldToView'>,
  occupied: ScreenRect[],
): SketchAngularDimensionLayout | undefined {
  const sv = vp.worldToView(annotation.vertex);
  const sa = vp.worldToView(annotation.a);
  const sb = vp.worldToView(annotation.b);
  if (![sv.x, sv.y, sa.x, sa.y, sb.x, sb.y].every(Number.isFinite)) return undefined;
  const dirA = normalize(sa.x - sv.x, sa.y - sv.y);
  const dirB = normalize(sb.x - sv.x, sb.y - sv.y);
  if (!dirA || !dirB) return undefined;
  const startAngle = Math.atan2(dirA.y, dirA.x);
  let sweep = Math.atan2(dirB.y, dirB.x) - startAngle;
  while (sweep > Math.PI) sweep -= Math.PI * 2;
  while (sweep < -Math.PI) sweep += Math.PI * 2;
  if (Math.abs(sweep) < 1e-3) return undefined;

  let radius = ANGULAR_RADIUS;
  let labelCenter: ScreenPoint = { x: sv.x, y: sv.y };
  for (let attempt = 0; attempt < 6; attempt++) {
    const mid = startAngle + sweep / 2;
    labelCenter = { x: sv.x + Math.cos(mid) * (radius + 14), y: sv.y + Math.sin(mid) * (radius + 14) };
    const rect = labelRect(labelCenter, 0, annotation.text);
    if (!occupied.some((other) => rectsOverlap(rect, other))) break;
    radius += ANGULAR_STACK_STEP;
  }
  occupied.push(labelRect(labelCenter, 0, annotation.text));
  const arcStart = { x: sv.x + dirA.x * radius, y: sv.y + dirA.y * radius };
  const arcEnd = { x: sv.x + dirB.x * radius, y: sv.y + dirB.y * radius };
  return { kind: 'angular', annotation, sv, radius, startAngle, sweepAngle: sweep, arcStart, arcEnd, labelCenter, angle: 0 };
}

/**
 * 纯布局（无绘制）：装饰器与视口拾取层共用——标签屏幕位置只有一个事实源，
 * 避免拾取层复制堆叠避让逻辑后与绘制漂移。
 */
export function layoutSketchDimensions(
  annotations: readonly SketchDimensionAnnotation[],
  vp: Pick<ScreenViewport, 'worldToView'>,
): SketchDimensionLayout[] {
  const occupied: ScreenRect[] = [];
  const layout: SketchDimensionLayout[] = [];
  for (const annotation of annotations) {
    const item = annotation.kind === 'linear'
      ? layoutLinear(annotation, vp, occupied)
      : annotation.kind === 'radial'
        ? layoutRadial(annotation, vp, occupied)
        : layoutAngular(annotation, vp, occupied);
    if (item) layout.push(item);
  }
  return layout;
}

/** 数值标签列表（id=`dimension-<constraintId>`，与标注 id 同源）。 */
export function sketchDimensionLabels(layout: readonly SketchDimensionLayout[]): SketchDimensionLabel[] {
  return layout.map((item) => ({
    id: item.annotation.id,
    kind: item.kind,
    text: item.annotation.text,
    center: { ...item.labelCenter },
    angle: item.angle,
    rect: labelRect(item.labelCenter, item.angle, item.annotation.text),
  }));
}

/**
 * 活动草图尺寸标注装饰器。锚点为空/非空间视图 no-op；setAnnotations 重新
 * invalidate（草图约束变化时由 React effect 调用）。
 */
export class SketchDimensionsDecoration {
  private readonly _viewport: ScreenViewport;
  private _annotations: readonly SketchDimensionAnnotation[];
  private readonly _removeListener?: () => void;

  public constructor(
    viewport: ScreenViewport,
    annotations: readonly SketchDimensionAnnotation[] = [],
  ) {
    this._viewport = viewport;
    this._annotations = [...annotations];
    this._removeListener = IModelApp.viewManager.addDecorator(this);
  }

  public setAnnotations(annotations: readonly SketchDimensionAnnotation[]): void {
    this._annotations = [...annotations];
    this._viewport.invalidateScene();
  }

  public dispose(): void {
    this._removeListener?.();
  }

  public decorate(context: DecorateContext): void {
    const vp = context.viewport;
    if (!vp.view.isSpatialView() || this._annotations.length === 0)
      return;

    context.addCanvasDecoration({
      drawDecoration: (ctx) => this.draw(ctx, vp),
    });
  }

  private draw(ctx: CanvasRenderingContext2D, vp: ScreenViewport): void {
    const layout = layoutSketchDimensions(this._annotations, vp);
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = LINE_COLOR;
    ctx.font = FONT;

    for (const item of layout) {
      if (item.kind === 'linear')
        this.drawLinear(ctx, item);
      else if (item.kind === 'radial')
        this.drawRadial(ctx, item);
      else
        this.drawAngular(ctx, item);
    }
    ctx.restore();
  }

  private drawLinear(ctx: CanvasRenderingContext2D, item: SketchLinearDimensionLayout): void {
    const { annotation, sa, sb, da, db, lineDir, sideDir, labelCenter, angle } = item;

    // 延长线（与几何留 3px 间隙，越过尺寸线 4px）。
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1;
    for (const [s, d] of [[sa, da], [sb, db]] as const) {
      ctx.beginPath();
      ctx.moveTo(s.x + sideDir.x * EXT_GAP, s.y + sideDir.y * EXT_GAP);
      ctx.lineTo(d.x + sideDir.x * EXT_OVERSHOOT, d.y + sideDir.y * EXT_OVERSHOOT);
      ctx.stroke();
    }

    // 尺寸线 + 两端箭头（指向延长线）。
    ctx.beginPath();
    ctx.moveTo(da.x, da.y);
    ctx.lineTo(db.x, db.y);
    ctx.stroke();
    drawArrow(ctx, da, { x: -lineDir.x, y: -lineDir.y });
    drawArrow(ctx, db, lineDir);

    // 数值：沿尺寸线旋转。
    ctx.save();
    ctx.translate(labelCenter.x, labelCenter.y);
    ctx.rotate(angle);
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = HALO_COLOR;
    ctx.strokeText(annotation.text, 0, 0);
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(annotation.text, 0, 0);
    ctx.restore();
  }

  private drawRadial(ctx: CanvasRenderingContext2D, item: SketchRadialDimensionLayout): void {
    const { annotation, sc, sp, outward, leaderEnd, labelCenter, angle } = item;

    // 圆心→弧点→外侧引线；箭头落在弧点上，指向圆心（标准半径标注）。
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sc.x, sc.y);
    ctx.lineTo(leaderEnd.x, leaderEnd.y);
    ctx.stroke();
    drawArrow(ctx, sp, { x: -outward.x, y: -outward.y });

    // 圆心十字。
    ctx.beginPath();
    ctx.moveTo(sc.x - 3, sc.y);
    ctx.lineTo(sc.x + 3, sc.y);
    ctx.moveTo(sc.x, sc.y - 3);
    ctx.lineTo(sc.x, sc.y + 3);
    ctx.stroke();

    ctx.save();
    ctx.translate(labelCenter.x, labelCenter.y);
    ctx.rotate(angle);
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = HALO_COLOR;
    ctx.strokeText(annotation.text, 0, 0);
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(annotation.text, 0, 0);
    ctx.restore();
  }

  /** 角度尺寸：两条射线（顶点→弧端）+ 圆弧 + 两端切向箭头 + 度数值。 */
  private drawAngular(ctx: CanvasRenderingContext2D, item: SketchAngularDimensionLayout): void {
    const { annotation, sv, radius, startAngle, sweepAngle, arcStart, arcEnd, labelCenter, angle } = item;
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sv.x, sv.y);
    ctx.lineTo(arcStart.x, arcStart.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sv.x, sv.y);
    ctx.lineTo(arcEnd.x, arcEnd.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(sv.x, sv.y, radius, startAngle, startAngle + sweepAngle, sweepAngle < 0);
    ctx.stroke();

    // 箭头在弧端沿弧切线指向弧内。
    const sign = sweepAngle >= 0 ? 1 : -1;
    const endAngle = startAngle + sweepAngle;
    drawArrow(ctx, arcStart, { x: -Math.sin(startAngle) * sign, y: Math.cos(startAngle) * sign });
    drawArrow(ctx, arcEnd, { x: Math.sin(endAngle) * sign, y: -Math.cos(endAngle) * sign });

    ctx.save();
    ctx.translate(labelCenter.x, labelCenter.y);
    ctx.rotate(angle);
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = HALO_COLOR;
    ctx.strokeText(annotation.text, 0, 0);
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(annotation.text, 0, 0);
    ctx.restore();
  }
}
