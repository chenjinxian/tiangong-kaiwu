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
import type { ScreenViewport } from '@itwin/core-frontend';
import { datumPlaneGeometries } from '@luban-cad/viewer';
import type { DatumPlaneId } from '@luban-cad/viewer';
import {
  datumPlanePickPoints,
  pickDatumPlaneAt,
  type ScreenPoint,
} from '../internal/plane-picker.js';
import './SketchPlanePicker.css';

export interface SketchPlanePickerProps {
  viewport?: ScreenViewport | null;
  selected?: DatumPlaneId | null;
  onSelect: (id: DatumPlaneId) => void;
  /** 新建草图名（Onshape live：选中平面后沿其顶边显示浅蓝「草图 N」）。 */
  pendingSketchName?: string;
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

export function SketchPlanePicker({
  viewport,
  selected,
  onSelect,
  pendingSketchName,
}: SketchPlanePickerProps): React.JSX.Element | null {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = React.useState<DatumPlaneId | null>(null);
  const [points, setPoints] = React.useState<Partial<Record<DatumPlaneId, ScreenPoint>>>({});
  const hoverRef = React.useRef<DatumPlaneId | null>(null);
  hoverRef.current = hover;

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
    for (const geometry of datumPlaneGeometries(viewport)) {
      const active = geometry.id === hover || geometry.id === selected;
      if (!active) continue;
      const points2d = geometry.points.map((p) => viewport.worldToView(p));
      ctx.beginPath();
      ctx.moveTo(points2d[0]!.x, points2d[0]!.y);
      for (let i = 1; i < points2d.length; i++) ctx.lineTo(points2d[i]!.x, points2d[i]!.y);
      ctx.closePath();
      ctx.fillStyle = geometry.id === selected ? SELECTED_FILL : HOVER_FILL;
      ctx.fill();
      ctx.strokeStyle = SELECTED_STROKE;
      ctx.lineWidth = geometry.id === selected ? 2 : 1.25;
      ctx.stroke();
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
  }, [viewport, hover, selected, pendingSketchName]);

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
        aria-hidden="true"
      />
    </React.Fragment>
  );
}
