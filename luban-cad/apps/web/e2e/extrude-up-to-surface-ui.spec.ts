/**
 * v1.52 / ADR-0005 Phase 5 真栈 UI 验收：extrude 成形到面（upToSurface）。
 *
 * live 证据：ui-evidence/feature-dialogs-20261108/onshape/
 *   extrude-endbound-menu.json（给 定深度/成形到下一个面/成形到面/成形到零件/成形到顶点/完全贯穿）、
 *   extrude-endbound-surface.json（endBoundEntityFace 行）。
 *
 * 板 20×20×5（2000 mm³）+ z=0 内嵌 10×10 草图；视口选中板顶面 z=5 → ribbon「拉伸」→
 * 草图 2 → 移除 → 成形到面 → 确认。期望去材 500 → **1500 mm³**，push+重开一致。
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
  releaseWriteLease,
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

test.describe('Extrude 成形到面 UI（ADR-0005 Phase 5）', () => {
  test('选顶面 → 草图 2 移除 成形到面 → 1500 mm³/push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Extrude Up To Surface UI', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'extrude-up-to-surface-ui');

    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

    const plate = rectangleSketch(20, 20);
    const plateSketchId = await apply(
      { kind: 'insertSketch', entities: plate.entities, constraints: plate.constraints, plane: XY_PLANE },
      '板草图',
    );
    await apply(
      {
        kind: 'insertFeature', featureType: 'extrude',
        params: { profile: [], distance: 5, sketchId: plateSketchId, regions: [0] },
      },
      '板拉伸',
    );
    const cut = rectangleSketch(10, 10);
    await apply(
      { kind: 'insertSketch', entities: cut.entities, constraints: cut.constraints, plane: XY_PLANE },
      '切除草图',
    );
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openWithRetry();

    // 顶面完整可见 → 点选顶面（为 ribbon 路由提供面快照）。
    await frameStandardView(page, 0, RANGE, { left: 0.2, right: 0.05, top: 0.15, bottom: 0.1 });
    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('画布不可用');
    const screens = await projectWorld(page, { x: box.x, y: box.y }, [
      { x: 10, y: 10, z: 5 },
      { x: 9, y: 9, z: 5 },
      { x: 11, y: 11, z: 5 },
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
    console.log(`[extrude-up-to-surface-ui] faceRef=(${faceRef.nodeId},${faceRef.entityId})`);

    await page.getByRole('button', { name: '拉伸', exact: true }).click({ timeout: 30_000 });
    const dialog = page.getByTestId('part-studio-feature-dialog');
    await expect(dialog.getByText('草图 2 的面')).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('tab', { name: '移除' }).click();
    const endBound = dialog.getByRole('combobox', { name: '终止条件' });
    await expect(dialog.getByRole('option', { name: '成形到面' })).toBeEnabled({ timeout: 15_000 });
    await endBound.selectOption('upToSurface');
    await expect(dialog.getByTestId('part-studio-feature-dialog-up-to-surface-face-hint'))
      .toContainText(`${faceRef.nodeId}:${faceRef.entityId}`, { timeout: 15_000 });
    await expect(dialog.getByRole('textbox', { name: '深度' })).toBeDisabled();
    const confirm = dialog.getByRole('button', { name: '确认' });
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    await confirm.click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    const TREE_TYPES = ['sketch', 'extrude', 'sketch', 'extrude'];
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(TREE_TYPES);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[3]?.params).toMatchObject({
      endBound: 'upToSurface',
      endFaceRef: faceRef,
      operation: 'remove',
    });
    let volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    console.log(`[extrude-up-to-surface-ui] volume=${volume.toFixed(3)} expected=${EXPECTED_VOLUME_MM3}`);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3)).toBeLessThan(0.5);

    await pushExampleChanges(page, 'extrude upToSurface UI acceptance');
    await page.reload();
    ctx = await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(TREE_TYPES);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);
  });

});
