/**
 * 草图「中点线」（2026-11-13 live 工具栏补齐）：线 ▾ → 中点线；首击=线段
 * 中点、次击=端点；对称线 + 中点 point + midpoint 约束落库
 *（Onshape Help: Midpoint Line，先中点后端点）。
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
import {
  P,
  activate,
  clickWorld,
  finishSketch,
} from './tutorial2-helpers';

/** 前视平面（世界 (x,0,−y)）。用 RPC 建壳保证平面与点击坐标一致。 */
const FRONT: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  xDir: { x: 1, y: 0, z: 0 },
};

type Line = Extract<SketchEntityDto, { kind: 'line' }>;
type Pt = Extract<SketchEntityDto, { kind: 'point' }>;

async function canvasHub(page: Page): Promise<{ x: number; y: number }> {
  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 90_000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas boundingBox 不可得');
  return { x: box.x, y: box.y };
}

function inline(p: Line['p1']): { x: number; y: number } {
  if (typeof p === 'number') throw new Error('中点线端点应为内联');
  return p;
}

test.describe('草图中点线（Sketch.Midline）', () => {
  test('首击中点 + 次击端点 → 对称线 + midpoint 约束 / 完成草图', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openSeedImodelEditor(page, seed);
    const lease = await borrowWriteLease(ctx, token, 'sketch-midline');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: [], constraints: [], plane: FRONT,
    }, lease, token);
    assertFeatureOpOk(created, '草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);
    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    const row = page.getByTestId(`tree-row-${sketchId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.dblclick({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => page.evaluate(() =>
      (window as any).__lubanE2EApp?.usePartStudioStore?.getState().sketch.isActive,
    ), { timeout: 30_000 }).toBe(true);

    const hub = await canvasHub(page);
    await activate(page, '中点线');
    // 中点 (0,0)，端点 (10,0) → 对称线 (-10,0)-(10,0)。
    await clickWorld(page, hub, P(0, 0));
    await clickWorld(page, hub, P(10, 0));

    await expect.poll(async () => (await getSketchRpc(ctx, sketchId, token))?.entities.length, {
      timeout: 30_000,
      intervals: [300, 600, 1200],
    }).toBe(2);

    const sketch = await getSketchRpc(ctx, sketchId, token);
    const line = sketch!.entities.find((entity): entity is Line => entity.kind === 'line');
    const mid = sketch!.entities.find((entity): entity is Pt => entity.kind === 'point');
    expect(line).toBeDefined();
    expect(mid).toBeDefined();
    const a = inline(line!.p1);
    const b = inline(line!.p2);
    // 对称：两端点关于首击点对称；y 与首击点一致（像素取整容差）。
    expect(a.x + b.x).toBeCloseTo(0, 0);
    expect(a.y + b.y).toBeCloseTo(0, 0);
    expect(Math.abs(b.x - a.x)).toBeGreaterThan(15); // 约 20 mm（首击 0、次击 10）
    expect(Math.abs(b.x - a.x)).toBeLessThan(25);
    expect(mid!.x).toBeCloseTo((a.x + b.x) / 2, 3);
    expect(mid!.y).toBeCloseTo((a.y + b.y) / 2, 3);
    expect(sketch!.constraints.map((c) => c.kind)).toEqual(['midpoint']);

    await finishSketch(page);
    const after = await getSketchRpc(ctx, sketchId, token);
    expect(after?.constraints.map((c) => c.kind)).toEqual(['midpoint']);
  });
});
