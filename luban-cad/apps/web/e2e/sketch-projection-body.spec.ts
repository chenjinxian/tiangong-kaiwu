/**
 * shared 1.85 / ADR-0024 S1 真栈验收：草图外部引用 bodyEdge（模型边投影）。
 *
 * 链路（AIRR 2026-11-21-sketch-external-references-airr.md §7 S1）：
 * 源草图 20×20（XY@z=0）→ 拉伸 10 盒体（4000 mm³）→ 枚举 z=10 顶面 4 条线边并
 * `resolveEdgeRef` 换持久拓扑 id → 插入投影草图（plane z=10，externalRefs 4 行、
 * 每行 3 个实体 id）→ 读面 projection ok / externalRefs 4 / entities 12 / DOF 0 /
 * area 400 → 消费拉伸 10 = 新 body 4000 mm³；改源宽 30 → area 600、消费体 6000；
 * 原生 Undo → 4000、Redo → 6000；push + 冷重开仍 6000 且投影状态 ok。
 *
 * 失败用例：删源特征被外部引用守卫拒收（错误含「外部引用」）；抑制源特征 →
 * projection failed / source-missing、failedRefIds 全 4、无投影曲线、regions
 * undefined、消费特征树 status=1；恢复 → ok / 4000 mm³。
 *
 * 边枚举复用示例回放的 dev-only 只读观测面（`readEdgeHandles`）+ 既有
 * `resolveEdgeRef` RPC，不新增第二套建模 API。
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
  type WriteLease,
} from './helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './examples/imodel.js';
import { readBodyEdgeHandles } from './examples/replay/edge-resolver.js';

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

interface ProjectedChain {
  sourceSketchId: string;
  sourceFeatureId: string;
  projectedSketchId: string;
  consumerFeatureId: string;
  refs: SketchExternalReferenceDto[];
  sourceBodyKey: string;
  consumerBodyKey: string;
}

/**
 * 20×20 源草图 + 拉伸 10 盒体 → 顶面 4 条线边持久引用 → 投影草图 → 消费拉伸 10。
 * bodyKey 由创建前后差集捕获（body 身份不按源特征名猜）。
 */
async function buildProjectedChain(
  page: Page,
  ctx: BSeedEditorContext,
  lease: WriteLease,
  token: string,
): Promise<ProjectedChain> {
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
  const sourceBodies = await getBodiesRpc(ctx, token);
  const sourceBody = sourceBodies.find((body) => body.active !== false && body.sourceFeatureId === sourceFeatureId);
  if (!sourceBody) throw new Error('源拉伸后未找到源 body');

  // 顶面（z=10）线边：与 BRep 显示同一只读拓扑通道（缓存子实体 id + 精确曲线）。
  const handles = await readBodyEdgeHandles(page, ctx, token);
  const topEdges = handles.filter((handle) => {
    const curve = handle.curve;
    if (curve.kind !== 'line' || !curve.p0 || !curve.p1) return false;
    return Math.abs(curve.p0[2] - 10) <= 1e-6 && Math.abs(curve.p1[2] - 10) <= 1e-6;
  });
  expect(topEdges.length, '盒体顶面线边数').toBe(4);
  expect(topEdges.every((edge) => edge.bodyKey === sourceBody.bodyKey)).toBe(true);

  const refs: SketchExternalReferenceDto[] = [];
  for (const [index, edge] of topEdges.entries()) {
    const resolved = (await msRpc(
      ctx.itwinId,
      ctx.imodelId,
      'resolveEdgeRef',
      [ctx.dbKey, edge.bodyKey, edge.subEntityId],
      token,
    )) as { ok: boolean; ref?: { edge: LubanTopologyId }; error?: string };
    expect(resolved.ok, `resolveEdgeRef #${index + 1}：${resolved.error ?? 'unknown'}`).toBe(true);
    if (!resolved.ref) throw new Error(`resolveEdgeRef #${index + 1} 无 ref`);
    const root = 101 + index * 10;
    refs.push({
      id: index + 1,
      kind: 'project',
      source: { kind: 'bodyEdge', bodyId: edge.bodyKey, topologyRef: resolved.ref.edge },
      entityIds: [root, root + 1, root + 2],
    });
  }

  const projectedSketchId = await apply(
    { kind: 'insertSketch', entities: [], constraints: [], plane: PLANE(10), externalRefs: refs },
    '投影草图（体边 externalRefs）',
  );
  const consumerFeatureId = await apply(
    {
      kind: 'insertFeature', featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: projectedSketchId, regions: [0], operation: 'new' },
    },
    '消费拉伸 10',
  );
  const bodies = await getBodiesRpc(ctx, token);
  const consumerBody = bodies.find((body) => body.active !== false && body.bodyKey !== sourceBody.bodyKey);
  if (!consumerBody) throw new Error('消费拉伸后未找到新 body');
  return {
    sourceSketchId,
    sourceFeatureId,
    projectedSketchId,
    consumerFeatureId,
    refs,
    sourceBodyKey: sourceBody.bodyKey,
    consumerBodyKey: consumerBody.bodyKey,
  };
}

test.describe('草图外部引用 S1（bodyEdge 真栈）', () => {
  test('顶面四边投影 → 4000 → 改源宽 6000 → undo/redo → push+冷重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Sketch Projection Body', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return await openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'sketch-projection-body');
    const chain = await buildProjectedChain(page, ctx, lease, token);

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
    const expectArea = async (expected: number): Promise<void> => {
      await expect.poll(async () => {
        const sketch = await getSketchRpc(ctx, chain.projectedSketchId, token);
        const area = sketch?.regions?.[0]?.area;
        return area === undefined ? -1 : Math.round(area);
      }, { timeout: 60_000, intervals: [500, 1000, 2000] }).toBe(expected);
    };

    await expectVolume(chain.sourceBodyKey, 4000);
    await expectVolume(chain.consumerBodyKey, 4000);

    // 投影读面：projection ok、externalRefs 4、12 实体（4 线 + 8 端点）、DOF 0、面积 400。
    const projected = await getSketchRpc(ctx, chain.projectedSketchId, token);
    if (!projected) throw new Error('投影草图读面为空');
    expect(projected.projection?.status).toBe('ok');
    expect(projected.externalRefs).toHaveLength(4);
    expect(projected.externalRefs?.map((ref) => ref.source.kind)).toEqual([
      'bodyEdge', 'bodyEdge', 'bodyEdge', 'bodyEdge',
    ]);
    expect(projected.entities).toHaveLength(12);
    expect(projected.entities.filter((entity) => entity.kind === 'line')).toHaveLength(4);
    expect(projected.entities.every((entity) => entity.projected?.kind === 'projected')).toBe(true);
    expect(projected.solve.dof).toBe(0);
    expect(projected.regions?.[0]?.area).toBeCloseTo(400, 4);
    expect((await getFeatureTreeRpc(ctx, token)).every((row) => row.status === 0)).toBe(true);

    // 改源宽 30：投影环与消费体联动 6000 mm³（读时按源当前几何重投影）。
    const updated = await applyFeatureOpRpc(
      ctx, { kind: 'updateSketchConstraint', sketchId: chain.sourceSketchId, constraintId: 29, value: 30 }, lease, token,
    );
    assertFeatureOpOk(updated, '改源宽 30');
    await expectVolume(chain.consumerBodyKey, 6000);
    await expectArea(600);
    console.log(`[sketch-projection-body] consumer volume after source width 30 = ${await volumeByKey(chain.consumerBodyKey)}`);

    // 原生 Undo/Redo（BriefcaseTxns 标准事务通道，不是 FeatureOp.undo）。
    // 快照键含 body 持久几何/placement/上游草图 params 摘要：undo 后必须同时回退
    // 体积与投影读面（area 400），redo 后回到 6000/600；不得出现陈旧投影。
    const undoButton = page.getByTestId('part-studio-ribbon-undo');
    await expect(undoButton).toBeEnabled({ timeout: 30_000 });
    await undoButton.click();
    await expectVolume(chain.consumerBodyKey, 4000);
    await expectArea(400);
    const undone = await getSketchRpc(ctx, chain.projectedSketchId, token);
    expect(undone?.projection?.status).toBe('ok');
    const redoButton = page.getByTestId('part-studio-ribbon-redo');
    await expect(redoButton).toBeEnabled({ timeout: 30_000 });
    await redoButton.click();
    await expectVolume(chain.consumerBodyKey, 6000);
    await expectArea(600);

    // push + 冷重开：投影是读时派生，冷重建后仍 ok/4 refs/6000 mm³。
    await pushExampleChanges(page, 'sketch external ref body acceptance');
    await page.reload();
    ctx = await openWithRetry();
    await expectVolume(chain.consumerBodyKey, 6000);
    await expectArea(600);
    const reopened = await getSketchRpc(ctx, chain.projectedSketchId, token);
    if (!reopened) throw new Error('重开后投影草图读面为空');
    expect(reopened.projection?.status).toBe('ok');
    expect(reopened.externalRefs).toHaveLength(4);
    expect(reopened.entities.filter((entity) => entity.kind === 'line')).toHaveLength(4);
  });

  test('删源拒收 / 抑制源失败封闭 / 恢复后 4000', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Sketch Projection Body Guards', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return await openExampleEditor(page, ids);
      }
    };
    const ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'sketch-projection-body-guards');
    const chain = await buildProjectedChain(page, ctx, lease, token);

    const volumeByKey = async (bodyKey: string): Promise<number | undefined> => {
      const mass = await getMassPropertiesRpc(ctx, token);
      return mass.find((item) => item.bodyKey === bodyKey)?.volume;
    };

    // 1) 删除被外部引用驱动的唯一源特征 → 守卫拒收（不是静默悬空引用）。
    const deleted = await applyFeatureOpRpc(
      ctx, { kind: 'deleteFeature', featureId: chain.sourceFeatureId }, lease, token,
    );
    expect(deleted.ok, '删源特征应被外部引用守卫拒收').toBe(false);
    if (!deleted.ok) expect(deleted.error).toContain('外部引用');

    // 2) 抑制源 → 读面失败封闭：failed/source-missing、无投影曲线、regions 不下发、消费 status=1。
    const suppressed = await applyFeatureOpRpc(
      ctx, { kind: 'setFeatureSuppressed', featureId: chain.sourceFeatureId, suppressed: true }, lease, token,
    );
    assertFeatureOpOk(suppressed, '抑制源特征');
    const failed = await getSketchRpc(ctx, chain.projectedSketchId, token);
    if (!failed) throw new Error('抑制后投影草图读面为空');
    expect(failed.projection?.status).toBe('failed');
    expect([...(failed.projection?.failedRefIds ?? [])].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect((failed.projection?.errors ?? []).map((error) => error.code)).toContain('projection-source-missing');
    expect(failed.entities).toHaveLength(0);
    expect(failed.regions).toBeUndefined();
    expect(failed.externalRefs).toHaveLength(4);
    const consumerRow = (await getFeatureTreeRpc(ctx, token))
      .find((row) => row.id === chain.consumerFeatureId);
    expect(consumerRow?.status).toBe(1);

    // 3) 恢复源 → ok、消费体重新求值 4000 mm³、树 status 0。
    const restored = await applyFeatureOpRpc(
      ctx, { kind: 'setFeatureSuppressed', featureId: chain.sourceFeatureId, suppressed: false }, lease, token,
    );
    assertFeatureOpOk(restored, '恢复源特征');
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, chain.projectedSketchId, token);
      return sketch?.projection?.status;
    }, { timeout: 60_000, intervals: [500, 1000, 2000] }).toBe('ok');
    await expect.poll(async () => Math.round(await volumeByKey(chain.consumerBodyKey) ?? -1), {
      timeout: 60_000,
      intervals: [500, 1000, 2000],
    }).toBe(4000);
    await expect.poll(async () => {
      const row = (await getFeatureTreeRpc(ctx, token)).find((entry) => entry.id === chain.consumerFeatureId);
      return row?.status;
    }, { timeout: 60_000, intervals: [500, 1000, 2000] }).toBe(0);
    expect((await getSketchRpc(ctx, chain.projectedSketchId, token))?.regions?.[0]?.area).toBeCloseTo(400, 4);
  });
});
