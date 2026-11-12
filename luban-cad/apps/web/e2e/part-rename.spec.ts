/**
 * v1.70 真栈验收：特征/零件树内联重命名（Onshape 零件行右键「重命名」→ 原地输入框）。
 *
 * RPC 建一个 20×20×10 盒体 → 右键零件行「重命名」→ 输入 Housing A → Enter →
 * 行名与 getBodies[].name 同步 → undo 回 Body 1 → 再改名 → push+重开仍在。
 */
import { expect, test } from '@playwright/test';
import type { FeatureOp, SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getBodiesRpc,
  releaseWriteLease,
} from './helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './examples/imodel.js';

function rectangleSketch(width: number, height: number): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
  const x1 = width;
  const y1 = height;
  return {
    entities: [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: x1, y: 0 },
      { kind: 'point', id: 3, x: x1, y: y1 },
      { kind: 'point', id: 4, x: 0, y: y1 },
      { kind: 'line', id: 11, p1: { x: 0, y: 0 }, p2: { x: x1, y: 0 } },
      { kind: 'line', id: 12, p1: { x: x1, y: 0 }, p2: { x: x1, y: y1 } },
      { kind: 'line', id: 13, p1: { x: x1, y: y1 }, p2: { x: 0, y: y1 } },
      { kind: 'line', id: 14, p1: { x: 0, y: y1 }, p2: { x: 0, y: 0 } },
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

test.describe('v1.70 特征/零件重命名（Onshape 树内联）', () => {
  test('零件行右键重命名 → getBodies 同步 → undo → push+重开保留', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Part Rename', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return await openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'part-rename');
    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

    const rect = rectangleSketch(20, 20);
    const sketchId = await apply(
      { kind: 'insertSketch', entities: rect.entities, constraints: rect.constraints, plane: XY_PLANE },
      '草图',
    );
    await apply(
      { kind: 'insertFeature', featureType: 'extrude', params: { profile: [], distance: 10, sketchId, regions: [0], operation: 'new' } },
      '拉伸',
    );
    const bodies = await getBodiesRpc(ctx, token);
    const body = bodies.find((item) => item.active !== false && item.authored !== false);
    expect(body).toBeDefined();
    const bodyKey = body!.bodyKey;
    expect(body!.name).toBe('Body 1');
    await releaseWriteLease(ctx, lease, token);

    // 等零件段读面。
    await expect(page.getByTestId('part-studio-part-list')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('part-studio-part-count')).toHaveText('(1)');
    const row = page.getByTestId(`tree-row-${bodyKey}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await expect(row).toContainText('Body 1');

    // 右键 → 重命名 → 原地输入框。
    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: '重命名' }).click();
    const input = page.getByRole('textbox', { name: '重命名' });
    await expect(input).toBeVisible({ timeout: 15_000 });
    await expect(input).toHaveValue('Body 1');
    await input.fill('Housing A');
    await input.press('Enter');

    await expect(row).toContainText('Housing A', { timeout: 30_000 });
    await expect.poll(async () => {
      const after = await getBodiesRpc(ctx, token);
      return after.find((item) => item.bodyKey === bodyKey)?.name;
    }, { timeout: 30_000, intervals: [500, 1000, 2000] }).toBe('Housing A');

    // undo：原生 briefcase 事务回退（P0-10）。
    await page.keyboard.press('Control+z');
    await expect(row).toContainText('Body 1', { timeout: 30_000 });
    await expect.poll(async () => {
      const after = await getBodiesRpc(ctx, token);
      return after.find((item) => item.bodyKey === bodyKey)?.name;
    }, { timeout: 30_000, intervals: [500, 1000, 2000] }).toBe('Body 1');

    // 再改名 → push + 重开仍保留。
    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: '重命名' }).click();
    const input2 = page.getByRole('textbox', { name: '重命名' });
    await input2.fill('Housing A');
    await input2.press('Enter');
    await expect(row).toContainText('Housing A', { timeout: 30_000 });

    await pushExampleChanges(page, 'part rename acceptance');
    await page.reload();
    ctx = await openWithRetry();
    await expect(page.getByTestId('part-studio-part-list')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(`tree-row-${bodyKey}`)).toContainText('Housing A', { timeout: 60_000 });
  });

  test('特征行重命名：改名后树行显示自定义名，push+重开保留', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Feature Rename', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return await openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'feature-rename');
    const rect = rectangleSketch(20, 20);
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: rect.entities, constraints: rect.constraints, plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '草图');
    const sketchId = created.featureId!;
    const extrude = await applyFeatureOpRpc(ctx, {
      kind: 'insertFeature', featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId, regions: [0], operation: 'new' },
    }, lease, token);
    assertFeatureOpOk(extrude, '拉伸');
    const featureId = extrude.featureId!;
    await releaseWriteLease(ctx, lease, token);

    const row = page.getByTestId(`tree-row-${featureId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await expect(row).toContainText('拉伸 1');

    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: '重命名' }).click();
    const input = page.getByRole('textbox', { name: '重命名' });
    await expect(input).toHaveValue('拉伸 1');
    await input.fill('Housing Extrude');
    await input.press('Enter');
    await expect(row).toContainText('Housing Extrude', { timeout: 30_000 });

    // 草图行同一内联改名路径（后端 def/phys model 双解析）。
    const sketchRow = page.getByTestId(`tree-row-${sketchId}`);
    await expect(sketchRow).toBeVisible({ timeout: 30_000 });
    await expect(sketchRow).toContainText('草图 1');
    await sketchRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: '重命名' }).click();
    const sketchInput = page.getByRole('textbox', { name: '重命名' });
    await expect(sketchInput).toHaveValue('草图 1');
    await sketchInput.fill('Base Sketch');
    await sketchInput.press('Enter');
    await expect(sketchRow).toContainText('Base Sketch', { timeout: 30_000 });

    await pushExampleChanges(page, 'feature rename acceptance');
    await page.reload();
    ctx = await openWithRetry();
    await expect(page.getByTestId(`tree-row-${featureId}`)).toContainText('Housing Extrude', { timeout: 60_000 });
    await expect(page.getByTestId(`tree-row-${sketchId}`)).toContainText('Base Sketch', { timeout: 60_000 });
  });
});
