/**
 * 贝塞尔曲线工具（Sketch.Bezier）真栈首切片，2026-11-09。
 *
 * 证据：Onshape 样条飞菜单「贝塞尔曲线」——四个控制点按 P0→P3 顺序点击。
 * 本 spec 走真实 ribbon/画布：4 个控制点 → 1 条 spline（4 controlPoints、
 * 2 fitPoints、2 条端点 coincident）；完成草图 → reload 重开仍在。
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
type SplineEntity = Extract<SketchEntityDto, { kind: 'spline' }>;

async function latestSketch(ctx: Ctx, token: string): Promise<SketchDto> {
  const tree = await getFeatureTreeRpc(ctx, token);
  const id = tree.filter((row) => row.featureType === 'sketch').at(-1)?.id;
  expect(id, '树内应有 sketch 行').toBeTruthy();
  const sketch = await getSketchRpc(ctx, id!, token);
  expect(sketch).toBeDefined();
  return sketch!;
}

test.describe('贝塞尔曲线工具（Sketch.Bezier）', () => {
  test('真实 ribbon：四个控制点 → spline / 完成草图 / reload 重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 120_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const ctx = await openSeedImodelEditor(page, seed);

    await page.getByRole('button', { name: '草图', exact: true }).click();
    const dialog = page.getByTestId('part-studio-sketch-dialog');
    await expect(dialog).toBeVisible();
    await chooseSketchPlaneInViewport(page, 'front');
    await dialog.getByRole('button', { name: '确认' }).click();
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const hub = { x: box.x, y: box.y };
    await setStandardView(page, 4, {
      low: { x: -100, y: -100, z: -100 }, high: { x: 100, y: 100, z: 100 },
    });
    await disableSnap(page);

    await activate(page, '贝塞尔曲线');
    await clickWorld(page, hub, P(0, 0));
    await clickWorld(page, hub, P(10, 10));
    await clickWorld(page, hub, P(20, -10));
    await clickWorld(page, hub, P(30, 0));
    await page.waitForTimeout(1_500);

    const after = await latestSketch(ctx, token);
    const splines = after.entities.filter((e): e is SplineEntity => e.kind === 'spline');
    expect(splines).toHaveLength(1);
    expect(splines[0]!.controlPoints).toHaveLength(4);
    expect(splines[0]!.fitPoints).toHaveLength(2);
    expect(after.constraints.filter((c) => c.kind === 'coincident')).toHaveLength(2);

    await finishSketch(page);
    expect((await getFeatureTreeRpc(ctx, token)).some((row) => row.featureType === 'sketch')).toBe(true);

    await page.reload();
    const reopened = await openSeedImodelEditor(page, seed);
    const persisted = await latestSketch(reopened, token);
    const persistedSpline = persisted.entities.find((e): e is SplineEntity => e.kind === 'spline');
    expect(persistedSpline?.controlPoints).toHaveLength(4);
  });
});
