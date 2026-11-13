/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * 草图平面对话框的视口拾取层（2026-11-02 Onshape live）：Top/Front/Right
 * 三个默认基准面在画布上悬停/选中高亮，左键点击选面。监听挂在 iTwin canvas
 * 上而不是全屏覆盖层——不拦截视图旋转/缩放等原生交互。
 *
 * 视觉隐藏 marker 暴露每个平面一个保证命中的屏幕点（演示/e2e 用真实点击）。
 */
import React from 'react';
import { Range3d } from '@itwin/core-geometry';
import type { ScreenViewport } from '@itwin/core-frontend';
import type { SketchPlaneDto } from '@luban-cad/shared';
import { datumPlaneGeometries, datumPlaneHalfSize } from '@luban-cad/viewer';
import type { DatumPlaneId } from '@luban-cad/viewer';
import {
  datumPlanePickPoints,
  pickDatumPlaneAt,
  type ScreenPoint,
} from '../internal/plane-picker.js';
import {
  sketchPlaneFrameCorners,
  sketchPlaneFrameRect,
} from '../internal/sketch-plane-frame.js';
import './SketchPlanePicker.css';

export interface SketchPlanePickerProps {
  viewport?: ScreenViewport | null;
  selected?: DatumPlaneId | null;
  onSelect: (id: DatumPlaneId) => void;
  /** 新建草图名（Onshape live：选中平面后沿其顶边显示浅蓝「草图 N」）。 */
  pendingSketchName?: string;
  /**
   * 选中/活动草图平面（基准面/cPlane/模型面任意来源；2026-11-13 Onshape live
   * f4/f5）：存在时绘制浅蓝草图平面框——即使三基准面已被 body 规则隐藏。
   */
  framePlane?: SketchPlaneDto | null;
  /** 草图实体世界范围（框尺寸按草图 ∪ 模型自适应；缺省查询模型范围）。 */
  sketchRange?: Range3d;
  /** 平面框文字（草图名「草图 N」；沿框顶边外侧绘制，随边框同步显示）。 */
  frameLabel?: string;
}

// Onshape live（2026-11-12 像素采样）：选中平面不加填充（内部仍 #f6f8fa），
// 只加浅天蓝描边 + 顶边外侧的浅蓝「草图 N」标签；悬停保持轻填充。
// ADR-0018 背景（live）：悬停基准面为橙色填充（旧实现为蓝色）；与草图实体
// 选中橙同源 rgba(245,166,65)，取低透明叠加在平面上。
const HOVER_FILL = 'rgba(245, 166, 65, 0.18)';
const SELECTED_FILL = 'rgba(255, 255, 255, 0)';
const SELECTED_STROKE = 'rgba(168, 212, 240, 0.95)';
const PENDING_LABEL_COLOR = 'rgba(150, 200, 238, 0.95)';
const PENDING_LABEL_FONT = '600 16px "Segoe UI", "Microsoft YaHei", sans-serif';

/** 沿屏幕最上方边、向外偏移 10px 书写平面标签（随透视旋转；不倒置）。 */
function drawTopEdgeLabel(ctx: CanvasRenderingContext2D, points2d: ScreenPoint[], text: string): void {
  let topEdge = 0;
  let topMidY = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points2d.length; i++) {
    const a = points2d[i]!;
    const b = points2d[(i + 1) % points2d.length]!;
    const midY = (a.y + b.y) / 2;
    if (midY < topMidY) {
      topMidY = midY;
      topEdge = i;
    }
  }
  let a = points2d[topEdge]!;
  let b = points2d[(topEdge + 1) % points2d.length]!;
  let angle = Math.atan2(b.y - a.y, b.x - a.x);
  if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
    const swap = a; a = b; b = swap;
    angle += Math.PI;
  }
  const cx = points2d.reduce((sum, point) => sum + point.x, 0) / points2d.length;
  const cy = points2d.reduce((sum, point) => sum + point.y, 0) / points2d.length;
  const outward = Math.hypot(a.x - cx, a.y - cy) || 1;
  ctx.save();
  ctx.translate(a.x + ((a.x - cx) / outward) * 10, a.y + ((a.y - cy) / outward) * 10);
  ctx.rotate(angle);
  ctx.font = PENDING_LABEL_FONT;
  ctx.fillStyle = PENDING_LABEL_COLOR;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, 4, 0);
  ctx.restore();
}

export function SketchPlanePicker({
  viewport,
  selected,
  onSelect,
  pendingSketchName,
  framePlane,
  sketchRange,
  frameLabel,
}: SketchPlanePickerProps): React.JSX.Element | null {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = React.useState<DatumPlaneId | null>(null);
  const [points, setPoints] = React.useState<Partial<Record<DatumPlaneId, ScreenPoint>>>({});
  const [modelFrameRange, setModelFrameRange] = React.useState<Range3d | undefined>(undefined);
  const hoverRef = React.useRef<DatumPlaneId | null>(null);
  hoverRef.current = hover;

  // 无草图实体时按模型范围取框尺寸（Onshape live：框随零件尺寸自适应）。
  React.useEffect(() => {
    let cancelled = false;
    setModelFrameRange(undefined);
    if (!viewport || !framePlane || sketchRange)
      return;
    void (async () => {
      try {
        const ids: string[] = [];
        for await (const row of viewport.iModel.createQueryReader('SELECT ECInstanceId FROM BisCore.PhysicalModel'))
          ids.push(row[0] as string);
        if (cancelled || ids.length === 0)
          return;
        const ranges = await viewport.iModel.models.queryModelRanges(ids);
        if (cancelled)
          return;
        const union = new Range3d();
        for (const range of ranges)
          union.extendRange(Range3d.fromJSON(range));
        if (!union.isNull && !cancelled)
          setModelFrameRange(union);
      } catch {
        // 模型范围查询失败：回退基准面尺寸（不阻断草图拾取）。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewport, framePlane, sketchRange]);

  React.useEffect(() => {
    const canvas = viewport?.canvas;
    if (!viewport || !canvas) return;
    let down: { x: number; y: number } | undefined;
    const local = (event: PointerEvent): ScreenPoint => ({ x: event.offsetX, y: event.offsetY });
    const onDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      down = local(event);
    };
    const onUp = (event: PointerEvent): void => {
      if (event.button !== 0 || !down) return;
      const up = local(event);
      const moved = Math.hypot(up.x - down.x, up.y - down.y);
      down = undefined;
      if (moved > 4) return;
      const hit = pickDatumPlaneAt(viewport, up);
      if (hit) onSelect(hit);
    };
    const onMove = (event: PointerEvent): void => {
      const hit = pickDatumPlaneAt(viewport, local(event)) ?? null;
      if (hit !== hoverRef.current) setHover(hit);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointermove', onMove);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointermove', onMove);
    };
  }, [viewport, onSelect]);

  const draw = React.useCallback((): void => {
    const overlay = canvasRef.current;
    // 结构测试/早期挂载的伪视口可能尚无 viewRect——绘制静默跳过。
    if (!overlay || !viewport?.viewRect) return;
    const rect = viewport.viewRect;
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    if (overlay.width !== Math.round(width * dpr) || overlay.height !== Math.round(height * dpr)) {
      overlay.width = Math.round(width * dpr);
      overlay.height = Math.round(height * dpr);
      overlay.style.width = `${width}px`;
      overlay.style.height = `${height}px`;
    }
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    // Onshape live f4/f5 + 用户复核：选中/活动草图平面框（任意来源平面，非仅
    // 基准面）。框是贴合内容（草图/模型）的**长方形**（每边略大一点），不是
    // 正方形；空场景回退基准面方框。颜色取 live 采样 rgb(182,200,223) 2px。
    // 存在 frame 时不再重复描基准面选中边。
    let hasFrame = false;
    if (framePlane) {
      const contentRange = sketchRange ?? modelFrameRange;
      const corners = (contentRange ? sketchPlaneFrameRect(framePlane, contentRange) : undefined)
        ?? sketchPlaneFrameCorners(framePlane, datumPlaneHalfSize(viewport));
      if (corners) {
        hasFrame = true;
        const pts = corners.map((p) => viewport.worldToView(p));
        ctx.beginPath();
        ctx.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
        ctx.closePath();
        ctx.strokeStyle = 'rgb(182, 200, 223)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // 2026-11-13 用户复核：选面后视口需同步显示平面框**和草图名文字**。
        if (frameLabel)
          drawTopEdgeLabel(ctx, pts, frameLabel);
      }
    }
    for (const geometry of datumPlaneGeometries(viewport)) {
      const active = geometry.id === hover || geometry.id === selected;
      if (!active) continue;
      const points2d = geometry.points.map((p) => viewport.worldToView(p));
      // framePlane 在场时由上方统一平面框负责选中描边；此处只留悬停高亮与标签。
      const drawSelectedOutline = geometry.id === selected && !hasFrame;
      if (geometry.id === selected && hasFrame) {
        // Onshape live：不填充、不描边，仅保留「草图 N」标签。
      } else {
        ctx.beginPath();
        ctx.moveTo(points2d[0]!.x, points2d[0]!.y);
        for (let i = 1; i < points2d.length; i++) ctx.lineTo(points2d[i]!.x, points2d[i]!.y);
        ctx.closePath();
        ctx.fillStyle = drawSelectedOutline ? SELECTED_FILL : HOVER_FILL;
        ctx.fill();
        ctx.strokeStyle = SELECTED_STROKE;
        ctx.lineWidth = drawSelectedOutline ? 2 : 1.25;
        ctx.stroke();
      }
      if (geometry.id === selected && pendingSketchName) {
        // Onshape live：选中平面顶边外侧、沿边书写的浅蓝「草图 N」。
        let topEdge = 0;
        let topMidY = Number.POSITIVE_INFINITY;
        for (let i = 0; i < points2d.length; i++) {
          const a = points2d[i]!;
          const b = points2d[(i + 1) % points2d.length]!;
          const midY = (a.y + b.y) / 2;
          if (midY < topMidY) {
            topMidY = midY;
            topEdge = i;
          }
        }
        let a = points2d[topEdge]!;
        let b = points2d[(topEdge + 1) % points2d.length]!;
        let angle = Math.atan2(b.y - a.y, b.x - a.x);
        if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
          const swap = a; a = b; b = swap;
          angle += Math.PI;
        }
        const cx = points2d.reduce((sum, p) => sum + p.x, 0) / points2d.length;
        const cy = points2d.reduce((sum, p) => sum + p.y, 0) / points2d.length;
        const outward = Math.hypot(a.x - cx, a.y - cy) || 1;
        const position = {
          x: a.x + ((a.x - cx) / outward) * 10,
          y: a.y + ((a.y - cy) / outward) * 10,
        };
        ctx.save();
        ctx.translate(position.x, position.y);
        ctx.rotate(angle);
        ctx.font = PENDING_LABEL_FONT;
        ctx.fillStyle = PENDING_LABEL_COLOR;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(pendingSketchName, 4, 0);
        ctx.restore();
      }
    }
  }, [viewport, hover, selected, pendingSketchName, framePlane, sketchRange, frameLabel, modelFrameRange]);

  React.useEffect(() => { draw(); }, [draw]);
  React.useEffect(() => {
    if (!viewport?.viewRect) return;
    const refresh = (): void => {
      setPoints(datumPlanePickPoints(viewport));
      draw();
    };
    refresh();
    const event = viewport.onViewChanged;
    if (event && typeof event.addListener === 'function') event.addListener(refresh);
    window.addEventListener('resize', refresh);
    return () => {
      if (event && typeof event.removeListener === 'function') event.removeListener(refresh);
      window.removeEventListener('resize', refresh);
    };
  }, [viewport, draw]);

  return (
    <React.Fragment>
      <canvas ref={canvasRef} className="part-studio-plane-picker" aria-hidden="true" />
      <div
        className="part-studio-plane-picker__marker"
        data-testid="sketch-plane-picker"
        data-plane-points={JSON.stringify(points)}
        data-hover={hover ?? ''}
        data-selected={selected ?? ''}
        data-frame-plane={framePlane !== null && framePlane !== undefined ? 'true' : 'false'}
        data-frame-label={frameLabel ?? ''}
        aria-hidden="true"
      />
    </React.Fragment>
  );
}
