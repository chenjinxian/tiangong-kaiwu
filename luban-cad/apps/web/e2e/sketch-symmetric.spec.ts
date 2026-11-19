/**
 * 草图「对称」约束（2026-11-19，ADR-0022 S1；live shift+q 入口）：
 * 两个异侧点 + 固定轴线/首点 → 约束工具拾取点 A、点 B、轴线 → updateSketch
 * 提交 → 求解器用 SLVS_C_SYMMETRIC_LINE 把 B 反射到 A 关于轴线的对称位置；
 * 约束落库 kind=symmetric；完成草图后可读回。
 *
 * 本 spec 同时证明 capability gated→full：入口点击后不再走能力引导，
 * 而是真实进入三槽位拾取并提交。
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
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
import { activate, clickWorld, finishSketch } from './tutorial2-helpers';

const TOP: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

const ENTITIES: SketchEntityDto[] = [
  { kind: 'point', id: 1, x: -10, y: 5 }, // A（固定）
  { kind: 'point', id: 2, x: 12, y: -3 }, // B（初值偏，应被求解到 (10,5)）
  { kind: 'point', id: 3, x: 0, y: -20 }, // 轴线起点（固定）
  { kind: 'point', id: 4, x: 0, y: 20 }, // 轴线终点（固定）
  { kind: 'line', id: 5, p1: 3, p2: 4 }, // 轴线 x=0
];

const CONSTRAINTS: SketchConstraintDto[] = [
  { kind: 'fixed', id: 11, refs: [1] },
  { kind: 'fixed', id: 12, refs: [3] },
  { kind: 'fixed', id: 13, refs: [4] },
];

async function canvasHub(page: Page): Promise<{ x: number; y: number }> {
  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 90_000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas boundingBox 不可得');
  return { x: box.x, y: box.y };
}

test.describe('草图对称约束（Sketch.Constraint.Symmetric，ADR-0022 S1）', () => {
  test('点 A / 点 B / 轴线 → B 反射到 A 的对称位置；落库并完成草图读回', async ({ page, request }) => {
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
    const lease = await borrowWriteLease(ctx, token, 'sketch-symmetric');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: ENTITIES, constraints: CONSTRAINTS, plane: TOP,
    }, lease, token);
    assertFeatureOpOk(created, '对称草图');
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
    await activate(page, '对称');
    await clickWorld(page, hub, { x: -10, y: 5, z: 0 }); // A
    await clickWorld(page, hub, { x: 12, y: -3, z: 0 }); // B
    await clickWorld(page, hub, { x: 0, y: 10, z: 0 }); // 轴线上非端点位置

    await expect.poll(async () => (await getSketchRpc(ctx, sketchId, token))?.constraints.map((c) => c.kind), {
      timeout: 30_000,
      intervals: [300, 600, 1200],
    }).toContain('symmetric');

    const sketch = await getSketchRpc(ctx, sketchId, token);
    expect(sketch).toBeDefined();
    expect(sketch!.solve.status).not.toBe('failed');
    const points = new Map<number, { x: number; y: number }>();
    for (const entity of sketch!.entities) {
      if (entity.kind === 'point' && entity.x !== undefined && entity.y !== undefined)
        points.set(entity.id, { x: entity.x, y: entity.y });
    }
    const b = points.get(2);
    expect(b).toBeDefined();
    expect(b!.x).toBeCloseTo(10, 4);
    expect(b!.y).toBeCloseTo(5, 4);

    await finishSketch(page);
    const after = await getSketchRpc(ctx, sketchId, token);
    expect(after?.constraints.map((c) => c.kind)).toContain('symmetric');
    const afterB = after?.entities.find((entity) => entity.kind === 'point' && entity.id === 2);
    expect(afterB && afterB.kind === 'point' ? afterB.x : undefined).toBeCloseTo(10, 4);
  });
});
