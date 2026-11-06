/**
 * v1.34 / ADR-0007 第一切片真栈验收（合成）：FEATURE pattern。
 *
 * 链路：40×40×10 盒（16000）→ 顶面 4×4×5 凸台（ADD 80）
 *   → featurePattern（源=凸台 extrude，linear count 3 spacing 6 沿 X）
 *   → 体积 16000 + 3×80 = 16240 → push + 重开（树含 featurePattern status=0）。
 * 源特征几何增量由后端“源前/后缓存差集”得到；e2e 不重算差集，只做体积/树验收。
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
} from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './imodel.js';

function rectangleSketch(
  width: number,
  height: number,
  x0 = 0,
  y0 = 0,
): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
  const x1 = x0 + width;
  const y1 = y0 + height;
  return {
    entities: [
      { kind: 'point', id: 1, x: x0, y: y0 },
      { kind: 'point', id: 2, x: x1, y: y0 },
      { kind: 'point', id: 3, x: x1, y: y1 },
      { kind: 'point', id: 4, x: x0, y: y1 },
      { kind: 'point', id: 5, x: x0, y: y0 },
      { kind: 'point', id: 6, x: x1, y: y0 },
      { kind: 'point', id: 7, x: x1, y: y1 },
      { kind: 'point', id: 8, x: x0, y: y1 },
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
const TOP_PLANE = {
  origin: { x: 0, y: 0, z: 10 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

test.describe('featurePattern 真栈验收', () => {
  test('凸台 3 实例线性阵列 → 体积 16240 → push/重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Feature Pattern', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    const ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'feature-pattern');

    // 40×40×10 盒 = 16000
    const baseSketch = rectangleSketch(40, 40, -20, -20);
    const baseSketchResult = await applyFeatureOpRpc(
      ctx,
      {
        kind: 'insertSketch',
        entities: baseSketch.entities,
        constraints: baseSketch.constraints,
        plane: XY_PLANE,
      } as unknown as FeatureOp,
      lease,
      token,
    );
    expect(baseSketchResult.ok).toBe(true);
    const baseSketchId = (baseSketchResult as { featureId: string }).featureId;
    const baseExtrude = await applyFeatureOpRpc(
      ctx,
      {
        kind: 'insertFeature',
        featureType: 'extrude',
        params: { profile: [], distance: 10, sketchId: baseSketchId, regions: [0], operation: 'new' },
      },
      lease,
      token,
    );
    expect(baseExtrude.ok).toBe(true);

    // 顶面 4×4×5 凸台 @ x∈[2,6], y∈[2,6] → 80
    const bossSketch = rectangleSketch(4, 4, 2, 2);
    const bossSketchResult = await applyFeatureOpRpc(
      ctx,
      {
        kind: 'insertSketch',
        entities: bossSketch.entities,
        constraints: bossSketch.constraints,
        plane: TOP_PLANE,
      } as unknown as FeatureOp,
      lease,
      token,
    );
    expect(bossSketchResult.ok).toBe(true);
    const bossSketchId = (bossSketchResult as { featureId: string }).featureId;
    const bossExtrude = await applyFeatureOpRpc(
      ctx,
      {
        kind: 'insertFeature',
        featureType: 'extrude',
        params: { profile: [], distance: 5, sketchId: bossSketchId, regions: [0], operation: 'add' },
      },
      lease,
      token,
    );
    expect(bossExtrude.ok, bossExtrude.ok ? '' : bossExtrude.error).toBe(true);
    const bossFeatureId = (bossExtrude as { featureId: string }).featureId;

    const bodies = (await getBodiesRpc(ctx, token)).filter(
      (body: BodyInfo) => body.active !== false && body.authored !== false,
    );
    expect(bodies).toHaveLength(1);

    const pattern = await applyFeatureOpRpc(
      ctx,
      {
        kind: 'insertFeature',
        featureType: 'featurePattern',
        params: {
          sourceFeatureId: bossFeatureId,
          kind: 'linear',
          count: 3,
          spacing: 6,
          axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
        },
      } as unknown as FeatureOp,
      lease,
      token,
    );
    expect(pattern.ok, pattern.ok ? '' : pattern.error).toBe(true);

    const mass = await getMassPropertiesRpc(ctx, token);
    const volume = mass.reduce((sum, item) => sum + item.volume, 0);
    console.log(`[feature-pattern] volume=${volume.toFixed(3)} expected=16240`);
    expect(Math.abs(volume - 16240)).toBeLessThan(162.4);

    await pushExampleChanges(page, 'featurePattern synthetic acceptance');
    await page.reload();
    const reopened = await openExampleEditor(page, { itwinId: ids.itwinId, imodelId: ids.imodelId });
    const tree = await getFeatureTreeRpc(reopened, token);
    expect(tree.map((row) => row.featureType)).toEqual([
      'sketch', 'extrude', 'sketch', 'extrude', 'featurePattern',
    ]);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const reopenedVolume = (await getMassPropertiesRpc(reopened, token))
      .reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(reopenedVolume - 16240)).toBeLessThan(162.4);
  });
});
