/**
 * 实体面单线 imprint 切分解析（ADR-0006 D2，test-only 回放层）。
 *
 * 场景：imprintFace 拉伸引用的草图只有一条**开放直线**（0 个闭合面域），该线
 * 落在当前 body 的一个平面面上，把该面切成两侧；Onshape 选择其中一侧作为拉伸
 * 轮廓。解析器枚举 active authored body 的平面面，按“线两端在面平面内 + 线段
 * 接触面 + 直线把面切成两个正面积子面”找候选面，要求**唯一**候选；再
 * `resolveFaceRef` 取持久面引用，并返回世界切分线/保留侧给产品 `faceExtrude`
 * 的 `splitByLine`。
 *
 * 0/多候选、草图非单线、line 缺失、面法向与草图平面法向关系不明确一律
 * ok:false，由 runner 诚实阻塞（绝不任选一面或退回 region 0）。
 */
import type { Page } from '@playwright/test';
import type { BodyInfo, LubanTopologyId, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import { getBodiesRpc, msRpc, type BSeedEditorContext } from '../../helpers.js';
import { BlockedCapabilityError } from './scenario-to-op.js';

export interface SplitVec3 { x: number; y: number; z: number }
type Tuple3 = [number, number, number];
type LoopCurve =
  | { kind: 'line'; p0: Tuple3; p1: Tuple3 }
  | {
    kind: 'arc'; center: Tuple3; radius: number; normal: Tuple3;
    start: Tuple3; end: Tuple3; sweepRadians: number;
  }
  | { kind: 'other'; geometryType: string };

export interface SplitFaceHandle {
  bodyKey: string;
  subEntityId: number;
  range: { low: Tuple3; high: Tuple3 };
  normal: Tuple3;
  loops: LoopCurve[][];
}

export interface ImprintSplitFace {
  start: SplitVec3;
  end: SplitVec3;
  keepSide: 'left' | 'right';
  keepPoint?: SplitVec3;
  region: 'material' | 'void';
}

export type ImprintSplitResolution =
  | {
    ok: true;
    bodyId: string;
    faceRef: LubanTopologyId;
    faceSubEntityId: number;
    faceNormal: Tuple3;
    split: ImprintSplitFace;
    note: string;
  }
  | { ok: false; reason: string };

interface Frame { origin: SplitVec3; x: SplitVec3; y: SplitVec3; n: SplitVec3 }
type Vec2 = { x: number; y: number };

const PLANE_TOLERANCE_MM = 0.05;
const SPLIT_AREA_EPS_MM2 = 1e-3;

const v3 = (x: number, y: number, z: number): SplitVec3 => ({ x, y, z });
const sub = (a: SplitVec3, b: SplitVec3): SplitVec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const dot = (a: SplitVec3, b: SplitVec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: SplitVec3, b: SplitVec3): SplitVec3 =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const unit = (a: SplitVec3): SplitVec3 | undefined => {
  const length = Math.hypot(a.x, a.y, a.z);
  return length < 1e-12 ? undefined : v3(a.x / length, a.y / length, a.z / length);
};

export function frameOf(plane: SketchPlaneDto): Frame | undefined {
  const n = unit(v3(plane.normal.x, plane.normal.y, plane.normal.z));
  if (!n) return undefined;
  const xRaw = v3(plane.xDir.x, plane.xDir.y, plane.xDir.z);
  const x = unit(sub(xRaw, v3(n.x * dot(xRaw, n), n.y * dot(xRaw, n), n.z * dot(xRaw, n))));
  if (!x) return undefined;
  return { origin: v3(plane.origin.x, plane.origin.y, plane.origin.z), x, y: cross(n, x), n };
}

function toWorld(frame: Frame, point: { x: number; y: number }): SplitVec3 {
  const x = frame.origin.x + frame.x.x * point.x + frame.y.x * point.y;
  const y = frame.origin.y + frame.x.y * point.x + frame.y.y * point.y;
  const z = frame.origin.z + frame.x.z * point.x + frame.y.z * point.y;
  return v3(x, y, z);
}

/** 草图单线实体 → 世界有向线（p1→p2）。非 line / 缺坐标返回 undefined。 */
export function sketchLineWorld(
  plane: SketchPlaneDto | undefined,
  entities: readonly SketchEntityDto[] | undefined,
  entityId: number,
): { start: SplitVec3; end: SplitVec3 } | undefined {
  if (!plane || !entities) return undefined;
  const frame = frameOf(plane);
  if (!frame) return undefined;
  const entity = entities.find((candidate) => candidate.id === entityId);
  if (!entity || entity.kind !== 'line') return undefined;
  const resolvePoint = (ref: number | { x: number; y: number }): { x: number; y: number } | undefined => {
    if (typeof ref !== 'number') return ref;
    const point = entities.find((candidate) => candidate.kind === 'point' && candidate.id === ref);
    return point && point.kind === 'point' && Number.isFinite(point.x) && Number.isFinite(point.y)
      ? { x: point.x!, y: point.y! }
      : undefined;
  };
  const p1 = resolvePoint(entity.p1);
  const p2 = resolvePoint(entity.p2);
  if (!p1 || !p2) return undefined;
  return { start: toWorld(frame, p1), end: toWorld(frame, p2) };
}

function pointTuple(point: readonly number[]): SplitVec3 {
  return v3(point[0]!, point[1]!, point[2]!);
}

function sampleLoop(loop: readonly LoopCurve[], frame: Frame): Vec2[] | undefined {
  const out: Vec2[] = [];
  const push = (point: SplitVec3): boolean => {
    const rel = sub(point, frame.origin);
    if (Math.abs(dot(rel, frame.n)) > PLANE_TOLERANCE_MM) return false;
    out.push({ x: dot(rel, frame.x), y: dot(rel, frame.y) });
    return true;
  };
  for (const curve of loop) {
    if (curve.kind === 'line') {
      if (!push(pointTuple(curve.p0)) || !push(pointTuple(curve.p1))) return undefined;
    } else if (curve.kind === 'arc') {
      const center = pointTuple(curve.center);
      const start = pointTuple(curve.start);
      if (!unit(pointTuple(curve.normal))) return undefined;
      const startAngle = Math.atan2(dot(sub(start, center), frame.y), dot(sub(start, center), frame.x));
      const steps = 24;
      for (let index = 0; index <= steps; index++) {
        const angle = startAngle + curve.sweepRadians * (index / steps);
        if (!push(v3(
          center.x + curve.radius * (Math.cos(angle) * frame.x.x + Math.sin(angle) * frame.y.x),
          center.y + curve.radius * (Math.cos(angle) * frame.x.y + Math.sin(angle) * frame.y.y),
          center.z + curve.radius * (Math.cos(angle) * frame.x.z + Math.sin(angle) * frame.y.z),
        ))) return undefined;
      }
    } else {
      return undefined;
    }
  }
  return out.length >= 3 ? out : undefined;
}

function signedArea(points: readonly Vec2[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Sutherland–Hodgman：保留有向线左侧（side=1）或右侧（side=-1）的多边形。 */
function clipBySide(points: readonly Vec2[], start: Vec2, end: Vec2, side: 1 | -1): Vec2[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const signed = (p: Vec2): number => side * (dx * (p.y - start.y) - dy * (p.x - start.x));
  const output: Vec2[] = [];
  for (let index = 0; index < points.length; index++) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const currentValue = signed(current);
    const nextValue = signed(next);
    if (currentValue >= 0) output.push(current);
    if ((currentValue > 0 && nextValue < 0) || (currentValue < 0 && nextValue > 0)) {
      const t = currentValue / (currentValue - nextValue);
      output.push({ x: current.x + (next.x - current.x) * t, y: current.y + (next.y - current.y) * t });
    }
  }
  return output;
}

function pointInPolygon(point: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index]!;
    const b = polygon[previous]!;
    const crossValue = (a.x - point.x) * (b.y - point.y) - (b.x - point.x) * (a.y - point.y);
    if (Math.abs(crossValue) < 1e-9
      && point.x >= Math.min(a.x, b.x) - 1e-6 && point.x <= Math.max(a.x, b.x) + 1e-6
      && point.y >= Math.min(a.y, b.y) - 1e-6 && point.y <= Math.max(a.y, b.y) + 1e-6) return true;
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const orient = (p: Vec2, q: Vec2, r: Vec2): number =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = orient(a, b, c);
  const abD = orient(a, b, d);
  const cdA = orient(c, d, a);
  const cdB = orient(c, d, b);
  return (abC === 0 || abD === 0 || Math.sign(abC) !== Math.sign(abD))
    && (cdA === 0 || cdB === 0 || Math.sign(cdA) !== Math.sign(cdB));
}

function lineTouchesPolygon(polygon: readonly Vec2[], start: Vec2, end: Vec2): boolean {
  if (pointInPolygon(start, polygon) || pointInPolygon(end, polygon)) return true;
  for (let index = 0; index < polygon.length; index++)
    if (segmentsIntersect(start, end, polygon[index]!, polygon[(index + 1) % polygon.length]!)) return true;
  return false;
}

export interface SplitFaceCandidate {
  face: SplitFaceHandle;
  mode: 'material' | 'void';
  keepSide: 'left' | 'right';
  leftArea: number;
  rightArea: number;
  /** 线段是否接触面（仅用于诊断）。 */
  lineTouches: boolean;
}

/**
 * 纯函数候选搜索：在给定草图平面 frame 中找被世界有向线切成两个正面积子面、
 * 且线端点都在面平面内的 body 面。
 */
function distanceToSegment(point: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (!(lengthSq > 1e-12)) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

/** 点落在多边形边界上（容差 0.05mm）。 */
function pointOnPolygonBoundary(point: Vec2, polygon: readonly Vec2[]): boolean {
  for (let index = 0; index < polygon.length; index++)
    if (distanceToSegment(point, polygon[index]!, polygon[(index + 1) % polygon.length]!) <= 0.05) return true;
  return false;
}

function convexHull(points: readonly Vec2[]): Vec2[] {
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const unique: Vec2[] = [];
  for (const point of sorted) {
    const last = unique[unique.length - 1];
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 1e-9) unique.push(point);
  }
  if (unique.length < 3) return [];
  const cross3 = (o: Vec2, a: Vec2, b: Vec2): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec2[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross3(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Vec2[] = [];
  for (let index = unique.length - 1; index >= 0; index--) {
    const point = unique[index]!;
    while (upper.length >= 2 && cross3(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** 线段中段是否有材料（判断线是在面内切分还是面外凹口）。 */
function segmentCrossesFace(outer: readonly Vec2[], start: Vec2, end: Vec2): boolean {
  for (const fraction of [0.2, 0.35, 0.5, 0.65, 0.8]) {
    const point = { x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction };
    if (pointInPolygon(point, outer)) return true;
  }
  return false;
}

/** 所选侧是否存在“凸包内、面外”的空腔（凹口填充语义）。 */
function hasVoidOnSide(outer: readonly Vec2[], hull: readonly Vec2[], start: Vec2, end: Vec2, keepLeft: boolean): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 1e-9)) return false;
  const nx = -dy / length;
  const ny = dx / length;
  const side = keepLeft ? 1 : -1;
  for (const fraction of [0.3, 0.5, 0.7]) {
    for (const offset of [0.1, 0.5, 1]) {
      const point = {
        x: start.x + dx * fraction + nx * side * offset,
        y: start.y + dy * fraction + ny * side * offset,
      };
      if (pointInPolygon(point, hull) && !pointInPolygon(point, outer)) return true;
    }
  }
  return false;
}

export function findSplitFaceCandidates(
  faces: readonly SplitFaceHandle[],
  frame: Frame,
  lineStart: SplitVec3,
  lineEnd: SplitVec3,
  sign: 1 | -1,
  bodyKey?: string,
): SplitFaceCandidate[] {
  const candidates: SplitFaceCandidate[] = [];
  const start2 = { x: dot(sub(lineStart, frame.origin), frame.x), y: dot(sub(lineStart, frame.origin), frame.y) };
  const end2 = { x: dot(sub(lineEnd, frame.origin), frame.x), y: dot(sub(lineEnd, frame.origin), frame.y) };
  for (const face of faces) {
    if (bodyKey !== undefined && face.bodyKey !== bodyKey) continue;
    const normal = unit(v3(face.normal[0], face.normal[1], face.normal[2]));
    if (!normal) continue;
    const debug = process.env.EXAMPLE_DEBUG_SPLIT === '1';
    const firstLine = face.loops.flat().find((curve): curve is Extract<LoopCurve, { kind: 'line' }> =>
      curve.kind === 'line');
    if (!firstLine) continue;
    const planePoint = pointTuple(firstLine.p0);
    if (Math.abs(dot(sub(lineStart, planePoint), normal)) > PLANE_TOLERANCE_MM
      || Math.abs(dot(sub(lineEnd, planePoint), normal)) > PLANE_TOLERANCE_MM) {
      if (debug) console.log(`[split-cand] face ${face.subEntityId}: plane reject`);
      continue;
    }
    const loops: Vec2[][] = [];
    let supported = true;
    for (const loop of face.loops) {
      const sampled = sampleLoop(loop, frame);
      if (!sampled) { supported = false; break; }
      loops.push(sampled);
    }
    if (!supported || loops.length === 0) {
      if (debug) console.log(`[split-cand] face ${face.subEntityId}: loops reject supported=${supported} n=${loops.length}`);
      continue;
    }
    const outer = loops.reduce((largest, current) =>
      Math.abs(signedArea(current)) > Math.abs(signedArea(largest)) ? current : largest);
    if (!lineTouchesPolygon(outer, start2, end2)) continue;
    // 侧向语义在**草图坐标系**内解释；不按面参数法向翻转（面 xDir 未知）。
    const keepSide: 'left' | 'right' = sign > 0 ? 'left' : 'right';
    const left = clipBySide(outer, start2, end2, 1);
    const right = clipBySide(outer, start2, end2, -1);
    const leftArea = Math.abs(signedArea(left));
    const rightArea = Math.abs(signedArea(right));
    const crossesFace = segmentCrossesFace(outer, start2, end2);
    if (crossesFace && leftArea > SPLIT_AREA_EPS_MM2 && rightArea > SPLIT_AREA_EPS_MM2) {
      candidates.push({ face, mode: 'material', keepSide, leftArea, rightArea, lineTouches: true });
      continue;
    }
    // 面外单线 + 凹口：线中段不在材料内、两端落在面边界、所选侧存在凸包内空腔。
    // 线段未穿面时不得用无限延伸线的材料两侧冒充面切分（Part 5 E3 反例）。
    if (!crossesFace
      && pointOnPolygonBoundary(start2, outer) && pointOnPolygonBoundary(end2, outer)) {
      const hull = convexHull(outer);
      if (hull.length >= 3 && hasVoidOnSide(outer, hull, start2, end2, keepSide === 'left'))
        candidates.push({ face, mode: 'void', keepSide, leftArea, rightArea, lineTouches: true });
    }
  }
  return candidates;
}

export async function resolveImprintSplitFace(args: {
  page: Page;
  ctx: BSeedEditorContext;
  accessToken: string;
  plane: SketchPlaneDto | undefined;
  entities: readonly SketchEntityDto[] | undefined;
  sketchEntityId: number;
  imprintSign: number | undefined;
}): Promise<ImprintSplitResolution> {
  const { page, ctx, accessToken, plane, entities, sketchEntityId, imprintSign } = args;
  if (!plane) return { ok: false, reason: '缺草图平面快照' };
  if (imprintSign !== 1 && imprintSign !== -1) return { ok: false, reason: `imprint 侧向缺失/非法（${imprintSign ?? '?'}）` };
  const frame = frameOf(plane);
  if (!frame) return { ok: false, reason: '草图平面退化' };
  const line = sketchLineWorld(plane, entities, sketchEntityId);
  if (!line) return { ok: false, reason: `实体 ${sketchEntityId} 不是带端点的直线` };
  const bodies = (await getBodiesRpc(ctx, accessToken)).filter(
    (body: BodyInfo) => body.active !== false && body.authored !== false,
  );
  if (bodies.length !== 1) return { ok: false, reason: `active authored body 数 ${bodies.length}（D2 首切片仅单 body）` };
  const body = bodies[0]!;
  let faces: SplitFaceHandle[] | undefined;
  try {
    faces = await page.evaluate(async ({ key, bodyInfos }) => {
      const hook = (window as unknown as {
        __lubanE2EExamples?: {
          readFaceHandles(iModelKey: string, allBodies: readonly unknown[]): Promise<SplitFaceHandle[] | undefined>;
        };
      }).__lubanE2EExamples;
      if (!hook) throw new Error('__lubanE2EExamples 未安装（VITE_E2E_HOOKS != true）');
      return hook.readFaceHandles(key, bodyInfos) as Promise<SplitFaceHandle[] | undefined>;
    }, { key: ctx.dbKey, bodyInfos: bodies });
  } catch (error) {
    return { ok: false, reason: `面枚举失败：${error instanceof Error ? error.message : String(error)}` };
  }
  if (!faces) return { ok: false, reason: '面枚举命令槽被占用' };
  const candidates = findSplitFaceCandidates(faces, frame, line.start, line.end, imprintSign, body.bodyKey);
  if (process.env.EXAMPLE_DEBUG_SPLIT === '1') {
    const start2 = { x: dot(sub(line.start, frame.origin), frame.x), y: dot(sub(line.start, frame.origin), frame.y) };
    const end2 = { x: dot(sub(line.end, frame.origin), frame.x), y: dot(sub(line.end, frame.origin), frame.y) };
    console.log(`[split] line world=${JSON.stringify(line)} local=${JSON.stringify({ start2, end2 })}`);
    for (const face of faces) {
      const normal = unit(v3(face.normal[0], face.normal[1], face.normal[2]));
      const firstLine = face.loops.flat().find((curve): curve is Extract<LoopCurve, { kind: 'line' }> => curve.kind === 'line');
      const planePoint = firstLine ? pointTuple(firstLine.p0) : undefined;
      const dStart = normal && planePoint ? dot(sub(line.start, planePoint), normal) : undefined;
      const dEnd = normal && planePoint ? dot(sub(line.end, planePoint), normal) : undefined;
      const loops: Vec2[][] = [];
      let supported = true;
      for (const loop of face.loops) {
        const sampled = sampleLoop(loop, frame);
        if (!sampled) { supported = false; break; }
        loops.push(sampled);
      }
      let areas: number[] | undefined;
      let touches: boolean | undefined;
      if (supported && loops.length > 0) {
        const outer = loops.reduce((largest, current) =>
          Math.abs(signedArea(current)) > Math.abs(signedArea(largest)) ? current : largest);
        touches = lineTouchesPolygon(outer, start2, end2);
        areas = [
          Math.abs(signedArea(clipBySide(outer, start2, end2, 1))),
          Math.abs(signedArea(clipBySide(outer, start2, end2, -1))),
        ];
      }
      console.log(`[split] face ${face.bodyKey}:${face.subEntityId} normal=${JSON.stringify(face.normal)} ` +
        `dStart=${dStart?.toFixed(3)} dEnd=${dEnd?.toFixed(3)} supported=${supported} touches=${touches} areas=${JSON.stringify(areas)}`);
    }
  }
  if (candidates.length === 0) return { ok: false, reason: '无面被该单线切成两个正面积子面' };
  if (candidates.length > 1) {
    return {
      ok: false,
      reason: `${candidates.length} 个面被单线切分（歧义：` +
        candidates.map((entry) => `${entry.face.bodyKey}:${entry.face.subEntityId}`).join(',') + '）',
    };
  }
  const candidate = candidates[0]!;
  const face = candidate.face;
  const resolved = (await msRpc(
    ctx.itwinId,
    ctx.imodelId,
    'resolveFaceRef',
    [ctx.dbKey, face.bodyKey, face.subEntityId],
    accessToken,
  )) as { ok: boolean; ref?: LubanTopologyId; error?: string };
  if (!resolved.ok || !resolved.ref
    || !Number.isInteger(resolved.ref.nodeId) || !Number.isInteger(resolved.ref.entityId)) {
    throw new BlockedCapabilityError(
      'imprint-split',
      `resolveFaceRef 失败：${resolved.error ?? '无持久面引用'}`,
    );
  }
  const faceNormal = unit(v3(face.normal[0], face.normal[1], face.normal[2]))!;
  const start2 = { x: dot(sub(line.start, frame.origin), frame.x), y: dot(sub(line.start, frame.origin), frame.y) };
  const end2 = { x: dot(sub(line.end, frame.origin), frame.x), y: dot(sub(line.end, frame.origin), frame.y) };
  const lineDx = end2.x - start2.x;
  const lineDy = end2.y - start2.y;
  const lineLength = Math.hypot(lineDx, lineDy);
  if (!(lineLength > 1e-9)) return { ok: false, reason: '切分线在草图坐标系退化' };
  const sideSign = imprintSign > 0 ? 1 : -1;
  const offsetMm = 1;
  const keepPoint = {
    x: frame.origin.x + frame.x.x * ((start2.x + end2.x) / 2 - (lineDy / lineLength) * sideSign * offsetMm)
      + frame.y.x * ((start2.y + end2.y) / 2 + (lineDx / lineLength) * sideSign * offsetMm),
    y: frame.origin.y + frame.x.y * ((start2.x + end2.x) / 2 - (lineDy / lineLength) * sideSign * offsetMm)
      + frame.y.y * ((start2.y + end2.y) / 2 + (lineDx / lineLength) * sideSign * offsetMm),
    z: frame.origin.z + frame.x.z * ((start2.x + end2.x) / 2 - (lineDy / lineLength) * sideSign * offsetMm)
      + frame.y.z * ((start2.y + end2.y) / 2 + (lineDx / lineLength) * sideSign * offsetMm),
  };
  if (process.env.EXAMPLE_DEBUG_SPLIT === '1')
    console.log(`[split] selected ${face.bodyKey}:${face.subEntityId} mode=${candidate.mode} keep=${candidate.keepSide} keepPoint=${JSON.stringify(keepPoint)}`);
  return {
    ok: true,
    bodyId: face.bodyKey,
    faceRef: resolved.ref,
    faceSubEntityId: face.subEntityId,
    faceNormal: [faceNormal.x, faceNormal.y, faceNormal.z],
    split: {
      start: line.start,
      end: line.end,
      keepSide: candidate.keepSide,
      keepPoint,
      region: candidate.mode,
    },
    note: `imprintFace 单线${candidate.mode === 'void' ? '空腔' : '材料'}切分→实体面 ` +
      `${face.bodyKey}:${face.subEntityId}（${candidate.keepSide} side，` +
      `area ${candidate.leftArea.toFixed(3)}/${candidate.rightArea.toFixed(3)}mm²）`,
  };
}
