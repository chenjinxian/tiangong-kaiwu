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
 * 2026-11-21 S1：候选来源扩展**模型边/边端点**（同一 Part Studio 的 active
 * authored body）——复用既有 `readBrepEdgeHandles` + `resolveEdgeRef` 通道，
 * 经 `withExclusiveBrepCommand` 串行（不新增工具族/选择管道）。边曲线虚线、
 * 端点圆点；端点优先 6 px 命中，点击交给宿主构造 externalRefs 行。
 *
 * 2026-11-21 S1b：同一只读通道扩展**平面面**（`readBrepFaceHandles` +
 * `resolveFaceRef`）——面边界外环/孔环画虚线；面命中=指针在屏幕外环多边形内
 * 且不在孔环内（边/端点/曲线先行命中优先，不回归既有拾取）。点击交给宿主
 * 构造 `source.kind="bodyFace"` + `loops:"outer"` 的 externalRefs 行。
 *
 * 边界：边仅 line/arc 精确、面任一环含 other 曲线整面跳过（计数提示）；
 * PIERCE/面环选项（外环/全部环）未接，固定 outer（真栈证据：带孔面只投影
 * 外环）；样条/投影源不入候选；非平行平面的圆/弧由后端诚实拒收。Esc 结束。
 */
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { BodyInfo, SketchDto, SketchEntityDto } from '@luban-cad/shared';
import { LubanFeatureRpcInterface } from '@luban-cad/shared';
import type { BriefcaseConnection, ScreenViewport } from '@itwin/core-frontend';
import { Point3d } from '@itwin/core-geometry';
import { sketchEntitiesToWorldPolylines, type SketchEntityPolyline } from '../internal/sketch-curves.js';
import { curveDistance, HIT_CURVE_PX } from '../internal/sketch-entity-picker.js';
import { isUsableSourceEntity } from '../internal/sketch-use.js';
import {
  faceLoopContainsPoint,
  loadSketchUseBodyCandidates,
  loadSketchUseFaceCandidates,
  type SketchUseBodyCandidate,
  type SketchUseFaceCandidate,
  type SketchUseModelCandidate,
} from '../internal/sketch-use-candidates.js';
import type { BrepEdgeCurve } from '../internal/brep-topology.js';
import { sketchPlaneFrameFrom } from '../tools/sketch/sketch-plane.js';

const MAX_SOURCE_SKETCHES = 8;
/** 端点命中优先半径（px；曲线沿用 HIT_CURVE_PX）。 */
const HIT_ENDPOINT_PX = 6;

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
  /** S1：同 Part Studio 的 body 读面（模型边候选来源；缺省=无体候选）。 */
  bodies?: readonly BodyInfo[];
  onPick: (pick: SketchUsePick) => void | Promise<void>;
  /** S1/S1b：模型边/端点/平面面拾取（宿主构造 externalRefs 行并 applyUpdate）。 */
  onPickBody: (candidate: SketchUseModelCandidate) => void | Promise<void>;
  onError: (message: string) => void;
  onCancel: () => void;
}

interface SourceGeometry {
  sketch: SketchDto;
  lines: SketchEntityPolyline[];
  points: Array<{ entityId: number; position: Point3d }>;
}

type Hover =
  | { kind: 'sketch'; sketchId: string; entityId: number }
  | { kind: 'body'; bodyKey: string; subEntityId: number; part: SketchUseBodyCandidate['part'] }
  | { kind: 'face'; bodyKey: string; subEntityId: number };

const toPoint3d = (tuple: readonly [number, number, number]): Point3d =>
  new Point3d(tuple[0], tuple[1], tuple[2]);

function normalize3(v: readonly [number, number, number]): [number, number, number] | undefined {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (length <= 1e-12)
    return undefined;
  return [v[0] / length, v[1] / length, v[2] / length];
}

/** 边曲线显示折线（仅显示采样；不进入数据/投影事实源）。 */
function bodyCurvePolyline(curve: BrepEdgeCurve): Point3d[] {
  if (curve.kind === 'line')
    return [toPoint3d(curve.p0), toPoint3d(curve.p1)];
  if (curve.kind === 'other')
    return [];
  const [cx, cy, cz] = curve.center;
  const xAxis = normalize3([curve.start[0] - cx, curve.start[1] - cy, curve.start[2] - cz]);
  const normal = normalize3(curve.normal);
  if (!xAxis || !normal)
    return [toPoint3d(curve.start), toPoint3d(curve.end)];
  // y = normal × x（右手系；sweep 符号直接作用到采样角）。
  const yAxis: [number, number, number] = [
    normal[1] * xAxis[2] - normal[2] * xAxis[1],
    normal[2] * xAxis[0] - normal[0] * xAxis[2],
    normal[0] * xAxis[1] - normal[1] * xAxis[0],
  ];
  const steps = Math.max(8, Math.min(64, Math.ceil(Math.abs(curve.sweepRadians) / (Math.PI / 32))));
  const points: Point3d[] = [];
  for (let index = 0; index <= steps; index++) {
    if (index === steps) {
      points.push(toPoint3d(curve.end));
      break;
    }
    const angle = (curve.sweepRadians * index) / steps;
    const cos = Math.cos(angle) * curve.radius;
    const sin = Math.sin(angle) * curve.radius;
    points.push(new Point3d(
      cx + cos * xAxis[0] + sin * yAxis[0],
      cy + cos * xAxis[1] + sin * yAxis[1],
      cz + cos * xAxis[2] + sin * yAxis[2],
    ));
  }
  return points;
}

function bodyEndpoint(curve: BrepEdgeCurve, part: 'start' | 'end'): Point3d | undefined {
  if (curve.kind === 'line')
    return toPoint3d(part === 'start' ? curve.p0 : curve.p1);
  if (curve.kind === 'arc')
    return toPoint3d(part === 'start' ? curve.start : curve.end);
  return undefined;
}

export function SketchUseOverlay({
  viewport,
  connection,
  partStudioId,
  sourceSketchIds,
  bodies,
  onPick,
  onPickBody,
  onError,
  onCancel,
}: SketchUseOverlayProps): React.JSX.Element {
  const { t } = useTranslation();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [sources, setSources] = React.useState<SourceGeometry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [hover, setHover] = React.useState<Hover | null>(null);
  const [bodyCandidates, setBodyCandidates] = React.useState<SketchUseBodyCandidate[]>([]);
  const [faceCandidates, setFaceCandidates] = React.useState<SketchUseFaceCandidate[]>([]);
  const [bodyLoading, setBodyLoading] = React.useState(false);
  const [bodyNote, setBodyNote] = React.useState<string | undefined>(undefined);
  const sourceKey = sourceSketchIds.join(',');
  const bodiesKey = (bodies ?? []).map((body) => `${body.bodyKey}:${body.active ? 1 : 0}`).join(',');

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

  // S1/S1b：模型边/端点 + 平面面候选（同一只读 BRep 通道；动态 import 避免把
  // editor 通道打进非 Use 路径，与 e2e 观测面同款）。读面不可用/无 body 时静默跳过。
  React.useEffect(() => {
    let disposed = false;
    const list = bodies ?? [];
    if (list.length === 0) {
      setBodyCandidates([]);
      setFaceCandidates([]);
      setBodyLoading(false);
      setBodyNote(undefined);
      return;
    }
    setBodyLoading(true);
    void (async () => {
      try {
        const [{ readBrepEdgeHandles, readBrepFaceHandles }, { withExclusiveBrepCommand }] = await Promise.all([
          import('../internal/brep-topology.js'),
          import('../internal/brep-command-coordinator.js'),
        ]);
        const hasEdgeReader = typeof readBrepEdgeHandles === 'function';
        const hasFaceReader = typeof readBrepFaceHandles === 'function';
        if (!hasEdgeReader && !hasFaceReader) {
          if (!disposed) {
            setBodyCandidates([]);
            setFaceCandidates([]);
            setBodyLoading(false);
          }
          return;
        }
        // 两个只读命令共享同一 editor 命令槽：在一次独占任务内顺序执行，
        // 不新增命令槽/拾取管道（hover 只 suspend/resume 一次）。
        const { edges, faces } = await withExclusiveBrepCommand(async () => ({
          edges: hasEdgeReader
            ? await loadSketchUseBodyCandidates({
              iModelKey: connection.key,
              bodies: list,
              readEdges: readBrepEdgeHandles,
              resolveEdgeRef: (iModelKey, bodyKey, subEntityId) =>
                LubanFeatureRpcInterface.getClient().resolveEdgeRef(iModelKey, bodyKey, subEntityId),
            })
            : { candidates: [], skipped: 0, errors: ['read-edges-unavailable' as const] },
          faces: hasFaceReader
            ? await loadSketchUseFaceCandidates({
              iModelKey: connection.key,
              bodies: list,
              readFaces: readBrepFaceHandles,
              resolveFaceRef: (iModelKey, bodyKey, subEntityId) =>
                LubanFeatureRpcInterface.getClient().resolveFaceRef(iModelKey, bodyKey, subEntityId),
            })
            : { candidates: [], skipped: 0, errors: ['read-faces-unavailable' as const] },
        }));
        if (disposed)
          return;
        setBodyCandidates(edges.candidates);
        setFaceCandidates(faces.candidates);
        setBodyLoading(false);
        const unsupportedEdges = edges.errors.filter((code) => code === 'unsupported-curve').length;
        const unsupportedFaces = faces.errors.filter((code) => code === 'unsupported-curve').length;
        const resolveFailed = edges.errors.filter((code) => code === 'resolve-failed').length
          + faces.errors.filter((code) => code === 'resolve-failed').length;
        const noOuterLoop = faces.errors.filter((code) => code === 'no-outer-loop').length;
        const notes: string[] = [];
        if (unsupportedEdges > 0)
          notes.push(t('partStudio.sketch.useBodyEdgeUnsupported', { count: unsupportedEdges }));
        if (unsupportedFaces > 0)
          notes.push(t('partStudio.sketch.useFaceUnsupported', { count: unsupportedFaces }));
        if (noOuterLoop > 0)
          notes.push(t('partStudio.sketch.useFaceLoopUnsupported', { count: noOuterLoop }));
        if (resolveFailed > 0)
          notes.push(t('partStudio.sketch.useResolveFailed', { count: resolveFailed }));
        setBodyNote(notes.length > 0 ? notes.join(' ') : undefined);
      } catch {
        if (!disposed) {
          setBodyCandidates([]);
          setFaceCandidates([]);
          setBodyLoading(false);
          setBodyNote(undefined);
        }
      }
    })();
    return () => {
      disposed = true;
    };
  }, [connection.key, bodiesKey, t]);

  // 体候选显示折线（仅 curve 候选；端点单独画点）。
  const bodyCurves = React.useMemo(
    () => bodyCandidates
      .filter((candidate) => candidate.part === 'curve')
      .map((candidate) => ({
        candidate,
        points: bodyCurvePolyline(candidate.curve),
      }))
      .filter((entry) => entry.points.length >= 2),
    [bodyCandidates],
  );
  const bodyEndpoints = React.useMemo(
    () => bodyCandidates
      .filter((candidate) => candidate.part !== 'curve')
      .map((candidate) => ({
        candidate,
        position: bodyEndpoint(candidate.curve, candidate.part === 'start' ? 'start' : 'end'),
      }))
      .filter((entry): entry is { candidate: SketchUseBodyCandidate; position: Point3d } => entry.position !== undefined),
    [bodyCandidates],
  );
  // S1b：面边界折线（世界坐标；仅显示/命中用，数据事实源在后端投影）。
  const faceLoops = React.useMemo(
    () => faceCandidates.map((candidate) => ({
      candidate,
      polylines: candidate.loops.map((loop) => loop.map(toPoint3d)),
    })),
    [faceCandidates],
  );

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
    const strokePolyline = (points: Point3d[], highlighted: boolean, construction: boolean): void => {
      if (points.length < 2)
        return;
      ctx.strokeStyle = highlighted
        ? 'rgba(245, 166, 65, 0.95)'
        : construction
          ? 'rgba(150, 150, 160, 0.65)'
          : 'rgba(110, 140, 190, 0.85)';
      ctx.lineWidth = highlighted ? 2.4 : 1.4;
      ctx.beginPath();
      const screen = points.map((point) => viewport.worldToView(point));
      ctx.moveTo(screen[0]!.x, screen[0]!.y);
      for (let index = 1; index < screen.length; index++)
        ctx.lineTo(screen[index]!.x, screen[index]!.y);
      const closed = screen.length > 3
        && Math.hypot(screen[0]!.x - screen.at(-1)!.x, screen[0]!.y - screen.at(-1)!.y) < 0.5;
      if (closed)
        ctx.closePath();
      ctx.stroke();
    };
    for (const source of sources) {
      for (const line of source.lines) {
        const highlighted = hover?.kind === 'sketch'
          && hover.sketchId === source.sketch.id
          && hover.entityId === line.entityId;
        strokePolyline(line.points, highlighted, line.construction === true);
      }
    }
    for (const entry of bodyCurves) {
      const highlighted = hover?.kind === 'body'
        && hover.bodyKey === entry.candidate.bodyKey
        && hover.subEntityId === entry.candidate.subEntityId
        && hover.part === 'curve';
      strokePolyline(entry.points, highlighted, false);
    }
    // S1b：面边界（外环 + 孔环）虚线；悬停整面高亮。
    for (const entry of faceLoops) {
      const highlighted = hover?.kind === 'face'
        && hover.bodyKey === entry.candidate.bodyKey
        && hover.subEntityId === entry.candidate.subEntityId;
      for (const points of entry.polylines)
        strokePolyline(points, highlighted, false);
    }
    ctx.setLineDash([]);
    for (const source of sources) {
      for (const point of source.points) {
        const screen = viewport.worldToView(point.position);
        const highlighted = hover?.kind === 'sketch'
          && hover.sketchId === source.sketch.id
          && hover.entityId === point.entityId;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, highlighted ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = highlighted ? 'rgba(245, 166, 65, 0.95)' : 'rgba(110, 140, 190, 0.85)';
        ctx.fill();
      }
    }
    for (const entry of bodyEndpoints) {
      const screen = viewport.worldToView(entry.position);
      const highlighted = hover?.kind === 'body'
        && hover.bodyKey === entry.candidate.bodyKey
        && hover.subEntityId === entry.candidate.subEntityId
        && hover.part === entry.candidate.part;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, highlighted ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = highlighted ? 'rgba(245, 166, 65, 0.95)' : 'rgba(110, 140, 190, 0.85)';
      ctx.fill();
    }
  }, [sources, bodyCurves, faceLoops, bodyEndpoints, hover, viewport]);

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

  const findHit = React.useCallback((point: { x: number; y: number }): Hover | null => {
    // 端点/点优先（6 px；plan S1）：先找最近的草图点或模型边端点。
    let endpointBest: { hover: Hover; distance: number } | null = null;
    for (const source of sources) {
      for (const sourcePoint of source.points) {
        const screen = viewport.worldToView(sourcePoint.position);
        const distance = Math.hypot(point.x - screen.x, point.y - screen.y);
        if (distance <= HIT_ENDPOINT_PX && (endpointBest === null || distance < endpointBest.distance))
          endpointBest = {
            hover: { kind: 'sketch', sketchId: source.sketch.id, entityId: sourcePoint.entityId },
            distance,
          };
      }
    }
    for (const entry of bodyEndpoints) {
      const screen = viewport.worldToView(entry.position);
      const distance = Math.hypot(point.x - screen.x, point.y - screen.y);
      if (distance <= HIT_ENDPOINT_PX && (endpointBest === null || distance < endpointBest.distance))
        endpointBest = {
          hover: {
            kind: 'body',
            bodyKey: entry.candidate.bodyKey,
            subEntityId: entry.candidate.subEntityId,
            part: entry.candidate.part,
          },
          distance,
        };
    }
    if (endpointBest)
      return endpointBest.hover;

    let curveBest: { hover: Hover; distance: number } | null = null;
    for (const source of sources) {
      for (const line of source.lines) {
        const distance = curveDistance(point, line.points.map((world) => viewport.worldToView(world)));
        if (distance <= HIT_CURVE_PX && (curveBest === null || distance < curveBest.distance))
          curveBest = {
            hover: { kind: 'sketch', sketchId: source.sketch.id, entityId: line.entityId },
            distance,
          };
      }
    }
    for (const entry of bodyCurves) {
      const distance = curveDistance(point, entry.points.map((world) => viewport.worldToView(world)));
      if (distance <= HIT_CURVE_PX && (curveBest === null || distance < curveBest.distance))
        curveBest = {
          hover: {
            kind: 'body',
            bodyKey: entry.candidate.bodyKey,
            subEntityId: entry.candidate.subEntityId,
            part: 'curve',
          },
          distance,
        };
    }
    // 边/端点优先；面只在没有边/点命中时按屏幕多边形命中（外环内、孔环外）。
    if (curveBest)
      return curveBest.hover;

    const view = viewport.view;
    const eye = view.is3d() ? view.getEyePoint() : undefined;
    let faceBest: { hover: Hover; distance: number } | null = null;
    for (const entry of faceLoops) {
      const screenLoops = entry.polylines.map((points) => points.map((world) => {
        const view = viewport.worldToView(world);
        return { x: view.x, y: view.y };
      }));
      const outerIndex = entry.candidate.outerLoopIndex;
      const outer = screenLoops[outerIndex] ?? [];
      if (outer.length < 3)
        continue;
      const holes = screenLoops.filter((_, loopIndex) => loopIndex !== outerIndex);
      if (!faceLoopContainsPoint(point, { outer, holes }))
        continue;
      // 多面在屏幕重叠时取离相机最近的面（视点距离；无额外拾取通道）。
      const worldOuter = entry.polylines[outerIndex] ?? [];
      const count = Math.max(1, worldOuter.length);
      let centerX = 0;
      let centerY = 0;
      let centerZ = 0;
      for (const vertex of worldOuter) {
        centerX += vertex.x;
        centerY += vertex.y;
        centerZ += vertex.z;
      }
      const distance = eye
        ? Math.hypot(eye.x - centerX / count, eye.y - centerY / count, eye.z - centerZ / count)
        : 0;
      if (faceBest === null || distance < faceBest.distance)
        faceBest = {
          hover: {
            kind: 'face',
            bodyKey: entry.candidate.bodyKey,
            subEntityId: entry.candidate.subEntityId,
          },
          distance,
        };
    }
    return faceBest?.hover ?? null;
  }, [sources, bodyCurves, bodyEndpoints, faceLoops, viewport]);

  const localPoint = React.useCallback((event: React.PointerEvent | React.MouseEvent): { x: number; y: number } => {
    const rect = viewport.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, [viewport]);

  const sameHover = (a: Hover | null, b: Hover | null): boolean => {
    if (a === null || b === null)
      return a === b;
    if (a.kind !== b.kind)
      return false;
    if (a.kind === 'sketch' && b.kind === 'sketch')
      return a.sketchId === b.sketchId && a.entityId === b.entityId;
    if (a.kind === 'body' && b.kind === 'body')
      return a.bodyKey === b.bodyKey && a.subEntityId === b.subEntityId && a.part === b.part;
    if (a.kind === 'face' && b.kind === 'face')
      return a.bodyKey === b.bodyKey && a.subEntityId === b.subEntityId;
    return false;
  };

  const handleMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    const next = findHit(localPoint(event));
    if (!sameHover(next, hover))
      setHover(next);
  }, [findHit, hover, localPoint]);

  const handleClick = React.useCallback((event: React.MouseEvent<HTMLDivElement>): void => {
    const hit = findHit(localPoint(event));
    if (!hit)
      return;
    if (hit.kind === 'body') {
      const candidate = bodyCandidates.find((entry) => entry.bodyKey === hit.bodyKey
        && entry.subEntityId === hit.subEntityId
        && entry.part === hit.part);
      if (candidate)
        void onPickBody(candidate);
      return;
    }
    if (hit.kind === 'face') {
      const candidate = faceCandidates.find((entry) => entry.bodyKey === hit.bodyKey
        && entry.subEntityId === hit.subEntityId);
      if (candidate)
        void onPickBody(candidate);
      return;
    }
    const source = sources.find((entry) => entry.sketch.id === hit.sketchId);
    if (!source)
      return;
    const entity = source.sketch.entities.find((candidate) => candidate.id === hit.entityId);
    if (!entity)
      return;
    void onPick({ sketch: source.sketch, entity });
  }, [findHit, localPoint, onPick, onPickBody, sources, bodyCandidates, faceCandidates]);

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

  const basePrompt = loading || bodyLoading
    ? t('partStudio.sketch.useLoading')
    : sources.length === 0 && bodyCandidates.length === 0 && faceCandidates.length === 0
      ? t('partStudio.sketch.useEmpty')
      : t('partStudio.sketch.usePrompt');
  const prompt = bodyNote ? `${basePrompt} ${bodyNote}` : basePrompt;

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
      <div
        className="part-studio-pattern-prompt"
        data-testid="sketch-use-prompt"
        data-edge-candidates={bodyCandidates.length}
        data-face-candidates={faceCandidates.length}
        data-hover-kind={hover?.kind ?? ''}
      >
        {prompt}
      </div>
    </React.Fragment>
  );
}
