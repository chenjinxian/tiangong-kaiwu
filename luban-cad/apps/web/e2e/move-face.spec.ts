/**
 * v1.42 / ADR-0014 切片 1 真栈验收：moveFace 面偏移。
 *
 * 盒 20×20×10（4000 mm³）→ 视口点选顶面 z=10（持久拓扑 id）→ +5 mm →
 * 6000 mm³、质心 z=7.5；update −2 mm → 3200 mm³、质心 z=4；push + 重开一致。
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
import { frameStandardView, projectWorld } from './tutorial2-helpers.js';
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

const RANGE = { low: { x: 0, y: 0, z: 0 }, high: { x: 20, y: 20, z: 10 } };

test.describe('moveFace 面偏移（ADR-0014 切片 1）', () => {
  test('顶面 +5 → −2 → 3200 mm³/push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Move Face', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'move-face');

    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

    const sketch = rectangleSketch(20, 20);
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

    await frameStandardView(page, 0, RANGE, { left: 0.2, right: 0.05, top: 0.15, bottom: 0.1 });
    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('画布不可用');
    const screens = await projectWorld(page, { x: box.x, y: box.y }, [
      { x: 10, y: 10, z: 10 },
      { x: 9, y: 9, z: 10 },
      { x: 11, y: 11, z: 10 },
      { x: 10, y: 11, z: 10 },
    ]);
    let faceRef: { nodeId: number; entityId: number } | undefined;
    for (const screen of screens) {
      await page.mouse.click(screen.x, screen.y);
      await page.waitForTimeout(500);
      faceRef = await page.evaluate(() => {
        const selection = (window as unknown as {
          __lubanE2EApp: { usePartStudioStore: { getState(): { canvas: { selection: Array<{ kind: string; topologyId?: { nodeId: number; entityId: number } }> } } } };
        }).__lubanE2EApp.usePartStudioStore.getState().canvas.selection;
        return selection.find((entry) => entry.kind === 'face')?.topologyId;
      });
      if (faceRef) break;
    }
    if (!faceRef) throw new Error('顶面拾取失败：未获得持久面引用');

    const moveId = await apply(
      { kind: 'insertFeature', featureType: 'moveFace', params: { faces: [faceRef], distanceMm: 5 } },
      'moveFace +5',
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
    console.log(`[move-face] +5 volume=${result.volume.toFixed(3)} centroid=(${result.centroid.x.toFixed(3)},${result.centroid.y.toFixed(3)},${result.centroid.z.toFixed(3)})`);
    expect(result.volume).toBeCloseTo(6000, 2);
    expect(result.centroid.z).toBeCloseTo(7.5, 3);

    const updated = await applyFeatureOpRpc(
      ctx,
      { kind: 'updateParams', featureId: moveId, params: { faces: [faceRef], distanceMm: -2 } },
      lease,
      token,
    );
    assertFeatureOpOk(updated, 'moveFace −2');
    result = await mass();
    console.log(`[move-face] -2 volume=${result.volume.toFixed(3)} centroid=(${result.centroid.x.toFixed(3)},${result.centroid.y.toFixed(3)},${result.centroid.z.toFixed(3)})`);
    expect(result.volume).toBeCloseTo(3200, 2);
    expect(result.centroid.z).toBeCloseTo(4, 3);

    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'moveFace']);
    expect(tree.every((row) => row.status === 0)).toBe(true);

    await pushExampleChanges(page, 'moveFace acceptance');
    await page.reload();
    ctx = await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'moveFace']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    result = await mass();
    expect(result.volume).toBeCloseTo(3200, 2);
    expect(result.centroid.z).toBeCloseTo(4, 3);
  });
});
