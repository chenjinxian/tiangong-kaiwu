/**
 * v1.60 / ADR-0005 Phase 7 真栈验收：extrude upToVertex（草图顶点引用）。
 *
 * 板 20×20×5（2000 mm³）→ z=0 内嵌 10×10 草图 → 目标顶点=另一张草图
 * （平面 z=3）上的点 (5,5) → 深度=顶点世界点在拉伸方向上的投影 3 →
 * operation=remove、distance=1 占位。期望去材 10×10×3=300 → **1700 mm³**；
 * 若误用占位 distance=1 则为 1900。树全 status=0；push + 冷重开后体积一致。
 */
import { expect, test } from '@playwright/test';
import type { FeatureOp, SketchConstraintDto, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
} from './helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './examples/imodel.js';

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

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

const VERTEX_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 3 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

const EXPECTED_VOLUME_MM3 = 2000 - 10 * 10 * 3;

test.describe('Extrude upToVertex（ADR-0005 Phase 7）', () => {
  test('目标顶点 z=3 + remove → 1700 mm³/push+冷重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Extrude Up To Vertex', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'extrude-up-to-vertex');

    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

    const plateSketch = rectangleSketch(20, 20);
    const plateSketchId = await apply(
      { kind: 'insertSketch', entities: plateSketch.entities, constraints: plateSketch.constraints, plane: XY_PLANE },
      '板草图',
    );
    await apply(
      {
        kind: 'insertFeature', featureType: 'extrude',
        params: { profile: [], distance: 5, sketchId: plateSketchId, regions: [0] },
      },
      '板拉伸',
    );
    expect((await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0)).toBeCloseTo(2000, 3);

    const cutSketch = rectangleSketch(10, 10);
    const cutSketchId = await apply(
      { kind: 'insertSketch', entities: cutSketch.entities, constraints: cutSketch.constraints, plane: XY_PLANE },
      '切除草图',
    );

    // 目标顶点：z=3 平面上的单点 (5,5)，仅作 upToVertex 目标。
    const vertexSketchId = await apply(
      {
        kind: 'insertSketch',
        entities: [{ kind: 'point', id: 1, x: 5, y: 5 }],
        constraints: [],
        plane: VERTEX_PLANE,
      },
      '顶点草图',
    );
    const endVertexRef = { sketchId: vertexSketchId, entityId: 1, part: 'start' as const };

    await apply(
      {
        kind: 'insertFeature', featureType: 'extrude',
        params: {
          profile: [], distance: 1, sketchId: cutSketchId, regions: [0],
          operation: 'remove', endBound: 'upToVertex', endVertexRef,
        },
      },
      'upToVertex 切除',
    );

    const TREE_TYPES = ['sketch', 'extrude', 'sketch', 'sketch', 'extrude'];
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(TREE_TYPES);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[4]?.params).toMatchObject({
      endBound: 'upToVertex',
      endVertexRef,
      operation: 'remove',
      distance: 1,
    });
    let volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    console.log(`[extrude-up-to-vertex] volume=${volume.toFixed(3)} expected=${EXPECTED_VOLUME_MM3}`);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3)).toBeLessThan(0.5);

    await pushExampleChanges(page, 'extrude upToVertex acceptance');
    await page.reload();
    ctx = await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(TREE_TYPES);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);
  });
});
