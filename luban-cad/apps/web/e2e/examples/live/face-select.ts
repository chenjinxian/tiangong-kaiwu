/**
 * live spec 的几何面选择（test-only）。
 *
 * 与 `edge-select.ts` 同思路：dev-only `__lubanE2EExamples.readFaceHandles`
 * 枚举当前 body 的面（世界 mm），按平面/中心/环数唯一匹配，再走既有
 * `resolveFaceRef` RPC 换持久面引用。零/多命中、跨 body 一律诚实失败。
 */
import type { Page } from '@playwright/test';
import type { LubanTopologyId } from '@luban-cad/shared';
import { getBodiesRpc, msRpc, type BSeedEditorContext } from '../../helpers.js';

export type LiveVec3 = { x: number; y: number; z: number };

interface FaceLoopCurve {
  kind: 'line' | 'arc' | 'other';
}

export interface LiveFaceHandle {
  bodyKey: string;
  subEntityId: number;
  range: { low: [number, number, number]; high: [number, number, number] };
  normal: [number, number, number];
  loops: FaceLoopCurve[][];
}

export interface LiveFaceSelector {
  /** 面法向平行（正负均可）。 */
  normal?: LiveVec3;
  /** 面 AABB 中心，mm 世界坐标。 */
  center?: LiveVec3;
  /** 面的环数（含外环）。 */
  loopCount?: number;
  /** 中心容差（mm，缺省 1）。 */
  toleranceMm?: number;
  /** 法向夹角容差（deg，缺省 1）。 */
  angleToleranceDeg?: number;
}

export interface LiveResolvedFaces {
  refs: LubanTopologyId[];
  bodyKeys: string[];
  notes: string[];
}

function norm(v: LiveVec3): LiveVec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  if (!(len > 0)) throw new Error('face-select: 零方向向量');
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function faceCenter(handle: LiveFaceHandle): LiveVec3 {
  const low = handle.range.low;
  const high = handle.range.high;
  return {
    x: (low[0] + high[0]) / 2,
    y: (low[1] + high[1]) / 2,
    z: (low[2] + high[2]) / 2,
  };
}

export function matchesLiveFace(handle: LiveFaceHandle, selector: LiveFaceSelector): boolean {
  if (selector.loopCount !== undefined && handle.loops.length !== selector.loopCount) return false;
  const center = faceCenter(handle);
  if (selector.center) {
    const tol = selector.toleranceMm ?? 1;
    if (Math.hypot(
      center.x - selector.center.x,
      center.y - selector.center.y,
      center.z - selector.center.z,
    ) > tol) return false;
  }
  if (selector.normal) {
    const want = norm(selector.normal);
    const raw = handle.normal;
    const len = Math.hypot(raw[0], raw[1], raw[2]);
    if (!(len > 0)) return false;
    const got = { x: raw[0] / len, y: raw[1] / len, z: raw[2] / len };
    const cos = Math.abs(got.x * want.x + got.y * want.y + got.z * want.z);
    const limit = Math.cos(((selector.angleToleranceDeg ?? 1) * Math.PI) / 180);
    if (cos < limit) return false;
  }
  return true;
}

export async function resolveLiveShellFaceRefs(
  page: Page,
  ctx: BSeedEditorContext,
  accessToken: string,
  selectors: LiveFaceSelector[],
  targetBodyKey?: string,
): Promise<LiveResolvedFaces> {
  if (selectors.length === 0) throw new Error('face-select: 选择器为空');
  const bodies = (await getBodiesRpc(ctx, accessToken)).filter(
    (body) => body.active !== false && body.authored !== false,
  );
  const activeBodyKeys = new Set(bodies.map((body) => body.bodyKey));
  if (targetBodyKey !== undefined && !activeBodyKeys.has(targetBodyKey))
    throw new Error(`face-select: 目标 body ${targetBodyKey} 不在 active authored 集合`);
  const handles = (await page.evaluate(async ({ key, bodyInfos }) => {
    const hook = (window as unknown as {
      __lubanE2EExamples?: {
        readFaceHandles(iModelKey: string, allBodies: readonly unknown[]): Promise<LiveFaceHandle[] | undefined>;
      };
    }).__lubanE2EExamples;
    if (!hook) throw new Error('__lubanE2EExamples 未安装（VITE_E2E_HOOKS != true）');
    return hook.readFaceHandles(key, bodyInfos);
  }, { key: ctx.dbKey, bodyInfos: bodies })) ?? undefined;
  if (!handles || handles.length === 0)
    throw new Error('face-select: 当前 body 无可枚举面');
  const scoped = targetBodyKey === undefined
    ? handles
    : handles.filter((handle) => handle.bodyKey === targetBodyKey);
  if (scoped.length === 0) throw new Error(`face-select: 目标 body ${targetBodyKey} 无面`);
  if (process.env.LIVE_FACE_DEBUG === '1')
    console.log(
      `[face-select] faces=${JSON.stringify(scoped.map((handle) => ({
        body: handle.bodyKey,
        id: handle.subEntityId,
        center: Object.values(faceCenter(handle)).map((n) => Number(n.toFixed(2))),
        normal: handle.normal.map((n) => Number(n.toFixed(3))),
        loops: handle.loops.length,
        range: handle.range,
      })))}`,
    );

  const refs = new Map<string, LubanTopologyId>();
  const bodyKeys = new Set<string>();
  const notes: string[] = [];
  for (const [index, selector] of selectors.entries()) {
    const matched = scoped.filter((handle) => matchesLiveFace(handle, selector));
    if (matched.length === 0)
      throw new Error(`face-select #${index + 1} 零命中：${JSON.stringify(selector)}`);
    if (matched.length > 1)
      throw new Error(
        `face-select #${index + 1} 匹配不唯一（${matched.length}）：${JSON.stringify(selector)}`,
      );
    const handle = matched[0]!;
    const result = (await msRpc(
      ctx.itwinId,
      ctx.imodelId,
      'resolveFaceRef',
      [ctx.dbKey, handle.bodyKey, handle.subEntityId],
      accessToken,
    )) as { ok: boolean; ref?: LubanTopologyId; error?: string };
    if (!result.ok || !result.ref)
      throw new Error(`face-select #${index + 1} resolveFaceRef 失败：${result.error ?? 'unknown'}`);
    refs.set(`${result.ref.nodeId}:${result.ref.entityId}`, result.ref);
    bodyKeys.add(handle.bodyKey);
    const c = faceCenter(handle);
    notes.push(
      `face #${index + 1} ${handle.bodyKey}:${handle.subEntityId} `
      + `center=(${c.x.toFixed(2)},${c.y.toFixed(2)},${c.z.toFixed(2)}) loops=${handle.loops.length}`,
    );
  }
  return { refs: [...refs.values()], bodyKeys: [...bodyKeys], notes };
}
