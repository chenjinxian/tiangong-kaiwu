/**
 * 草图非尺寸约束 glyph 真栈验收（Onshape 对拍 2026-11-12）。
 *
 * 覆盖：水平/垂直约束在视口出现可点击 glyph（⊥/—/| 同款小方块观测面）→
 * 单击选中（浅蓝高亮）→ Delete 删除该约束（updateSketch 移除，另一条保留）。
 * 约束删除仍走宿主 updateSketch / BriefcaseTxns（可撤销）。
 */
import { expect, test } from '@playwright/test';
import type { SketchConstraintDto, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getSketchRpc,
  openSeedImodelEditor,
  releaseWriteLease,
} from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

const ENTITIES: SketchEntityDto[] = [
  { kind: 'line', id: 11, p1: { x: -10, y: 0 }, p2: { x: 10, y: 0 } },
  { kind: 'line', id: 12, p1: { x: 0, y: -10 }, p2: { x: 0, y: 10 } },
];

const CONSTRAINTS: SketchConstraintDto[] = [
  { kind: 'horizontal', id: 101, refs: [11] },
  { kind: 'vertical', id: 102, refs: [12] },
  { kind: 'length', id: 103, refs: [11], value: 20 },
];

interface Point { x: number; y: number }

test.describe('草图非尺寸约束 glyph（Onshape 对拍）', () => {
  test('glyph 可见 → 点击选中 → Delete 删除约束', async ({ page, request }) => {
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

    const lease = await borrowWriteLease(ctx, token, 'sketch-constraint-glyphs');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: ENTITIES, constraints: CONSTRAINTS, plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openWithRetry();
    const sketchRow = page.getByTestId(`tree-row-${sketchId}`);
    await expect(sketchRow).toBeVisible({ timeout: 60_000 });
    await sketchRow.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    // 正视草图并取景（glyph 屏幕位置依赖相机；点击坐标从观测面实时读取）。
    await page.getByTestId('viewcube-menu-trigger').click();
    await page.getByTestId('viewcube-menu-zoom-fit').click();
    await page.getByTestId('viewcube-menu-trigger').click();
    await page.getByTestId('viewcube-menu-view-normal-to-sketch').click();
    await page.waitForTimeout(600);

    const glyph = page.locator('[data-testid="sketch-constraint-glyph"][data-constraint-id="101"]').first();
    const dimensionLabel = page.locator('[data-testid="sketch-dimension-label"][data-constraint-id="103"]').first();
    await expect(glyph).toHaveCount(1, { timeout: 30_000 });
    await expect(glyph).toHaveAttribute('data-kind', 'horizontal');
    await expect(dimensionLabel).toHaveCount(1);

    // ADR-0018 S1g：「显示约束」关闭同时隐藏非尺寸 glyph 与尺寸标注（live 实测）。
    const showConstraints = page.getByRole('checkbox', { name: '显示约束' });
    await expect(showConstraints).toBeChecked();
    await showConstraints.click();
    await expect(showConstraints).not.toBeChecked();
    await expect(glyph).toHaveCount(0);
    await expect(dimensionLabel).toHaveCount(0);
    await showConstraints.click();
    await expect(showConstraints).toBeChecked();
    await expect(glyph).toHaveCount(1);
    await expect(dimensionLabel).toHaveCount(1);

    const centerAttr = await glyph.getAttribute('data-center');
    expect(centerAttr).not.toBeNull();
    const [xText, yText] = centerAttr!.split(',');
    const center: Point = { x: Number(xText), y: Number(yText) };
    expect(Number.isFinite(center.x)).toBe(true);
    expect(Number.isFinite(center.y)).toBe(true);

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + center.x, box!.y + center.y);

    await expect(glyph).toHaveAttribute('data-selected', 'true', { timeout: 10_000 });
    await expect(page.locator('.part-studio-constraint-glyph-highlight')).toHaveCount(1);

    await page.keyboard.press('Delete');
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      return (sketch?.constraints ?? []).map((constraint) => constraint.id).sort((a, b) => a - b);
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toEqual([102, 103]);
    await expect(glyph).toHaveCount(0, { timeout: 10_000 });
    // 另一条约束的 glyph 仍在。
    await expect(page.locator('[data-testid="sketch-constraint-glyph"][data-constraint-id="102"]')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('part-studio-sketch-dialog')).toHaveCount(0);
  });
});
