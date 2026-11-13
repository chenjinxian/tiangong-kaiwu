/**
 * 草图「同心」约束（2026-11-13，live 工具栏补齐后的功能切片）：
 * 两圆 → ribbon 约束飞菜单「同心」(shift+o 入口同工具) → 点击两圆周 →
 * updateSketch 提交 → 求解器把第二圆心移到第一圆心；约束落库 kind=concentric。
 * 后端契约/求解器早已支持（shared SketchConstraintDto + SlvsSolver v1.23）。
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
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
import { activate, clickWorld, finishSketch } from './tutorial2-helpers';

const TOP: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

const CIRCLES: SketchEntityDto[] = [
  { kind: 'circle', id: 21, center: { x: 0, y: 0 }, radius: 10 },
  { kind: 'circle', id: 22, center: { x: 30, y: 0 }, radius: 10 },
];

const pointOf = (value: { x: number; y: number } | number, points: Map<number, { x: number; y: number }>) =>
  typeof value === 'number' ? points.get(value) : value;

async function canvasHub(page: Page): Promise<{ x: number; y: number }> {
  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 90_000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas boundingBox 不可得');
  return { x: box.x, y: box.y };
}

test.describe('草图同心约束（Sketch.Constraint.Concentric）', () => {
  test('点两个圆 → 圆心重合落库；完成草图后读回', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const openWithRetry = async () => {
      try {
        return await openSeedImodelEditor(page, seed);
      } catch {
        await page.reload();
        return await openSeedImodelEditor(page, seed);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'sketch-concentric');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: CIRCLES, constraints: [], plane: TOP,
    }, lease, token);
    assertFeatureOpOk(created, '草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openWithRetry();
    const row = page.getByTestId(`tree-row-${sketchId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.dblclick({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => page.evaluate(() =>
      (window as any).__lubanE2EApp?.usePartStudioStore?.getState().sketch.isActive,
    ), { timeout: 30_000 }).toBe(true);

    const hub = await canvasHub(page);
    await activate(page, '同心');
    // 两圆周上的世界点（Top 平面：world = local）。
    await clickWorld(page, hub, { x: 10, y: 0, z: 0 });
    await clickWorld(page, hub, { x: 40, y: 0, z: 0 });

    await expect.poll(async () => (await getSketchRpc(ctx, sketchId, token))?.constraints.map((c) => c.kind), {
      timeout: 30_000,
      intervals: [300, 600, 1200],
    }).toEqual(['concentric']);

    const sketch = await getSketchRpc(ctx, sketchId, token);
    expect(sketch).toBeDefined();
    const points = new Map<number, { x: number; y: number }>();
    for (const entity of sketch!.entities) {
      if (entity.kind === 'point' && entity.x !== undefined && entity.y !== undefined)
        points.set(entity.id, { x: entity.x, y: entity.y });
    }
    const circles = sketch!.entities.filter((entity) => entity.kind === 'circle');
    expect(circles).toHaveLength(2);
    const centers = circles.map((circle) => pointOf(circle.center, points));
    expect(centers[0]).toBeDefined();
    expect(centers[1]).toBeDefined();
    expect(centers[1]!.x).toBeCloseTo(centers[0]!.x, 5);
    expect(centers[1]!.y).toBeCloseTo(centers[0]!.y, 5);

    await finishSketch(page);
    const after = await getSketchRpc(ctx, sketchId, token);
    expect(after?.constraints.map((c) => c.kind)).toEqual(['concentric']);
  });
});
