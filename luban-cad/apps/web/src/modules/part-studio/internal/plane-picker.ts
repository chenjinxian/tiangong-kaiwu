/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * 草图平面对话框的视口拾取（2026-11-02 Onshape live）：把 Top/Front/Right
 * 基准面世界四边形投影到屏幕，按指针位置命中并选最正对视线的平面；同时
 * 提供每平面一个「保证命中自己」的屏幕点（演示/e2e 用真实鼠标点击）。
 */
import type { ScreenViewport } from '@itwin/core-frontend';
import { Point3d, Vector3d } from '@itwin/core-geometry';
import { datumPlaneGeometries } from '@luban-cad/viewer';
import type { DatumPlaneGeometry, DatumPlaneId } from '@luban-cad/viewer';

export interface ScreenPoint { x: number; y: number }

export function pointInPolygon(point: ScreenPoint, polygon: readonly ScreenPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const intersects = ((a.y > point.y) !== (b.y > point.y))
      && (point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 1e-12) + a.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

function projectedQuad(viewport: ScreenViewport, geometry: DatumPlaneGeometry): ScreenPoint[] {
  return geometry.points.map((p) => {
    const v = viewport.worldToView(p);
    return { x: v.x, y: v.y };
  });
}

/**
 * 命中平面：重叠区域取视线交点最近的那个。三平面都过原点，不能用平面中心
 * 深度排序（恒相等）；必须按当前屏幕点的视线与每个平面求交（t 越小越近）。
 * 这也让 iso 视图里被 Top/Right 挡住的 Front 仍可在自己的可见区域拾取。
 */
export function pickDatumPlaneAt(viewport: ScreenViewport, point: ScreenPoint): DatumPlaneId | undefined {
  // 屏幕点 → 世界射线（viewToWorld 的 z 为视线深度轴；两点足矣）。
  const p0 = viewport.viewToWorld({ x: point.x, y: point.y, z: 0 });
  const p1 = viewport.viewToWorld({ x: point.x, y: point.y, z: 1 });
  const dir = Vector3d.createStartEnd(p0, p1);
  if (dir.magnitudeSquared() < 1e-18) return undefined;
  const zDir = viewport.view.getZVector();
  let best: { id: DatumPlaneId; t: number; facing: number } | undefined;
  for (const geometry of datumPlaneGeometries(viewport)) {
    const quad = projectedQuad(viewport, geometry);
    if (!pointInPolygon(point, quad)) continue;
    const denom = geometry.normal.dotProduct(dir);
    if (Math.abs(denom) < 1e-12) continue;
    // 平面过原点：origin 到射线上任一点的向量在法向上的投影 / 方向法向分量。
    const t = -geometry.normal.dotProduct(p0) / denom;
    const facing = Math.abs(geometry.normal.dotProduct(zDir));
    if (!best || t < best.t - 1e-9 || (Math.abs(t - best.t) <= 1e-9 && facing > best.facing)) {
      best = { id: geometry.id, t, facing };
    }
  }
  return best?.id;
}

function planePoint(viewport: ScreenViewport, geometry: DatumPlaneGeometry, u: number, v: number): ScreenPoint {
  // 双线性插值平面四角；t 从 labelPoint 方向取，避免原点处三面交叠。
  const [a, b, c, d] = geometry.points;
  if (!a || !b || !c || !d) return { x: 0, y: 0 };
  const p = Point3d.create(
    (1 - u) * (1 - v) * a.x + u * (1 - v) * b.x + u * v * c.x + (1 - u) * v * d.x,
    (1 - u) * (1 - v) * a.y + u * (1 - v) * b.y + u * v * c.y + (1 - u) * v * d.y,
    (1 - u) * (1 - v) * a.z + u * (1 - v) * b.z + u * v * c.z + (1 - u) * v * d.z,
  );
  const screen = viewport.worldToView(p);
  return { x: screen.x, y: screen.y };
}

/**
 * 每平面一个屏幕点，点击该点必定命中该平面（在 5×5 采样中找；找不到返回
 * 四边形中心作兜底）。用于演示与 e2e 的真实鼠标拾取。
 */
export function datumPlanePickPoints(viewport: ScreenViewport): Partial<Record<DatumPlaneId, ScreenPoint>> {
  const result: Partial<Record<DatumPlaneId, ScreenPoint>> = {};
  const rect = viewport.viewRect;
  // 对话框占画布左上约 300px；避开左上/顶部提示条/右上 ViewCube/右缘工具条。
  const safe = (p: ScreenPoint): boolean => p.x > 340
    && p.x < rect.width - 100
    && p.y > 70
    && p.y < rect.height - 80;
  const samples = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  for (const geometry of datumPlaneGeometries(viewport)) {
    let fallback: ScreenPoint | undefined;
    let found: ScreenPoint | undefined;
    outer: for (const u of samples) {
      for (const v of samples) {
        const p = planePoint(viewport, geometry, u, v);
        if (pickDatumPlaneAt(viewport, p) !== geometry.id) continue;
        fallback ??= p;
        if (safe(p)) {
          found = p;
          break outer;
        }
      }
    }
    result[geometry.id] = found ?? fallback ?? planePoint(viewport, geometry, 0.5, 0.5);
  }
  return result;
}
