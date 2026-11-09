/**
 * v1.38 / ADR-0010 切片 2 真栈验收：Transform 均匀缩放。
 *
 * 盒体 (10..20, 0..10, 0..10)，质心 (15,5,5)，体积 1000：
 *  - scale 2 关于原点 → 8000 mm³、质心 (30,10,10)；
 *  - scale 0.5 关于 (5,5,5) → 125 mm³、质心 (10,5,5)；
 *  - scale 2 + translation (100,0,0) → 8000 mm³、质心 (130,10,10)；
 *  - push + 重开后一致。
 */
import { expect, test } from '@playwright/test';
import type { FeatureOp, SketchConstraintDto, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getMassPropertiesRpc,
} from './helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './examples/imodel.js';

function rectangleSketch(width: number, height: number, x0: number, y0: number): {
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
} {
  return {
    entities: [
      { kind: 'point', id: 1, x: x0, y: y0 },
      { kind: 'point', id: 2, x: x0 + width, y: y0 },
      { kind: 'point', id: 3, x: x0 + width, y: y0 + height },
      { kind: 'point', id: 4, x: x0, y: y0 + height },
      { kind: 'point', id: 5, x: x0, y: y0 },
      { kind: 'point', id: 6, x: x0 + width, y: y0 },
      { kind: 'point', id: 7, x: x0 + width, y: y0 + height },
      { kind: 'point', id: 8, x: x0, y: y0 + height },
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

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

test.describe('Transform 均匀缩放（ADR-0010 切片 2）', () => {
  test('缩放 2 → 0.5@固定点 → 缩放+平移 → push/重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Transform Scale', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    const ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'transform-scale');

    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

    const sketch = rectangleSketch(10, 10, 10, 0);
    const sketchId = await apply(
      { kind: 'insertSketch', entities: sketch.entities, constraints: sketch.constraints, plane: XY_PLANE },
      '盒体草图',
    );
    await apply(
      {
        kind: 'insertFeature', featureType: 'extrude',
        params: { profile: [], distance: 10, sketchId, regions: [0] },
      },
      '盒体拉伸',
    );
    const transformId = await apply(
      { kind: 'insertFeature', featureType: 'transform', params: { scale: 2 } },
      'scale 2',
    );

    const mass = async () => {
      const items = await getMassPropertiesRpc(ctx, token);
      const volume = items.reduce((sum, item) => sum + item.volume, 0);
      const centroid = items.reduce(
        (sum, item) => ({
          x: sum.x + item.centroid.x * item.volume,
          y: sum.y + item.centroid.y * item.volume,
          z: sum.z + item.centroid.z * item.volume,
        }),
        { x: 0, y: 0, z: 0 },
      );
      return {
        volume,
        centroid: { x: centroid.x / volume, y: centroid.y / volume, z: centroid.z / volume },
      };
    };
    let result = await mass();
    console.log(`[transform-scale] scale2 volume=${result.volume.toFixed(3)} centroid=(${result.centroid.x.toFixed(3)},${result.centroid.y.toFixed(3)},${result.centroid.z.toFixed(3)})`);
    expect(result.volume).toBeCloseTo(8000, 3);
    expect(result.centroid.x).toBeCloseTo(30, 3);
    expect(result.centroid.y).toBeCloseTo(10, 3);
    expect(result.centroid.z).toBeCloseTo(10, 3);

    const half = await applyFeatureOpRpc(
      ctx,
      { kind: 'updateParams', featureId: transformId, params: { scale: 0.5, scaleOrigin: { x: 5, y: 5, z: 5 } } },
      lease,
      token,
    );
    assertFeatureOpOk(half, 'scale 0.5@(5,5,5)');
    result = await mass();
    console.log(`[transform-scale] half volume=${result.volume.toFixed(3)} centroid=(${result.centroid.x.toFixed(3)},${result.centroid.y.toFixed(3)},${result.centroid.z.toFixed(3)})`);
    expect(result.volume).toBeCloseTo(125, 3);
    expect(result.centroid.x).toBeCloseTo(10, 3);
    expect(result.centroid.y).toBeCloseTo(5, 3);

    const final = await applyFeatureOpRpc(
      ctx,
      {
        kind: 'updateParams', featureId: transformId,
        params: { scale: 2, translation: { x: 100, y: 0, z: 0 } },
      },
      lease,
      token,
    );
    assertFeatureOpOk(final, 'scale 2 + translate');
    result = await mass();
    console.log(`[transform-scale] final volume=${result.volume.toFixed(3)} centroid=(${result.centroid.x.toFixed(3)},${result.centroid.y.toFixed(3)})`);
    expect(result.volume).toBeCloseTo(8000, 3);
    expect(result.centroid.x).toBeCloseTo(130, 3);
    expect(result.centroid.y).toBeCloseTo(10, 3);

    await pushExampleChanges(page, 'transform scale acceptance');
    await page.reload();
    await openWithRetry();
    const reopened = await mass();
    expect(reopened.volume).toBeCloseTo(8000, 3);
    expect(reopened.centroid.x).toBeCloseTo(130, 3);
    expect(reopened.centroid.y).toBeCloseTo(10, 3);
  });
});
