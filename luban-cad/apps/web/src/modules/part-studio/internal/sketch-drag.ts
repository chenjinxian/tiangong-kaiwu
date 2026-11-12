/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图拖拽纯逻辑（ADR-0018 S1c）：把屏幕位移换算成草图局部 (u,v) 位移，
 * 生成本地预览实体集（事实源仍是后端解算后的 params；释放后一次 updateSketch
 * 提交，拖拽期间零 RPC）。
 *
 * 语义（Onshape live 对拍）：
 * - 拖曲线本体 = 整体平移该实体的定位点（线两端/圆心/样条控制点）；
 *   共享点实体被移动时，所有引用它的实体一起动。
 * - 拖控制点 = 只动该端点/圆心/样条控制点；圆弧端点拖动改起/扫角（半径与
 *   圆心不动），圆弧中点暂不支持（返回原实体）。
 * - 约束不在此处删除/改写：提交后由后端求解器按约束回解（例如水平约束会把
 *   拖拽结果拉回水平）。
 */
import type { ScreenViewport } from '@itwin/core-frontend';
import type { SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import { sketchPlaneFrameFrom, type SketchPlaneFrame } from '../tools/sketch/sketch-plane.js';

export interface SketchDragTarget {
  entityId: number;
  part: 'curve' | 'handle';
  handleIndex?: number;
}

type MutableEntity = Record<string, unknown> & { kind?: string; id?: number };

function isPointRef(value: unknown): value is { x: number; y: number } {
  return !!value && typeof value === 'object'
    && typeof (value as { x?: unknown }).x === 'number'
    && typeof (value as { y?: unknown }).y === 'number';
}

/**
 * 屏幕像素位移 → 草图局部 (u,v)。用平面原点的两条坐标轴在屏幕上的导数解
 * 2×2 线性方程；相机与草图平面近平行（行列式接近 0）时返回 null（放弃拖拽）。
 */
export function screenDeltaToLocal(
  viewport: Pick<ScreenViewport, 'worldToView'>,
  plane: SketchPlaneDto | undefined,
  dx: number,
  dy: number,
): { du: number; dv: number } | null {
  const frame = sketchPlaneFrameFrom(plane);
  const origin = frame.toWorld({ u: 0, v: 0 });
  const alongU = frame.toWorld({ u: 1, v: 0 });
  const alongV = frame.toWorld({ u: 0, v: 1 });
  const s0 = viewport.worldToView(origin);
  const su = viewport.worldToView(alongU);
  const sv = viewport.worldToView(alongV);
  const ux = su.x - s0.x;
  const uy = su.y - s0.y;
  const vx = sv.x - s0.x;
  const vy = sv.y - s0.y;
  const det = ux * vy - uy * vx;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9)
    return null;
  const du = (dx * vy - dy * vx) / det;
  const dv = (ux * dy - uy * dx) / det;
  if (!Number.isFinite(du) || !Number.isFinite(dv))
    return null;
  return { du, dv };
}

function moveRef(ref: unknown, pointById: Map<number, MutableEntity>, du: number, dv: number): void {
  if (typeof ref === 'number') {
    const point = pointById.get(ref);
    if (point) {
      point.x = ((point.x as number) ?? 0) + du;
      point.y = ((point.y as number) ?? 0) + dv;
    }
    return;
  }
  if (isPointRef(ref)) {
    ref.x += du;
    ref.y += dv;
  }
}

function movePointArray(points: unknown, du: number, dv: number): void {
  if (!Array.isArray(points))
    return;
  for (const point of points) {
    if (isPointRef(point)) {
      point.x += du;
      point.y += dv;
    }
  }
}

function translateEntity(entity: MutableEntity, pointById: Map<number, MutableEntity>, du: number, dv: number): void {
  switch (entity.kind) {
    case 'point':
      entity.x = ((entity.x as number) ?? 0) + du;
      entity.y = ((entity.y as number) ?? 0) + dv;
      break;
    case 'line':
      moveRef(entity.p1, pointById, du, dv);
      moveRef(entity.p2, pointById, du, dv);
      break;
    case 'circle':
    case 'arc':
      moveRef(entity.center, pointById, du, dv);
      break;
    case 'spline':
      movePointArray(entity.controlPoints, du, dv);
      movePointArray(entity.fitPoints, du, dv);
      break;
  }
}

function moveArcHandle(entity: MutableEntity, center: { x: number; y: number }, handleIndex: number, du: number, dv: number): void {
  const radius = entity.radius as number;
  const startAngle = entity.startAngle as number;
  const sweepAngle = entity.sweepAngle as number;
  if (handleIndex === 1) {
    const px = center.x + radius * Math.cos(startAngle) + du;
    const py = center.y + radius * Math.sin(startAngle) + dv;
    entity.startAngle = Math.atan2(py - center.y, px - center.x);
    return;
  }
  if (handleIndex === 3) {
    const end = startAngle + sweepAngle;
    const px = center.x + radius * Math.cos(end) + du;
    const py = center.y + radius * Math.sin(end) + dv;
    let raw = Math.atan2(py - center.y, px - center.x) - startAngle;
    // 保持扫角方向（顺/逆时针）并落在 (0,2π]。
    const tau = Math.PI * 2;
    if (sweepAngle >= 0) {
      while (raw <= 1e-9) raw += tau;
      while (raw > tau) raw -= tau;
    } else {
      while (raw >= -1e-9) raw -= tau;
      while (raw < -tau) raw += tau;
    }
    entity.sweepAngle = raw;
  }
}

function moveHandle(
  entity: MutableEntity,
  pointById: Map<number, MutableEntity>,
  handleIndex: number,
  du: number,
  dv: number,
): void {
  switch (entity.kind) {
    case 'point':
      entity.x = ((entity.x as number) ?? 0) + du;
      entity.y = ((entity.y as number) ?? 0) + dv;
      break;
    case 'line':
      moveRef(handleIndex === 1 ? entity.p2 : entity.p1, pointById, du, dv);
      break;
    case 'circle':
      moveRef(entity.center, pointById, du, dv);
      break;
    case 'arc': {
      const centerRef = entity.center;
      if (handleIndex === 0) {
        moveRef(centerRef, pointById, du, dv);
        return;
      }
      const center = typeof centerRef === 'number'
        ? pointById.get(centerRef)
        : isPointRef(centerRef) ? centerRef : undefined;
      if (!center || typeof entity.radius !== 'number'
        || typeof entity.startAngle !== 'number' || typeof entity.sweepAngle !== 'number')
        return;
      moveArcHandle(entity, { x: (center.x as number) ?? 0, y: (center.y as number) ?? 0 }, handleIndex, du, dv);
      break;
    }
    case 'spline': {
      const controls = entity.controlPoints;
      if (Array.isArray(controls) && handleIndex < controls.length) {
        const point = controls[handleIndex];
        if (isPointRef(point)) {
          point.x += du;
          point.y += dv;
        }
      }
      break;
    }
  }
}

/**
 * 生成拖拽后的实体副本（不改入参）。目标实体不存在时原样返回克隆集。
 * `handleIndex` 缺省按曲线本体处理。
 */
export function applySketchDrag(
  entities: readonly SketchEntityDto[],
  target: SketchDragTarget,
  du: number,
  dv: number,
): SketchEntityDto[] {
  const cloned = JSON.parse(JSON.stringify(entities)) as MutableEntity[];
  const pointById = new Map<number, MutableEntity>();
  for (const entity of cloned) {
    if (entity.kind === 'point' && typeof entity.id === 'number')
      pointById.set(entity.id, entity);
  }
  const entity = cloned.find((candidate) => candidate.id === target.entityId);
  if (!entity)
    return cloned as unknown as SketchEntityDto[];
  if (target.part === 'handle' && target.handleIndex !== undefined)
    moveHandle(entity, pointById, target.handleIndex, du, dv);
  else
    translateEntity(entity, pointById, du, dv);
  return cloned as unknown as SketchEntityDto[];
}

/** 仅用于测试/调试：平面帧（导出便于断言）。 */
export function dragFrame(plane: SketchPlaneDto | undefined): SketchPlaneFrame {
  return sketchPlaneFrameFrom(plane);
}
