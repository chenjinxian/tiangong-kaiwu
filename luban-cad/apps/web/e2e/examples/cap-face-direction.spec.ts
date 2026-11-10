/**
 * ADR-0016 S3 review（2026-11-10）：faceExtrude 产品面法向符号真栈证据。
 *
 * 背景：产品 `readFaceHandles` / 后端 `CurveOps.isPlanar` 返回的平面法向**不保证**
 * 等于实体外法向（合成 plate+boss 体实测：顶面 +z 朝外、底面 +z 朝内、y=0 面 +y
 * 朝内）。因此 runner 不能假设“产品 forward = 外法向”；必须用 Onshape 世界外法向
 * + 解析到的产品面法向换算 direction。
 *
 * 本 spec 构造 10×10×10 底座 + 40×40×10 顶板（单 body 17,000 mm³），选中**底面**
 * （10×10，z=0，产品法向 +z = 朝内），用产品 direction=forward（沿产品 +z，即
 * 朝体内）做 faceExtrude remove THROUGH_ALL：完整 10×10×20 柱 = 2,000 mm³ 被去除，
 * 终 15,000 mm³。若按“产品法向=外法向”假设用 backward，会沿 -z 切向体外 →
 * 后端零相交 status=1。本用例是真栈反证，不是 Onshape 候选 PS 绿例。
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

function rectangleSketch(
  width: number,
  height: number,
): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
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

interface FaceHandle {
  bodyKey: string;
  subEntityId: number;
  range: { low: [number, number, number]; high: [number, number, number] };
  normal: [number, number, number];
}

const TOP = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

test.describe('faceExtrude 产品面法向符号（S3 review）', () => {
  test('底面产品法向朝内（+z）：forward throughAll 切穿全高 15,000 mm³ → push/冷重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - S3 CapFace Direction', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    const ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 's3-capface-direction');

    // 10×10×10 底座。
    const base = rectangleSketch(10, 10);
    const baseSketch = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: base.entities, constraints: base.constraints, plane: TOP,
    } as unknown as FeatureOp, lease, token);
    expect(baseSketch.ok).toBe(true);
    const baseExtrude = await applyFeatureOpRpc(ctx, {
      kind: 'insertFeature', featureType: 'extrude',
      params: {
        profile: [], distance: 10, regions: [0], operation: 'new',
        sketchId: (baseSketch as { featureId: string }).featureId,
      },
    }, lease, token);
    expect(baseExtrude.ok, baseExtrude.ok ? '' : baseExtrude.error).toBe(true);

    // z=10 上 40×40×10 顶板（单 body 17,000 mm³）。
    const plate = rectangleSketch(40, 40);
    const plateSketch = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: plate.entities, constraints: plate.constraints,
      plane: { ...TOP, origin: { x: 0, y: 0, z: 10 } },
    } as unknown as FeatureOp, lease, token);
    expect(plateSketch.ok).toBe(true);
    const plateExtrude = await applyFeatureOpRpc(ctx, {
      kind: 'insertFeature', featureType: 'extrude',
      params: {
        profile: [], distance: 10, regions: [0], operation: 'add',
        sketchId: (plateSketch as { featureId: string }).featureId,
      },
    }, lease, token);
    expect(plateExtrude.ok, plateExtrude.ok ? '' : plateExtrude.error).toBe(true);
    const baseVolume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(baseVolume - 17_000)).toBeLessThan(17);

    const bodies = (await getBodiesRpc(ctx, token)).filter(
      (body: BodyInfo) => body.active !== false && body.authored !== false,
    );
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
    const bottom = (faces ?? []).find((face) => (
      Math.abs(face.range.low[2]) < 1e-3
      && Math.abs(face.range.high[2]) < 1e-3
      && Math.abs(face.range.low[0]) < 1e-3
      && Math.abs(face.range.high[0] - 10) < 1e-3
    ));
    expect(bottom, '未找到 z=0 的 10×10 底面').toBeTruthy();
    // 产品面法向 +z = 朝体内（实体在 z≥0）；不是外法向（外法向应为 -z）。
    expect(bottom!.normal[0]).toBeCloseTo(0, 6);
    expect(bottom!.normal[1]).toBeCloseTo(0, 6);
    expect(bottom!.normal[2]).toBeCloseTo(1, 6);

    const resolved = (await msRpc(
      ctx.itwinId,
      ctx.imodelId,
      'resolveFaceRef',
      [ctx.dbKey, body.bodyKey, bottom!.subEntityId],
      token,
    )) as { ok: boolean; ref?: { nodeId: number; entityId: number }; error?: string };
    expect(resolved.ok, resolved.error).toBe(true);

    // 产品法向朝内（+z），要切向体内必须 direction=forward。
    const faceExtrude = await applyFeatureOpRpc(ctx, {
      kind: 'insertFeature',
      featureType: 'faceExtrude',
      params: {
        bodyId: body.bodyKey,
        faceRef: resolved.ref!,
        operation: 'remove',
        endBound: 'throughAll',
        direction: 'forward',
      },
    }, lease, token);
    expect(faceExtrude.ok, faceExtrude.ok ? '' : faceExtrude.error).toBe(true);

    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual([
      'sketch', 'extrude', 'sketch', 'extrude', 'faceExtrude',
    ]);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    console.log(`[s3-capface-direction] volume=${volume.toFixed(6)} expected=15000 (inward product normal +z, forward throughAll)`);
    expect(Math.abs(volume - 15_000)).toBeLessThan(75);

    await pushExampleChanges(page, 'S3 inward product-normal direction acceptance');
    await page.reload();
    const reopened = await openExampleEditor(page, { itwinId: ids.itwinId, imodelId: ids.imodelId });
    const reopenedTree = await getFeatureTreeRpc(reopened, token);
    expect(reopenedTree.every((row) => row.status === 0)).toBe(true);
    const reopenedVolume = (await getMassPropertiesRpc(reopened, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(reopenedVolume - 15_000)).toBeLessThan(75);
  });
});
