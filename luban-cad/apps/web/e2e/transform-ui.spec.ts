/**
 * ADR-0010 UI 真栈验收：变换对话框（2026-11-09）。
 *
 * 10×10×10 盒（1000 mm³，x 10..20）：
 *  - 变换对话框 → 按 XYZ 平动 ΔX=30 + 复制零件 → 原件+副本 **2000 mm³**、
 *    质心 (30,5,5)；
 *  - 树行双击编辑 → 旋转世界 Z 90°、取消复制 → **1000 mm³**、质心 (-5,15,5)；
 *  - push + 冷重开一致；预览 data-dynamic=1（后端 transform shadow eval → TileRpc）。
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

test.describe('Transform UI（ADR-0010）', () => {
  test('平动+复制 2000 → 编辑旋转 1000/质心 (-5,15,5) → push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Transform UI', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    const ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'transform-ui');

    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

    const sketch = rectangleSketch(10, 10, 10, 0);
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
    expect((await mass()).volume).toBeCloseTo(1000, 0);

    // e2e RPC 建链持有写租约；释放给 UI 会话。
    await releaseWriteLease(ctx, lease, token);

    await page.getByRole('button', { name: '变换', exact: true }).click({ timeout: 30_000 });
    const dialog = page.getByTestId('part-studio-transform-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole('combobox', { name: '变换类型' })).toHaveValue('translate');
    // 单活动实体自动成为目标实体。
    await expect(dialog.getByTestId('part-studio-transform-target')).not.toHaveText('');
    await dialog.getByTestId('part-studio-transform-dx').fill('30');
    await dialog.getByRole('checkbox', { name: '复制零件' }).check();
    // transform 插入预览已接（后端 shadow eval → TileRpc）。
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    const confirm = dialog.getByTestId('part-studio-transform-confirm');
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    await confirm.click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    // 原件 1000 + 副本 1000 = 2000；质心 x=(15+45)/2=30。
    await expect.poll(async () => (await mass()).volume, {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeCloseTo(2000, 0);
    let result = await mass();
    expect(result.centroid.x).toBeCloseTo(30, 3);
    expect(result.centroid.y).toBeCloseTo(5, 3);
    expect(result.centroid.z).toBeCloseTo(5, 3);
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'transform']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[2]?.params).toMatchObject({ translation: { x: 30, y: 0, z: 0 }, copy: true });

    // 树行双击 → 编辑：旋转 Z 90°、取消复制（translate 分量被单分量页签替换）。
    const featureList = page.getByTestId('part-studio-feature-list');
    await featureList.getByRole('button', { name: /变换/ }).dblclick();
    const editDialog = page.getByTestId('part-studio-transform-dialog');
    await expect(editDialog).toBeVisible({ timeout: 30_000 });
    await expect(editDialog.getByTestId('part-studio-transform-target-fixed')).toBeVisible();
    await expect(editDialog.getByRole('checkbox', { name: '复制零件' })).toBeChecked();
    await editDialog.getByRole('combobox', { name: '变换类型' }).selectOption('rotate');
    await expect(editDialog.getByRole('combobox', { name: '轴' })).toHaveValue('Z');
    await editDialog.getByRole('textbox', { name: '角度（度）' }).fill('90');
    await editDialog.getByRole('checkbox', { name: '复制零件' }).uncheck();
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    const editConfirm = editDialog.getByTestId('part-studio-transform-confirm');
    await expect(editConfirm).toBeEnabled({ timeout: 15_000 });
    await editConfirm.click({ timeout: 30_000 });
    await expect(editDialog).toBeHidden({ timeout: 180_000 });

    // 绕 Z 轴原点 90° → 1000 mm³、质心 (-5,15,5)。
    await expect.poll(async () => (await mass()).volume, {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeCloseTo(1000, 0);
    result = await mass();
    expect(result.centroid.x).toBeCloseTo(-5, 3);
    expect(result.centroid.y).toBeCloseTo(15, 3);
    expect(result.centroid.z).toBeCloseTo(5, 3);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[2]?.params).toMatchObject({ rotation: { axisDirection: { x: 0, y: 0, z: 1 }, angleDeg: 90 } });
    expect(tree[2]?.params).not.toHaveProperty('translation');
    expect(tree[2]?.params).not.toHaveProperty('copy');

    await pushExampleChanges(page, 'transform UI acceptance');
    await page.reload();
    await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'transform']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    result = await mass();
    expect(result.volume).toBeCloseTo(1000, 0);
    expect(result.centroid.x).toBeCloseTo(-5, 3);
    expect(result.centroid.y).toBeCloseTo(15, 3);
    expect(result.centroid.z).toBeCloseTo(5, 3);
  });
});
