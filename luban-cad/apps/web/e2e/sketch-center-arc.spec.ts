/**
 * 中心点圆弧工具（Sketch.CenterArc）真栈首切片，2026-11-09。
 *
 * 证据：Onshape 圆弧飞菜单「中心点圆弧」——圆心 → 起点（定半径）→ 终点（定扫角）。
 * 本 spec 走真实 ribbon/画布：圆心 (0,0)、起点 (10,0)、终点 (0,10) →
 * 1 条 arc（r≈10、startAngle≈0、sweep≈+π/2）；完成草图 → reload 重开仍在。
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
type ArcEntity = Extract<SketchEntityDto, { kind: 'arc' }>;

async function latestSketch(ctx: Ctx, token: string): Promise<SketchDto> {
  const tree = await getFeatureTreeRpc(ctx, token);
  const id = tree.filter((row) => row.featureType === 'sketch').at(-1)?.id;
  expect(id, '树内应有 sketch 行').toBeTruthy();
  const sketch = await getSketchRpc(ctx, id!, token);
  expect(sketch).toBeDefined();
  return sketch!;
}

test.describe('中心点圆弧工具（Sketch.CenterArc）', () => {
  test('真实 ribbon：圆心+起点+终点 → arc / 完成草图 / reload 重开', async ({ page, request }) => {
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

    await activate(page, '中心圆弧');
    await clickWorld(page, hub, P(0, 0));
    await clickWorld(page, hub, P(10, 0));
    await clickWorld(page, hub, P(0, 10));
    await page.waitForTimeout(1_500);

    const after = await latestSketch(ctx, token);
    const arcs = after.entities.filter((e): e is ArcEntity => e.kind === 'arc');
    expect(arcs).toHaveLength(1);
    expect(Math.abs((arcs[0]!.radius ?? 0) - 10)).toBeLessThan(1);
    expect(Math.abs(arcs[0]!.sweepAngle ?? 0)).toBeGreaterThan(1.2);
    expect(Math.abs(arcs[0]!.sweepAngle ?? 0)).toBeLessThan(1.9);

    await finishSketch(page);
    expect((await getFeatureTreeRpc(ctx, token)).some((row) => row.featureType === 'sketch')).toBe(true);

    await page.reload();
    const reopened = await openSeedImodelEditor(page, seed);
    const persisted = await latestSketch(reopened, token);
    expect(persisted.entities.filter((e) => e.kind === 'arc')).toHaveLength(1);
  });
});
