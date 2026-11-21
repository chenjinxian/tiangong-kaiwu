/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图「使用」模型边候选加载（S1 2026-11-21）：
 * 复用既有只读通道 `readBrepEdgeHandles`（BRep 显示/拾取同一 SolidModeling 命令）
 * + `resolveEdgeRef` RPC 把拾取 id 换成边自身持久 id，产出 Use 覆盖层的
 * `{curve,start,end}` 候选。**不新增工具族/选择管道**；命令槽由调用方经
 * `withExclusiveBrepCommand` 串行（与显示拓扑读面共用粘性缓存）。
 *
 * 诚实边界：仅 line/arc（其他曲线精确投影不可证，跳过并计数/收集错误）；
 * resolveEdgeRef 失败逐边跳过（不猜 ref）；读边通道不可用返回错误码，候选为空。
 */
import type { BodyInfo, LubanTopologyId } from '@luban-cad/shared';
import type { BrepEdgeCurve, BrepEdgeHandle } from './brep-topology.js';
import type { SketchUseBodyPart } from './sketch-use.js';

export type SketchUseBodyCurveKind = 'line' | 'arc';

export interface SketchUseBodyCandidate {
  bodyKey: string;
  subEntityId: number;
  topologyRef: LubanTopologyId;
  part: SketchUseBodyPart;
  curveKind: SketchUseBodyCurveKind;
  curve: BrepEdgeCurve;
}

/** 跳过原因（locale-neutral；覆盖层负责 zh/en 映射）。 */
export type SketchUseBodyCandidateError =
  | 'unsupported-curve'
  | 'resolve-failed'
  | 'read-edges-unavailable';

export interface LoadBodyCandidatesArgs {
  iModelKey: string;
  bodies: readonly BodyInfo[];
  readEdges: (iModelKey: string, bodies: readonly BodyInfo[]) => Promise<BrepEdgeHandle[] | undefined>;
  resolveEdgeRef: (iModelKey: string, bodyKey: string, subEntityId: number) =>
    Promise<{ ok: boolean; ref?: { edge: LubanTopologyId }; error?: string }>;
}

export interface LoadBodyCandidatesResult {
  candidates: SketchUseBodyCandidate[];
  skipped: number;
  errors: SketchUseBodyCandidateError[];
}

export async function loadSketchUseBodyCandidates(
  args: LoadBodyCandidatesArgs,
): Promise<LoadBodyCandidatesResult> {
  if (args.bodies.length === 0)
    return { candidates: [], skipped: 0, errors: [] };
  let edges: BrepEdgeHandle[] | undefined;
  try {
    edges = await args.readEdges(args.iModelKey, args.bodies);
  } catch {
    return { candidates: [], skipped: 0, errors: ['read-edges-unavailable'] };
  }
  if (!edges)
    return { candidates: [], skipped: 0, errors: ['read-edges-unavailable'] };

  const candidates: SketchUseBodyCandidate[] = [];
  const errors: SketchUseBodyCandidateError[] = [];
  let skipped = 0;
  for (const edge of edges) {
    if (edge.curve.kind !== 'line' && edge.curve.kind !== 'arc') {
      skipped += 1;
      errors.push('unsupported-curve');
      continue;
    }
    let resolved: Awaited<ReturnType<LoadBodyCandidatesArgs['resolveEdgeRef']>>;
    try {
      resolved = await args.resolveEdgeRef(args.iModelKey, edge.bodyKey, edge.subEntityId);
    } catch {
      resolved = { ok: false };
    }
    if (!resolved.ok || !resolved.ref?.edge) {
      skipped += 1;
      errors.push('resolve-failed');
      continue;
    }
    const curveKind: SketchUseBodyCurveKind = edge.curve.kind;
    const base = {
      bodyKey: edge.bodyKey,
      subEntityId: edge.subEntityId,
      topologyRef: resolved.ref.edge,
      curveKind,
      curve: edge.curve,
    };
    candidates.push(
      { ...base, part: 'curve' },
      { ...base, part: 'start' },
      { ...base, part: 'end' },
    );
  }
  return { candidates, skipped, errors };
}
