/**
 * live spec 的几何边选择（test-only）。
 *
 * live spec 不携带 Onshape 拓扑 id；这里用 dev-only `readEdgeHandles` 枚举
 * 当前 body 的边曲线，按「曲线类型/方向/中点/长度」唯一匹配，再走既有
 * `resolveEdgeRef` RPC 换持久边引用。匹配不唯一/零命中一律诚实失败。
 */
import type { Page } from '@playwright/test';
import type { FilletEdgeRef } from '@luban-cad/shared';
import { msRpc, type BSeedEditorContext } from '../../helpers.js';
import { readBodyEdgeHandles, type EdgeHandle } from '../replay/edge-resolver.js';

export type LiveVec3 = { x: number; y: number; z: number };

export interface LiveEdgeSelector {
  curveKind?: 'line' | 'arc';
  /** 仅 line：方向平行（正负均可）。 */
  direction?: LiveVec3;
  /** 边中点，mm 世界坐标。 */
  midpoint?: LiveVec3;
  /** 线长/弧长，mm。 */
  lengthMm?: number;
  /** 中点容差（mm，缺省 1）。 */
  toleranceMm?: number;
  /** 长度容差（mm，缺省 1）。 */
  lengthToleranceMm?: number;
  /** 方向夹角容差（deg，缺省 1）。 */
  angleToleranceDeg?: number;
}

export interface LiveResolvedEdges {
  refs: FilletEdgeRef[];
  bodyKeys: string[];
  notes: string[];
}

function norm(v: LiveVec3): LiveVec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  if (!(len > 0)) throw new Error('edge-select: 零方向向量');
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/** `readEdgeHandles` 的曲线坐标已是 mm 世界系。 */
function midpointMm(handle: EdgeHandle): LiveVec3 | undefined {
  const curve = handle.curve;
  if (curve.kind === 'line' && curve.p0 && curve.p1) {
    return {
      x: (curve.p0[0] + curve.p1[0]) / 2,
      y: (curve.p0[1] + curve.p1[1]) / 2,
      z: (curve.p0[2] + curve.p1[2]) / 2,
    };
  }
  if (curve.kind === 'arc' && curve.start && curve.end) {
    return {
      x: (curve.start[0] + curve.end[0]) / 2,
      y: (curve.start[1] + curve.end[1]) / 2,
      z: (curve.start[2] + curve.end[2]) / 2,
    };
  }
  return undefined;
}

function lengthMm(handle: EdgeHandle): number | undefined {
  const curve = handle.curve;
  if (curve.kind === 'line' && curve.p0 && curve.p1)
    return Math.hypot(
      curve.p1[0] - curve.p0[0],
      curve.p1[1] - curve.p0[1],
      curve.p1[2] - curve.p0[2],
    );
  if (curve.kind === 'arc' && curve.radius !== undefined && curve.sweepRadians !== undefined)
    return Math.abs(curve.radius * curve.sweepRadians);
  return undefined;
}

function lineDirection(handle: EdgeHandle): LiveVec3 | undefined {
  const curve = handle.curve;
  if (curve.kind !== 'line' || !curve.p0 || !curve.p1) return undefined;
  const dx = curve.p1[0] - curve.p0[0];
  const dy = curve.p1[1] - curve.p0[1];
  const dz = curve.p1[2] - curve.p0[2];
  const len = Math.hypot(dx, dy, dz);
  if (!(len > 0)) return undefined;
  return { x: dx / len, y: dy / len, z: dz / len };
}

export function matchesLiveEdge(handle: EdgeHandle, selector: LiveEdgeSelector): boolean {
  const curve = handle.curve;
  if (selector.curveKind && curve.kind !== selector.curveKind) return false;
  const mid = midpointMm(handle);
  if (selector.midpoint) {
    if (!mid) return false;
    const tol = selector.toleranceMm ?? 1;
    if (Math.hypot(
      mid.x - selector.midpoint.x,
      mid.y - selector.midpoint.y,
      mid.z - selector.midpoint.z,
    ) > tol) return false;
  }
  if (selector.lengthMm !== undefined) {
    const length = lengthMm(handle);
    if (length === undefined) return false;
    if (Math.abs(length - selector.lengthMm) > (selector.lengthToleranceMm ?? 1)) return false;
  }
  if (selector.direction) {
    const dir = lineDirection(handle);
    if (!dir) return false;
    const want = norm(selector.direction);
    const cos = Math.abs(dir.x * want.x + dir.y * want.y + dir.z * want.z);
    const limit = Math.cos(((selector.angleToleranceDeg ?? 1) * Math.PI) / 180);
    if (cos < limit) return false;
  }
  return true;
}

export async function resolveLiveEdgeRefs(
  page: Page,
  ctx: BSeedEditorContext,
  accessToken: string,
  selectors: LiveEdgeSelector[],
): Promise<LiveResolvedEdges> {
  if (selectors.length === 0) throw new Error('edge-select: 选择器为空');
  const handles = await readBodyEdgeHandles(page, ctx, accessToken);
  if (handles.length === 0) throw new Error('edge-select: 当前 body 无可枚举边');
  if (process.env.EDGE_DEBUG === '1')
    console.log(
      `[edge-select] handles=${handles.length} sample=` +
      JSON.stringify(handles.slice(0, 8).map((h) => ({ body: h.bodyKey, id: h.subEntityId, curve: h.curve }))),
    );

  const refs = new Map<string, FilletEdgeRef>();
  const bodyKeys = new Set<string>();
  const notes: string[] = [];
  for (const [index, selector] of selectors.entries()) {
    const matches_ = handles.filter((handle) => matchesLiveEdge(handle, selector));
    if (matches_.length === 0)
      throw new Error(`edge-select #${index + 1} 零命中：${JSON.stringify(selector)}`);
    if (matches_.length > 1)
      throw new Error(
        `edge-select #${index + 1} 匹配不唯一（${matches_.length}）：${JSON.stringify(selector)}`,
      );
    const handle = matches_[0];
    if (!handle) throw new Error(`edge-select #${index + 1} 内部空匹配`);
    const result = (await msRpc(
      ctx.itwinId,
      ctx.imodelId,
      'resolveEdgeRef',
      [ctx.dbKey, handle.bodyKey, handle.subEntityId],
      accessToken,
    )) as { ok: boolean; ref?: FilletEdgeRef; error?: string };
    if (!result.ok || !result.ref)
      throw new Error(`edge-select #${index + 1} resolveEdgeRef 失败：${result.error ?? 'unknown'}`);
    refs.set(`${result.ref.edge.nodeId}:${result.ref.edge.entityId}`, result.ref);
    bodyKeys.add(handle.bodyKey);
    notes.push(`edge #${index + 1} ${handle.bodyKey}:${handle.subEntityId} (${handle.curve.kind})`);
  }
  return { refs: [...refs.values()], bodyKeys: [...bodyKeys], notes };
}
