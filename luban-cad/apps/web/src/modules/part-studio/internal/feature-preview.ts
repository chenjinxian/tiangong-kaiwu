/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 特征对话框实时几何预览（2026-11-02）：纯函数从 SketchDto 面域边界生成
 * 屏幕叠影几何（extrude = 边界沿法向双副本 + 侧面四边形；revolve = 边界绕
 * 草图内轴旋转的四边形/棱线）。不写库、不调内核——仅 UI 预览，提交仍走
 * `applyFeatureOp` 的真实内核路径。
 */
import { Point3d, Vector3d } from '@itwin/core-geometry';
import type { SketchEntityDto, SketchPlaneDto, SketchPointDto, SketchRegionDto } from '@luban-cad/shared';
import { sketchEntitiesToWorldPolylines } from './sketch-curves.js';
import { sketchPlaneFrameFrom } from '../tools/sketch/sketch-plane.js';

export interface FeaturePreviewGeometry {
  /** 半透明侧面四边形（世界坐标，4 点环）。 */
  quads: Point3d[][];
  /** 边界/棱线（世界坐标折线）。 */
  lines: Point3d[][];
  /**
   * 选中面域的有序填充环（世界坐标；外环在前、孔环随后）。橙色面用屏幕
   * 空间 even-odd 填充（天然消孔）；旧后端无有序环则不填充。
   */
  fillLoops: Point3d[][];
  /** 灰色端盖环（仅无孔面域——带孔环的 3D 端盖需三角化，暂不填充）。 */
  capLoops: Point3d[][];
  /**
   * 选中面域的全部边界实体折线（世界坐标）——橙色描边用。复杂面域（带孔/
   * T 形交点）即使无法重建填充环，也按真实边界画橙色轮廓，不伪造填充。
   */
  selectionEdges: Point3d[][];
}

const EPS = 1e-9;
const MAX_QUADS = 2400;

function emptyPreview(): FeaturePreviewGeometry {
  return { quads: [], lines: [], fillLoops: [], capLoops: [], selectionEdges: [] };
}

function selectedBoundaryIds(regions: readonly SketchRegionDto[]): Set<number> {
  const ids = new Set<number>();
  for (const region of regions) {
    for (const id of region.outerEntityIds) ids.add(id);
    for (const id of region.holeEntityIds ?? []) ids.add(id);
  }
  return ids;
}

/**
 * 后端有序环（v1.20）→ 世界环。fillLoops=外环+孔环（屏幕空间 even-odd 填充）；
 * capLoops 仅无孔面域（3D 灰端盖无三角化，带孔面不伪造端盖）。
 */
function regionBoundaryLoops(
  regions: readonly SketchRegionDto[],
  plane: SketchPlaneDto | undefined,
): { fillLoops: Point3d[][]; capLoops: Point3d[][] } {
  const frame = sketchPlaneFrameFrom(plane);
  const fillLoops: Point3d[][] = [];
  const capLoops: Point3d[][] = [];
  const toWorld = (loop: readonly SketchPointDto[]): Point3d[] =>
    loop.map((point) => frame.toWorld({ u: point.x, v: point.y }));
  for (const region of regions) {
    const outer = region.outerBoundary;
    if (!outer || outer.length < 3) continue;
    const outerWorld = toWorld(outer);
    fillLoops.push(outerWorld);
    const holes = (region.holeBoundaries ?? []).filter((loop) => loop.length >= 3);
    if (holes.length === 0) {
      capLoops.push(outerWorld.map((point) => point.clone()));
    } else {
      for (const hole of holes) fillLoops.push(toWorld(hole));
    }
  }
  return { fillLoops, capLoops };
}

interface LocalPoint { x: number; y: number }

function isLocalPoint(value: unknown): value is LocalPoint {
  return !!value && typeof value === 'object'
    && typeof (value as LocalPoint).x === 'number'
    && typeof (value as LocalPoint).y === 'number';
}

function resolveLocal(ref: unknown, points: Map<number, LocalPoint>): LocalPoint | undefined {
  if (typeof ref === 'number') return points.get(ref);
  return isLocalPoint(ref) ? ref : undefined;
}

function localPointMap(entities: readonly SketchEntityDto[]): Map<number, LocalPoint> {
  const points = new Map<number, LocalPoint>();
  for (const entity of entities) {
    if (entity.kind === 'point' && typeof entity.id === 'number')
      points.set(entity.id, { x: entity.x ?? 0, y: entity.y ?? 0 });
  }
  return points;
}

function offsetPoint(point: Point3d, normal: Vector3d, distance: number): Point3d {
  return point.plusScaled(normal, distance);
}

/**
 * 拉伸预览几何。`regionEntityIds` = 选中面域的外/内环实体 id 集；
 * symmetric=true 时沿法向 ±d/2，否则 [0,+d]。
 */
export function buildExtrudePreview(
  entities: readonly SketchEntityDto[],
  plane: SketchPlaneDto | undefined,
  regions: readonly SketchRegionDto[],
  distance: number,
  symmetric: boolean,
  startOffset = 0,
): FeaturePreviewGeometry {
  if (!Number.isFinite(distance) || Math.abs(distance) < EPS) return emptyPreview();
  const frame = sketchPlaneFrameFrom(plane);
  const normal = frame.normal;
  const bottomOffset = (Number.isFinite(startOffset) ? startOffset : 0) + (symmetric ? -distance / 2 : 0);
  const topOffset = bottomOffset + distance;
  const boundaryIds = selectedBoundaryIds(regions);
  if (boundaryIds.size === 0) return emptyPreview();
  const polylines = sketchEntitiesToWorldPolylines(entities, plane)
    .filter((polyline) => boundaryIds.has(polyline.entityId));

  const quads: Point3d[][] = [];
  const lines: Point3d[][] = [];
  for (const { points } of polylines) {
    if (points.length < 2) continue;
    const bottom = points.map((p) => offsetPoint(p, normal, bottomOffset));
    const top = points.map((p) => offsetPoint(p, normal, topOffset));
    lines.push(bottom, top);
    // 开口折线端点补一条竖直棱（闭合圆环首尾重合则不补）；侧面只填充不描边，
    // 避免每个采样段都描边形成“网格”噪点。
    const first = points[0]!;
    const last = points[points.length - 1]!;
    if (first.distance(last) > 1e-6) {
      lines.push([bottom[0]!, top[0]!], [bottom[bottom.length - 1]!, top[top.length - 1]!]);
    }
    for (let i = 0; i + 1 < points.length && quads.length < MAX_QUADS; i++) {
      quads.push([bottom[i]!, bottom[i + 1]!, top[i + 1]!, top[i]!]);
    }
  }
  const { fillLoops, capLoops } = regionBoundaryLoops(regions, plane);
  const capLoopsOffset = [
    ...capLoops.map((loop) => loop.map((point) => offsetPoint(point, normal, bottomOffset))),
    ...capLoops.map((loop) => loop.map((point) => offsetPoint(point, normal, topOffset))),
  ];
  const selectionEdges = polylines.map((polyline) => polyline.points.map((point) => point.clone()));
  return { quads, lines, fillLoops, capLoops: capLoopsOffset, selectionEdges };
}

interface Axis3d { origin: Point3d; direction: Vector3d }

function revolveAxis(
  entities: readonly SketchEntityDto[],
  plane: SketchPlaneDto | undefined,
  axisEntityId: number | undefined,
): Axis3d | undefined {
  if (axisEntityId === undefined) return undefined;
  const axis = entities.find((entity) => entity.id === axisEntityId && entity.kind === 'line');
  if (!axis || axis.kind !== 'line') return undefined;
  const frame = sketchPlaneFrameFrom(plane);
  const points = localPointMap(entities);
  const a = resolveLocal(axis.p1, points);
  const b = resolveLocal(axis.p2, points);
  if (!a || !b) return undefined;
  const origin = frame.toWorld({ u: a.x, v: a.y });
  const end = frame.toWorld({ u: b.x, v: b.y });
  const direction = Vector3d.createStartEnd(origin, end).normalize();
  if (!direction) return undefined;
  return { origin, direction };
}

function rotateAroundAxis(point: Point3d, axis: Axis3d, angle: number): Point3d {
  const relative = Vector3d.createStartEnd(axis.origin, point);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cross = axis.direction.crossProduct(relative);
  const dot = axis.direction.dotProduct(relative);
  return Point3d.create(
    axis.origin.x + relative.x * cos + (cross?.x ?? 0) * sin + axis.direction.x * dot * (1 - cos),
    axis.origin.y + relative.y * cos + (cross?.y ?? 0) * sin + axis.direction.y * dot * (1 - cos),
    axis.origin.z + relative.z * cos + (cross?.z ?? 0) * sin + axis.direction.z * dot * (1 - cos),
  );
}

/**
 * 旋转预览几何：选中面域边界绕草图内轴旋转；full 360° 或指定角度。
 */
export function buildRevolvePreview(
  entities: readonly SketchEntityDto[],
  plane: SketchPlaneDto | undefined,
  regions: readonly SketchRegionDto[],
  axisEntityId: number | undefined,
  angleRadians: number,
): FeaturePreviewGeometry {
  const axis = revolveAxis(entities, plane, axisEntityId);
  if (!axis) return emptyPreview();
  const sweep = Math.min(Math.abs(angleRadians), Math.PI * 2);
  if (sweep < EPS) return emptyPreview();
  const full = Math.abs(sweep - Math.PI * 2) < 1e-6;
  const boundaryIds = selectedBoundaryIds(regions);
  if (boundaryIds.size === 0) return emptyPreview();
  const polylines = sketchEntitiesToWorldPolylines(entities, plane)
    .filter((polyline) => polyline.entityId !== axisEntityId)
    .filter((polyline) => boundaryIds.has(polyline.entityId));
  const steps = Math.max(8, Math.min(72, Math.ceil((sweep / (Math.PI * 2)) * 48)));
  const quads: Point3d[][] = [];
  const lines: Point3d[][] = [];

  for (const { points } of polylines) {
    if (points.length < 2) continue;
    // 起止轮廓 + 每 8 步一条环线（稀疏，避免糊成实心块）。
    for (let step = 0; step <= steps; step++) {
      if (step !== 0 && step !== steps && step % 8 !== 0) continue;
      const angle = (sweep * step) / steps;
      lines.push(points.map((p) => rotateAroundAxis(p, axis, angle)));
    }
    for (let i = 0; i + 1 < points.length && quads.length < MAX_QUADS; i++) {
      for (let step = 0; step < steps && quads.length < MAX_QUADS; step++) {
        const a0 = (sweep * step) / steps;
        const a1 = (sweep * (step + 1)) / steps;
        quads.push([
          rotateAroundAxis(points[i]!, axis, a0),
          rotateAroundAxis(points[i + 1]!, axis, a0),
          rotateAroundAxis(points[i + 1]!, axis, a1),
          rotateAroundAxis(points[i]!, axis, a1),
        ]);
      }
    }
  }
  // full 旋转首尾重合：去掉重复的末环（视觉重复）。
  if (full && lines.length > 0)
    lines.splice(lines.length - 1, 1);
  const { fillLoops, capLoops } = regionBoundaryLoops(regions, plane);
  // 部分角旋转的终止面为灰色端盖；起始面即橙色选中轮廓（不重复画灰盖）。
  const capLoopsRotated = full
    ? []
    : capLoops.map((loop) => loop.map((point) => rotateAroundAxis(point, axis, sweep)));
  const selectionEdges = polylines.map((polyline) => polyline.points.map((point) => point.clone()));
  return { quads, lines, fillLoops, capLoops: capLoopsRotated, selectionEdges };
}
