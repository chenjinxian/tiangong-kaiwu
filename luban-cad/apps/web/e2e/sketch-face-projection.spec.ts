/**
 * shared 1.85 / ADR-0024 S3 真栈验收：草图外部引用 bodyFace（平面面边界投影）。
 *
 * 链路（AIRR 2026-11-21-sketch-external-references-airr.md §7 S3）：
 * 源草图 20×20（中心在原点，XY@z=0）→ 拉伸 10 盒体（4000 mm³）→
 * `readFaceHandles` + `resolveFaceRef` 取 z=10 顶面持久面引用 → 投影草图
 * （plane z=10，externalRefs 1 行 bodyFace loops=outer、外环 4 条线共 12 个实体 id）
 * → 读面 projection ok / entities 12 / DOF 0 / area 400 → 消费拉伸 10 = 4000 mm³；
 * 改源宽 30 → area 600、消费体 6000；原生 Undo/Redo；push + 冷重开仍 6000/ok。
 *
 * 带孔面：通孔盒体顶面（loopCount=2）→ loops="all"、块 14 id（4 线 + 1 圆）
 * → 外环/孔环双面域（400−4π 与 4π）→ 消费拉伸 10 = (400−4π)×10 mm³。
 *
 * 失败用例：抑制源特征 → failed/source-missing、消费 status=1；删源特征被外部引用
 * 守卫拒收；恢复 → ok/4000 mm³。（曲面/样条面的整面拒收由后端 StandaloneDb
 * 流程测试覆盖：`readBodyFaceLoops` 同一条 native 精确性裁决。）
 *
 * 面枚举复用示例回放的 dev-only 只读观测面（`readFaceHandles`）+ 既有
 * `resolveFaceRef` RPC，不新增第二套建模 API。
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type {
  FeatureOp,
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
  type BSeedEditorContext,
  type WriteLease, reloadWithFlush } from './helpers';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './examples/imodel.js';
import { resolveLiveShellFaceRefs } from './examples/live/face-select.js';

function centeredRectangleSketch(width: number, height: number): {
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
} {
  const halfW = width / 2;
  const halfH = height / 2;
  return {
    entities: [
      { kind: 'point', id: 1, x: -halfW, y: -halfH },
      { kind: 'point', id: 2, x: halfW, y: -halfH },
      { kind: 'point', id: 3, x: halfW, y: halfH },
      { kind: 'point', id: 4, x: -halfW, y: halfH },
      { kind: 'point', id: 5, x: -halfW, y: -halfH },
      { kind: 'point', id: 6, x: halfW, y: -halfH },
      { kind: 'point', id: 7, x: halfW, y: halfH },
      { kind: 'point', id: 8, x: -halfW, y: halfH },
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

interface FaceChain {
  sourceSketchId: string;
  sourceFeatureId: string;
  projectedSketchId: string;
  consumerFeatureId: string;
  sourceBodyKey: string;
  consumerBodyKey: string;
  outerRegionIndex: number;
}

/**
 * 20×20 源草图 + 拉伸 10 盒体（holed=true 时再减一个 Ø4 通孔）→
 * 顶面（中心 0,0,10 / 法向 +Z / loopCount=1|2）持久面引用 → 投影草图
 * （outer→4 线 12 id；all→4 线+1 圆 14 id）→ 消费拉伸 10（最大面积面域）。
 */
async function buildFaceChain(
  page: Page,
  ctx: BSeedEditorContext,
  lease: WriteLease,
  token: string,
  mode: 'plain' | 'holed' = 'plain',
): Promise<FaceChain> {
  const apply = async (op: FeatureOp, label: string): Promise<string> => {
    const result = await applyFeatureOpRpc(ctx, op, lease, token);
    assertFeatureOpOk(result, label);
    expect(result.featureId, `${label} 无 featureId`).toBeTruthy();
    return result.featureId!;
  };

  const source = centeredRectangleSketch(20, 20);
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
  // body 身份按创建特征匹配（不按创建前后 bodyKey 差集猜；空 Part Studio 也含内部 body 行）。
  const sourceBody = (await getBodiesRpc(ctx, token))
    .find((body) => body.active !== false && body.sourceFeatureId === sourceFeatureId);
  if (!sourceBody) throw new Error('源拉伸后未找到源 body');

  if (mode === 'holed') {
    // Ø4 通孔：圆草图在 z=−1，REMOVE 拉伸 30 穿透 0..10 盒体。
    const holeSketchId = await apply({
      kind: 'insertSketch',
      entities: [
        { kind: 'point', id: 1, x: 0, y: 0 },
        { kind: 'circle', id: 2, center: 1, radius: 2 },
      ],
      constraints: [],
      plane: PLANE(-1),
    }, '孔草图');
    await apply({
      kind: 'insertFeature', featureType: 'extrude',
      params: { profile: [], distance: 30, sketchId: holeSketchId, regions: [0], operation: 'remove' },
    }, '通孔拉伸 30 remove');
  }

  // 顶面：中心 (0,0,10)、法向 ±Z；plain 单环 / holed 双环（外环 + 孔环）。
  const faces = await resolveLiveShellFaceRefs(page, ctx, token, [{
    center: { x: 0, y: 0, z: 10 },
    normal: { x: 0, y: 0, z: 1 },
    loopCount: mode === 'holed' ? 2 : 1,
    toleranceMm: 0.5,
    angleToleranceDeg: 2,
  }], sourceBody.bodyKey);
  const faceRef = faces.refs[0];
  if (!faceRef) throw new Error('顶面 resolveFaceRef 无结果');

  const loops = mode === 'holed' ? 'all' as const : 'outer' as const;
  const entityIds = mode === 'holed'
    ? [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114]
    : [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112];
  const refs: SketchExternalReferenceDto[] = [{
    id: 1,
    kind: 'project',
    source: { kind: 'bodyFace', bodyId: sourceBody.bodyKey, topologyRef: faceRef, loops },
    entityIds,
  }];
  const projectedSketchId = await apply(
    { kind: 'insertSketch', entities: [], constraints: [], plane: PLANE(10), externalRefs: refs },
    '投影草图（面 externalRefs）',
  );

  // 消费特征按最大面积面域拉伸（holed：外环 400−4π > 孔环 4π）。
  await expect.poll(async () => (await getSketchRpc(ctx, projectedSketchId, token))?.regions?.length ?? 0, {
    timeout: 60_000,
    intervals: [500, 1000, 2000],
  }).toBeGreaterThan(0);
  const projected = await getSketchRpc(ctx, projectedSketchId, token);
  const regionAreas = (projected?.regions ?? []).map((region) => region.area ?? 0);
  let outerRegionIndex = 0;
  for (let index = 0; index < regionAreas.length; index++) {
    if ((regionAreas[index] ?? 0) > (regionAreas[outerRegionIndex] ?? 0)) outerRegionIndex = index;
  }

  const consumerFeatureId = await apply(
    {
      kind: 'insertFeature', featureType: 'extrude',
      params: {
        profile: [], distance: 10, sketchId: projectedSketchId,
        regions: [outerRegionIndex], operation: 'new',
      },
    },
    '消费拉伸 10',
  );
  const consumerBody = (await getBodiesRpc(ctx, token))
    .find((body) => body.active !== false && body.sourceFeatureId === consumerFeatureId);
  if (!consumerBody) throw new Error('消费拉伸后未找到新 body');
  return {
    sourceSketchId,
    sourceFeatureId,
    projectedSketchId,
    consumerFeatureId,
    sourceBodyKey: sourceBody.bodyKey,
    consumerBodyKey: consumerBody.bodyKey,
    outerRegionIndex,
  };
}

test.describe('草图外部引用 S3（bodyFace 平面面边界真栈）', () => {
  test('顶面外环 4 线 → 4000 → 改源宽 6000 → undo/redo → push+冷重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Sketch Face Projection', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await reloadWithFlush(page);
        return await openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'sketch-face-projection');
    const chain = await buildFaceChain(page, ctx, lease, token);

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

    // 投影读面：projection ok、externalRefs 1（bodyFace/outer）、12 实体（4 线 + 8 端点）、DOF 0、面积 400。
    const projected = await getSketchRpc(ctx, chain.projectedSketchId, token);
    if (!projected) throw new Error('投影草图读面为空');
    expect(projected.projection?.status).toBe('ok');
    expect(projected.externalRefs).toHaveLength(1);
    expect(projected.externalRefs?.[0]?.source.kind).toBe('bodyFace');
    expect(projected.entities).toHaveLength(12);
    expect(projected.entities.filter((entity) => entity.kind === 'line')).toHaveLength(4);
    expect(projected.entities.every((entity) => entity.projected?.kind === 'projected')).toBe(true);
    expect(projected.solve.dof).toBe(0);
    expect(projected.regions?.[0]?.area).toBeCloseTo(400, 4);
    expect((await getFeatureTreeRpc(ctx, token)).every((row) => row.status === 0)).toBe(true);

    // 改源宽 30：面边界联动 → 投影环 600、消费体 6000 mm³。
    const updated = await applyFeatureOpRpc(
      ctx, { kind: 'updateSketchConstraint', sketchId: chain.sourceSketchId, constraintId: 29, value: 30 }, lease, token,
    );
    assertFeatureOpOk(updated, '改源宽 30');
    await expectVolume(chain.consumerBodyKey, 6000);
    await expectArea(600);

    // 原生 Undo/Redo：体积与面投影读面同步回退（无陈旧面快照）。
    const undoButton = page.getByTestId('part-studio-ribbon-undo');
    await expect(undoButton).toBeEnabled({ timeout: 30_000 });
    await undoButton.click();
    await expectVolume(chain.consumerBodyKey, 4000);
    await expectArea(400);
    const redoButton = page.getByTestId('part-studio-ribbon-redo');
    await expect(redoButton).toBeEnabled({ timeout: 30_000 });
    await redoButton.click();
    await expectVolume(chain.consumerBodyKey, 6000);
    await expectArea(600);

    // push + 冷重开：读时派生的面投影仍 ok/1 ref/6000 mm³。
    await pushExampleChanges(page, 'sketch external ref bodyFace acceptance');
    await reloadWithFlush(page);
    ctx = await openWithRetry();
    await expectVolume(chain.consumerBodyKey, 6000);
    await expectArea(600);
    const reopened = await getSketchRpc(ctx, chain.projectedSketchId, token);
    if (!reopened) throw new Error('重开后投影草图读面为空');
    expect(reopened.projection?.status).toBe('ok');
    expect(reopened.externalRefs).toHaveLength(1);
    expect(reopened.entities.filter((entity) => entity.kind === 'line')).toHaveLength(4);
  });

  test('带孔面 loops=all → 外环+孔环 14 实体 → 双面域 → 消费体 (400−4π)×10', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Sketch Face Projection Hole', { reset: true });
    const ctx = await openExampleEditor(page, ids);
    const lease = await borrowWriteLease(ctx, token, 'sketch-face-projection-hole');
    const chain = await buildFaceChain(page, ctx, lease, token, 'holed');

    const ringArea = 400 - 4 * Math.PI;
    const holeArea = 4 * Math.PI;
    const expectedVolume = ringArea * 10;

    const volumeByKey = async (bodyKey: string): Promise<number | undefined> => {
      const mass = await getMassPropertiesRpc(ctx, token);
      return mass.find((item) => item.bodyKey === bodyKey)?.volume;
    };
    await expect.poll(async () => Math.round(await volumeByKey(chain.sourceBodyKey) ?? -1), {
      timeout: 60_000,
      intervals: [500, 1000, 2000],
    }).toBe(Math.round(expectedVolume));
    await expect.poll(async () => Math.round(await volumeByKey(chain.consumerBodyKey) ?? -1), {
      timeout: 60_000,
      intervals: [500, 1000, 2000],
    }).toBe(Math.round(expectedVolume));

    const projected = await getSketchRpc(ctx, chain.projectedSketchId, token);
    if (!projected) throw new Error('投影草图读面为空');
    expect(projected.projection?.status).toBe('ok');
    expect(projected.externalRefs?.[0]?.source.kind).toBe('bodyFace');
    if (projected.externalRefs?.[0]?.source.kind === 'bodyFace')
      expect(projected.externalRefs[0].source.loops).toBe('all');
    // 4 线（8 端点）+ 1 整圆（1 圆心）= 14 实体。
    expect(projected.entities).toHaveLength(14);
    expect(projected.entities.filter((entity) => entity.kind === 'line')).toHaveLength(4);
    expect(projected.solve.dof).toBe(0);
    const areas = (projected.regions ?? []).map((region) => region.area ?? 0).sort((a, b) => a - b);
    expect(areas).toHaveLength(2);
    expect(areas[0]).toBeCloseTo(holeArea, 3);
    expect(areas[1]).toBeCloseTo(ringArea, 3);

    // push + 冷重开：孔环仍参与面域（消费体体积不变）。
    await pushExampleChanges(page, 'sketch external ref bodyFace hole acceptance');
    await reloadWithFlush(page);
    const reopenedCtx = await openExampleEditor(page, ids);
    await expect.poll(async () => {
      const mass = await getMassPropertiesRpc(reopenedCtx, token);
      return Math.round(mass.find((item) => item.bodyKey === chain.consumerBodyKey)?.volume ?? -1);
    }, { timeout: 60_000, intervals: [500, 1000, 2000] }).toBe(Math.round(expectedVolume));
    const reopened = await getSketchRpc(reopenedCtx, chain.projectedSketchId, token);
    expect(reopened?.projection?.status).toBe('ok');
    expect(reopened?.entities).toHaveLength(14);
  });

  test('抑制源失败封闭 / 删源守卫 / 恢复 4000', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Sketch Face Projection Guards', { reset: true });
    const ctx = await openExampleEditor(page, ids);
    const lease = await borrowWriteLease(ctx, token, 'sketch-face-projection-guards');
    const chain = await buildFaceChain(page, ctx, lease, token);

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
    expect(failed.projection?.failedRefIds).toEqual([1]);
    expect((failed.projection?.errors ?? []).map((error) => error.code)).toContain('projection-source-missing');
    expect(failed.entities).toHaveLength(0);
    expect(failed.regions).toBeUndefined();
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
