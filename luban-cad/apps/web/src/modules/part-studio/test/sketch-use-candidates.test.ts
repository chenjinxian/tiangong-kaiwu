/**
 * 草图「使用」模型边候选纯逻辑（S1 2026-11-21）：
 * - 外部引用 id / 实体块分配（避开实体/约束/已有引用块）；
 * - bodyEdge externalRefs 行构造（line/arc 曲线 + 端点，槽位 3/2/1）；
 * - 投影失败消息映射（code → zh/en 键，未知 code 兜底）；
 * - 候选加载（注入 readEdges/resolveEdgeRef；other 曲线与 resolve 失败跳过计数）。
 */
import { describe, expect, it, vi } from 'vitest';
import type { BodyInfo, SketchEntityDto, SketchExternalReferenceDto } from '@luban-cad/shared';
import {
  buildBodyEdgeExternalRefRow,
  nextEntityBlockStart,
  nextExternalRefId,
  projectionFailureMessage,
} from '../internal/sketch-use.js';
import { loadSketchUseBodyCandidates } from '../internal/sketch-use-candidates.js';
import type { BrepEdgeHandle } from '../internal/brep-topology.js';

const bodyEdgeRef = (
  id: number,
  entityIds: number[],
  bodyId = 'body-a',
): SketchExternalReferenceDto => ({
  id,
  kind: 'project',
  source: { kind: 'bodyEdge', bodyId, topologyRef: { nodeId: 1, entityId: id } },
  entityIds,
});

const lineEdge: BrepEdgeHandle = {
  bodyKey: 'body-a',
  subEntityId: 11,
  curve: { kind: 'line', p0: [0, 0, 0], p1: [10, 0, 0] },
};

const arcEdge: BrepEdgeHandle = {
  bodyKey: 'body-a',
  subEntityId: 12,
  curve: {
    kind: 'arc',
    center: [0, 0, 0],
    radius: 5,
    normal: [0, 0, 1],
    start: [5, 0, 0],
    end: [0, 5, 0],
    sweepRadians: Math.PI / 2,
  },
};

const otherEdge: BrepEdgeHandle = {
  bodyKey: 'body-a',
  subEntityId: 13,
  curve: { kind: 'other', geometryType: 'BsplineCurve' },
};

const bodies: BodyInfo[] = [{ bodyKey: 'body-a', active: true, authored: true }];

describe('nextExternalRefId', () => {
  it('空表 → 1；已有 [2,9] → 10', () => {
    expect(nextExternalRefId([])).toBe(1);
    expect(nextExternalRefId([bodyEdgeRef(2, [11]), bodyEdgeRef(9, [12])])).toBe(10);
  });
});

describe('nextEntityBlockStart', () => {
  it('避开实体/约束/已有引用块（示例 1,2 / 3 / 4,5,6 + slots 3 → 7）', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'point', id: 1 },
      { kind: 'point', id: 2 },
    ];
    const constraints = [{ id: 3 }];
    const refs = [bodyEdgeRef(1, [4, 5, 6])];
    expect(nextEntityBlockStart(entities, constraints, refs, 3)).toBe(7);
  });

  it('块内任一 id 被占用即前移；空草图 → 1', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'point', id: 1 },
      { kind: 'point', id: 5 },
    ];
    // 1..3 区块含实体 1 → 2..4 空闲 → 2（实体 5 不阻塞 2..4）。
    expect(nextEntityBlockStart(entities, [], [], 3)).toBe(2);
    // slots 4：1..4/2..5/3..6/4..7/5..8 均含实体 1 或 5 → 6..9 空闲。
    expect(nextEntityBlockStart(entities, [], [], 4)).toBe(6);
    expect(nextEntityBlockStart([], [], [], 3)).toBe(1);
  });
});

describe('buildBodyEdgeExternalRefRow', () => {
  const base = {
    id: 3,
    bodyKey: 'body-a',
    topologyRef: { nodeId: 7, entityId: 8 },
    entities: [] as readonly SketchEntityDto[],
    constraints: [] as readonly { id: number }[],
    externalRefs: [] as readonly SketchExternalReferenceDto[],
  };

  it('line 曲线：kind=project、source=bodyEdge、entityIds 3 连块', () => {
    const row = buildBodyEdgeExternalRefRow({ ...base, part: 'curve', curveKind: 'line' });
    expect(row).toEqual({
      id: 3,
      kind: 'project',
      source: { kind: 'bodyEdge', bodyId: 'body-a', topologyRef: { nodeId: 7, entityId: 8 } },
      entityIds: [1, 2, 3],
    });
  });

  it('arc 曲线 2 槽、端点 1 槽（projectEndpoint + source.part）', () => {
    expect(buildBodyEdgeExternalRefRow({ ...base, part: 'curve', curveKind: 'arc' }))
      .toMatchObject({ kind: 'project', entityIds: [1, 2] });
    expect(buildBodyEdgeExternalRefRow({ ...base, part: 'start', curveKind: 'line' })).toEqual({
      id: 3,
      kind: 'projectEndpoint',
      source: {
        kind: 'bodyEdge', bodyId: 'body-a', topologyRef: { nodeId: 7, entityId: 8 }, part: 'start',
      },
      entityIds: [1],
    });
    expect(buildBodyEdgeExternalRefRow({ ...base, part: 'end', curveKind: 'arc' }))
      .toMatchObject({ kind: 'projectEndpoint', source: { part: 'end' }, entityIds: [1] });
  });

  it('块被占用时整体前移；无可用块 → no-entity-block', () => {
    const occupied = [bodyEdgeRef(1, [1, 2, 3])];
    expect(buildBodyEdgeExternalRefRow({ ...base, externalRefs: occupied, part: 'curve', curveKind: 'line' }))
      .toMatchObject({ entityIds: [4, 5, 6] });
  });
});

describe('projectionFailureMessage', () => {
  const t = (key: string, options?: Record<string, unknown>): string =>
    options ? `${key}|${JSON.stringify(options)}` : key;
  const status = (codes: string[]): Parameters<typeof projectionFailureMessage>[1] => ({
    status: 'failed',
    failedRefIds: codes.map((_, index) => index + 1),
    errors: codes.map((code, index) => ({
      refId: index + 1,
      code: code as never,
    })),
  });

  it('non-exact / source-missing / snapshot-stale / degenerate 映射；去重', () => {
    expect(projectionFailureMessage(t, status(['projection-non-exact'])))
      .toBe('partStudio.sketch.projectionNonExact');
    expect(projectionFailureMessage(t, status(['projection-source-missing'])))
      .toBe('partStudio.sketch.projectionSourceMissing');
    expect(projectionFailureMessage(t, status(['projection-snapshot-stale'])))
      .toBe('partStudio.sketch.projectionSourceMissing');
    expect(projectionFailureMessage(t, status(['projection-degenerate'])))
      .toBe('partStudio.sketch.projectionDegenerate');
    expect(projectionFailureMessage(t, status(['projection-non-exact', 'projection-non-exact'])))
      .toBe('partStudio.sketch.projectionNonExact');
  });

  it('未知 code / 空 errors → projectionFailed 兜底', () => {
    expect(projectionFailureMessage(t, status(['projection-cycle'])))
      .toContain('partStudio.sketch.projectionFailed');
    expect(projectionFailureMessage(t, status([])))
      .toBe('partStudio.sketch.projectionFailed');
  });
});

describe('loadSketchUseBodyCandidates', () => {
  it('line/arc 各产 curve/start/end 候选；other 与 resolve 失败跳过并计数', async () => {
    const readEdges = vi.fn(async () => [lineEdge, arcEdge, otherEdge]);
    const resolveEdgeRef = vi.fn(async (_key: string, _bodyKey: string, subEntityId: number) =>
      subEntityId === 11
        ? { ok: true, ref: { edge: { nodeId: 1, entityId: 21 } } }
        : { ok: false, error: '非流形' });

    const result = await loadSketchUseBodyCandidates({
      iModelKey: 'model-key',
      bodies,
      readEdges,
      resolveEdgeRef,
    });

    expect(readEdges).toHaveBeenCalledWith('model-key', bodies);
    expect(result.candidates.map((candidate) => candidate.part)).toEqual(['curve', 'start', 'end']);
    expect(result.candidates[0]).toMatchObject({
      bodyKey: 'body-a',
      subEntityId: 11,
      topologyRef: { nodeId: 1, entityId: 21 },
      curveKind: 'line',
      curve: lineEdge.curve,
    });
    // arc 解析失败 + other 曲线：两条跳过。
    expect(result.skipped).toBe(2);
    expect(result.errors).toEqual(expect.arrayContaining(['resolve-failed', 'unsupported-curve']));
    expect(resolveEdgeRef).toHaveBeenCalledTimes(2);
  });

  it('无 body → 空结果且不读边；读边通道不可用 → 错误码', async () => {
    const readEdges = vi.fn(async () => undefined);
    const empty = await loadSketchUseBodyCandidates({
      iModelKey: 'model-key',
      bodies: [],
      readEdges,
      resolveEdgeRef: vi.fn(),
    });
    expect(empty).toEqual({ candidates: [], skipped: 0, errors: [] });
    expect(readEdges).not.toHaveBeenCalled();

    const unavailable = await loadSketchUseBodyCandidates({
      iModelKey: 'model-key',
      bodies,
      readEdges,
      resolveEdgeRef: vi.fn(),
    });
    expect(unavailable.candidates).toEqual([]);
    expect(unavailable.errors).toContain('read-edges-unavailable');
  });
});
