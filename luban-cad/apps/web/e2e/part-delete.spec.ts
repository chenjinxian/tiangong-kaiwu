/**
 * 2026-11-13 真栈验收：零件删除首切片（NEW-body 驱动特征）。
 *
 * RPC 建 NEW-body 拉伸 → 零件行右键「删除…」→ HITL 确认 →
 * deleteFeature(featureId=源, targetBodyId=bodyKey) → 零件段 (0)、树特征行移除；
 * undo 恢复零件。
 */
import { expect, test } from '@playwright/test';
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getBodiesRpc,
  releaseWriteLease,
} from './helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { ensureExampleImodel, openExampleEditor } from './examples/imodel.js';

function rectangleSketch(width: number, height: number): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
  return {
    entities: [
      { kind: 'line', id: 11, p1: { x: 0, y: 0 }, p2: { x: width, y: 0 } },
      { kind: 'line', id: 12, p1: { x: width, y: 0 }, p2: { x: width, y: height } },
      { kind: 'line', id: 13, p1: { x: width, y: height }, p2: { x: 0, y: height } },
      { kind: 'line', id: 14, p1: { x: 0, y: height }, p2: { x: 0, y: 0 } },
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: width, y: 0 },
      { kind: 'point', id: 3, x: width, y: height },
      { kind: 'point', id: 4, x: 0, y: height },
    ],
    constraints: [
      { kind: 'horizontal', id: 21, refs: [11] },
      { kind: 'vertical', id: 22, refs: [12] },
      { kind: 'horizontal', id: 23, refs: [13] },
      { kind: 'vertical', id: 24, refs: [14] },
      { kind: 'distance', id: 25, refs: [1, 2], value: width },
      { kind: 'distance', id: 26, refs: [2, 3], value: height },
    ],
  };
}

const XY_PLANE = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

test.describe('2026-11-13 零件删除（NEW-body 驱动特征首切片）', () => {
  test('零件行删除 → HITL → 零件/特征移除 → undo 恢复', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Part Delete', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return await openExampleEditor(page, ids);
      }
    };
    const ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'part-delete');
    const rect = rectangleSketch(20, 20);
    const sketch = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: rect.entities, constraints: rect.constraints, plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(sketch, '草图');
    const extrude = await applyFeatureOpRpc(ctx, {
      kind: 'insertFeature', featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: sketch.featureId!, regions: [0], operation: 'new' },
    }, lease, token);
    assertFeatureOpOk(extrude, '拉伸');
    const bodies = await getBodiesRpc(ctx, token);
    const body = bodies.find((item) => item.active !== false && item.authored !== false);
    expect(body).toBeDefined();
    await releaseWriteLease(ctx, lease, token);

    await expect(page.getByTestId('part-studio-part-list')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('part-studio-part-count')).toHaveText('(1)');
    const partRow = page.getByTestId(`tree-row-${body!.bodyKey}`);
    await expect(partRow).toBeVisible({ timeout: 60_000 });

    await partRow.click({ button: 'right' });
    const deleteItem = page.getByTestId('tree-menu-delete-part');
    await expect(deleteItem).toBeEnabled();
    await deleteItem.click();
    await expect(page.getByRole('dialog', { name: /删除零件/ })).toBeVisible();
    await page.getByTestId('part-delete-confirm').click();

    await expect(page.getByTestId('part-studio-part-count')).toHaveText('(0)', { timeout: 30_000 });
    await expect(page.getByTestId(`tree-row-${extrude.featureId!}`)).toHaveCount(0, { timeout: 30_000 });

    // undo 恢复零件与特征行。
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('part-studio-part-count')).toHaveText('(1)', { timeout: 30_000 });
    await expect(page.getByTestId(`tree-row-${extrude.featureId!}`)).toBeVisible({ timeout: 30_000 });
  });
});
