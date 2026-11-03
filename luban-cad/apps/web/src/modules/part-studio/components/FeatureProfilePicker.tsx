/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * 特征对话框的草图面域视口拾取层（2026-11-02 Onshape live）：Extrude/Revolve
 * 打开时悬停/点击画布中的草图面域即可加入/移除「要拉伸的面和草图面域」。
 * 监听挂 iTwin canvas，不拦截视图操作；橙色选中填充仍由 FeaturePreviewOverlay
 * 绘制，本层只画悬停蓝色和选中橙色轮廓。
 */
import React from 'react';
import type { ScreenViewport } from '@itwin/core-frontend';
import {
  pickProfileAt,
  profilePickPoints,
  projectRegion,
  type ProfilePick,
  type ProfileSketch,
} from '../internal/profile-picker.js';
import type { ScreenPoint } from '../internal/plane-picker.js';
import './FeatureProfilePicker.css';

export interface FeatureProfilePickerProps {
  viewport?: ScreenViewport | null;
  profiles: readonly ProfileSketch[];
  selected: readonly ProfilePick[];
  onToggle: (pick: ProfilePick) => void;
}

const HOVER_FILL = 'rgba(64, 150, 255, 0.16)';
const HOVER_STROKE = 'rgba(30, 108, 224, 0.9)';
const SELECTED_STROKE = 'rgba(245, 166, 35, 0.95)';

export function FeatureProfilePicker({
  viewport,
  profiles,
  selected,
  onToggle,
}: FeatureProfilePickerProps): React.JSX.Element | null {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = React.useState<ProfilePick | null>(null);
  const [points, setPoints] = React.useState<Array<ProfilePick & ScreenPoint>>([]);
  const hoverRef = React.useRef<ProfilePick | null>(null);
  hoverRef.current = hover;
  const selectedKey = React.useMemo(
    () => new Set(selected.map((pick) => `${pick.sketchId}:${pick.regionIndex}`)),
    [selected],
  );

  React.useEffect(() => {
    const canvas = viewport?.canvas;
    if (!viewport || !canvas) return;
    let down: ScreenPoint | undefined;
    const local = (event: PointerEvent): ScreenPoint => ({ x: event.offsetX, y: event.offsetY });
    const onDown = (event: PointerEvent): void => {
      if (event.button === 0) down = local(event);
    };
    const onUp = (event: PointerEvent): void => {
      if (event.button !== 0 || !down) return;
      const up = local(event);
      const moved = Math.hypot(up.x - down.x, up.y - down.y);
      down = undefined;
      if (moved > 4) return;
      const hit = pickProfileAt(viewport, profiles, up);
      if (hit) onToggle(hit);
    };
    const onMove = (event: PointerEvent): void => {
      const hit = pickProfileAt(viewport, profiles, local(event)) ?? null;
      const old = hoverRef.current;
      if ((hit?.sketchId ?? '') !== (old?.sketchId ?? '') || (hit?.regionIndex ?? -1) !== (old?.regionIndex ?? -1))
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
  }, [viewport, profiles, onToggle]);

  const draw = React.useCallback((): void => {
    const overlay = canvasRef.current;
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
    for (const sketch of profiles) {
      sketch.regions.forEach((region, regionIndex) => {
        const key = `${sketch.id}:${regionIndex}`;
        const hovered = hover?.sketchId === sketch.id && hover.regionIndex === regionIndex;
        const isSelected = selectedKey.has(key);
        if (!hovered && !isSelected) return;
        const loops = projectRegion(viewport, sketch, region);
        if (!loops) return;
        ctx.beginPath();
        ctx.moveTo(loops.outer[0]!.x, loops.outer[0]!.y);
        for (let i = 1; i < loops.outer.length; i++) ctx.lineTo(loops.outer[i]!.x, loops.outer[i]!.y);
        ctx.closePath();
        for (const hole of loops.holes) {
          if (hole.length < 3) continue;
          ctx.moveTo(hole[0]!.x, hole[0]!.y);
          for (let i = 1; i < hole.length; i++) ctx.lineTo(hole[i]!.x, hole[i]!.y);
          ctx.closePath();
        }
        if (hovered) {
          ctx.fillStyle = HOVER_FILL;
          ctx.fill('evenodd');
          ctx.strokeStyle = HOVER_STROKE;
          ctx.lineWidth = 1.5;
        } else {
          ctx.strokeStyle = SELECTED_STROKE;
          ctx.lineWidth = 2;
        }
        ctx.stroke();
      });
    }
  }, [viewport, profiles, hover, selectedKey]);

  React.useEffect(() => { draw(); }, [draw]);
  React.useEffect(() => {
    if (!viewport?.viewRect) return;
    const refresh = (): void => {
      setPoints(profilePickPoints(viewport, profiles));
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
  }, [viewport, profiles, draw]);

  return (
    <React.Fragment>
      <canvas ref={canvasRef} className="part-studio-profile-picker" aria-hidden="true" />
      <div
        className="part-studio-profile-picker__marker"
        data-testid="feature-profile-picker"
        data-region-points={JSON.stringify(points)}
        data-hover={hover ? `${hover.sketchId}:${hover.regionIndex}` : ''}
        aria-hidden="true"
      />
    </React.Fragment>
  );
}
