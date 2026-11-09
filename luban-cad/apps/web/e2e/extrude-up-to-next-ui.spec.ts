/**
 * v1.53 / ADR-0005 Phase 6 增补 真栈 UI 验收：extrude 成形到下一个面（upToNext）。
 *
 * 板 20×20×5（2000 mm³）+ z=0 内嵌 10×10 草图 → ribbon「拉伸」→ 草图 2 → 移除 →
 * 成形到下一个面（自动选最近平行面=板顶 z=5，无需先选面）→ 去材 500 →
 * **1500 mm³**；push+重开一致。
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

const EXPECTED_VOLUME_MM3 = 2000 - 10 * 10 * 5;

test.describe('Extrude 成形到下一个面 UI（ADR-0005 Phase 6）', () => {
  test('草图 2 移除 成形到下一个面 → 1500 mm³/push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Extrude Up To Next UI', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'extrude-up-to-next-ui');

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
    await page.getByRole('button', { name: '拉伸', exact: true }).click({ timeout: 30_000 });
    const dialog = page.getByTestId('part-studio-feature-dialog');
    await expect(dialog.getByText('草图 2 的面')).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('tab', { name: '移除' }).click();
    const endBound = dialog.getByRole('combobox', { name: '终止条件' });
    await expect(dialog.getByRole('option', { name: '成形到下一个面' })).toBeEnabled({ timeout: 15_000 });
    await endBound.selectOption('upToNext');
    await expect(dialog.getByRole('textbox', { name: '深度' })).toBeDisabled();
    const confirm = dialog.getByRole('button', { name: '确认' });
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    await confirm.click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    const TREE_TYPES = ['sketch', 'extrude', 'sketch', 'extrude'];
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(TREE_TYPES);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[3]?.params).toMatchObject({ endBound: 'upToNext', operation: 'remove' });
    let volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    console.log(`[extrude-up-to-next-ui] volume=${volume.toFixed(3)} expected=${EXPECTED_VOLUME_MM3}`);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3)).toBeLessThan(0.5);

    await pushExampleChanges(page, 'extrude upToNext UI acceptance');
    await page.reload();
    ctx = await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(TREE_TYPES);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);
  });
});
