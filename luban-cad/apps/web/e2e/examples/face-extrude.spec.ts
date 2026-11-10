/**
 * ADR-0006 切片 D 真栈验收（合成盒体）：faceExtrude。
 *
 * 链路：4×4×2 盒（体积 32）→ dev-only 面枚举（getSubEntityGeometry 的 Loop 边界）
 *   → resolveFaceRef 持久面拓扑 id → FeatureOp faceExtrude add 1mm 外拉
 *   → 体积 48 → push + 重开（面引用跨重建稳定）。
 * 目标面按 z=2 平面 + 法线 ±Z 唯一选择；faceRef 由产品 RPC 生成，测试不写死拓扑 id。
 *
 * X-11（v1.64 A1）：本 spec 的 RPC URL 内嵌本地 `LubanFeatureRpcInterface.interfaceVersion`
 * （1.64.0），且 A1 用例发送 `startOffsetMm/draftAngleDeg/draftPullDirection`。因此它只适用于
 * **源码模式/新 backend**；已发布 backend-20261109（shared 1.63.0）不识别新字段/版本，不能
 * 用它跑本 spec（运行时无版本协商；发布顺序 backend 先于发送方）。
 */
import { expect, test } from '@playwright/test';
import type { BodyInfo, FeatureOp, SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  borrowWriteLease,
  getApiToken,
  getBodiesRpc,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
  msRpc,
} from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './imodel.js';

interface FaceHandle {
  bodyKey: string;
  subEntityId: number;
  range: { low: [number, number, number]; high: [number, number, number] };
  normal: [number, number, number];
}

function rectangleSketch(width: number, height: number): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
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

const XY_PLANE = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

test.describe('faceExtrude 真栈验收', () => {
  test('顶面外拉 1mm → 体积 48 → push/重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Face Extrude', { reset: true });
    // 冷 baseline 首次下载可能超过单次 90s 画布等待；失败后 reload 一次（此时 briefcase 已落缓存）。
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    const ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'face-extrude');

    const sketch = rectangleSketch(4, 4);
    const sketchResult = await applyFeatureOpRpc(
      ctx,
      { kind: 'insertSketch', entities: sketch.entities, constraints: sketch.constraints, plane: XY_PLANE } as unknown as FeatureOp,
      lease,
      token,
    );
    expect(sketchResult.ok).toBe(true);
    const sketchId = (sketchResult as { featureId: string }).featureId;

    const extrude = await applyFeatureOpRpc(
      ctx,
      {
        kind: 'insertFeature',
        featureType: 'extrude',
        params: { profile: [], distance: 2, sketchId, regions: [0] },
      },
      lease,
      token,
    );
    expect(extrude.ok).toBe(true);

    const bodies = (await getBodiesRpc(ctx, token)).filter((b: BodyInfo) => b.active !== false && b.authored !== false);
    expect(bodies).toHaveLength(1);
    const body = bodies[0]!;
    const faces = await page.evaluate(async ({ key, bodyInfos }) => {
      const hook = (window as unknown as {
        __lubanE2EExamples?: {
          readFaceHandles(iModelKey: string, bodies: readonly unknown[]): Promise<FaceHandle[] | undefined>;
        };
      }).__lubanE2EExamples;
      if (!hook) throw new Error('__lubanE2EExamples 未安装（VITE_E2E_HOOKS != true）');
      return hook.readFaceHandles(key, bodyInfos);
    }, { key: ctx.dbKey, bodyInfos: bodies });
    const top = (faces ?? []).find((face) => {
      const zLow = face.range.low[2];
      const zHigh = face.range.high[2];
      return Math.abs(zLow - 2) < 1e-3 && Math.abs(zHigh - 2) < 1e-3 && Math.abs(face.normal[2]) > 0.99;
    });
    expect(top, '未找到 z=2 平面顶面').toBeTruthy();

    const resolved = (await msRpc(
      ctx.itwinId,
      ctx.imodelId,
      'resolveFaceRef',
      [ctx.dbKey, body.bodyKey, top!.subEntityId],
      token,
    )) as { ok: boolean; ref?: { nodeId: number; entityId: number }; error?: string };
    expect(resolved.ok, resolved.error).toBe(true);
    const direction = top!.normal[2] > 0 ? 'forward' : 'backward';
    const faceExtrude = await applyFeatureOpRpc(
      ctx,
      {
        kind: 'insertFeature',
        featureType: 'faceExtrude',
        params: {
          bodyId: body.bodyKey,
          faceRef: resolved.ref!,
          operation: 'add',
          endBound: 'blind',
          depthMm: 1,
          direction,
        },
      },
      lease,
      token,
    );
    expect(faceExtrude.ok, faceExtrude.ok ? '' : faceExtrude.error).toBe(true);

    const mass = await getMassPropertiesRpc(ctx, token);
    const volume = mass.reduce((sum, item) => sum + item.volume, 0);
    console.log(`[face-extrude] volume=${volume.toFixed(3)} expected=48`);
    expect(Math.abs(volume - 48)).toBeLessThan(0.48);

    await pushExampleChanges(page, 'faceExtrude synthetic acceptance');
    await page.reload();
    const reopened = await openExampleEditor(page, { itwinId: ids.itwinId, imodelId: ids.imodelId });
    const tree = await getFeatureTreeRpc(reopened, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'faceExtrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const reopenedVolume = (await getMassPropertiesRpc(reopened, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(reopenedVolume - 48)).toBeLessThan(0.48);
  });

  /**
   * v1.64（ADR-0016 切片 A1）：起始面边界 + startOffset + draft 的**语义接线**验收。
   * 180×50×40 盒顶面（z=40）faceExtrude add 40、10° 收窄（draftPullDirection=true）：
   * 等距偏置 prismoid 上体 297,764.787 / 总 657,764.787（A1 baseline，允许 0.1%）。
   * **不是 A2 精确门**：本用例不断言锥面侧边为解析线/弧，也不宣称 oracle 20/20
   * （A2 的差异化项是 face-driven profile + 解析边 + 20/20）。
   */
  test('A1 语义接线：顶面 add 40 + 10° 拔模（pullDirection）→ baseline 657,764.787 → push/冷重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Face Extrude A1 Draft', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return await openExampleEditor(page, ids);
      }
    };
    const ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'face-extrude-a1-draft');

    const sketch = rectangleSketch(180, 50);
    const sketchResult = await applyFeatureOpRpc(
      ctx,
      { kind: 'insertSketch', entities: sketch.entities, constraints: sketch.constraints, plane: XY_PLANE } as unknown as FeatureOp,
      lease,
      token,
    );
    expect(sketchResult.ok).toBe(true);
    const sketchId = (sketchResult as { featureId: string }).featureId;
    const extrude = await applyFeatureOpRpc(
      ctx,
      { kind: 'insertFeature', featureType: 'extrude', params: { profile: [], distance: 40, sketchId, regions: [0] } },
      lease,
      token,
    );
    expect(extrude.ok).toBe(true);
    const baseVolume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(baseVolume - 360_000)).toBeLessThan(360);

    const bodies = (await getBodiesRpc(ctx, token)).filter((b: BodyInfo) => b.active !== false && b.authored !== false);
    expect(bodies).toHaveLength(1);
    const body = bodies[0]!;
    const faces = await page.evaluate(async ({ key, bodyInfos }) => {
      const hook = (window as unknown as {
        __lubanE2EExamples?: {
          readFaceHandles(iModelKey: string, bodies: readonly unknown[]): Promise<FaceHandle[] | undefined>;
        };
      }).__lubanE2EExamples;
      if (!hook) throw new Error('__lubanE2EExamples 未安装（VITE_E2E_HOOKS != true）');
      return hook.readFaceHandles(key, bodyInfos);
    }, { key: ctx.dbKey, bodyInfos: bodies });
    const top = (faces ?? []).find((face) => {
      const zLow = face.range.low[2];
      const zHigh = face.range.high[2];
      return Math.abs(zLow - 40) < 1e-3 && Math.abs(zHigh - 40) < 1e-3 && Math.abs(face.normal[2]) > 0.99;
    });
    expect(top, '未找到 z=40 平面顶面').toBeTruthy();
    const resolved = (await msRpc(
      ctx.itwinId,
      ctx.imodelId,
      'resolveFaceRef',
      [ctx.dbKey, body.bodyKey, top!.subEntityId],
      token,
    )) as { ok: boolean; ref?: { nodeId: number; entityId: number }; error?: string };
    expect(resolved.ok, resolved.error).toBe(true);

    const params = {
      bodyId: body.bodyKey,
      faceRef: resolved.ref!,
      operation: 'add' as const,
      endBound: 'blind' as const,
      depthMm: 40,
      direction: top!.normal[2] > 0 ? 'forward' as const : 'backward' as const,
      startOffsetMm: 0,
      draftAngleDeg: 10,
      draftPullDirection: true,
    };
    const faceExtrude = await applyFeatureOpRpc(
      ctx,
      { kind: 'insertFeature', featureType: 'faceExtrude', params },
      lease,
      token,
    );
    expect(faceExtrude.ok, faceExtrude.ok ? '' : faceExtrude.error).toBe(true);

    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'faceExtrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree.find((row) => row.featureType === 'faceExtrude')?.params).toMatchObject({
      startOffsetMm: 0, draftAngleDeg: 10, draftPullDirection: true,
    });

    const volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    console.log(`[face-extrude A1] volume=${volume.toFixed(3)} (A1 baseline 657764.787, not exact-edge claim)`);
    expect(Math.abs(volume - 657_764.787)).toBeLessThan(657_764.787 * 0.001);

    await pushExampleChanges(page, 'faceExtrude A1 draft baseline acceptance');
    await page.reload();
    const reopened = await openExampleEditor(page, { itwinId: ids.itwinId, imodelId: ids.imodelId });
    const reopenedTree = await getFeatureTreeRpc(reopened, token);
    expect(reopenedTree.every((row) => row.status === 0)).toBe(true);
    const reopenedBodies = (await getBodiesRpc(reopened, token)).filter((b: BodyInfo) => b.active !== false && b.authored !== false);
    expect(reopenedBodies).toHaveLength(1);
    const reopenedVolume = (await getMassPropertiesRpc(reopened, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(reopenedVolume - 657_764.787)).toBeLessThan(657_764.787 * 0.001);
  });

  /**
   * v1.64（ADR-0016 切片 A2，2026-11-10）：**解析边**硬门真栈验收。
   * 180×50×40 盒顶面（z=40）faceExtrude add 40、10° 收窄（draftPullDirection=true）：
   * - 逐边壳体（DraftShell.ts）→ 最终 body 20/20 条边全为 line（零 curvePrimitive）；
   * - prismoid 精确 657,764.787 mm³（增量 297,764.787）；
   * - 树全 status=0、1 body；push + 冷重开后边种/体积一致。
   * 需要**源码模式/含 A2 的新 backend**（本 spec RPC URL 内嵌 1.64.0；发布产物
   * backend-20261109 不含 A2，不能用它跑本用例）。
   */
  test('A2 解析边：顶面 add 40 + 10° 拔模（pullDirection）→ 20/20 line、657,764.787 → push/冷重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Face Extrude A2 Draft', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return await openExampleEditor(page, ids);
      }
    };
    const ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'face-extrude-a2-draft');

    const sketch = rectangleSketch(180, 50);
    const sketchResult = await applyFeatureOpRpc(
      ctx,
      { kind: 'insertSketch', entities: sketch.entities, constraints: sketch.constraints, plane: XY_PLANE } as unknown as FeatureOp,
      lease,
      token,
    );
    expect(sketchResult.ok).toBe(true);
    const sketchId = (sketchResult as { featureId: string }).featureId;
    const extrude = await applyFeatureOpRpc(
      ctx,
      { kind: 'insertFeature', featureType: 'extrude', params: { profile: [], distance: 40, sketchId, regions: [0] } },
      lease,
      token,
    );
    expect(extrude.ok).toBe(true);
    const baseVolume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(baseVolume - 360_000)).toBeLessThan(360);

    const bodies = (await getBodiesRpc(ctx, token)).filter((b: BodyInfo) => b.active !== false && b.authored !== false);
    expect(bodies).toHaveLength(1);
    const body = bodies[0]!;
    const faces = await page.evaluate(async ({ key, bodyInfos }) => {
      const hook = (window as unknown as {
        __lubanE2EExamples?: {
          readFaceHandles(iModelKey: string, bodies: readonly unknown[]): Promise<FaceHandle[] | undefined>;
        };
      }).__lubanE2EExamples;
      if (!hook) throw new Error('__lubanE2EExamples 未安装（VITE_E2E_HOOKS != true）');
      return hook.readFaceHandles(key, bodyInfos);
    }, { key: ctx.dbKey, bodyInfos: bodies });
    const top = (faces ?? []).find((face) => {
      const zLow = face.range.low[2];
      const zHigh = face.range.high[2];
      return Math.abs(zLow - 40) < 1e-3 && Math.abs(zHigh - 40) < 1e-3 && Math.abs(face.normal[2]) > 0.99;
    });
    expect(top, '未找到 z=40 平面顶面').toBeTruthy();
    const resolved = (await msRpc(
      ctx.itwinId,
      ctx.imodelId,
      'resolveFaceRef',
      [ctx.dbKey, body.bodyKey, top!.subEntityId],
      token,
    )) as { ok: boolean; ref?: { nodeId: number; entityId: number }; error?: string };
    expect(resolved.ok, resolved.error).toBe(true);

    const faceExtrude = await applyFeatureOpRpc(
      ctx,
      {
        kind: 'insertFeature',
        featureType: 'faceExtrude',
        params: {
          bodyId: body.bodyKey,
          faceRef: resolved.ref!,
          operation: 'add',
          endBound: 'blind',
          depthMm: 40,
          direction: top!.normal[2] > 0 ? 'forward' : 'backward',
          startOffsetMm: 0,
          draftAngleDeg: 10,
          draftPullDirection: true,
        },
      },
      lease,
      token,
    );
    expect(faceExtrude.ok, faceExtrude.ok ? '' : faceExtrude.error).toBe(true);

    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'faceExtrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);

    const volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    console.log(`[face-extrude A2] volume=${volume.toFixed(6)} expected=657764.787185`);
    expect(Math.abs(volume - 657_764.787185)).toBeLessThan(0.1);

    const readEdgeKinds = async (): Promise<string[]> => page.evaluate(async ({ key, bodyInfos }) => {
      const hook = (window as unknown as {
        __lubanE2EExamples?: {
          readEdgeHandles(iModelKey: string, bodies: readonly unknown[]): Promise<Array<{ curve: { kind: string } }> | undefined>;
        };
      }).__lubanE2EExamples;
      if (!hook) throw new Error('__lubanE2EExamples 未安装（VITE_E2E_HOOKS != true）');
      const edges = await hook.readEdgeHandles(key, bodyInfos);
      if (!edges) throw new Error('readEdgeHandles 返回 undefined');
      return edges.map((edge) => edge.curve.kind);
    }, { key: ctx.dbKey, bodyInfos: bodies });

    const edgeKinds = await readEdgeKinds();
    console.log(`[face-extrude A2] edges=${edgeKinds.length} kinds=${JSON.stringify(edgeKinds)}`);
    expect(edgeKinds).toHaveLength(20);
    expect(edgeKinds.every((kind) => kind === 'line' || kind === 'arc')).toBe(true);
    expect(edgeKinds.filter((kind) => kind === 'line')).toHaveLength(20);

    await pushExampleChanges(page, 'faceExtrude A2 analytic-edge acceptance');
    await page.reload();
    const reopened = await openExampleEditor(page, { itwinId: ids.itwinId, imodelId: ids.imodelId });
    const reopenedTree = await getFeatureTreeRpc(reopened, token);
    expect(reopenedTree.every((row) => row.status === 0)).toBe(true);
    const reopenedBodies = (await getBodiesRpc(reopened, token)).filter((b: BodyInfo) => b.active !== false && b.authored !== false);
    expect(reopenedBodies).toHaveLength(1);
    const reopenedVolume = (await getMassPropertiesRpc(reopened, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(reopenedVolume - 657_764.787185)).toBeLessThan(0.1);

    const reopenedEdgeKinds = await page.evaluate(async ({ key, bodyInfos }) => {
      const hook = (window as unknown as {
        __lubanE2EExamples?: {
          readEdgeHandles(iModelKey: string, bodies: readonly unknown[]): Promise<Array<{ curve: { kind: string } }> | undefined>;
        };
      }).__lubanE2EExamples;
      if (!hook) throw new Error('__lubanE2EExamples 未安装（VITE_E2E_HOOKS != true）');
      const edges = await hook.readEdgeHandles(key, bodyInfos);
      if (!edges) throw new Error('readEdgeHandles 返回 undefined');
      return edges.map((edge) => edge.curve.kind);
    }, { key: reopened.dbKey, bodyInfos: reopenedBodies });
    console.log(`[face-extrude A2 reopened] edges=${reopenedEdgeKinds.length} kinds=${JSON.stringify(reopenedEdgeKinds)}`);
    expect(reopenedEdgeKinds).toHaveLength(20);
    expect(reopenedEdgeKinds.every((kind) => kind === 'line' || kind === 'arc')).toBe(true);
  });
});
