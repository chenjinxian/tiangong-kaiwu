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
import {
  faceLoopContainsPoint,
  loadSketchUseBodyCandidates,
  loadSketchUseFaceCandidates,
  pointInPolygon,
} from '../internal/sketch-use-candidates.js';
import type { BrepEdgeHandle, BrepFaceHandle, BrepFaceLoopCurve } from '../internal/brep-topology.js';

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

// ---------------------------------------------------------------------------
// S1b（2026-11-21）：平面面候选（bodyFace loops=outer）
// ---------------------------------------------------------------------------

type Vec3 = [number, number, number];

const faceLine = (p0: Vec3, p1: Vec3): BrepFaceLoopCurve => ({ kind: 'line', p0, p1 });
const faceArc = (
  center: Vec3,
  radius: number,
  start: Vec3,
  end: Vec3,
  sweepRadians: number,
  normal: Vec3 = [0, 0, 1],
): BrepFaceLoopCurve => ({ kind: 'arc', center, radius, normal, start, end, sweepRadians });

const squareLoop = (halfSize: number, z = 10): BrepFaceLoopCurve[] => [
  faceLine([-halfSize, -halfSize, z], [halfSize, -halfSize, z]),
  faceLine([halfSize, -halfSize, z], [halfSize, halfSize, z]),
  faceLine([halfSize, halfSize, z], [-halfSize, halfSize, z]),
  faceLine([-halfSize, halfSize, z], [-halfSize, -halfSize, z]),
];

const faceHandle = (loops: BrepFaceLoopCurve[][], subEntityId = 21): BrepFaceHandle => ({
  bodyKey: 'body-a',
  subEntityId,
  range: { low: [-10, -10, 10], high: [10, 10, 10] },
  normal: [0, 0, 1],
  loops,
});

const faceRef = { nodeId: 4, entityId: 9 };

const resolveFaceOk = () => vi.fn(async () => ({ ok: true, ref: faceRef }));

describe('loadSketchUseFaceCandidates', () => {
  it('4 线外环 + 孔环 → blockLength 12、outerLoopIndex 指向外环（孔被忽略）', async () => {
    const readFaces = vi.fn(async () => [faceHandle([squareLoop(2), squareLoop(10)])]);
    const resolveFaceRef = resolveFaceOk();
    const result = await loadSketchUseFaceCandidates({
      iModelKey: 'model-key',
      bodies,
      readFaces,
      resolveFaceRef,
    });

    expect(readFaces).toHaveBeenCalledWith('model-key', bodies);
    expect(result.errors).toEqual([]);
    expect(result.skipped).toBe(0);
    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0]!;
    expect(candidate.kind).toBe('face');
    expect(candidate.bodyKey).toBe('body-a');
    expect(candidate.subEntityId).toBe(21);
    expect(candidate.topologyRef).toEqual(faceRef);
    expect(candidate.blockLength).toBe(12);
    expect(candidate.outerLoopIndex).toBe(1);
    expect(candidate.loops).toHaveLength(2);
    // 每环闭合折线（首尾重合；线环 5 点）。
    expect(candidate.loops[0]).toHaveLength(5);
    expect(candidate.loops[0]![0]).toEqual(candidate.loops[0]!.at(-1));
    expect(resolveFaceRef).toHaveBeenCalledWith('model-key', 'body-a', 21);
  });

  it('外环含一段弧 → 块长 3+2；整圆外环 → 2', async () => {
    const halfDisk = [
      faceLine([-10, 0, 10], [10, 0, 10]),
      faceArc([0, 0, 10], 10, [10, 0, 10], [-10, 0, 10], Math.PI),
    ];
    const halfDiskResult = await loadSketchUseFaceCandidates({
      iModelKey: 'model-key',
      bodies,
      readFaces: vi.fn(async () => [faceHandle([halfDisk])]),
      resolveFaceRef: resolveFaceOk(),
    });
    expect(halfDiskResult.errors).toEqual([]);
    expect(halfDiskResult.candidates[0]?.blockLength).toBe(5);
    expect(halfDiskResult.candidates[0]?.outerLoopIndex).toBe(0);

    const disk = [faceArc([0, 0, 10], 10, [10, 0, 10], [10, 0, 10], Math.PI * 2)];
    const diskResult = await loadSketchUseFaceCandidates({
      iModelKey: 'model-key',
      bodies,
      readFaces: vi.fn(async () => [faceHandle([disk])]),
      resolveFaceRef: resolveFaceOk(),
    });
    expect(diskResult.errors).toEqual([]);
    expect(diskResult.candidates[0]?.blockLength).toBe(2);
    expect(diskResult.candidates[0]?.loops[0]!.length).toBeGreaterThan(8);
  });

  it('任一环含 other 曲线 → 整面跳过（unsupported-curve）', async () => {
    const resolveFaceRef = resolveFaceOk();
    const result = await loadSketchUseFaceCandidates({
      iModelKey: 'model-key',
      bodies,
      readFaces: vi.fn(async () => [
        faceHandle([squareLoop(10), [{ kind: 'other', geometryType: 'BsplineCurve' }]]),
      ]),
      resolveFaceRef,
    });
    expect(result.candidates).toEqual([]);
    expect(result.skipped).toBe(1);
    expect(result.errors).toEqual(['unsupported-curve']);
    expect(resolveFaceRef).not.toHaveBeenCalled();
  });

  it('resolveFaceRef 失败/缺失 → 逐面跳过（resolve-failed）', async () => {
    const resolveFaceRef = vi.fn(async () => ({ ok: false, error: '面不存在' }));
    const failed = await loadSketchUseFaceCandidates({
      iModelKey: 'model-key',
      bodies,
      readFaces: vi.fn(async () => [faceHandle([squareLoop(10)])]),
      resolveFaceRef,
    });
    expect(failed.candidates).toEqual([]);
    expect(failed.skipped).toBe(1);
    expect(failed.errors).toEqual(['resolve-failed']);

    const missing = await loadSketchUseFaceCandidates({
      iModelKey: 'model-key',
      bodies,
      readFaces: vi.fn(async () => [faceHandle([squareLoop(10)])]),
      resolveFaceRef: vi.fn(async () => ({ ok: true })),
    });
    expect(missing.candidates).toEqual([]);
    expect(missing.errors).toEqual(['resolve-failed']);
  });

  it('退化环/等面积双环/开口环 → no-outer-loop 跳过', async () => {
    const collinear: BrepFaceLoopCurve[] = [
      faceLine([-10, 0, 10], [0, 0, 10]),
      faceLine([0, 0, 10], [10, 0, 10]),
      faceLine([10, 0, 10], [-10, 0, 10]),
    ];
    const equalSquares = [
      [
        faceLine([-10, -10, 10], [0, -10, 10]),
        faceLine([0, -10, 10], [0, 0, 10]),
        faceLine([0, 0, 10], [-10, 0, 10]),
        faceLine([-10, 0, 10], [-10, -10, 10]),
      ],
      [
        faceLine([0, 0, 10], [10, 0, 10]),
        faceLine([10, 0, 10], [10, 10, 10]),
        faceLine([10, 10, 10], [0, 10, 10]),
        faceLine([0, 10, 10], [0, 0, 10]),
      ],
    ];
    const open: BrepFaceLoopCurve[] = [
      faceLine([-10, -10, 10], [10, -10, 10]),
      faceLine([10, -10, 10], [10, 10, 10]),
      faceLine([10, 10, 10], [-10, 10, 10]),
    ];
    const resolveFaceRef = resolveFaceOk();
    const result = await loadSketchUseFaceCandidates({
      iModelKey: 'model-key',
      bodies,
      readFaces: vi.fn(async () => [
        faceHandle([collinear]),
        faceHandle(equalSquares),
        faceHandle([open]),
        faceHandle([]),
      ]),
      resolveFaceRef,
    });
    expect(result.candidates).toEqual([]);
    expect(result.skipped).toBe(4);
    expect(result.errors).toEqual(['no-outer-loop', 'no-outer-loop', 'no-outer-loop', 'no-outer-loop']);
    expect(resolveFaceRef).not.toHaveBeenCalled();
  });

  it('无 body → 空结果不读面；读面通道不可用 → read-faces-unavailable', async () => {
    const readFaces = vi.fn(async () => undefined);
    const empty = await loadSketchUseFaceCandidates({
      iModelKey: 'model-key',
      bodies: [],
      readFaces,
      resolveFaceRef: vi.fn(),
    });
    expect(empty).toEqual({ candidates: [], skipped: 0, errors: [] });
    expect(readFaces).not.toHaveBeenCalled();

    const unavailable = await loadSketchUseFaceCandidates({
      iModelKey: 'model-key',
      bodies,
      readFaces,
      resolveFaceRef: vi.fn(),
    });
    expect(unavailable.candidates).toEqual([]);
    expect(unavailable.errors).toEqual(['read-faces-unavailable']);
  });
});

describe('face screen hit helpers', () => {
  const square = (x: number, y: number, half: number) => [
    { x: x - half, y: y - half },
    { x: x + half, y: y - half },
    { x: x + half, y: y + half },
    { x: x - half, y: y + half },
    { x: x - half, y: y - half },
  ];

  it('pointInPolygon：内外/边界外；闭合重复点不影响', () => {
    const outer = square(0, 0, 10);
    expect(pointInPolygon({ x: 0, y: 0 }, outer)).toBe(true);
    expect(pointInPolygon({ x: 9.9, y: -9.9 }, outer)).toBe(true);
    expect(pointInPolygon({ x: 11, y: 0 }, outer)).toBe(false);
  });

  it('faceLoopContainsPoint：孔内不命中，外环内孔外命中', () => {
    const loops = { outer: square(0, 0, 10), holes: [square(0, 0, 2)] };
    expect(faceLoopContainsPoint({ x: 0, y: 0 }, loops)).toBe(false);
    expect(faceLoopContainsPoint({ x: 5, y: 5 }, loops)).toBe(true);
    expect(faceLoopContainsPoint({ x: 20, y: 0 }, loops)).toBe(false);
  });
});
