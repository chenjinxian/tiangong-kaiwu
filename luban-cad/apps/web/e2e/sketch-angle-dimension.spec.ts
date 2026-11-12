/**
 * 草图角度尺寸真栈验收（ADR-0018 S1h，2026-11-12）。
 *
 * 覆盖：两线夹角约束在视口绘制「度数」角度标注 → 双击度数 → 输入 45 →
 * Enter → 后端 updateSketchConstraint（shared 弧度量）按度换算提交、重解算 →
 * getSketch 角度值 π/4；重开草图仍为 45°。
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

const ANGLE_CONSTRAINT_ID = 8;

const ENTITIES: SketchEntityDto[] = [
  { kind: 'point', id: 1, x: 0, y: 0 },
  { kind: 'point', id: 2, x: 10, y: 0 },
  { kind: 'point', id: 3, x: 0, y: 10 },
  { kind: 'line', id: 4, p1: 1, p2: 2 },
  { kind: 'line', id: 5, p1: 1, p2: 3 },
];

const CONSTRAINTS: SketchConstraintDto[] = [
  { kind: 'fixed', id: 6, refs: [1] },
  { kind: 'horizontal', id: 7, refs: [4] },
  { kind: 'angle', id: ANGLE_CONSTRAINT_ID, refs: [4, 5], value: Math.PI / 2 },
];

interface Point { x: number; y: number }

test.describe('草图角度尺寸（Onshape 对拍）', () => {
  test('度数标注可见；双击 90° → 45° → 契约弧度重解算并持久化', async ({ page, request }) => {
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

    const lease = await borrowWriteLease(ctx, token, 'sketch-angle-dimension');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: ENTITIES, constraints: CONSTRAINTS, plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    const enterSketch = async (): Promise<void> => {
      await page.reload();
      ctx = await openWithRetry();
      const sketchRow = page.getByTestId(`tree-row-${sketchId}`);
      await expect(sketchRow).toBeVisible({ timeout: 60_000 });
      await sketchRow.dblclick({ timeout: 30_000 });
      await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });
      await page.getByRole('button', { name: '缩放到合适大小' }).click();
      await page.getByRole('button', { name: '正视草图平面' }).click();
      await page.waitForTimeout(600);
    };
    await enterSketch();

    const initial = await getSketchRpc(ctx, sketchId, token);
    expect(initial?.constraints.find((constraint) => constraint.id === ANGLE_CONSTRAINT_ID)?.value)
      .toBeCloseTo(Math.PI / 2, 6);

    const marker = page.locator(`[data-testid="sketch-dimension-label"][data-constraint-id="${ANGLE_CONSTRAINT_ID}"]`);
    await expect(marker).toBeAttached({ timeout: 30_000 });
    const center = await marker.getAttribute('data-center');
    expect(center).not.toBeNull();
    const parts = center!.split(',').map(Number);
    const point: Point = { x: parts[0] ?? 0, y: parts[1] ?? 0 };
    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.dblclick(box!.x + point.x, box!.y + point.y);

    const input = page.getByTestId('sketch-dimension-input');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('90');
    await input.fill('45');
    await input.press('Enter');
    await expect(input).toHaveCount(0, { timeout: 30_000 });

    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      return sketch?.constraints.find((constraint) => constraint.id === ANGLE_CONSTRAINT_ID)?.value;
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBeCloseTo(Math.PI / 4, 6);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('part-studio-sketch-dialog')).toHaveCount(0);

    // 重开草图仍为 45°（回写 params + 解算坐标）。
    await enterSketch();
    const reopened = await getSketchRpc(ctx, sketchId, token);
    expect(reopened?.constraints.find((constraint) => constraint.id === ANGLE_CONSTRAINT_ID)?.value)
      .toBeCloseTo(Math.PI / 4, 6);
    await expect(page.locator(`[data-testid="sketch-dimension-label"][data-constraint-id="${ANGLE_CONSTRAINT_ID}"]`))
      .toBeAttached({ timeout: 30_000 });
    await page.keyboard.press('Escape');
  });
});
