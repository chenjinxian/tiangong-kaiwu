/**
 * 草图删除（shared v1.3 `deleteSketch`；2026-11-12 真栈验收）。
 *
 * 背景：树行删除历史上一律发 `deleteFeature`，而草图是 `LubanCAD.Sketch`
 *（非 LubanCAD.Feature），后端报「特征不存在」。现 Sidebar 按节点类型路由：
 * 草图 → `deleteSketch`（后端存在性 + 被特征引用守卫）；其余 → `deleteFeature`。
 *
 * 覆盖：
 * 1) 未引用草图：树右键删除 → HITL 确认 → Success toast + 行消失 + RPC/冷开仍无；
 * 2) 被拉伸引用的草图：HITL 确认后后端诚实拒收（Error toast 含「草图被特征引用」），
 *    草图行保留（不伪造成功）。
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

test.describe('草图删除（deleteSketch 路由）', () => {
  test('未引用草图：树删除 → HITL → 行消失 + 冷开仍无', async ({ page, request }) => {
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

    const lease = await borrowWriteLease(ctx, token, 'sketch-delete');
    const sketch = rectangleSketch(20, 20);
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: sketch.entities, constraints: sketch.constraints, plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '草图');
    await releaseWriteLease(ctx, lease, token);
    const sketchId = created.featureId;
    expect(sketchId).toBeTruthy();

    await page.reload();
    ctx = await openWithRetry();
    const row = page.getByTestId(`tree-row-${sketchId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });

    // 树右键 → 删除 → HITL 确认（Sidebar 路由 shared deleteSketch）。
    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: '删除' }).click();
    const dialog = page.getByRole('dialog', { name: /^删除 草图/ });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: '删除' }).click();

    await expect(page.getByText(/^已删除 /).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(`tree-row-${sketchId}`)).toHaveCount(0, { timeout: 60_000 });
    expect((await getFeatureTreeRpc(ctx, token)).some((entry) => entry.id === sketchId)).toBe(false);

    // 冷重开：删除已落库（auto-push + briefcase 重读）。
    await page.reload();
    ctx = await openWithRetry();
    await expect(page.getByTestId(`tree-row-${sketchId}`)).toHaveCount(0, { timeout: 60_000 });
    expect((await getFeatureTreeRpc(ctx, token)).filter((entry) => entry.featureType === 'sketch')).toHaveLength(0);
  });

  test('被拉伸引用的草图：删除被后端诚实拒收（Error toast + 行保留）', async ({ page, request }) => {
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

    const lease = await borrowWriteLease(ctx, token, 'sketch-delete-ref');
    const sketch = rectangleSketch(20, 20);
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: sketch.entities, constraints: sketch.constraints, plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '草图');
    const sketchId = created.featureId!;
    const extrude = await applyFeatureOpRpc(ctx, {
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 5, sketchId, regions: [0] },
    }, lease, token);
    assertFeatureOpOk(extrude, '拉伸');
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openWithRetry();
    const row = page.getByTestId(`tree-row-${sketchId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });

    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: '删除' }).click();
    const dialog = page.getByRole('dialog', { name: /^删除 草图/ });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: '删除' }).click();

    // 诚实负路径：后端 checkSketchDeletable 拒收 → Error toast；树不乐观改。
    await expect(page.getByText(/草图被特征引用/).first()).toBeVisible({ timeout: 30_000 });
    expect(await page.getByTestId(`tree-row-${sketchId}`).count()).toBe(1);
    expect((await getFeatureTreeRpc(ctx, token)).some((entry) => entry.id === sketchId)).toBe(true);
  });
});
