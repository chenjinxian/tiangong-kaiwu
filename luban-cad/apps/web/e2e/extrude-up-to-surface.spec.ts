/**
 * v1.52 / ADR-0005 Phase 5 真栈验收：extrude upToSurface（平行平面目标面）。
 *
 * 板 20×20×5（2000 mm³）→ z=0 内嵌 10×10 草图 → 目标面=板顶面 z=5（视口拾取
 * 持久 faceRef）→ operation=remove、endBound=upToSurface、distance=1 占位。
 * 期望去材 10×10×5=500 → **1500 mm³**；若误用占位 distance=1 则为 1900。
 * 树全 status=0；push + 冷重开（rebuildAll 重解析目标面）体积一致。
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

const RANGE = { low: { x: 0, y: 0, z: 0 }, high: { x: 20, y: 20, z: 5 } };
const EXPECTED_VOLUME_MM3 = 2000 - 10 * 10 * 5;

test.describe('Extrude upToSurface（ADR-0005 Phase 5）', () => {
  test('目标面=板顶面 + remove → 1500 mm³/push+冷重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Extrude Up To Surface', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'extrude-up-to-surface');

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

    // 顶面完整可见 → 点选顶面，读持久拓扑 id（与产品面选择同一 resolveFaceRef 通道）。
    await frameStandardView(page, 0, RANGE, { left: 0.2, right: 0.05, top: 0.15, bottom: 0.1 });
    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('画布不可用');
    const screens = await projectWorld(page, { x: box.x, y: box.y }, [
      { x: 10, y: 10, z: 5 },
      { x: 9, y: 9, z: 5 },
      { x: 11, y: 11, z: 5 },
      { x: 10, y: 11, z: 5 },
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
    console.log(`[extrude-up-to-surface] faceRef=(${faceRef.nodeId},${faceRef.entityId})`);

    const cutSketch = rectangleSketch(10, 10);
    const cutSketchId = await apply(
      { kind: 'insertSketch', entities: cutSketch.entities, constraints: cutSketch.constraints, plane: XY_PLANE },
      '切除草图',
    );
    await apply(
      {
        kind: 'insertFeature', featureType: 'extrude',
        params: {
          profile: [], distance: 1, sketchId: cutSketchId, regions: [0],
          operation: 'remove', endBound: 'upToSurface', endFaceRef: faceRef,
        },
      },
      'upToSurface 切除',
    );

    const TREE_TYPES = ['sketch', 'extrude', 'sketch', 'extrude'];
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(TREE_TYPES);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[3]?.params).toMatchObject({
      endBound: 'upToSurface',
      endFaceRef: faceRef,
      operation: 'remove',
      distance: 1,
    });
    let volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    console.log(`[extrude-up-to-surface] volume=${volume.toFixed(3)} expected=${EXPECTED_VOLUME_MM3}`);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3)).toBeLessThan(0.5);

    await pushExampleChanges(page, 'extrude upToSurface acceptance');
    await page.reload();
    ctx = await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(TREE_TYPES);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);
  });
});
