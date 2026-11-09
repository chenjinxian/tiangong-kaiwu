/**
 * v1.41 / ADR-0011 切片 2 真栈验收：Mirror faceRef 面镜像。
 *
 * 盒 20×20×10（体积 4000、z∈[0,10]）→ 视口点选顶面 z=10（持久拓扑 id）→
 * mirror faceRef 保留原体 Unite → 8000 mm³、质心 z=10；push + 重开一致。
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

test.describe('Mirror faceRef 面镜像（ADR-0011 切片 2）', () => {
  test('顶面 z=10 镜像 → 8000 mm³ 质心 z=10/push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Mirror Face', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'mirror-face');

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

    // 顶面完整可见 → 点选顶面，读持久拓扑 id（与产品面选择同一 resolveFaceRef 通道）。
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
    expect(Number.isInteger(faceRef.nodeId)).toBe(true);
    console.log(`[mirror-face] faceRef=(${faceRef.nodeId},${faceRef.entityId})`);

    const mirrorId = await apply(
      { kind: 'insertFeature', featureType: 'mirror', params: { faceRef, keepOriginal: true } },
      '面镜像',
    );

    const mass = async (context: typeof ctx) => {
      const items = await getMassPropertiesRpc(context, token);
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
    let result = await mass(ctx);
    console.log(`[mirror-face] volume=${result.volume.toFixed(3)} centroid=(${result.centroid.x.toFixed(3)},${result.centroid.y.toFixed(3)},${result.centroid.z.toFixed(3)})`);
    expect(result.volume).toBeCloseTo(8000, 2);
    expect(result.centroid.x).toBeCloseTo(10, 3);
    expect(result.centroid.y).toBeCloseTo(10, 3);
    expect(result.centroid.z).toBeCloseTo(10, 3);

    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.find((row) => row.id === mirrorId)?.status).toBe(0);

    await pushExampleChanges(page, 'mirror faceRef acceptance');
    await page.reload();
    ctx = await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'mirror']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    result = await mass(ctx);
    expect(result.volume).toBeCloseTo(8000, 2);
    expect(result.centroid.z).toBeCloseTo(10, 3);
  });
});
