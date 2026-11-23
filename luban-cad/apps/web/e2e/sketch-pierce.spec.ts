/**
 * shared 1.85 / ADR-0025 S2 真栈验收：草图外部引用 PIERCE（模型边 × 草图平面精确交点）。
 *
 * 链路（AIRR 2026-11-21-sketch-external-references-airr.md §7 S2）：
 * 源草图 20×20（XY@z=0）→ 拉伸 10 盒体（4000 mm³）→ 枚举竖直线边并
 * `resolveEdgeRef` 换持久拓扑 id → 草图平面 z=5 与 (20,0) 竖边交于局部 (20,0)：
 * 单点 PIERCE（本地点 1 初始任意 (7.5,-4)）→ 读面 projection ok / 点坐标 (20,0) /
 * DOF 0 / 实体仅 1 点、约束 0 条（隐藏 fixed+coincident 不落库）→ 改源宽 30 →
 * 点联动 (30,0)；再以左右两条竖边 PIERCE 建三角形（面积 100）→ 消费拉伸 4 =
 * 400 mm³ → 改源宽 30 → 面积 150、消费体 600 mm³ → push + 冷重开仍 600/ok。
 *
 * 失败用例：与草图平面平行的顶面水平边 → insertSketch 拒收（projection-pierce-miss，
 * 树零变更）；竖边 PIERCE 草图抑制源特征 → projection failed / source-missing、
 * 本地点坐标省略（不返回旧交点）、regions 不下发；恢复 → ok / (20,0)。
 *
 * 边枚举复用示例回放的 dev-only 只读观测面（`readBodyEdgeHandles`）+ 既有
 * `resolveEdgeRef` RPC，不新增第二套建模 API；PIERCE 求解/落库语义在私有后端
 * StandaloneDb 出口测试（SketchPierceFlow）已覆盖，本 spec 只验真栈链路。
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type {
  FeatureOp,
  LubanTopologyId,
  SketchConstraintDto,
  SketchEntityDto,
  SketchExternalReferenceDto,
  SketchPlaneDto,
} from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getBodiesRpc,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
  getSketchRpc,
  msRpc,
  type BSeedEditorContext,
  type WriteLease, reloadWithFlush } from './helpers';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './examples/imodel.js';
import { readBodyEdgeHandles, type EdgeHandle } from './examples/replay/edge-resolver.js';

function rectangleSketch(width: number, height: number): {
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
} {
  return {
    entities: [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: width, y: 0 },
      { kind: 'point', id: 3, x: width, y: height },
      { kind: 'point', id: 4, x: 0, y: height },
      { kind: 'point', id: 5, x: 0, y: 0 },
      { kind: 'point', id: 6, x: width, y: 0 },
      { kind: 'point', id: 7, x: width, y: height },
      { kind: 'point', id: 8, x: 0, y: height },
      { kind: 'line', id: 11, p1: 5, p2: 6 },
      { kind: 'line', id: 12, p1: 6, p2: 7 },
      { kind: 'line', id: 13, p1: 7, p2: 8 },
      { kind: 'line', id: 14, p1: 8, p2: 5 },
    ],
    constraints: [
      { kind: 'coincident', id: 21, refs: [1, 5] },
      { kind: 'coincident', id: 22, refs: [2, 6] },
      { kind: 'coincident', id: 23, refs: [3, 7] },
      { kind: 'coincident', id: 24, refs: [4, 8] },
      { kind: 'horizontal', id: 25, refs: [11] },
      { kind: 'horizontal', id: 26, refs: [13] },
      { kind: 'vertical', id: 27, refs: [12] },
      { kind: 'vertical', id: 28, refs: [14] },
      { kind: 'distance', id: 29, refs: [1, 2], value: width },
      { kind: 'distance', id: 30, refs: [2, 3], value: height },
    ],
  };
}

const PLANE = (z: number): SketchPlaneDto => ({
  origin: { x: 0, y: 0, z },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
});

function pierceRef(
  id: number,
  bodyKey: string,
  topologyRef: LubanTopologyId,
  localEntityId: number,
): SketchExternalReferenceDto {
  return {
    id,
    kind: 'pierce',
    source: { kind: 'bodyEdge', bodyId: bodyKey, topologyRef },
    entityIds: [],
    localEntityId,
  };
}

/** 线边端点（世界 mm）；非线段返回 undefined。 */
function lineEndpoints(edge: EdgeHandle): { p0: [number, number, number]; p1: [number, number, number] } | undefined {
  const curve = edge.curve;
  if (curve.kind !== 'line' || curve.p0 === undefined || curve.p1 === undefined) return undefined;
  const { p0, p1 } = curve;
  return { p0: [p0[0], p0[1], p0[2]], p1: [p1[0], p1[1], p1[2]] };
}

/** 与 (x,y) 处竖直（沿 Z、长度 10）的线边；必须唯一。 */
function findVerticalEdge(handles: readonly EdgeHandle[], x: number, y: number): EdgeHandle {
  const matches = handles.filter((handle) => {
    const ends = lineEndpoints(handle);
    if (ends === undefined) return false;
    const [a, b] = [ends.p0, ends.p1];
    return Math.abs(a[0] - x) <= 1e-6 && Math.abs(a[1] - y) <= 1e-6
      && Math.abs(b[0] - x) <= 1e-6 && Math.abs(b[1] - y) <= 1e-6
      && Math.abs(Math.abs(a[2] - b[2]) - 10) <= 1e-6;
  });
  expect(matches.length, `(${x},${y}) 竖直边数`).toBe(1);
  return matches[0]!;
}

/** 顶面（z=10）沿 X 的水平线边；用于「与 z=5 草图平面平行、无交点」失败用例。 */
function findTopHorizontalEdge(handles: readonly EdgeHandle[]): EdgeHandle {
  const matches = handles.filter((handle) => {
    const ends = lineEndpoints(handle);
    if (ends === undefined) return false;
    return Math.abs(ends.p0[2] - 10) <= 1e-6 && Math.abs(ends.p1[2] - 10) <= 1e-6
      && Math.abs(ends.p0[1] - ends.p1[1]) <= 1e-6;
  });
  expect(matches.length, '顶面沿 X 的线边数').toBe(2);
  return matches[0]!;
}

async function resolveEdgeRef(
  ctx: BSeedEditorContext,
  token: string,
  handle: EdgeHandle,
): Promise<LubanTopologyId> {
  const resolved = (await msRpc(
    ctx.itwinId,
    ctx.imodelId,
    'resolveEdgeRef',
    [ctx.dbKey, handle.bodyKey, handle.subEntityId],
    token,
  )) as { ok: boolean; ref?: { edge: LubanTopologyId }; error?: string };
  expect(resolved.ok, `resolveEdgeRef 失败：${resolved.error ?? 'unknown'}`).toBe(true);
  if (resolved.ref === undefined) throw new Error('resolveEdgeRef 无 ref');
  return resolved.ref.edge;
}

interface SourceBox {
  sourceSketchId: string;
  sourceFeatureId: string;
  bodyKey: string;
  handles: EdgeHandle[];
}

/** 20×20 源草图 + 拉伸 10 盒体 + 全部 BRep 边句柄（bodyKey 由创建后差集捕获）。 */
async function buildSourceBox(
  page: Page,
  ctx: BSeedEditorContext,
  lease: WriteLease,
  token: string,
): Promise<SourceBox> {
  const apply = async (op: FeatureOp, label: string): Promise<string> => {
    const result = await applyFeatureOpRpc(ctx, op, lease, token);
    assertFeatureOpOk(result, label);
    expect(result.featureId, `${label} 无 featureId`).toBeTruthy();
    return result.featureId!;
  };
  const source = rectangleSketch(20, 20);
  const sourceSketchId = await apply(
    { kind: 'insertSketch', entities: source.entities, constraints: source.constraints, plane: PLANE(0) },
    '源草图',
  );
  const sourceFeatureId = await apply(
    {
      kind: 'insertFeature', featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: sourceSketchId, regions: [0], operation: 'new' },
    },
    '源拉伸 10',
  );
  const bodies = await getBodiesRpc(ctx, token);
  const body = bodies.find((candidate) => candidate.active !== false && candidate.sourceFeatureId === sourceFeatureId);
  if (!body) throw new Error('源拉伸后未找到源 body');
  const handles = await readBodyEdgeHandles(page, ctx, token);
  expect(handles.length, '盒体 BRep 边数').toBeGreaterThan(0);
  expect(handles.every((handle) => handle.bodyKey === body.bodyKey), '边枚举应只含源 body').toBe(true);
  return { sourceSketchId, sourceFeatureId, bodyKey: body.bodyKey, handles };
}

async function readPoint(
  ctx: BSeedEditorContext,
  sketchId: string,
  entityId: number,
  token: string,
): Promise<{ x: number; y: number } | undefined> {
  const sketch = await getSketchRpc(ctx, sketchId, token);
  const entity = sketch?.entities.find((candidate) => candidate.id === entityId);
  if (entity?.kind !== 'point' || typeof entity.x !== 'number' || typeof entity.y !== 'number') return undefined;
  return { x: entity.x, y: entity.y };
}

/** 轮询 PIERCE 本地点坐标（6 位小数；失败封闭时坐标缺失会得到 missing 而非旧值）。 */
async function expectPiercePoint(
  ctx: BSeedEditorContext,
  sketchId: string,
  entityId: number,
  x: number,
  y: number,
  token: string,
): Promise<void> {
  await expect.poll(async () => {
    const point = await readPoint(ctx, sketchId, entityId, token);
    return point === undefined ? 'missing' : `${point.x.toFixed(6)}:${point.y.toFixed(6)}`;
  }, { timeout: 60_000, intervals: [500, 1000, 2000] }).toBe(`${x.toFixed(6)}:${y.toFixed(6)}`);
}

test.describe('草图外部引用 S2（PIERCE 真栈）', () => {
  test('单点/三角形 PIERCE → 交点 + DOF 0 + 消费体联动 → push+冷重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Sketch Pierce', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await reloadWithFlush(page);
        return await openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'sketch-pierce');
    const box = await buildSourceBox(page, ctx, lease, token);

    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      expect(result.featureId, `${label} 无 featureId`).toBeTruthy();
      return result.featureId!;
    };
    const volumeByKey = async (bodyKey: string): Promise<number | undefined> => {
      const mass = await getMassPropertiesRpc(ctx, token);
      return mass.find((item) => item.bodyKey === bodyKey)?.volume;
    };
    const expectVolume = async (bodyKey: string, expected: number): Promise<void> => {
      await expect.poll(async () => Math.round(await volumeByKey(bodyKey) ?? -1), {
        timeout: 60_000,
        intervals: [500, 1000, 2000],
      }).toBe(expected);
    };

    // 右侧竖边 (20,0)：z=5 平面交点局部 (20,0)；左侧竖边 (0,0)：局部 (0,0)。
    const rightRef = await resolveEdgeRef(ctx, token, findVerticalEdge(box.handles, 20, 0));
    const leftRef = await resolveEdgeRef(ctx, token, findVerticalEdge(box.handles, 0, 0));

    // 1) 单点 PIERCE：本地点 1 初始任意 (7.5,-4)，必须被钉到精确交点 (20,0)。
    const singlePointId = await apply(
      {
        kind: 'insertSketch',
        entities: [{ kind: 'point', id: 1, x: 7.5, y: -4 }],
        constraints: [],
        plane: PLANE(5),
        externalRefs: [pierceRef(1, box.bodyKey, rightRef, 1)],
      },
      '单点 PIERCE 草图',
    );
    await expectPiercePoint(ctx, singlePointId, 1, 20, 0, token);
    const single = await getSketchRpc(ctx, singlePointId, token);
    if (!single) throw new Error('单点 PIERCE 草图读面为空');
    expect(single.projection?.status).toBe('ok');
    expect(single.externalRefs).toHaveLength(1);
    expect(single.externalRefs?.[0]).toMatchObject({
      id: 1, kind: 'pierce', entityIds: [], localEntityId: 1,
    });
    expect(single.entities).toHaveLength(1);
    expect(single.entities[0]).toMatchObject({ kind: 'point', id: 1 });
    // 隐藏 fixed + coincident 只在求解请求内：读面约束恒 0、本地点不是投影实体。
    expect(single.constraints).toHaveLength(0);
    expect((single.entities[0] as { projected?: unknown }).projected).toBeUndefined();
    expect(single.solve.dof).toBe(0);
    expect(single.regions).toBeUndefined();

    // 2) 三角形消费链路：左右两条竖边各 PIERCE 一个顶点，面积 100 → 拉伸 4 = 400 mm³。
    const triangleId = await apply(
      {
        kind: 'insertSketch',
        entities: [
          { kind: 'point', id: 1, x: 0, y: 0 },
          { kind: 'point', id: 2, x: 20, y: 0 },
          { kind: 'point', id: 3, x: 0, y: 10 },
          { kind: 'line', id: 11, p1: 1, p2: 3 },
          { kind: 'line', id: 12, p1: 3, p2: 2 },
          { kind: 'line', id: 13, p1: 2, p2: 1 },
        ],
        constraints: [
          { kind: 'distance', id: 21, refs: [1, 3], value: 10 },
          { kind: 'vertical', id: 22, refs: [11] },
        ],
        plane: PLANE(5),
        externalRefs: [
          pierceRef(1, box.bodyKey, leftRef, 1),
          pierceRef(2, box.bodyKey, rightRef, 2),
        ],
      },
      '三角形 PIERCE 草图',
    );
    await expectPiercePoint(ctx, triangleId, 1, 0, 0, token);
    await expectPiercePoint(ctx, triangleId, 2, 20, 0, token);
    const triangle = await getSketchRpc(ctx, triangleId, token);
    if (!triangle) throw new Error('三角形 PIERCE 草图读面为空');
    expect(triangle.projection?.status).toBe('ok');
    expect(triangle.externalRefs).toHaveLength(2);
    expect(triangle.entities).toHaveLength(6);
    // 隐藏求解行不落库：约束仅为用户提交的 2 条。
    expect(triangle.constraints.map((constraint) => constraint.id).sort((a, b) => a - b)).toEqual([21, 22]);
    expect(triangle.solve.dof).toBe(0);
    expect(triangle.regions?.[0]?.area).toBeCloseTo(100, 4);

    await apply(
      {
        kind: 'insertFeature', featureType: 'extrude',
        params: { profile: [], distance: 4, sketchId: triangleId, regions: [0], operation: 'new' },
      },
      '消费拉伸 4',
    );
    const bodies = await getBodiesRpc(ctx, token);
    const consumerBody = bodies.find((body) => body.active !== false && body.bodyKey !== box.bodyKey);
    if (!consumerBody) throw new Error('消费拉伸后未找到新 body');
    await expectVolume(box.bodyKey, 4000);
    await expectVolume(consumerBody.bodyKey, 400);
    expect((await getFeatureTreeRpc(ctx, token)).every((row) => row.status === 0)).toBe(true);

    // 3) 改源宽 20 → 30：源体 6000；右侧 PIERCE 点跟随 (30,0)、左侧保持 (0,0)；
    //    三角形面积 150、消费体 600 mm³。
    const updated = await applyFeatureOpRpc(
      ctx, { kind: 'updateSketchConstraint', sketchId: box.sourceSketchId, constraintId: 29, value: 30 }, lease, token,
    );
    assertFeatureOpOk(updated, '改源宽 30');
    await expectVolume(box.bodyKey, 6000);
    await expectPiercePoint(ctx, singlePointId, 1, 30, 0, token);
    await expectPiercePoint(ctx, triangleId, 1, 0, 0, token);
    await expectPiercePoint(ctx, triangleId, 2, 30, 0, token);
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, triangleId, token);
      const area = sketch?.regions?.[0]?.area;
      return area === undefined ? -1 : Math.round(area);
    }, { timeout: 60_000, intervals: [500, 1000, 2000] }).toBe(150);
    await expectVolume(consumerBody.bodyKey, 600);
    const movedSingle = await getSketchRpc(ctx, singlePointId, token);
    expect(movedSingle?.projection?.status).toBe('ok');
    expect(movedSingle?.entities).toHaveLength(1);
    expect(movedSingle?.constraints).toHaveLength(0);
    expect(movedSingle?.solve.dof).toBe(0);
    const movedTriangle = await getSketchRpc(ctx, triangleId, token);
    expect(movedTriangle?.constraints.map((constraint) => constraint.id).sort((a, b) => a - b)).toEqual([21, 22]);
    expect(movedTriangle?.solve.dof).toBe(0);
    expect((await getFeatureTreeRpc(ctx, token)).every((row) => row.status === 0)).toBe(true);
    console.log(
      `[sketch-pierce] after width 30: source=${await volumeByKey(box.bodyKey)} ` +
      `consumer=${await volumeByKey(consumerBody.bodyKey)} area=${movedTriangle?.regions?.[0]?.area}`,
    );

    // 4) push + 冷重开：PIERCE 是读时派生，冷重建后仍 ok/坐标 30,0/面积 150/体积 600。
    await pushExampleChanges(page, 'sketch pierce acceptance');
    await reloadWithFlush(page);
    ctx = await openWithRetry();
    await expectVolume(box.bodyKey, 6000);
    await expectVolume(consumerBody.bodyKey, 600);
    await expectPiercePoint(ctx, singlePointId, 1, 30, 0, token);
    await expectPiercePoint(ctx, triangleId, 1, 0, 0, token);
    await expectPiercePoint(ctx, triangleId, 2, 30, 0, token);
    const reopenedSingle = await getSketchRpc(ctx, singlePointId, token);
    if (!reopenedSingle) throw new Error('冷重开后单点 PIERCE 草图读面为空');
    expect(reopenedSingle.projection?.status).toBe('ok');
    expect(reopenedSingle.externalRefs?.[0]).toMatchObject({
      kind: 'pierce', entityIds: [], localEntityId: 1,
    });
    expect(reopenedSingle.entities).toHaveLength(1);
    expect(reopenedSingle.constraints).toHaveLength(0);
    expect(reopenedSingle.solve.dof).toBe(0);
    const reopenedTriangle = await getSketchRpc(ctx, triangleId, token);
    if (!reopenedTriangle) throw new Error('冷重开后三角形 PIERCE 草图读面为空');
    expect(reopenedTriangle.projection?.status).toBe('ok');
    expect(reopenedTriangle.externalRefs).toHaveLength(2);
    expect(reopenedTriangle.entities).toHaveLength(6);
    expect(reopenedTriangle.constraints.map((constraint) => constraint.id).sort((a, b) => a - b))
      .toEqual([21, 22]);
    expect(reopenedTriangle.solve.dof).toBe(0);
    expect(reopenedTriangle.regions?.[0]?.area).toBeCloseTo(150, 4);
    expect((await getFeatureTreeRpc(ctx, token)).every((row) => row.status === 0)).toBe(true);
  });

  test('顶面水平边 PIERCE 拒收 / 源抑制失败封闭 / 恢复', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Sketch Pierce Guards', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await reloadWithFlush(page);
        return await openExampleEditor(page, ids);
      }
    };
    const ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'sketch-pierce-guards');
    const box = await buildSourceBox(page, ctx, lease, token);

    // 1) 顶面 z=10 水平线边与 z=5 草图平面平行、无交点 → op 拒收 projection-pierce-miss。
    const topRef = await resolveEdgeRef(ctx, token, findTopHorizontalEdge(box.handles));
    const treeBefore = await getFeatureTreeRpc(ctx, token);
    const rejected = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [{ kind: 'point', id: 1, x: 5, y: 5 }],
      constraints: [],
      plane: PLANE(5),
      externalRefs: [pierceRef(1, box.bodyKey, topRef, 1)],
    }, lease, token);
    expect(rejected.ok, '与草图平面平行的顶面水平边 PIERCE 应拒收').toBe(false);
    if (!rejected.ok) expect(rejected.error).toContain('projection-pierce-miss');
    expect((await getFeatureTreeRpc(ctx, token)).length, '拒收不得写入树').toBe(treeBefore.length);

    // 2) 合法竖边 PIERCE（本地点 1 任意 (9,-6) → 交点 (20,0)）。
    const verticalRef = await resolveEdgeRef(ctx, token, findVerticalEdge(box.handles, 20, 0));
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [{ kind: 'point', id: 1, x: 9, y: -6 }],
      constraints: [],
      plane: PLANE(5),
      externalRefs: [pierceRef(1, box.bodyKey, verticalRef, 1)],
    }, lease, token);
    assertFeatureOpOk(created, '竖边 PIERCE 草图');
    const pierceSketchId = created.featureId!;
    await expectPiercePoint(ctx, pierceSketchId, 1, 20, 0, token);

    // 3) 抑制源特征 → projection failed / source-missing；本地点坐标省略（绝不陈旧）。
    const suppressed = await applyFeatureOpRpc(
      ctx, { kind: 'setFeatureSuppressed', featureId: box.sourceFeatureId, suppressed: true }, lease, token,
    );
    assertFeatureOpOk(suppressed, '抑制源特征');
    await expect.poll(async () => (await getSketchRpc(ctx, pierceSketchId, token))?.projection?.status, {
      timeout: 60_000,
      intervals: [500, 1000, 2000],
    }).toBe('failed');
    const failed = await getSketchRpc(ctx, pierceSketchId, token);
    if (!failed) throw new Error('抑制后 PIERCE 草图读面为空');
    expect(failed.projection?.status).toBe('failed');
    expect((failed.projection?.errors ?? []).map((error) => error.code)).toContain('projection-source-missing');
    expect([...(failed.projection?.failedRefIds ?? [])]).toEqual([1]);
    expect(failed.entities).toHaveLength(1);
    const stale = failed.entities[0];
    expect(stale).toMatchObject({ kind: 'point', id: 1 });
    if (stale?.kind !== 'point') throw new Error('抑制后本地点缺失');
    expect(stale.x).toBeUndefined();
    expect(stale.y).toBeUndefined();
    expect(failed.regions).toBeUndefined();

    // 4) 恢复源 → project ok、点回到 (20,0)，DOF 0。
    const restored = await applyFeatureOpRpc(
      ctx, { kind: 'setFeatureSuppressed', featureId: box.sourceFeatureId, suppressed: false }, lease, token,
    );
    assertFeatureOpOk(restored, '恢复源特征');
    await expect.poll(async () => (await getSketchRpc(ctx, pierceSketchId, token))?.projection?.status, {
      timeout: 60_000,
      intervals: [500, 1000, 2000],
    }).toBe('ok');
    await expectPiercePoint(ctx, pierceSketchId, 1, 20, 0, token);
    const restoredSketch = await getSketchRpc(ctx, pierceSketchId, token);
    expect(restoredSketch?.solve.dof).toBe(0);
    expect(restoredSketch?.entities).toHaveLength(1);
    expect(restoredSketch?.constraints).toHaveLength(0);
    expect((await getFeatureTreeRpc(ctx, token)).every((row) => row.status === 0)).toBe(true);
  });
});
