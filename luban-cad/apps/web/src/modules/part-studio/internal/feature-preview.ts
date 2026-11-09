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

interface DraftPreviewOptions {
  angleDeg: number;
  pullDirection: boolean;
}

/**
 * 草图局部 2D 环偏置（拔模预览）：顶点沿相邻边右法线（材料外扩方向）的角平分线
 * 偏移。外环 CCW/孔环 CW 下右法线均指向材料增长侧，与后端“外环扩、孔环缩”同口径。
 * 折线近似圆弧；无效输入返回原点列（不伪造锥度）。
 */
function offsetLoop2d(
  points: readonly SketchPointDto[],
  delta: number,
): SketchPointDto[] {
  if (!Number.isFinite(delta) || Math.abs(delta) < EPS) return points.map((p) => ({ x: p.x, y: p.y }));
  const n = points.length;
  if (n < 3) return points.map((p) => ({ x: p.x, y: p.y }));
  const rightNormal = (dx: number, dy: number): [number, number] | undefined => {
    const length = Math.hypot(dx, dy);
    if (length < EPS) return undefined;
    return [dy / length, -dx / length];
  };
  return points.map((point, index) => {
    const prev = points[(index - 1 + n) % n]!;
    const next = points[(index + 1) % n]!;
    const r1 = rightNormal(point.x - prev.x, point.y - prev.y)
      ?? rightNormal(next.x - point.x, next.y - point.y);
    const r2 = rightNormal(next.x - point.x, next.y - point.y)
      ?? rightNormal(point.x - prev.x, point.y - prev.y);
    if (!r1 || !r2) return { x: point.x, y: point.y };
    const bx = r1[0] + r2[0];
    const by = r1[1] + r2[1];
    const length = Math.hypot(bx, by);
    if (length < EPS) return { x: point.x, y: point.y };
    const bisector: [number, number] = [bx / length, by / length];
    const miter = Math.max(0.3, bisector[0] * r1[0] + bisector[1] * r1[1]);
    const scaled = delta / miter;
    return { x: point.x + bisector[0] * scaled, y: point.y + bisector[1] * scaled };
  });
}

/**
 * 拔模拉伸预览（v1.51）：底端=草图环，远端=按 δ=d·tan(θ) 偏置的环；外环/孔环
 * 同向右法线（材料扩张方向一致）。中性面=起始端（与后端一致）。
 */
function buildDraftExtrudePreview(
  plane: SketchPlaneDto | undefined,
  regions: readonly SketchRegionDto[],
  bottomOffset: number,
  topOffset: number,
  draft: DraftPreviewOptions,
): FeaturePreviewGeometry {
  const frame = sketchPlaneFrameFrom(plane);
  const effectiveDeg = draft.pullDirection ? -draft.angleDeg : draft.angleDeg;
  const delta = Math.abs(topOffset - bottomOffset) * Math.tan((effectiveDeg * Math.PI) / 180);
  if (!Number.isFinite(delta)) return emptyPreview();
  const quads: Point3d[][] = [];
  const lines: Point3d[][] = [];
  const fillLoops: Point3d[][] = [];
  const capLoops: Point3d[][] = [];
  const selectionEdges: Point3d[][] = [];
  const toWorld = (point: { x: number; y: number }, offset: number): Point3d =>
    frame.toWorld({ u: point.x, v: point.y }).plusScaled(frame.normal, offset);
  for (const region of regions) {
    const outer = region.outerBoundary ?? [];
    if (outer.length < 3) continue;
    const holes = (region.holeBoundaries ?? []).filter((loop) => loop.length >= 3);
    const loops = [outer, ...holes];
    for (const loop of loops) {
      const bottom = loop.map((point) => toWorld(point, bottomOffset));
      const top = offsetLoop2d(loop, delta).map((point) => toWorld(point, topOffset));
      fillLoops.push(bottom);
      selectionEdges.push(bottom);
      if (quads.length + loop.length <= MAX_QUADS) {
        for (let i = 0; i < loop.length; i++) {
          const next = (i + 1) % loop.length;
          quads.push([bottom[i]!, bottom[next]!, top[next]!, top[i]!]);
        }
      }
      lines.push([...bottom, bottom[0]!.clone()], [...top, top[0]!.clone()]);
      const step = Math.max(1, Math.floor(loop.length / 8));
      for (let i = 0; i < loop.length; i += step)
        lines.push([bottom[i]!.clone(), top[i]!.clone()]);
    }
    if (holes.length === 0) {
      capLoops.push(outer.map((point) => toWorld(point, bottomOffset)));
      capLoops.push(offsetLoop2d(outer, delta).map((point) => toWorld(point, topOffset)));
    }
  }
  return { quads, lines, fillLoops, capLoops, selectionEdges };
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
  /** v1.24 第二方向：沿法向的有符号距离（缺省=主方向相反侧）。同一轮廓的
   *  两段扫掠并集仍是单一棱柱——扩展到 [min, max] 即正确包络。 */
  secondSignedDistance = 0,
  /** v1.51 拔模：远端环按 δ=|d|·tan(θ) 偏置（pullDirection 翻转方向）。 */
  draft?: DraftPreviewOptions,
): FeaturePreviewGeometry {
  if (!Number.isFinite(distance) || Math.abs(distance) < EPS) return emptyPreview();
  const frame = sketchPlaneFrameFrom(plane);
  const normal = frame.normal;
  const origin = Number.isFinite(startOffset) ? startOffset : 0;
  let bottomOffset = origin + (symmetric ? -distance / 2 : 0);
  let topOffset = bottomOffset + distance;
  if (!symmetric && Number.isFinite(secondSignedDistance) && Math.abs(secondSignedDistance) > EPS) {
    bottomOffset = Math.min(bottomOffset, origin + Math.min(0, secondSignedDistance));
    topOffset = Math.max(topOffset, origin + Math.max(0, secondSignedDistance));
  }
  if (draft && Number.isFinite(draft.angleDeg) && Math.abs(draft.angleDeg) > EPS)
    return buildDraftExtrudePreview(plane, regions, bottomOffset, topOffset, draft);
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
