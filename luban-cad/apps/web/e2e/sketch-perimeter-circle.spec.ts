/**
 * 周边圆工具（Sketch.PerimeterCircle）真栈首切片，2026-11-09。
 *
 * 证据：Onshape 圆飞菜单「Perimeter circle」——圆上依次拾取三点定圆。
 * 本 spec 走真实 ribbon/画布：三点 (10,0)/(0,10)/(−10,0) → 1 个整圆
 * （center≈(0,0)、r≈10，不生成圆心点）；完成草图 → reload 重开仍在。
 */
import { expect, test } from '@playwright/test';
import type { SketchDto, SketchEntityDto } from '@luban-cad/shared';
import { getApiToken, getFeatureTreeRpc, getSketchRpc, openSeedImodelEditor } from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import {
  P,
  activate,
  chooseSketchPlaneInViewport,
  clickWorld,
  disableSnap,
  finishSketch,
  setStandardView,
} from './tutorial2-helpers.js';

type Ctx = Awaited<ReturnType<typeof openSeedImodelEditor>>;
type CircleEntity = Extract<SketchEntityDto, { kind: 'circle' }>;

async function latestSketch(ctx: Ctx, token: string): Promise<SketchDto> {
  const tree = await getFeatureTreeRpc(ctx, token);
  const id = tree.filter((row) => row.featureType === 'sketch').at(-1)?.id;
  expect(id, '树内应有 sketch 行').toBeTruthy();
  const sketch = await getSketchRpc(ctx, id!, token);
  expect(sketch).toBeDefined();
  return sketch!;
}

test.describe('周边圆工具（Sketch.PerimeterCircle）', () => {
  test('真实 ribbon：圆上三点 → circle / 完成草图 / reload 重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 120_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const ctx = await openSeedImodelEditor(page, seed);

    await page.getByRole('button', { name: '草图', exact: true }).click();
    const dialog = page.getByTestId('part-studio-sketch-dialog');
    await expect(dialog).toBeVisible();
    await chooseSketchPlaneInViewport(page, 'front');
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const hub = { x: box.x, y: box.y };
    await setStandardView(page, 4, {
      low: { x: -100, y: -100, z: -100 }, high: { x: 100, y: 100, z: 100 },
    });
    await disableSnap(page);

    await activate(page, '3 点圆');
    await clickWorld(page, hub, P(10, 0));
    await clickWorld(page, hub, P(0, 10));
    await clickWorld(page, hub, P(-10, 0));
    await page.waitForTimeout(1_500);

    const after = await latestSketch(ctx, token);
    const circles = after.entities.filter((e): e is CircleEntity => e.kind === 'circle');
    expect(circles).toHaveLength(1);
    const circle = circles[0]!;
    expect(circle.radius).toBeGreaterThan(9);
    expect(circle.radius).toBeLessThan(11);
    if (typeof circle.center !== 'number') {
      expect(Math.abs(circle.center.x)).toBeLessThan(1);
      expect(Math.abs(circle.center.y)).toBeLessThan(1);
    }
    // Onshape 三次点样式不生成圆心点实体。
    expect(after.entities.filter((e) => e.kind === 'point')).toHaveLength(0);

    await finishSketch(page);
    expect((await getFeatureTreeRpc(ctx, token)).some((row) => row.featureType === 'sketch')).toBe(true);

    await page.reload();
    const reopened = await openSeedImodelEditor(page, seed);
    const persisted = await latestSketch(reopened, token);
    expect(persisted.entities.filter((e) => e.kind === 'circle')).toHaveLength(1);
  });
});
