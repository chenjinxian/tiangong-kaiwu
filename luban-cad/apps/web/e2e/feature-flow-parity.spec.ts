/**
 * ADR-0017 Stage E 真栈验收：现有特征对话框的 Onshape 参数行结构。
 *
 * 证据：ui-evidence/editor-flow-parity-20261112/screenshots/f6-extrude-dialog.png
 * + DOM：方向/起始偏移是**真复选框**（勾选才展开值行），拔模/对称/第二个终止位置
 * 为平铺复选；底栏只有滑杆 + ?（无「成品」按钮）。
 *
 * 流程：RPC 造 20×20 草图 → UI 拉伸 5 mm、勾选方向（反向）+ 起始偏移 2 →
 * 实体跨 z∈[-3,2]（体积 2000、质心 z=-0.5）→ 树行双击编辑回显两勾选 →
 * push + 冷重开一致。
 */
import { expect, test } from '@playwright/test';
import type { SketchConstraintDto, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
  openSeedImodelEditor,
  releaseWriteLease,
} from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { pushExampleChanges } from './examples/imodel.js';

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};
const EXPECTED_VOLUME_MM3 = 20 * 20 * 5;

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

test.describe('特征对话框 Onshape 参数行（Stage E）', () => {
  test('方向/起始偏移真复选框 → 体积/位置 → 编辑回显 → push+冷重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const openWithRetry = async () => {
      try {
        return await openSeedImodelEditor(page, seed);
      } catch {
        await page.reload();
        return openSeedImodelEditor(page, seed);
      }
    };
    let ctx = await openWithRetry();

    const sketch = rectangleSketch(20, 20);
    const lease = await borrowWriteLease(ctx, token, 'feature-flow-parity');
    const result = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: sketch.entities, constraints: sketch.constraints, plane: XY_PLANE,
    }, lease, token);
    await releaseWriteLease(ctx, lease, token);
    assertFeatureOpOk(result, '草图');

    await page.reload();
    ctx = await openWithRetry();

    // ── UI 拉伸：方向=反向 + 起始偏移 2 ─────────────────────────────────────
    await page.getByRole('button', { name: '拉伸', exact: true }).click();
    const dialog = page.getByTestId('part-studio-feature-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText('草图 1 的面')).toBeVisible({ timeout: 60_000 });
    // 底栏无「成品」按钮（唯一确认=标题行 ✓）。
    await expect(dialog.getByRole('button', { name: '成品' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '确认' })).toHaveCount(1);

    const direction = dialog.getByRole('checkbox', { name: '方向', exact: true });
    const startOffset = dialog.getByRole('checkbox', { name: '起始偏移' });
    await expect(direction).not.toBeChecked();
    await expect(startOffset).not.toBeChecked();
    await expect(dialog.getByRole('textbox', { name: '起始偏移' })).toHaveCount(0);

    await dialog.getByRole('textbox', { name: '深度' }).fill('5');
    await direction.check();
    await startOffset.check();
    const offsetInput = dialog.getByRole('textbox', { name: '起始偏移' });
    await expect(offsetInput).toHaveValue('0');
    await offsetInput.fill('2');
    await dialog.getByRole('button', { name: '确认' }).click();
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[1]!.params).toMatchObject({ distance: 5, direction: 'backward', startOffsetMm: 2 });
    let mass = await getMassPropertiesRpc(ctx, token);
    let volume = mass.reduce((sum, item) => sum + item.volume, 0);
    console.log(`[feature-flow-parity] volume=${volume.toFixed(3)} centroidZ=${mass[0]?.centroid.z}`);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3)).toBeLessThan(1);
    // 剖面沿法向 +2 起扫、反向 5 → z∈[-3,2]，质心 z=-0.5。
    expect(Math.abs((mass[0]?.centroid.z ?? 0) + 0.5)).toBeLessThan(0.05);

    // ── 树行双击编辑：两勾选与值回显 ────────────────────────────────────────
    await page.getByTestId('part-studio-feature-list').getByRole('button', { name: /拉伸 1/ }).dblclick();
    const editDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(editDialog.getByRole('checkbox', { name: '方向', exact: true })).toBeChecked({ timeout: 30_000 });
    await expect(editDialog.getByRole('checkbox', { name: '起始偏移' })).toBeChecked();
    await expect(editDialog.getByRole('textbox', { name: '起始偏移' })).toHaveValue('2');
    await expect(editDialog.getByRole('textbox', { name: '深度' })).toHaveValue('5');
    await editDialog.getByRole('button', { name: '取消' }).click();
    await expect(editDialog).toBeHidden();

    // ── push + 冷重开 ──────────────────────────────────────────────────────
    await pushExampleChanges(page, 'feature dialog parity acceptance');
    await page.reload();
    ctx = await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[1]!.params).toMatchObject({ direction: 'backward', startOffsetMm: 2 });
    mass = await getMassPropertiesRpc(ctx, token);
    volume = mass.reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);
    expect(Math.abs((mass[0]?.centroid.z ?? 0) + 0.5)).toBeLessThan(0.05);
  });
});
