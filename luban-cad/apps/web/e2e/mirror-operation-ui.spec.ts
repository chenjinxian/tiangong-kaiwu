/**
 * v1.48 / ADR-0011 切片 2c 真栈 UI 验收：mirror operation（加入/移除/相交）。
 *
 * 盒 x[-5,10] × y[0,20] × z[0,10]（体积 3000）→ 镜像平面 YZ（x=0）：
 *   镜像体 x[-10,5]，与原件交集 x[-5,5]（宽 10）→ **2000 mm³**。
 * 真实 UI：ribbon「镜像」→ 平面 YZ → 操作「相交」→ 确认；树/status/push+重开。
 * 「新建」（独立镜像体）需多体输出，UI 禁用并提示（ADR-0015）。
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

function rectangleSketch(
  x0: number,
  x1: number,
  height: number,
): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
  return {
    entities: [
      { kind: 'point', id: 1, x: x0, y: 0 },
      { kind: 'point', id: 2, x: x1, y: 0 },
      { kind: 'point', id: 3, x: x1, y: height },
      { kind: 'point', id: 4, x: x0, y: height },
      { kind: 'point', id: 5, x: x0, y: 0 },
      { kind: 'point', id: 6, x: x1, y: 0 },
      { kind: 'point', id: 7, x: x1, y: height },
      { kind: 'point', id: 8, x: x0, y: height },
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
      { kind: 'distance', id: 29, refs: [1, 2], value: x1 - x0 },
      { kind: 'distance', id: 30, refs: [2, 3], value: height },
    ],
  };
}

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

test.describe('Mirror operation UI（ADR-0011 切片 2c）', () => {
  test('YZ 平面 + 相交 → 2000 mm³/push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Mirror Operation UI', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'mirror-operation-ui');

    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

    const sketch = rectangleSketch(-5, 10, 20);
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

    await page.reload();
    ctx = await openWithRetry();
    await page.getByRole('button', { name: '镜像', exact: true }).click({ timeout: 30_000 });
    const dialog = page.getByTestId('part-studio-feature-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('combobox', { name: '镜像平面' }).selectOption('YZ');
    const operationTabs = dialog.getByRole('tablist', { name: '镜像操作' });
    await expect(operationTabs.getByRole('tab', { name: '新建' })).toBeDisabled();
    await operationTabs.getByRole('tab', { name: '相交' }).click();
    const confirm = dialog.getByRole('button', { name: '确认' });
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    // 后端影子求值几何 → TileRpc 动态预览（2026-11-08 接入 mirror）。
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    await confirm.click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'mirror']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[2]?.params).toMatchObject({
      plane: 'YZ',
      keepOriginal: true,
      operation: 'intersect',
    });
    let volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    console.log(`[mirror-operation-ui] volume=${volume.toFixed(3)} expected=2000`);
    expect(Math.abs(volume - 2000)).toBeLessThan(0.5);

    await pushExampleChanges(page, 'mirror operation UI acceptance');
    await page.reload();
    ctx = await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'mirror']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(volume - 2000) / 2000).toBeLessThan(0.005);

    // ── 编辑态预览（2026-11-08）：双击「镜像」行 → updateParams 影子求值预览 ──
    // e2e RPC 链持有写租约，先释放给 UI 会话，否则 previewOp 租约获取失败。
    await releaseWriteLease(ctx, lease, token);
    await page.getByTestId('part-studio-feature-list').getByRole('button', { name: /镜像/ }).dblclick();
    const editDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(editDialog).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    await editDialog.getByRole('button', { name: '取消' }).click();
    await expect(editDialog).toBeHidden({ timeout: 30_000 });
    volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(volume - 2000) / 2000).toBeLessThan(0.005);
  });
});
