/**
 * v1.37 / ADR-0011 切片 1 真栈验收：mirror 任意世界平面（planeLine）。
 *
 * 盒体 x∈[3,5], y∈[0,2], z∈[0,2]（体积 8、质心 (4,1,1)）：
 *  - 平面 x=y（normal (1,-1,0)）→ 镜像质心 (1,4,1)，并集 16 mm³、质心 (2.5,2.5,1)；
 *  - 偏置平面 x=2（origin (2,0,0)，normal (1,0,0)）→ 镜像质心 (0,1,1)，
 *    并集 16 mm³、质心 (2,1,1)；
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

test.describe('mirror 任意世界平面（ADR-0011 切片 1）', () => {
  test('对角平面 → 偏置平面 → push/重开一致', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Mirror Plane Line', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    const ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'mirror-plane-line');

    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

    const sketch = rectangleSketch(2, 2, 3, 0);
    const sketchId = await apply(
      { kind: 'insertSketch', entities: sketch.entities, constraints: sketch.constraints, plane: XY_PLANE },
      '盒体草图',
    );
    await apply(
      {
        kind: 'insertFeature', featureType: 'extrude',
        params: { profile: [], distance: 2, sketchId, regions: [0] },
      },
      '盒体拉伸',
    );
    const mirrorId = await apply(
      {
        kind: 'insertFeature', featureType: 'mirror',
        params: {
          planeLine: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 1, y: -1, z: 0 } },
          keepOriginal: true,
        },
      },
      '对角平面镜像',
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
    console.log(`[mirror-plane-line] diagonal volume=${result.volume.toFixed(3)} centroid=(${result.centroid.x.toFixed(3)},${result.centroid.y.toFixed(3)})`);
    expect(result.volume).toBeCloseTo(16, 3);
    expect(result.centroid.x).toBeCloseTo(2.5, 3);
    expect(result.centroid.y).toBeCloseTo(2.5, 3);

    const updated = await applyFeatureOpRpc(
      ctx,
      {
        kind: 'updateParams', featureId: mirrorId,
        params: {
          planeLine: { origin: { x: 2, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } },
          keepOriginal: true,
        },
      },
      lease,
      token,
    );
    assertFeatureOpOk(updated, '偏置平面 x=2');
    result = await mass();
    console.log(`[mirror-plane-line] offset volume=${result.volume.toFixed(3)} centroid=(${result.centroid.x.toFixed(3)},${result.centroid.y.toFixed(3)})`);
    expect(result.volume).toBeCloseTo(16, 3);
    expect(result.centroid.x).toBeCloseTo(2, 3);
    expect(result.centroid.y).toBeCloseTo(1, 3);

    await pushExampleChanges(page, 'mirror planeLine acceptance');
    await page.reload();
    await openWithRetry();
    const reopened = await mass();
    expect(reopened.volume).toBeCloseTo(16, 3);
    expect(reopened.centroid.x).toBeCloseTo(2, 3);
    expect(reopened.centroid.y).toBeCloseTo(1, 3);
  });
});
