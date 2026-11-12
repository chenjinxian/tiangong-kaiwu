/**
 * ADR-0017 Stage D 真栈验收：编辑既有草图（Onshape 双击树行）。
 *
 * 覆盖：树行双击 → 草图对话框编辑态（标题/平面只读/✓ 可完成）→ ✗ 取消与
 * Escape 关闭且不删除草图；草图行仍在。平面字段只读对应 updateSketch 契约
 * 无 plane 键（平面快照属创建输入）。
 */
import { expect, test } from '@playwright/test';
import type { SketchConstraintDto, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getFeatureTreeRpc,
  openSeedImodelEditor,
  releaseWriteLease,
} from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

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

test.describe('编辑既有草图（Stage D）', () => {
  test('树行双击 → 编辑态（平面只读）；取消/Escape 不删草图', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
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

    const lease = await borrowWriteLease(ctx, token, 'sketch-edit');
    const sketch = rectangleSketch(20, 20);
    const result = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: sketch.entities, constraints: sketch.constraints, plane: XY_PLANE,
    }, lease, token);
    await releaseWriteLease(ctx, lease, token);
    assertFeatureOpOk(result, '草图');

    await page.reload();
    ctx = await openWithRetry();

    const treeBefore = await getFeatureTreeRpc(ctx, token);
    expect(treeBefore.filter((row) => row.featureType === 'sketch')).toHaveLength(1);

    const sketchRow = page.getByTestId('part-studio-feature-list')
      .getByRole('button', { name: /草图 1/ });
    await sketchRow.dblclick({ timeout: 30_000 });

    const dialog = page.getByTestId('part-studio-sketch-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    const planeField = dialog.getByRole('combobox', { name: '草图平面' });
    await expect(planeField).toBeDisabled();
    await expect(planeField).toContainText('Top');
    await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled();
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    // ✗ 取消：对话框关闭、草图行仍在（不删除）。
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '特征工具' })).toBeVisible({ timeout: 30_000 });
    expect((await getFeatureTreeRpc(ctx, token)).filter((row) => row.featureType === 'sketch')).toHaveLength(1);

    // 再次双击 → Escape 关闭（Onshape 草图工具退出语义）。
    await sketchRow.dblclick({ timeout: 30_000 });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    expect((await getFeatureTreeRpc(ctx, token)).filter((row) => row.featureType === 'sketch')).toHaveLength(1);
  });
});
