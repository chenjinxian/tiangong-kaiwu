/**
 * 草图槽——多连通分量联动等宽（ADR-0022 §2.8 扩展，2026-11-20 live S2o）。
 *
 * live 证据（私有 `ui-evidence/slot-variants-20261120/`）：
 * - `s2oC-arc-line-disjoint-slot.dxf`：3 点弧 + 不相连直线一起选 → **两条独立
 *   槽**（弧槽 = 同心偏移弧 R±w/2 + 两半圆帽；线槽 = 体育场），全部帽 r=w/2、
 *   草图中只有一个 Ø20。
 * - `s2oB2-mixed-partial-slot.dxf`：2 相连线（链）+ 1 独立线一起选 → 链槽
 *   （端帽 + 外侧转角弧/内侧斜接）+ 独立体育场，同一个 Ø20。
 *
 * 实现：按端点焊接把选中曲线拆成连通分量；每分量用既有单分量构建器
 * （单线/单弧/开放链/闭合环/混合开放链/闭合混合环/分支/线树）生成独立草稿；
 * 合并时保留**首分量**的 diameter，其余分量的 diameter 换成
 * `equal(首帽锚, 该分量首帽)`——一个可见 Ø 驱动所有分量。
 *
 * 限制（未采证据）：闭合环分量使用 `slotWidth` 宽度语义，与直径约束不能合并
 * → 混合选择中含任何闭合环/整圆分量即诚实拒收；全部分量为互不相连的直线时
 * 仍走既有 `buildMultiLineSlotDraft`（同一结构，保持已验证路径不变）。
 */
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import {
  SLOT_CHAIN_TOL,
  SLOT_TOL,
  buildArcSlotDraft,
  buildLineChainSlotDraft,
  buildLineSlotDraft,
  lineChainFromSelection,
  type SlotBuildError,
  type SlotDraft,
} from './sketch-slot-logic.js';
import {
  buildClosedMixedRingSlotDraft,
  buildMixedChainSlotDraft,
  closedMixedChainFromSelection,
  mixedChainFromSelection,
  resolveMixedArc,
} from './sketch-slot-mixed-logic.js';
import { branchChainFromSelection, buildBranchChainSlotDraft } from './sketch-slot-branch-logic.js';
import { buildLineTreeSlotDraft, lineTreeFromSelection } from './sketch-slot-tree-logic.js';

interface P2 { u: number; v: number }

function indexPoints(entities: SketchEntityDto[]): Map<number, P2> {
  const points = new Map<number, P2>();
  for (const e of entities)
    if (e.kind === 'point' && e.x !== undefined && e.y !== undefined)
      points.set(e.id, { u: e.x, v: e.y });
  return points;
}

function resolvePoint(ref: number | { x: number; y: number }, points: Map<number, P2>): P2 | undefined {
  return typeof ref === 'number' ? points.get(ref) : { u: ref.x, v: ref.y };
}

/**
 * 按端点焊接把选中曲线拆成连通分量（分量内保持实体顺序；仅 line/arc）。
 * 未解算端点/非 line·arc → undefined。
 */
export function slotMemberComponents(
  entities: SketchEntityDto[],
  selectedIds: readonly number[],
): number[][] | undefined {
  const ids = new Set(selectedIds);
  if (ids.size === 0) return undefined;
  const members = entities.filter(
    (e): e is SketchEntityDto & ({ kind: 'line' } | { kind: 'arc' }) =>
      (e.kind === 'line' || e.kind === 'arc') && ids.has(e.id),
  );
  if (members.length !== ids.size) return undefined;
  const points = indexPoints(entities);
  const ends = new Map<number, P2[]>();
  for (const member of members) {
    if (member.kind === 'line') {
      const a = resolvePoint(member.p1, points);
      const b = resolvePoint(member.p2, points);
      if (!a || !b) return undefined;
      ends.set(member.id, [a, b]);
    } else {
      const g = resolveMixedArc(member, points);
      if (!g) return undefined;
      ends.set(member.id, [g.start, g.end]);
    }
  }
  const parent = new Map<number, number>(members.map((m) => [m.id, m.id]));
  const find = (id: number): number => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = id;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i]!;
      const b = members[j]!;
      const ea = ends.get(a.id)!;
      const eb = ends.get(b.id)!;
      if (ea.some((p) => eb.some((q) => Math.hypot(p.u - q.u, p.v - q.v) <= SLOT_CHAIN_TOL)))
        union(a.id, b.id);
    }
  }
  const groups = new Map<number, number[]>();
  for (const member of members) {
    const root = find(member.id);
    const list = groups.get(root);
    if (list) list.push(member.id);
    else groups.set(root, [member.id]);
  }
  return [...groups.values()];
}

type Built = { ok: true; draft: SlotDraft } | { ok: false; error: SlotBuildError };

/** 单分量构建（按成员拓扑分派到既有构建器）。 */
function buildComponent(
  entities: SketchEntityDto[],
  ids: readonly number[],
  width: number,
  startId: number,
): Built {
  const members = ids.map((id) => entities.find((e) => e.id === id));
  if (members.some((m) => !m || (m.kind !== 'line' && m.kind !== 'arc')))
    return { ok: false, error: 'unsupportedKind' };
  if (ids.length === 1) {
    const member = members[0];
    if (!member) return { ok: false, error: 'unsupportedKind' };
    if (member.kind === 'line')
      return buildLineSlotDraft({ line: member, entities, width, startId });
    if (member.kind === 'arc')
      return buildArcSlotDraft({ arc: member, entities, width, startId });
    return { ok: false, error: 'unsupportedKind' };
  }
  if (members.every((m) => m!.kind === 'line')) {
    const branch = branchChainFromSelection(entities, ids);
    if (branch) return buildBranchChainSlotDraft({ chain: branch, width, startId });
    const tree = lineTreeFromSelection(entities, ids);
    if (tree) return buildLineTreeSlotDraft({ tree, width, startId });
    const chain = lineChainFromSelection(entities, ids);
    if (!chain) return { ok: false, error: 'unsupportedChain' };
    return buildLineChainSlotDraft({ chain, entities, width, startId });
  }
  const mixed = mixedChainFromSelection(entities, ids);
  if (mixed) return buildMixedChainSlotDraft({ chain: mixed, entities, width, startId });
  const closed = closedMixedChainFromSelection(entities, ids);
  if (closed) return buildClosedMixedRingSlotDraft({ chain: closed, entities, width, startId });
  return { ok: false, error: 'unsupportedChain' };
}

/**
 * 多分量联动等宽槽草稿：逐分量构建后合并，保留首分量 diameter，其余分量
 * diameter 换为跨分量 equal。任何分量是闭合环（`slotWidth` 语义）→ 拒收。
 */
export function buildComponentsSlotDraft(input: {
  components: ReadonlyArray<readonly number[]>;
  entities: SketchEntityDto[];
  width: number;
  startId: number;
}): Built {
  const { components, entities, width } = input;
  if (components.length < 2) return { ok: false, error: 'unsupportedChain' };
  if (!(width > SLOT_TOL)) return { ok: false, error: 'zeroWidth' };
  const drafts: SlotDraft[] = [];
  let cursor = input.startId;
  for (const ids of components) {
    const built = buildComponent(entities, ids, width, cursor);
    if (!built.ok) return built;
    if (built.draft.slotWidthConstraintId !== undefined || built.draft.capArcIds.length === 0)
      return { ok: false, error: 'unsupportedChain' }; // 混合选择中的闭合环（ring 宽度语义）未采证据
    if (built.draft.diameterConstraintId === undefined)
      return { ok: false, error: 'unsupportedChain' };
    drafts.push(built.draft);
    cursor = built.draft.nextId;
  }

  const mergedEntities = drafts.flatMap((d) => d.entities);
  const mergedConstraints: SketchConstraintDto[] = [];
  let anchorCap: number | undefined;
  let diameterConstraintId: number | undefined;
  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]!;
    for (const constraint of draft.constraints) {
      if (constraint.id === draft.diameterConstraintId) {
        if (i === 0) {
          mergedConstraints.push(constraint);
          anchorCap = constraint.refs[0] as number;
          diameterConstraintId = constraint.id;
        }
        continue;
      }
      mergedConstraints.push(constraint);
    }
  }
  if (anchorCap === undefined || diameterConstraintId === undefined)
    return { ok: false, error: 'unsupportedChain' };
  let nextId = cursor;
  for (let i = 1; i < drafts.length; i++) {
    const draft = drafts[i]!;
    const diameter = draft.constraints.find((c) => c.id === draft.diameterConstraintId);
    if (!diameter) return { ok: false, error: 'unsupportedChain' };
    mergedConstraints.push({
      kind: 'equal', id: nextId++, refs: [anchorCap, diameter.refs[0] as number],
    });
  }
  const cornerArcIds = drafts.flatMap((d) => d.cornerArcIds ?? []);
  return {
    ok: true,
    draft: {
      entities: mergedEntities,
      constraints: mergedConstraints,
      nextId,
      capArcIds: drafts.flatMap((d) => d.capArcIds),
      boundaryLineIds: drafts.flatMap((d) => d.boundaryLineIds),
      diameterConstraintId,
      ...(cornerArcIds.length > 0 ? { cornerArcIds } : {}),
    },
  };
}
