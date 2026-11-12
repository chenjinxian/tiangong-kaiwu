/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图实体拾取层（ADR-0018 S1b，2026-11-12 Onshape 对拍）：
 * 草图编辑态（无绘制工具激活）在 iTwin canvas 上监听指针事件，按屏幕距离
 * 命中控制点（≤6px）或曲线（≤5px），把选择写回唯一选择权威
 * `store.canvas.selection`（kind=sketchEntity，经 selection-authority 不投影
 * 到 connection.selectionSet）。
 *
 * 视觉：选中实体=橙色描边（闭合实体加浅橙填充）；悬停=蓝色加粗；控制点悬停
 * 放大圆环。基础约束着色/控制点由 SketchCurvesDecoration 负责，本层只画强调。
 */
import React from 'react';
import type { ScreenViewport } from '@itwin/core-frontend';
import type { Point3d } from '@itwin/core-geometry';
import type { SketchDto } from '@luban-cad/shared';
import {
  sketchControlPointsToWorld,
  sketchEntitiesToWorldPolylines,
  type SketchEntityPolyline,
} from '../internal/sketch-curves.js';
import {
  hitTestSketchEntity,
  type ScreenPoint2,
  type SketchEntitySelection,
  type SketchPickerGeometry,
} from '../internal/sketch-entity-picker.js';
import './SketchPlanePicker.css';

export type { SketchEntitySelection } from '../internal/sketch-entity-picker.js';

export interface SketchEntityPickerProps {
  viewport?: ScreenViewport | null;
  sketch: SketchDto;
  selected: readonly SketchEntitySelection[];
  onSelectionChange: (selection: readonly SketchEntitySelection[]) => void;
}

const CLICK_SLOP_PX = 4;
const SELECTED_STROKE = '#c88a3c';
const HOVER_STROKE = '#4a90e2';
const SELECTED_FILL = 'rgba(245, 166, 65, 0.18)';

export function SketchEntityPicker({
  viewport,
  sketch,
  selected,
  onSelectionChange,
}: SketchEntityPickerProps): React.JSX.Element | null {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = React.useState<SketchEntitySelection | null>(null);
  const hoverRef = React.useRef<SketchEntitySelection | null>(null);
  hoverRef.current = hover;
  const selectedRef = React.useRef(selected);
  selectedRef.current = selected;

  const geometry = React.useMemo(() => ({
    polylines: sketchEntitiesToWorldPolylines(sketch.entities, sketch.plane),
    controlPoints: sketchControlPointsToWorld(sketch.entities, sketch.plane),
  }), [sketch.entities, sketch.plane]);

  const toScreen = React.useCallback((viewport2: ScreenViewport, points: readonly Point3d[]): ScreenPoint2[] =>
    points.map((p) => {
      const v = viewport2.worldToView(p);
      return { x: v.x, y: v.y };
    }), []);

  const hitTest = React.useCallback((point: ScreenPoint2): SketchEntitySelection | null => {
    if (!viewport?.viewRect)
      return null;
    const project = (world: Point3d): ScreenPoint2 => {
      const v = viewport.worldToView(world);
      return { x: v.x, y: v.y };
    };
    return hitTestSketchEntity(geometry as SketchPickerGeometry, point, project, sketch.id);
  }, [viewport, geometry, sketch.id]);

  const sameSelection = (a: SketchEntitySelection, b: SketchEntitySelection): boolean =>
    a.entityId === b.entityId && a.part === b.part;

  // 指针监听（挂 iTwin canvas，不阻挡旋转/缩放——与 SketchPlanePicker 同姿态）。
  React.useEffect(() => {
    const canvas = viewport?.canvas;
    if (!viewport || !canvas)
      return;
    let down: ScreenPoint2 | undefined;
    const local = (event: PointerEvent): ScreenPoint2 => ({ x: event.offsetX, y: event.offsetY });
    const onDown = (event: PointerEvent): void => {
      if (event.button !== 0)
        return;
      down = local(event);
    };
    const onUp = (event: PointerEvent): void => {
      if (event.button !== 0 || !down)
        return;
      const up = local(event);
      const moved = Math.hypot(up.x - down.x, up.y - down.y);
      down = undefined;
      if (moved > CLICK_SLOP_PX)
        return;
      const hit = hitTest(up);
      const current = selectedRef.current;
      if (!hit) {
        if (current.length > 0)
          onSelectionChange([]);
        return;
      }
      const toggle = event.ctrlKey || event.metaKey;
      const exists = current.find((entry) => sameSelection(entry, hit));
      if (toggle) {
        onSelectionChange(exists
          ? current.filter((entry) => !sameSelection(entry, hit))
          : [...current, hit]);
      } else {
        onSelectionChange([hit]);
      }
    };
    const onMove = (event: PointerEvent): void => {
      const hit = hitTest(local(event));
      const prev = hoverRef.current;
      if (hit === null && prev === null)
        return;
      if (hit && prev && sameSelection(hit, prev))
        return;
      setHover(hit);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointermove', onMove);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointermove', onMove);
    };
  }, [viewport, hitTest, onSelectionChange]);

  const draw = React.useCallback((): void => {
    const overlay = canvasRef.current;
    if (!overlay || !viewport?.viewRect)
      return;
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
    if (!ctx)
      return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const selectedIds = new Set(selected.map((entry) => entry.entityId));
    const hoverId = hover?.entityId;
    const drawLine = (line: SketchEntityPolyline, style: string, lineWidth: number, fill?: string): void => {
      const pts = toScreen(viewport, line.points);
      if (pts.length < 2)
        return;
      ctx.beginPath();
      ctx.moveTo(pts[0]!.x, pts[0]!.y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
      const closed = pts.length > 3
        && Math.hypot(pts[0]!.x - pts.at(-1)!.x, pts[0]!.y - pts.at(-1)!.y) < 0.5;
      if (closed && fill) {
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.strokeStyle = style;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash([]);
      ctx.stroke();
    };
    for (const line of geometry.polylines) {
      if (!selectedIds.has(line.entityId))
        continue;
      drawLine(line, SELECTED_STROKE, 2, SELECTED_FILL);
    }
    if (hoverId !== undefined && !selectedIds.has(hoverId)) {
      const line = geometry.polylines.find((entry) => entry.entityId === hoverId);
      if (line)
        drawLine(line, HOVER_STROKE, 2);
    }
    // 控制点悬停强调（基础控制点由 SketchCurvesDecoration 绘制）。
    if (hover?.part === 'handle') {
      const cp = geometry.controlPoints.find((entry) => entry.entityId === hover.entityId);
      if (cp) {
        const v = viewport.worldToView(cp.position);
        ctx.beginPath();
        ctx.arc(v.x, v.y, 5.5, 0, Math.PI * 2);
        ctx.strokeStyle = HOVER_STROKE;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [viewport, geometry, selected, hover, toScreen]);

  React.useEffect(() => { draw(); }, [draw]);
  React.useEffect(() => {
    if (!viewport?.viewRect)
      return;
    const event = viewport.onViewChanged;
    const refresh = (): void => { draw(); };
    event?.addListener?.(refresh);
    window.addEventListener('resize', refresh);
    return () => {
      event?.removeListener?.(refresh);
      window.removeEventListener('resize', refresh);
    };
  }, [viewport, draw]);

  return (
    <React.Fragment>
      <canvas ref={canvasRef} className="part-studio-plane-picker" aria-hidden="true" />
      <div
        className="part-studio-plane-picker__marker"
        data-testid="sketch-entity-picker"
        data-selected={JSON.stringify(selected.map((entry) => [entry.entityId, entry.part]))}
        data-hover={hover ? `${hover.entityId}:${hover.part}` : ''}
        aria-hidden="true"
      />
    </React.Fragment>
  );
}
