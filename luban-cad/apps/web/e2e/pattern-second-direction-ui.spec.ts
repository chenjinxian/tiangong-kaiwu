/**
 * ADR-0007 切片 13 真栈验收：body 线性阵列第二方向 UI（2026-11-09）。
 *
 * 4×4×5 盒（80 mm³，x/y 2..6）：
 *  - 线性阵列 count=3 spacing=10 X + 第二方向 count=2 spacing=8 Y →
 *    6 实例 **480 mm³** 质心 (14,8,2.5)；
 *  - 树行双击 → 第二方向 2→3 / 间距 8→5 → 9 实例 **720 mm³** 质心 (14,9,2.5)；
 *  - 插入/编辑预览 data-dynamic=1；push + 冷重开一致。
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

function rectangleSketch(width: number, height: number, x0 = 0, y0 = 0): {
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

test.describe('Body pattern 第二方向 UI（ADR-0007 切片 13）', () => {
  test('3×2 网格 480 → 编辑 3×3 720 → push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Pattern Second Direction UI', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'pattern-second-direction-ui');

    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

    const sketch = rectangleSketch(4, 4, 2, 2);
    const sketchId = await apply(
      { kind: 'insertSketch', entities: sketch.entities, constraints: sketch.constraints, plane: XY_PLANE },
      '盒体草图',
    );
    await apply(
      {
        kind: 'insertFeature', featureType: 'extrude',
        params: { profile: [], distance: 5, sketchId, regions: [0] },
      },
      '盒体拉伸',
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
    expect((await mass(ctx)).volume).toBeCloseTo(80, 0);

    await releaseWriteLease(ctx, lease, token);

    await page.getByRole('button', { name: '线性阵列', exact: true }).click({ timeout: 30_000 });
    await expect(page.getByRole('textbox', { name: '实例数量（含原件）' })).toHaveValue('3', { timeout: 30_000 });
    await page.getByRole('checkbox', { name: '第二个方向' }).check();
    await expect(page.getByRole('textbox', { name: '第二方向实例数量（含原件）' })).toHaveValue('2');
    await page.getByRole('textbox', { name: '第二方向间距' }).fill('8');
    await expect(page.getByRole('combobox', { name: '第二方向轴' })).toHaveValue('Y');
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    const confirm = page.getByRole('button', { name: '确认' });
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    await confirm.click({ timeout: 30_000 });

    // 3×2 = 6 实例：480 mm³、质心 (14,8,2.5)。
    await expect.poll(async () => (await mass(ctx)).volume, {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeCloseTo(480, 0);
    let result = await mass(ctx);
    expect(result.centroid.x).toBeCloseTo(14, 3);
    expect(result.centroid.y).toBeCloseTo(8, 3);
    expect(result.centroid.z).toBeCloseTo(2.5, 3);
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'pattern']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[2]?.params).toMatchObject({
      kind: 'linear', count: 3, spacing: 10, axis: 'X',
      secondDirection: { count: 2, spacing: 8, axis: 'Y' },
    });

    // 树行双击编辑：第二方向 2→3 / 间距 8→5 → 3×3 = 9 实例 720 mm³、质心 y=9。
    const featureList = page.getByTestId('part-studio-feature-list');
    await featureList.getByRole('button', { name: /阵列/ }).dblclick();
    const dialog = page.getByTestId('part-studio-feature-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('checkbox', { name: '第二个方向' })).toBeChecked();
    await page.getByRole('textbox', { name: '第二方向实例数量（含原件）' }).fill('3');
    await page.getByRole('textbox', { name: '第二方向间距' }).fill('5');
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    const editConfirm = page.getByRole('button', { name: '确认' });
    await expect(editConfirm).toBeEnabled({ timeout: 15_000 });
    await editConfirm.click({ timeout: 30_000 });

    await expect.poll(async () => (await mass(ctx)).volume, {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeCloseTo(720, 0);
    result = await mass(ctx);
    expect(result.centroid.x).toBeCloseTo(14, 3);
    expect(result.centroid.y).toBeCloseTo(9, 3);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[2]?.params).toMatchObject({
      secondDirection: { count: 3, spacing: 5, axis: 'Y' },
    });

    // v1.63：第一方向反向 → 网格沿 −X 平移；体积不变 720、质心 x=-6。
    await featureList.getByRole('button', { name: /阵列/ }).dblclick();
    const reverseDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(reverseDialog).toBeVisible({ timeout: 30_000 });
    await reverseDialog.getByRole('checkbox', { name: '反向' }).check();
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    const reverseConfirm = reverseDialog.getByRole('button', { name: '确认' });
    await expect(reverseConfirm).toBeEnabled({ timeout: 15_000 });
    await reverseConfirm.click({ timeout: 30_000 });
    await expect.poll(async () => (await mass(ctx)).centroid.x, {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeCloseTo(-6, 3);
    result = await mass(ctx);
    expect(result.volume).toBeCloseTo(720, 0);
    expect(result.centroid.y).toBeCloseTo(9, 3);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[2]?.params).toMatchObject({
      secondDirection: { count: 3, spacing: 5, axis: 'Y' },
      oppositeDirection: true,
    });

    await pushExampleChanges(page, 'body pattern second direction UI acceptance');
    await page.reload();
    ctx = await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'pattern']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    result = await mass(ctx);
    expect(result.volume).toBeCloseTo(720, 0);
    expect(result.centroid.x).toBeCloseTo(-6, 3);
    expect(result.centroid.y).toBeCloseTo(9, 3);
  });
});
