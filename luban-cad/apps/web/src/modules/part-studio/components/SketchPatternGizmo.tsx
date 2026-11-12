/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图线性阵列 gizmo（AIRR 2026-11-12，Onshape canvas manipulator 对拍）：
 * - 橙色种子由 SketchEntityPicker 高亮；本层画蓝色预览实例与方向/间距/计数手柄。
 * - 拖方向手柄旋转（Shift 吸附 15°）；拖间距手柄改间距；拖计数手柄改实例数。
 * - 点数值手柄内联输入；Enter 提交一次 updateSketch（可撤销），Esc 取消。
 * - 草图对话框 ✓/右键「确认 草图」经 sketch-pattern-session 先提交未完成阵列。
 *
 * 近似登记：shared 无“阵列关系”约束 kind，实例是独立几何副本（改动不联动）。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ScreenViewport } from '@itwin/core-frontend';
import { Point3d } from '@itwin/core-geometry';
import type { SketchConstraintDto, SketchDto, SketchEntityDto } from '@luban-cad/shared';
import { sketchEntitiesToWorldPolylines } from '../internal/sketch-curves.js';
import type { SketchEntitySelection } from '../internal/sketch-entity-picker.js';
import {
  buildSketchLinearPattern,
  SKETCH_PATTERN_MAX_COUNT,
  SKETCH_PATTERN_MIN_COUNT,
} from '../internal/sketch-pattern.js';
import { registerSketchPatternCommit } from '../internal/sketch-pattern-session.js';
import { screenToSketchLocal } from '../internal/sketch-screen.js';
import { sketchPlaneFrameFrom } from '../tools/sketch/sketch-plane.js';
import './SketchPlanePicker.css';

export interface SketchPatternApplyResult {
  ok: boolean;
  error?: string;
}

export interface SketchPatternGizmoProps {
  viewport?: ScreenViewport | null;
  sketch: SketchDto;
  selected: readonly SketchEntitySelection[];
  /** 宿主一次 updateSketch 提交；失败返回错误文案。 */
  onApply: (
    entities: SketchEntityDto[],
    constraints: SketchConstraintDto[],
    instanceCurveIds: readonly number[][],
  ) => Promise<SketchPatternApplyResult>;
  /** 退出阵列模式（提交成功后由本组件调用）。 */
  onCancel: () => void;
  onError: (message: string) => void;
}

const DEFAULT_SPACING_MM = 10;
const DEFAULT_COUNT = 3;
const DIRECTION_HANDLE_PX = 70;
const MIN_HANDLE_SPACING_PX = 30;
const CLICK_SLOP_PX = 3;
const PREVIEW_STROKE = '#4a90e2';
const PREVIEW_FILL = 'rgba(74, 144, 226, 0.12)';

type DragKind = 'direction' | 'spacing' | 'count';
type EditKind = 'spacing' | 'count';

interface DragState {
  kind: DragKind;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatMm(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function SketchPatternGizmo({
  viewport,
  sketch,
  selected,
  onApply,
  onCancel,
  onError,
}: SketchPatternGizmoProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [directionRad, setDirectionRad] = React.useState(0);
  const [spacingMm, setSpacingMm] = React.useState(DEFAULT_SPACING_MM);
  const [count, setCount] = React.useState(DEFAULT_COUNT);
  const [editing, setEditing] = React.useState<{ kind: EditKind; value: string; x: number; y: number } | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [, forceTick] = React.useReducer((value: number) => value + 1, 0);
  const dragRef = React.useRef<DragState | null>(null);
  const submittingRef = React.useRef(false);
  const editingRef = React.useRef(editing);
  editingRef.current = editing;

  const seedIds = React.useMemo(
    () => new Set(selected.filter((entry) => entry.part === 'curve').map((entry) => entry.entityId)),
    [selected],
  );
  const seedPolylines = React.useMemo(
    () => sketchEntitiesToWorldPolylines(sketch.entities, sketch.plane)
      .filter((line) => seedIds.has(line.entityId)),
    [sketch.entities, sketch.plane, seedIds],
  );
  const seedCenter = React.useMemo(() => {
    let x = 0;
    let y = 0;
    let z = 0;
    let points = 0;
    for (const line of seedPolylines) {
      for (const point of line.points) {
        x += point.x;
        y += point.y;
        z += point.z;
        points += 1;
      }
    }
    return points > 0 ? Point3d.create(x / points, y / points, z / points) : undefined;
  }, [seedPolylines]);
  const frame = React.useMemo(() => sketchPlaneFrameFrom(sketch.plane), [sketch.plane]);
  const seedLocal = React.useMemo(() => seedCenter ? frame.toLocal(seedCenter) : undefined, [seedCenter, frame]);

  const preview = React.useMemo(
    () => buildSketchLinearPattern(sketch.entities, sketch.constraints, selected, {
      directionRad,
      spacingLocal: spacingMm / 1000,
      count,
    }),
    [sketch.entities, sketch.constraints, selected, directionRad, spacingMm, count],
  );

  // 相机/尺寸变化时重算手柄屏幕位置（草图内仍可能旋转/缩放）。
  React.useEffect(() => {
    if (!viewport)
      return;
    const refresh = (): void => forceTick();
    const event = viewport.onViewChanged;
    event?.addListener?.(refresh);
    window.addEventListener('resize', refresh);
    return () => {
      event?.removeListener?.(refresh);
      window.removeEventListener('resize', refresh);
    };
  }, [viewport]);

  const canvasBox = viewport?.canvas?.getBoundingClientRect();
  const toClient = React.useCallback((world: Point3d): { x: number; y: number } | undefined => {
    if (!viewport || !canvasBox)
      return undefined;
    const v = viewport.worldToView(world);
    return { x: canvasBox.left + v.x, y: canvasBox.top + v.y };
  }, [viewport, canvasBox]);

  const seedClient = seedCenter ? toClient(seedCenter) : undefined;
  const spacingLocal = spacingMm / 1000;
  const firstWorld = seedLocal
    ? frame.toWorld({
      u: seedLocal.u + Math.cos(directionRad) * spacingLocal,
      v: seedLocal.v + Math.sin(directionRad) * spacingLocal,
    })
    : undefined;
  const lastWorld = seedLocal
    ? frame.toWorld({
      u: seedLocal.u + Math.cos(directionRad) * spacingLocal * (count - 1),
      v: seedLocal.v + Math.sin(directionRad) * spacingLocal * (count - 1),
    })
    : undefined;
  const firstClient = firstWorld ? toClient(firstWorld) : undefined;
  let screenDir = { x: 1, y: 0 };
  let spacingPx = MIN_HANDLE_SPACING_PX;
  if (seedClient && firstClient) {
    const dx = firstClient.x - seedClient.x;
    const dy = firstClient.y - seedClient.y;
    const length = Math.hypot(dx, dy);
    if (length > 0.5)
      screenDir = { x: dx / length, y: dy / length };
    spacingPx = Math.max(MIN_HANDLE_SPACING_PX, length);
  }
  const perp = { x: -screenDir.y, y: screenDir.x };
  const lastClient = seedClient ? {
    x: seedClient.x + screenDir.x * spacingPx * (count - 1),
    y: seedClient.y + screenDir.y * spacingPx * (count - 1),
  } : undefined;
  const directionClient = seedClient ? {
    x: seedClient.x + screenDir.x * DIRECTION_HANDLE_PX,
    y: seedClient.y + screenDir.y * DIRECTION_HANDLE_PX,
  } : undefined;
  const spacingHandle = seedClient ? {
    x: seedClient.x + screenDir.x * spacingPx * 0.5 + perp.x * 16,
    y: seedClient.y + screenDir.y * spacingPx * 0.5 + perp.y * 16,
  } : undefined;
  const countHandle = lastClient ? {
    x: lastClient.x + perp.x * 16,
    y: lastClient.y + perp.y * 16,
  } : undefined;

  const draw = React.useCallback((): void => {
    const canvas = canvasRef.current;
    const viewRect = viewport?.viewRect;
    if (!canvas || !viewport || !viewRect)
      return;
    const width = Math.max(1, Math.round(viewRect.width));
    const height = Math.max(1, Math.round(viewRect.height));
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx)
      return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!preview.ok || !seedCenter || !lastWorld)
      return;

    const seedView = viewport.worldToView(seedCenter);
    const lastView = viewport.worldToView(lastWorld);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(74, 144, 226, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(seedView.x, seedView.y);
    ctx.lineTo(lastView.x, lastView.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const instanceIds = new Set(preview.instanceCurveIds.slice(1).flat());
    if (instanceIds.size === 0)
      return;
    const lines = sketchEntitiesToWorldPolylines(preview.entities, sketch.plane)
      .filter((line) => instanceIds.has(line.entityId));
    for (const line of lines) {
      if (line.points.length < 2)
        continue;
      const screen = line.points.map((point) => viewport.worldToView(point));
      ctx.beginPath();
      ctx.moveTo(screen[0]!.x, screen[0]!.y);
      for (let index = 1; index < screen.length; index++)
        ctx.lineTo(screen[index]!.x, screen[index]!.y);
      const closed = screen.length > 3
        && Math.hypot(screen[0]!.x - screen.at(-1)!.x, screen[0]!.y - screen.at(-1)!.y) < 0.5;
      if (closed) {
        ctx.closePath();
        ctx.fillStyle = PREVIEW_FILL;
        ctx.fill();
      }
      ctx.strokeStyle = PREVIEW_STROKE;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [preview, viewport, sketch.plane, seedCenter, lastWorld]);

  React.useEffect(() => { draw(); }, [draw]);
  React.useEffect(() => {
    if (!viewport?.viewRect)
      return;
    const refresh = (): void => draw();
    const event = viewport.onViewChanged;
    event?.addListener?.(refresh);
    window.addEventListener('resize', refresh);
    return () => {
      event?.removeListener?.(refresh);
      window.removeEventListener('resize', refresh);
    };
  }, [viewport, draw]);

  const errorMessage = React.useCallback((error: string): string => {
    if (error === 'no-selection')
      return t('partStudio.sketch.patternSelectPrompt');
    if (error === 'invalid-count')
      return t('partStudio.sketch.patternErrorCount', { min: SKETCH_PATTERN_MIN_COUNT, max: SKETCH_PATTERN_MAX_COUNT });
    if (error === 'invalid-spacing')
      return t('partStudio.sketch.patternErrorSpacing');
    return t('partStudio.sketch.patternErrorDirection');
  }, [t]);

  const commit = React.useCallback(async (): Promise<boolean> => {
    if (!preview.ok) {
      onError(errorMessage(preview.error));
      return false;
    }
    if (submittingRef.current)
      return false;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await onApply(preview.entities, preview.constraints, preview.instanceCurveIds);
      if (!result.ok) {
        onError(t('partStudio.sketch.patternCommitFailed', { message: result.error ?? '' }));
        return false;
      }
      // 成功：退出阵列模式；草图保持编辑态（与 Onshape 的工具完成一致）。
      onCancel();
      return true;
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [preview, onApply, onCancel, onError, t, errorMessage]);

  const commitRef = React.useRef(commit);
  commitRef.current = commit;
  React.useEffect(() => {
    registerSketchPatternCommit(() => commitRef.current());
    return () => registerSketchPatternCommit(null);
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement)
        return; // 内联输入自己处理 Enter/Escape
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        void commitRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onCancel]);

  const beginEdit = React.useCallback((kind: EditKind, position: { x: number; y: number }): void => {
    setEditing({
      kind,
      value: kind === 'spacing' ? formatMm(spacingMm) : String(count),
      x: position.x,
      y: position.y,
    });
  }, [spacingMm, count]);

  const applyEdit = React.useCallback((): void => {
    const current = editingRef.current;
    if (!current)
      return;
    const numeric = Number(current.value);
    if (Number.isFinite(numeric)) {
      if (current.kind === 'spacing') {
        if (numeric > 0 && numeric <= 1_000_000)
          setSpacingMm(numeric);
      } else {
        const next = Math.round(numeric);
        if (next >= SKETCH_PATTERN_MIN_COUNT && next <= SKETCH_PATTERN_MAX_COUNT)
          setCount(next);
      }
    }
    setEditing(null);
  }, []);

  const startDrag = React.useCallback((kind: DragKind) => (event: React.PointerEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // jsdom/合成事件无 pointer capture：仍按普通拖拽处理。
    }
    dragRef.current = {
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  }, []);

  const moveDrag = React.useCallback((event: React.PointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current;
    if (!drag || !viewport || !seedLocal || event.pointerId !== drag.pointerId)
      return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > CLICK_SLOP_PX)
      drag.moved = true;
    const rect = viewport.canvas.getBoundingClientRect();
    const local = screenToSketchLocal(viewport, sketch.plane, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
    if (!local)
      return;
    const du = local.u - seedLocal.u;
    const dv = local.v - seedLocal.v;
    if (drag.kind === 'direction') {
      let angle = Math.atan2(dv, du);
      if (event.shiftKey) {
        const step = Math.PI / 12;
        angle = Math.round(angle / step) * step;
      }
      setDirectionRad(angle);
      return;
    }
    const projection = du * Math.cos(directionRad) + dv * Math.sin(directionRad);
    if (drag.kind === 'spacing') {
      if (projection > 0.0001)
        setSpacingMm(clamp(projection * 1000, 0.1, 1_000_000));
      return;
    }
    const next = Math.round(projection / spacingLocal) + 1;
    setCount(clamp(next, SKETCH_PATTERN_MIN_COUNT, SKETCH_PATTERN_MAX_COUNT));
  }, [viewport, seedLocal, sketch.plane, directionRad, spacingLocal]);

  const endDrag = React.useCallback((event: React.PointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current;
    if (!drag)
      return;
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // 同上。
    }
    if (drag.moved)
      return;
    if (drag.kind === 'spacing' && spacingHandle)
      beginEdit('spacing', spacingHandle);
    else if (drag.kind === 'count' && countHandle)
      beginEdit('count', countHandle);
  }, [beginEdit, spacingHandle, countHandle]);

  if (!viewport || !sketch)
    return null;

  const hasSeed = seedLocal !== undefined;
  return (
    <React.Fragment>
      <canvas ref={canvasRef} className="part-studio-pattern-overlay" data-testid="sketch-pattern-preview" aria-hidden="true" />
      <div className="part-studio-pattern-prompt" data-testid="sketch-pattern-prompt">
        {!seedLocal
          ? t('partStudio.sketch.patternSelectPrompt')
          : t('partStudio.sketch.patternPrompt')}
      </div>
      {hasSeed && seedClient && (
        <React.Fragment>
          <button
            type="button"
            className="part-studio-pattern-handle part-studio-pattern-handle--direction"
            data-testid="sketch-pattern-direction"
            title={t('partStudio.sketch.patternDirection')}
            aria-label={t('partStudio.sketch.patternDirection')}
            style={directionClient ? { left: directionClient.x, top: directionClient.y } : undefined}
            onPointerDown={startDrag('direction')}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.5 8h8.5M8 4.5 12 8l-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {spacingHandle && (
            <button
              type="button"
              className="part-studio-pattern-handle part-studio-pattern-handle--value"
              data-testid="sketch-pattern-spacing"
              title={t('partStudio.sketch.patternSpacing')}
              aria-label={t('partStudio.sketch.patternSpacing')}
              style={{ left: spacingHandle.x, top: spacingHandle.y }}
              onPointerDown={startDrag('spacing')}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              disabled={submitting}
            >
              <span className="part-studio-pattern-handle__label">{formatMm(spacingMm)}</span>
            </button>
          )}
          {countHandle && (
            <button
              type="button"
              className="part-studio-pattern-handle part-studio-pattern-handle--value"
              data-testid="sketch-pattern-count"
              title={t('partStudio.sketch.patternCount')}
              aria-label={t('partStudio.sketch.patternCount')}
              style={{ left: countHandle.x, top: countHandle.y }}
              onPointerDown={startDrag('count')}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              disabled={submitting}
            >
              <span className="part-studio-pattern-handle__label">{count}x</span>
            </button>
          )}
          {editing && (
            <input
              className="part-studio-pattern-input"
              data-testid="sketch-pattern-input"
              aria-label={editing.kind === 'spacing'
                ? t('partStudio.sketch.patternSpacingInput')
                : t('partStudio.sketch.patternCountInput')}
              style={{ left: editing.x, top: editing.y }}
              value={editing.value}
              autoFocus
              onChange={(event) => setEditing({ ...editing, value: event.target.value })}
              onFocus={(event) => event.currentTarget.select()}
              onBlur={() => setEditing(null)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyEdit();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  setEditing(null);
                }
              }}
            />
          )}
        </React.Fragment>
      )}
    </React.Fragment>
  );
}
