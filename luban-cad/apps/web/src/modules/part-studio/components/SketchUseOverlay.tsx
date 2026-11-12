/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图「使用」（Use）canvas 覆盖层（Onshape Use 首切片 2026-11-13）。
 *
 * 激活期间读取同一 Part Studio 内**当前草图之前**的其它草图（最多 8 张，按
 * 树序取最近的），把 line/circle/arc 画成灰色虚线候选；指针悬停高亮、点击
 * 交给宿主生成 projected 根实体（后端 updateSketch 实时重投影）。
 *
 * 边界：仅草图源（实体边/面未接）；样条/投影源不入候选；非平行平面的圆/弧
 * 可点但由宿主诚实拒收（后端同样拒收）。Esc 结束。
 */
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { SketchDto, SketchEntityDto } from '@luban-cad/shared';
import { LubanFeatureRpcInterface } from '@luban-cad/shared';
import type { BriefcaseConnection, ScreenViewport } from '@itwin/core-frontend';
import { sketchEntitiesToWorldPolylines, type SketchEntityPolyline } from '../internal/sketch-curves.js';
import { curveDistance, HIT_CURVE_PX } from '../internal/sketch-entity-picker.js';
import { isUsableSourceEntity } from '../internal/sketch-use.js';
import { sketchPlaneFrameFrom } from '../tools/sketch/sketch-plane.js';
import type { Point3d } from '@itwin/core-geometry';

const MAX_SOURCE_SKETCHES = 8;

export interface SketchUsePick {
  sketch: SketchDto;
  entity: SketchEntityDto;
}

export interface SketchUseOverlayProps {
  viewport: ScreenViewport;
  connection: BriefcaseConnection;
  partStudioId?: string;
  /** 当前草图之前的同 Part Studio 草图 id（树序；取最近 8 张）。 */
  sourceSketchIds: readonly string[];
  onPick: (pick: SketchUsePick) => void | Promise<void>;
  onError: (message: string) => void;
  onCancel: () => void;
}

interface SourceGeometry {
  sketch: SketchDto;
  lines: SketchEntityPolyline[];
  points: Array<{ entityId: number; position: Point3d }>;
}

export function SketchUseOverlay({
  viewport,
  connection,
  partStudioId,
  sourceSketchIds,
  onPick,
  onError,
  onCancel,
}: SketchUseOverlayProps): React.JSX.Element {
  const { t } = useTranslation();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [sources, setSources] = React.useState<SourceGeometry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [hover, setHover] = React.useState<{ sketchId: string; entityId: number } | null>(null);
  const sourceKey = sourceSketchIds.join(',');

  React.useEffect(() => {
    let disposed = false;
    setLoading(true);
    setSources([]);
    const ids = [...sourceSketchIds].slice(-MAX_SOURCE_SKETCHES);
    void (async () => {
      const client = LubanFeatureRpcInterface.getClient();
      const loaded: SourceGeometry[] = [];
      for (const id of ids) {
        const sketch = await client.getSketch(connection.key, id, partStudioId);
        if (!sketch)
          continue;
        // 保留点实体供数字引用解析；折线只由线/圆/弧产生。
        const usable = sketch.entities.filter(
          (entity) => entity.kind === 'point' || isUsableSourceEntity(entity),
        );
        const frame = sketchPlaneFrameFrom(sketch.plane);
        const points = usable
          .filter((entity): entity is Extract<SketchEntityDto, { kind: 'point' }> => entity.kind === 'point')
          .filter((entity) => typeof entity.x === 'number' && typeof entity.y === 'number')
          .map((entity) => ({
            entityId: entity.id,
            position: frame.toWorld({ u: entity.x ?? 0, v: entity.y ?? 0 }),
          }));
        loaded.push({ sketch, lines: sketchEntitiesToWorldPolylines(usable, sketch.plane), points });
      }
      if (!disposed) {
        setSources(loaded);
        setLoading(false);
      }
    })().catch((err: unknown) => {
      if (disposed)
        return;
      setLoading(false);
      onError(t('partStudio.sketch.useError', { message: err instanceof Error ? err.message : String(err) }));
    });
    return () => {
      disposed = true;
    };
    // sourceKey 是 sourceSketchIds 的稳定内容键（数组每次渲染可能新引用）。
  }, [connection.key, partStudioId, sourceKey, onError, t, sourceSketchIds]);

  const draw = React.useCallback((): void => {
    const canvas = canvasRef.current;
    const viewRect = viewport?.viewRect;
    if (!canvas || !viewRect)
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
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.4;
    for (const source of sources) {
      for (const line of source.lines) {
        if (line.points.length < 2)
          continue;
        const highlighted = hover !== null
          && hover.sketchId === source.sketch.id
          && hover.entityId === line.entityId;
        ctx.strokeStyle = highlighted
          ? 'rgba(245, 166, 65, 0.95)'
          : line.construction
            ? 'rgba(150, 150, 160, 0.65)'
            : 'rgba(110, 140, 190, 0.85)';
        ctx.lineWidth = highlighted ? 2.4 : 1.4;
        ctx.beginPath();
        const screen = line.points.map((point) => viewport.worldToView(point));
        ctx.moveTo(screen[0]!.x, screen[0]!.y);
        for (let index = 1; index < screen.length; index++)
          ctx.lineTo(screen[index]!.x, screen[index]!.y);
        const closed = screen.length > 3
          && Math.hypot(screen[0]!.x - screen.at(-1)!.x, screen[0]!.y - screen.at(-1)!.y) < 0.5;
        if (closed)
          ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    for (const source of sources) {
      for (const point of source.points) {
        const screen = viewport.worldToView(point.position);
        const highlighted = hover !== null
          && hover.sketchId === source.sketch.id
          && hover.entityId === point.entityId;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, highlighted ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = highlighted ? 'rgba(245, 166, 65, 0.95)' : 'rgba(110, 140, 190, 0.85)';
        ctx.fill();
      }
    }
  }, [sources, hover, viewport]);

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

  const findHit = React.useCallback((point: { x: number; y: number }): { source: SourceGeometry; entityId: number } | null => {
    let best: { source: SourceGeometry; entityId: number; distance: number } | null = null;
    for (const source of sources) {
      for (const line of source.lines) {
        const distance = curveDistance(point, line.points.map((world) => viewport.worldToView(world)));
        if (distance <= HIT_CURVE_PX && (best === null || distance < best.distance))
          best = { source, entityId: line.entityId, distance };
      }
      for (const sourcePoint of source.points) {
        const screen = viewport.worldToView(sourcePoint.position);
        const distance = Math.hypot(point.x - screen.x, point.y - screen.y);
        if (distance <= 6 && (best === null || distance < best.distance))
          best = { source, entityId: sourcePoint.entityId, distance };
      }
    }
    return best && { source: best.source, entityId: best.entityId };
  }, [sources, viewport]);

  const localPoint = React.useCallback((event: React.PointerEvent | React.MouseEvent): { x: number; y: number } => {
    const rect = viewport.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, [viewport]);

  const handleMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    const hit = findHit(localPoint(event));
    const next = hit ? { sketchId: hit.source.sketch.id, entityId: hit.entityId } : null;
    if (next?.sketchId !== hover?.sketchId || next?.entityId !== hover?.entityId)
      setHover(next);
  }, [findHit, hover, localPoint]);

  const handleClick = React.useCallback((event: React.MouseEvent<HTMLDivElement>): void => {
    const hit = findHit(localPoint(event));
    if (!hit)
      return;
    const entity = hit.source.sketch.entities.find((candidate) => candidate.id === hit.entityId);
    if (!entity)
      return;
    void onPick({ sketch: hit.source.sketch, entity });
  }, [findHit, localPoint, onPick]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.target instanceof HTMLInputElement)
        return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onCancel]);

  const prompt = loading
    ? t('partStudio.sketch.useLoading')
    : sources.length === 0
      ? t('partStudio.sketch.useEmpty')
      : t('partStudio.sketch.usePrompt');

  return (
    <React.Fragment>
      <canvas ref={canvasRef} className="part-studio-pattern-overlay" data-testid="sketch-use-overlay" aria-hidden="true" />
      <div
        data-testid="sketch-use-hit-layer"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 20,
          cursor: hover ? 'pointer' : 'crosshair',
        }}
        onPointerMove={handleMove}
        onPointerLeave={() => setHover(null)}
        onClick={handleClick}
      />
      <div className="part-studio-pattern-prompt" data-testid="sketch-use-prompt">
        {prompt}
      </div>
    </React.Fragment>
  );
}
