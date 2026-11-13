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
import { sketchPlaneFrameRect } from '../internal/sketch-plane-frame.js';
import './SketchPlanePicker.css';

export interface SketchPlanePickerProps {
  viewport?: ScreenViewport | null;
  selected?: DatumPlaneId | null;
  onSelect: (id: DatumPlaneId) => void;
  /** 新建草图名（Onshape live：平面框左上角内侧显示浅蓝水平「草图 N」）。 */
  pendingSketchName?: string;
  /**
   * 选中/活动草图平面（基准面/cPlane/模型面任意来源；2026-11-13 Onshape live
   * f4/f5）：存在时绘制浅蓝草图平面框——即使三基准面已被 body 规则隐藏。
   */
  framePlane?: SketchPlaneDto | null;
  /** 草图实体世界范围（内容超出最小框时对称扩张；缺省查询模型范围）。 */
  sketchRange?: Range3d;
  /** 平面框文字（草图名「草图 N」；水平绘制在框左上角内侧）。 */
  frameLabel?: string;
}

// Onshape live（2026-11-12 像素采样；2026-11-13 二轮复核）：选中平面不加填充
// （内部仍 #f6f8fa），草图平面框为浅天蓝固定长方形描边 + 左上角内侧水平
// 「草图 N」标签；悬停保持轻填充。ADR-0018 背景（live）：悬停基准面为橙色
// 填充（旧实现为蓝色）；与草图实体选中橙同源 rgba(245,166,65)，取低透明叠加。
const HOVER_FILL = 'rgba(245, 166, 65, 0.18)';
const SELECTED_FILL = 'rgba(255, 255, 255, 0)';
const SELECTED_STROKE = 'rgba(168, 212, 240, 0.95)';
const PENDING_LABEL_COLOR = 'rgba(150, 200, 238, 0.95)';
const PENDING_LABEL_FONT = '600 16px "Segoe UI", "Microsoft YaHei", sans-serif';

/**
 * 框左上角内侧的水平标签（2026-11-13 Onshape live 实测：外框左上角内侧、
 * 文字水平书写，浅蓝；不沿边旋转、不随透视倾斜）。
 */
function drawFrameLabel(ctx: CanvasRenderingContext2D, points2d: ScreenPoint[], text: string): void {
  let topLeft = points2d[0]!;
  for (const point of points2d) {
    if (point.x + point.y < topLeft.x + topLeft.y)
      topLeft = point;
  }
  ctx.save();
  ctx.font = PENDING_LABEL_FONT;
  ctx.fillStyle = PENDING_LABEL_COLOR;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, topLeft.x + 12, topLeft.y + 24);
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
    // Onshape live 第二轮实测（2026-11-13 用户复核）：选中/活动草图平面框
    // （任意来源平面）是**以平面原点为中心的固定长方形**——半宽 2× 基准面、
    // 半高 1.15× 基准面；内容更大时对称扩张。不是内容包围盒、不是正方形。
    // 颜色取 live 采样 rgb(182,200,223) 2px；「草图 N」水平写在框左上角内侧。
    // 存在 frame 时不再重复描基准面选中边。
    let hasFrame = false;
    if (framePlane) {
      const contentRange = sketchRange ?? modelFrameRange;
      const corners = sketchPlaneFrameRect(framePlane, datumPlaneHalfSize(viewport), contentRange);
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
        const label = frameLabel ?? pendingSketchName;
        if (label)
          drawFrameLabel(ctx, pts, label);
      }
    }
    for (const geometry of datumPlaneGeometries(viewport)) {
      const active = geometry.id === hover || geometry.id === selected;
      if (!active) continue;
      const points2d = geometry.points.map((p) => viewport.worldToView(p));
      // framePlane 在场时由上方统一平面框负责选中描边与「草图 N」标签。
      const drawSelectedOutline = geometry.id === selected && !hasFrame;
      if (geometry.id === selected && hasFrame) {
        // Onshape live：选中基准面本身不再额外填充/描边（框已承担选中视觉）。
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
