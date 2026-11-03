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
}

const HOVER_FILL = 'rgba(64, 150, 255, 0.12)';
const SELECTED_FILL = 'rgba(30, 108, 224, 0.16)';
const SELECTED_STROKE = 'rgba(30, 108, 224, 0.95)';

export function SketchPlanePicker({
  viewport,
  selected,
  onSelect,
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
    }
  }, [viewport, hover, selected]);

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
