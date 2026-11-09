/**
 * ADR-0012 UI 真栈验收：单侧世界平面分割对话框（2026-11-09）。
 *
 * 20×20×10 盒（4000 mm³，x 10..30）：
 *  - 分割对话框 YZ 平面 offset 20、保留正侧 → **2000 mm³** 质心 x=25；
 *  - 树行双击编辑 offset 25、保留正侧 → **1000 mm³** 质心 x=27.5；
 *  - 插入/编辑预览 data-dynamic=1（后端 splitPart shadow eval → TileRpc）；
 *  - push + 冷重开一致。
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

function rectangleSketch(width: number, height: number, x0: number, y0: number): {
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
} {
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

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

test.describe('SplitPart UI（ADR-0012）', () => {
  test('YZ x=20 正侧 2000 → 编辑 x=25 1000 → push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Split Part UI', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    const ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'split-part-ui');

    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

    const sketch = rectangleSketch(20, 20, 10, 0);
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
    expect((await mass()).volume).toBeCloseTo(4000, 0);

    await releaseWriteLease(ctx, lease, token);

    await page.getByRole('button', { name: '分割', exact: true }).click({ timeout: 30_000 });
    const dialog = page.getByTestId('part-studio-split-part-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    // 单活动实体自动成为目标。
    await expect(dialog.getByTestId('part-studio-split-part-target')).not.toHaveText('');
    await dialog.getByRole('combobox', { name: '分割平面' }).selectOption('YZ');
    await dialog.getByTestId('part-studio-split-part-offset').fill('20');
    await dialog.getByRole('combobox', { name: '保留侧' }).selectOption('positive');
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    const confirm = dialog.getByTestId('part-studio-split-part-confirm');
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    await confirm.click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    await expect.poll(async () => (await mass()).volume, {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeCloseTo(2000, 0);
    let result = await mass();
    expect(result.centroid.x).toBeCloseTo(25, 3);
    expect(result.centroid.y).toBeCloseTo(10, 3);
    expect(result.centroid.z).toBeCloseTo(5, 3);
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'splitPart']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[2]?.params).toMatchObject({ plane: 'YZ', offsetMm: 20, keepSide: 'positive' });

    // 树行双击编辑：offset 20 → 25（保留正侧）。
    const featureList = page.getByTestId('part-studio-feature-list');
    await featureList.getByRole('button', { name: /分割/ }).dblclick();
    const editDialog = page.getByTestId('part-studio-split-part-dialog');
    await expect(editDialog).toBeVisible({ timeout: 30_000 });
    await expect(editDialog.getByTestId('part-studio-split-part-target-fixed')).toBeVisible();
    await expect(editDialog.getByTestId('part-studio-split-part-offset')).toHaveValue('20');
    await editDialog.getByTestId('part-studio-split-part-offset').fill('25');
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    const editConfirm = editDialog.getByTestId('part-studio-split-part-confirm');
    await expect(editConfirm).toBeEnabled({ timeout: 15_000 });
    await editConfirm.click({ timeout: 30_000 });
    await expect(editDialog).toBeHidden({ timeout: 180_000 });

    await expect.poll(async () => (await mass()).volume, {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeCloseTo(1000, 0);
    result = await mass();
    expect(result.centroid.x).toBeCloseTo(27.5, 3);
    expect(result.centroid.y).toBeCloseTo(10, 3);
    expect(result.centroid.z).toBeCloseTo(5, 3);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[2]?.params).toMatchObject({ plane: 'YZ', offsetMm: 25, keepSide: 'positive' });

    await pushExampleChanges(page, 'splitPart UI acceptance');
    await page.reload();
    await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'splitPart']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    result = await mass();
    expect(result.volume).toBeCloseTo(1000, 0);
    expect(result.centroid.x).toBeCloseTo(27.5, 3);
  });
});
