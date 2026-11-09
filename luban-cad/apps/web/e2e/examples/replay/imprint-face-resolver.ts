/**
 * imprintFace → 实体平面面解析（A1，test-only 回放层）。
 *
 * 目标：非 NEW 的 imprintFace 拉伸若所选草图区域与当前 body 的某个**平面面**
 * 边界完全一致，则改走产品既有 `faceExtrude`（整面沿法向拉伸），而不是把草图
 * 面域当独立 prism 从草图平面拉伸（后者在多次 imprint/不同起始面时会错位）。
 *
 * A1 只做“整面一致”子集：区域数必须为 1，body 必须恰 1 个 active authored，
 * 面须平面且共面于草图平面，区域外环/孔环与面环面积、质心在容差内匹配；
 * 零/多候选一律返回 ok:false（调用方回退现有草图面域近似并登记），不猜。
 * face split（区域是面的一部分）不在本切片。
 */
import type { Page } from '@playwright/test';
import type { BodyInfo, LubanTopologyId, SketchPlaneDto, SketchRegionDto } from '@luban-cad/shared';
import { getBodiesRpc, msRpc, type BSeedEditorContext } from '../../helpers.js';
import { BlockedCapabilityError } from './scenario-to-op.js';

export type ImprintFaceResolution =
  | { ok: true; bodyId: string; faceRef: LubanTopologyId; faceSubEntityId: number; note: string }
  | { ok: false; reason: string };

interface Vec3 { x: number; y: number; z: number }
interface Vec2 { x: number; y: number }
type LoopCurve =
  | { kind: 'line'; p0: [number, number, number]; p1: [number, number, number] }
  | {
    kind: 'arc'; center: [number, number, number]; radius: number; normal: [number, number, number];
    start: [number, number, number]; end: [number, number, number]; sweepRadians: number;
  }
  | { kind: 'other'; geometryType: string };
interface FaceHandle {
  bodyKey: string;
  subEntityId: number;
  range: { low: [number, number, number]; high: [number, number, number] };
  normal: [number, number, number];
  loops: LoopCurve[][];
}

const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const unit = (a: Vec3): Vec3 | undefined => {
  const l = Math.hypot(a.x, a.y, a.z);
  return l < 1e-12 ? undefined : v3(a.x / l, a.y / l, a.z / l);
};

interface Frame { origin: Vec3; x: Vec3; y: Vec3; n: Vec3 }
function frameOf(plane: SketchPlaneDto): Frame | undefined {
  const n = unit(v3(plane.normal.x, plane.normal.y, plane.normal.z));
  if (!n) return undefined;
  const xRaw = v3(plane.xDir.x, plane.xDir.y, plane.xDir.z);
  const x = unit(sub(xRaw, v3(n.x * dot(xRaw, n), n.y * dot(xRaw, n), n.z * dot(xRaw, n))));
  if (!x) return undefined;
  return { origin: v3(plane.origin.x, plane.origin.y, plane.origin.z), x, y: cross(n, x), n };
}

function sampleLoop(loop: LoopCurve[], frame: Frame): Vec2[] | undefined {
  const out: Vec2[] = [];
  const push = (p: Vec3): void => {
    const rel = sub(p, frame.origin);
    if (Math.abs(dot(rel, frame.n)) > 0.02) return;
    out.push({ x: dot(rel, frame.x), y: dot(rel, frame.y) });
  };
  for (const curve of loop) {
    if (curve.kind === 'line') {
      push(v3(curve.p0[0], curve.p0[1], curve.p0[2]));
      push(v3(curve.p1[0], curve.p1[1], curve.p1[2]));
    } else if (curve.kind === 'arc') {
      const c = v3(curve.center[0], curve.center[1], curve.center[2]);
      const s = v3(curve.start[0], curve.start[1], curve.start[2]);
      const radius = curve.radius;
      const startAngle = Math.atan2(dot(sub(s, c), frame.y), dot(sub(s, c), frame.x));
      const count = 16;
      for (let i = 0; i <= count; i++) {
        const a = startAngle + curve.sweepRadians * (i / count);
        push(v3(
          c.x + radius * (Math.cos(a) * frame.x.x + Math.sin(a) * frame.y.x),
          c.y + radius * (Math.cos(a) * frame.x.y + Math.sin(a) * frame.y.y),
          c.z + radius * (Math.cos(a) * frame.x.z + Math.sin(a) * frame.y.z),
        ));
      }
    } else {
      return undefined;
    }
  }
  return out.length >= 3 ? out : undefined;
}

function polygonArea(points: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function centroid(points: readonly Vec2[]): Vec2 {
  return {
    x: points.reduce((sum, p) => sum + p.x, 0) / Math.max(1, points.length),
    y: points.reduce((sum, p) => sum + p.y, 0) / Math.max(1, points.length),
  };
}

function regionLoops(region: SketchRegionDto): Vec2[][] | undefined {
  const boundary = (list: readonly { x: number; y: number }[] | undefined): Vec2[] | undefined =>
    list && list.length >= 3 ? list.map((p) => ({ x: p.x, y: p.y })) : undefined;
  const outer = boundary(region.outerBoundary);
  if (!outer) return undefined;
  const holes = (region.holeBoundaries ?? []).map((h) => boundary(h)).filter((h): h is Vec2[] => h !== undefined);
  if (holes.length !== (region.holeBoundaries?.length ?? 0)) return undefined;
  return [outer, ...holes];
}

function loopsMatch(region: Vec2[][], faceLoops: Vec2[][]): boolean {
  if (region.length !== faceLoops.length) return false;
  const regionSorted = region.map((points) => ({ area: polygonArea(points), c: centroid(points) }))
    .sort((a, b) => b.area - a.area);
  const faceSorted = faceLoops.map((points) => ({ area: polygonArea(points), c: centroid(points) }))
    .sort((a, b) => b.area - a.area);
  for (let i = 0; i < regionSorted.length; i++) {
    const r = regionSorted[i]!;
    const f = faceSorted[i]!;
    const scale = Math.max(r.area, f.area);
    if (scale <= 1e-9 || Math.abs(r.area - f.area) > scale * 0.01) return false;
    const span = Math.sqrt(scale);
    if (Math.hypot(r.c.x - f.c.x, r.c.y - f.c.y) > Math.max(0.05, span * 0.01)) return false;
  }
  return true;
}

/** 解析 imprintFace 区域 → 当前 body 的单个共面实体面。 */
export async function resolveImprintFaceRef(args: {
  page: Page;
  ctx: BSeedEditorContext;
  accessToken: string;
  plane: SketchPlaneDto | undefined;
  regions: readonly SketchRegionDto[];
  regionIndices: readonly number[];
}): Promise<ImprintFaceResolution> {
  const { page, ctx, accessToken, plane } = args;
  if (!plane) return { ok: false, reason: '缺草图平面快照' };
  if (args.regionIndices.length !== 1) return { ok: false, reason: `选中面域数 ${args.regionIndices.length}（A1 仅单区域）` };
  const region = args.regions[args.regionIndices[0]!];
  if (!region) return { ok: false, reason: '区域下标越界' };
  const frame = frameOf(plane);
  if (!frame) return { ok: false, reason: '草图平面退化' };
  const loops = regionLoops(region);
  if (!loops) return { ok: false, reason: '区域边界点缺失' };

  const bodies = (await getBodiesRpc(ctx, accessToken)).filter(
    (body: BodyInfo) => body.active !== false && body.authored !== false,
  );
  if (bodies.length !== 1) return { ok: false, reason: `active authored body 数 ${bodies.length}（A1 仅单 body）` };
  let faces: FaceHandle[] | undefined;
  try {
    faces = await page.evaluate(async ({ key, bodyInfos }) => {
      const hook = (window as unknown as {
        __lubanE2EExamples?: {
          readFaceHandles(iModelKey: string, allBodies: readonly unknown[]): Promise<FaceHandle[] | undefined>;
        };
      }).__lubanE2EExamples;
      if (!hook) throw new Error('__lubanE2EExamples 未安装（VITE_E2E_HOOKS != true）');
      return hook.readFaceHandles(key, bodyInfos) as Promise<FaceHandle[] | undefined>;
    }, { key: ctx.dbKey, bodyInfos: bodies });
  } catch (error) {
    return { ok: false, reason: `面枚举失败：${error instanceof Error ? error.message : String(error)}` };
  }
  if (!faces) return { ok: false, reason: '面枚举命令槽被占用' };

  const candidates: FaceHandle[] = [];
  for (const face of faces) {
    if (Math.abs(dot(v3(face.normal[0], face.normal[1], face.normal[2]), frame.n)) < 0.999) continue;
    const faceLoops: Vec2[][] = [];
    let supported = true;
    for (const loop of face.loops) {
      const sampled = sampleLoop(loop, frame);
      if (!sampled) { supported = false; break; }
      faceLoops.push(sampled);
    }
    if (!supported || faceLoops.length === 0) continue;
    if (loopsMatch(loops, faceLoops)) candidates.push(face);
  }
  if (candidates.length !== 1) {
    return { ok: false, reason: candidates.length === 0 ? '无共面且边界一致的面' : `${candidates.length} 个面满足条件` };
  }
  const face = candidates[0]!;
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
      'imprint-face',
      `resolveFaceRef 失败：${resolved.error ?? '无持久面引用'}`,
    );
  }
  return {
    ok: true,
    bodyId: face.bodyKey,
    faceRef: resolved.ref,
    faceSubEntityId: face.subEntityId,
    note: `imprintFace→实体面 ${face.bodyKey}:${face.subEntityId}（faceExtrude）`,
  };
}
