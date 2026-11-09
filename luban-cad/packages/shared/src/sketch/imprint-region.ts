/**
 * Onshape imprint FACE 选择（纯几何工具，shared 单一实现）。
 *
 * Onshape 的 `topologyDisambiguation([[edge, sign]])` 不是“孔侧/外环”语义，而是
 * **有向草图边的左/右侧**：`+1` = 沿边方向看去的左侧材料面，`-1` = 右侧。
 * 2026-11-09 First Part 实证（Tutorial 2 desktop）：
 * - rect.top 从左到右 +1 → 矩形内部；
 * - 竖线 x=41.275 向上 +1 → 左侧大面；
 * - 横线 y=42.875 向右 +1 → 上方窄面（旧“最大面积”启发式错选大面，少 5,277 mm³）；
 * - 竖线 x=22.225 向上 +1 → 左侧 spline 面。
 *
 * 本模块只依赖 `SketchRegionDto` 的采样边界（outerBoundary/holeBoundaries），
 * 用有向边左右偏移点做材料面归属，不依赖面积排序、不猜。边界缺失、边类型
 * 不支持或同侧多候选时返回 undefined，由调用方登记近似/阻塞，禁止默认 region 0。
 */
import type { SketchEntityDto, SketchPointDto, SketchRegionDto } from '../rpc/LubanFeatureRpcInterface.js';

export type ImprintEdgeSide = 'left' | 'right';

export interface ImprintEdgeGeometry {
  /** 有向边起点（草图局部 2D）。 */
  start: SketchPointDto;
  /** 有向边终点（草图局部 2D）。 */
  end: SketchPointDto;
}

export interface ImprintEdgeRegionPick {
  regionIndex: number;
  basis: 'outer' | 'hole';
  area: number;
}

/** Onshape 符号 → 有向边侧；0/非数/缺失不指定（调用方走旧启发式并登记近似）。 */
export function imprintEdgeSideFromSign(sign: number | undefined): ImprintEdgeSide | undefined {
  if (sign === undefined || !Number.isFinite(sign) || sign === 0) return undefined;
  return sign > 0 ? 'left' : 'right';
}

function resolvePoint(
  value: number | SketchPointDto,
  byId: ReadonlyMap<number, SketchEntityDto>,
): SketchPointDto | undefined {
  if (typeof value !== 'number') return value;
  const entity = byId.get(value);
  return entity?.kind === 'point' && entity.x !== undefined && entity.y !== undefined
    ? { x: entity.x, y: entity.y }
    : undefined;
}

/**
 * 草图实体 → 有向边几何（草图局部 2D）。
 *
 * line：返回完整线段；arc/circle：返回曲线中点附近的一小段弦，方向与草图实体
 * 参数方向一致（弧按 sweep 方向、整圆按 CCW）。`pickImprintRegionByEdgeSide`
 * 用这段弦的左右侧偏移判断材料面。spline 仍返回 undefined（曲线侧语义未验收，
 * 不让弦线冒充）。
 */
export function resolveImprintEdgeGeometry(
  entities: readonly SketchEntityDto[],
  entityId: number,
): ImprintEdgeGeometry | undefined {
  const byId = new Map<number, SketchEntityDto>();
  for (const entity of entities) byId.set(entity.id, entity);
  const entity = byId.get(entityId);
  if (!entity) return undefined;
  if ('construction' in entity && entity.construction) return undefined;

  if (entity.kind === 'line') {
    const start = resolvePoint(entity.p1, byId);
    const end = resolvePoint(entity.p2, byId);
    if (!start || !end) return undefined;
    if (Math.hypot(end.x - start.x, end.y - start.y) < 1e-9) return undefined;
    return { start, end };
  }

  if (entity.kind === 'arc' || entity.kind === 'circle') {
    const center = resolvePoint(entity.center, byId);
    const radius = entity.radius;
    if (!center || radius === undefined || !(radius > 0)) return undefined;
    let startAngle: number;
    let sweep: number;
    if (entity.kind === 'circle') {
      startAngle = 0;
      sweep = 2 * Math.PI; // CCW（Onshape 整圆边的参数方向）
    } else {
      if (entity.startAngle === undefined || entity.sweepAngle === undefined) return undefined;
      startAngle = entity.startAngle;
      sweep = entity.sweepAngle;
    }
    const direction = sweep >= 0 ? 1 : -1;
    // 整圆取参数起点（角度 0）作为采样点；若取 sweep/2=π，切线在 -y 方向，
    // 左右偏移会绕到圆的另一侧，徒增符号歧义。弧取真实中点。
    const mid = entity.kind === 'circle' ? startAngle : startAngle + sweep / 2;
    // 弦长约 1 mm（大半径更短），保证左右偏移点仍落在同一材料面。
    const delta = Math.min(0.35, 0.5 / radius);
    const a0 = mid - direction * delta;
    const a1 = mid + direction * delta;
    return {
      start: { x: center.x + radius * Math.cos(a0), y: center.y + radius * Math.sin(a0) },
      end: { x: center.x + radius * Math.cos(a1), y: center.y + radius * Math.sin(a1) },
    };
  }

  return undefined;
}

/** 射线法点在多边形内（边界点视为外，调用方用偏移点避开边界）。 */
function pointInPolygon(points: readonly SketchPointDto[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const pi = points[i]!;
    const pj = points[j]!;
    if ((pi.y > y) !== (pj.y > y)
      && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** 点是否在该面域材料内（外环内且不在任何孔环内）；边界缺失 undefined。 */
function pointInRegion(region: SketchRegionDto, x: number, y: number): boolean | undefined {
  const outer = region.outerBoundary;
  if (!outer || outer.length < 3) return undefined;
  if (!pointInPolygon(outer, x, y)) return false;
  for (const hole of region.holeBoundaries ?? []) {
    if (hole.length >= 3 && pointInPolygon(hole, x, y)) return false;
  }
  return true;
}

const SAMPLE_FRACTIONS = [0.2, 0.4, 0.6, 0.8] as const;

/**
 * 按有向边左/右侧选择材料面域。
 *
 * 返回唯一命中；同侧多个候选（边被其它曲线分割成多个面）返回 undefined——
 * 此时需要 Onshape 的顶点/边级 disambiguation，不能用面积猜。
 */
export function pickImprintRegionByEdgeSide(
  regions: readonly SketchRegionDto[] | undefined,
  entityId: number,
  edge: ImprintEdgeGeometry,
  side: ImprintEdgeSide,
): ImprintEdgeRegionPick | undefined {
  if (!regions || regions.length === 0) return undefined;
  const dx = edge.end.x - edge.start.x;
  const dy = edge.end.y - edge.start.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 1e-9)) return undefined;
  const nx = -dy / length;
  const ny = dx / length;
  const direction = side === 'left' ? 1 : -1;
  // 偏移量需大于采样边界弦高、又小于相邻特征尺寸；0.05–0.5 mm。
  const epsilon = Math.max(0.05, Math.min(0.5, length * 0.01));
  const hits: ImprintEdgeRegionPick[] = [];
  regions.forEach((region, regionIndex) => {
    const basis = region.outerEntityIds.includes(entityId)
      ? 'outer'
      : region.holeEntityIds?.includes(entityId)
        ? 'hole'
        : undefined;
    if (!basis) return;
    let insideCount = 0;
    for (const fraction of SAMPLE_FRACTIONS) {
      const x = edge.start.x + dx * fraction + nx * direction * epsilon;
      const y = edge.start.y + dy * fraction + ny * direction * epsilon;
      const inside = pointInRegion(region, x, y);
      if (inside === undefined) return; // 边界缺失：本面域不可判定
      if (inside) insideCount++;
    }
    if (insideCount > 0) hits.push({ regionIndex, basis, area: region.area });
  });
  if (hits.length !== 1) return undefined;
  return hits[0];
}
