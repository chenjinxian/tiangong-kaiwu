/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * ADR-0006 切片 A 真栈验收（2026-11-05）：
 *   草图（矩形中心点）→ 拉伸 10mm 成体 → ribbon「孔」→ HoleDialog
 *   选草图点 + 完全贯穿 → 真内核 Subtract。
 * 只读回 RPC 断言树（sketch/extrude/hole，状态 0）与体积
 * （40×20×10 − π·2.5²·10 = 7803.65 mm³）。
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { getFeatureTreeRpc, getMassPropertiesRpc, getApiToken, openSeedImodelEditor } from './helpers';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed';
import {
  P,
  activate,
  chooseSketchPlaneInViewport,
  clickWorld,
  disableSnap,
  finishSketch,
  setStandardView,
} from './tutorial2-helpers';

type Ctx = Awaited<ReturnType<typeof openSeedImodelEditor>>;

async function boot(page: Page, request: APIRequestContext): Promise<{ ctx: Ctx; token: string; hub: { x: number; y: number } }> {
  const token = await getApiToken();
  const seed = await resetBModelSeed(request, token);
  const ctx = await openSeedImodelEditor(page, seed);

  await page.getByRole('button', { name: '草图', exact: true }).click();
  const dialog = page.getByTestId('part-studio-sketch-dialog');
  await expect(dialog).toBeVisible();
  await chooseSketchPlaneInViewport(page, 'front');
  await dialog.getByRole('button', { name: '确认' }).click();
  await expect(
    page.getByRole('toolbar', { name: '草图工具' }).or(dialog.getByTestId('part-studio-sketch-dialog-error')),
  ).toBeVisible({ timeout: 60_000 });
  if ((await dialog.getByTestId('part-studio-sketch-dialog-error').count()) > 0)
    throw new Error(`insertSketch 拒收: ${await dialog.getByTestId('part-studio-sketch-dialog-error').textContent()}`);

  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas boundingBox 不可得');
  const hub = { x: box.x, y: box.y };
  await setStandardView(page, 4, {
    low: { x: -170, y: -120, z: -100 }, high: { x: 160, y: 120, z: 120 },
  });
  await disableSnap(page);
  return { ctx, token, hub };
}

/** 草图矩形 + 10mm 拉伸成板（孔 e2e 共用前置）。 */
async function createPlate(page: Page, request: APIRequestContext): Promise<{
  ctx: Ctx; token: string; hub: { x: number; y: number }; baseVolumeMm3: number;
}> {
  const { ctx, token, hub } = await boot(page, request);

  // 40 × 20 矩形（中心点由矩形工具生成）。
  await activate(page, '拐角矩形');
  await clickWorld(page, hub, P(-20, 10));
  await clickWorld(page, hub, P(20, -10));
  await page.waitForTimeout(1_500);
  await finishSketch(page);

  // 拉伸 10mm 成体（单面域自动预选）。
  const featureDialog = page.getByTestId('part-studio-feature-dialog');
  await page.getByRole('button', { name: '拉伸', exact: true }).click();
  await expect(featureDialog).toBeVisible();
  await featureDialog.getByLabel('深度').fill('10');
  await expect(featureDialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 20_000 });
  await featureDialog.getByRole('button', { name: '确认' }).click();
  await expect(featureDialog).toBeHidden({ timeout: 90_000 });
  const tree = await getFeatureTreeRpc(ctx, token);
  expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude']);
  const baseMass = await getMassPropertiesRpc(ctx, token);
  const baseVolumeMm3 = baseMass.reduce((sum, m) => sum + m.volume, 0);
  await page.screenshot({ path: 'test-results/hole-00-plate.png' });
  return { ctx, token, hub, baseVolumeMm3 };
}

test.describe('孔（ADR-0006 切片 A/A2/A3）真栈', () => {
  test('草图点 + 完全贯穿：树落 hole 行且体积正确扣除', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS);
    const { ctx, token, baseVolumeMm3 } = await createPlate(page, request);

    // 孔：ribbon 入口 → HoleDialog（草图点 + throughAll）。
    await page.getByRole('button', { name: '孔', exact: true }).click();
    const holeDialog = page.getByTestId('part-studio-hole-dialog');
    await expect(holeDialog).toBeVisible();
    await holeDialog.getByTestId('hole-locations-toggle').click();
    const points = holeDialog.getByTestId('hole-points');
    await expect(points).toBeVisible({ timeout: 30_000 });
    await holeDialog.getByLabel('点 1').check();
    await holeDialog.getByTestId('hole-end-bound').selectOption('throughAll');
    await expect(holeDialog.getByRole('button', { name: '确认' })).toBeEnabled();
    await page.screenshot({ path: 'test-results/hole-01-simple-dialog.png' });
    await holeDialog.getByRole('button', { name: '确认' }).click();
    await expect(holeDialog).toBeHidden({ timeout: 90_000 });
    await page.screenshot({ path: 'test-results/hole-02-simple-result.png' });

    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'hole']);
    expect(tree.every((row) => row.status === 0), `特征状态：${JSON.stringify(tree.map((r) => r.status))}`).toBe(true);

    const mass = await getMassPropertiesRpc(ctx, token);
    const volumeMm3 = mass.reduce((sum, m) => sum + m.volume, 0);
    const removedMm3 = baseVolumeMm3 - volumeMm3;
    const expectedRemoved = Math.PI * 2.5 * 2.5 * 10;
    console.log(`[hole] base=${baseVolumeMm3.toFixed(3)} removed=${removedMm3.toFixed(3)} expected=${expectedRemoved.toFixed(3)} mm³`);
    // 基准体积随鼠标落点有亚毫米差；孔去材量应精确等于孔径（Ø5）×厚度（10）。
    expect(Math.abs(removedMm3 - expectedRemoved) / expectedRemoved, '孔去材量误差').toBeLessThan(0.01);
  });

  test('沉头孔：主孔贯通 + 起始面扩孔（v1.28）', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS);
    const { ctx, token, baseVolumeMm3 } = await createPlate(page, request);

    await page.getByRole('button', { name: '孔', exact: true }).click();
    const holeDialog = page.getByTestId('part-studio-hole-dialog');
    await expect(holeDialog).toBeVisible();
    await holeDialog.getByTestId('hole-locations-toggle').click();
    await expect(holeDialog.getByTestId('hole-points')).toBeVisible({ timeout: 30_000 });
    await holeDialog.getByLabel('点 1').check();
    await holeDialog.getByText('沉头孔').click();
    await holeDialog.getByTestId('hole-cbore-diameter').fill('10');
    await holeDialog.getByTestId('hole-cbore-depth').fill('3');
    await holeDialog.getByTestId('hole-end-bound').selectOption('throughAll');
    await expect(holeDialog.getByRole('button', { name: '确认' })).toBeEnabled();
    await page.screenshot({ path: 'test-results/hole-03-counterbore-dialog.png' });
    await holeDialog.getByRole('button', { name: '确认' }).click();
    await expect(holeDialog).toBeHidden({ timeout: 90_000 });
    await page.screenshot({ path: 'test-results/hole-04-counterbore-result.png' });

    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'hole']);
    expect(tree.every((row) => row.status === 0), `特征状态：${JSON.stringify(tree.map((r) => r.status))}`).toBe(true);

    const mass = await getMassPropertiesRpc(ctx, token);
    const removedMm3 = baseVolumeMm3 - mass.reduce((sum, m) => sum + m.volume, 0);
    // 主孔 Ø5 贯通（62.5π）+ 沉头 Ø10×3 环带（56.25π）。
    const expectedRemoved = Math.PI * (2.5 * 2.5 * 10 + (5 * 5 - 2.5 * 2.5) * 3);
    console.log(`[hole-counterbore] base=${baseVolumeMm3.toFixed(3)} removed=${removedMm3.toFixed(3)} expected=${expectedRemoved.toFixed(3)} mm³`);
    expect(Math.abs(removedMm3 - expectedRemoved) / expectedRemoved, '沉头孔去材量误差').toBeLessThan(0.01);
  });

  test('倒角孔：主孔贯通 + 起始面 90° 锥口（v1.32）', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS);
    const { ctx, token, baseVolumeMm3 } = await createPlate(page, request);

    await page.getByRole('button', { name: '孔', exact: true }).click();
    const holeDialog = page.getByTestId('part-studio-hole-dialog');
    await expect(holeDialog).toBeVisible();
    await holeDialog.getByTestId('hole-locations-toggle').click();
    await expect(holeDialog.getByTestId('hole-points')).toBeVisible({ timeout: 30_000 });
    await holeDialog.getByLabel('点 1').check();
    await holeDialog.getByText('倒角孔').click();
    await holeDialog.getByTestId('hole-csink-diameter').fill('10');
    await holeDialog.getByTestId('hole-csink-angle').fill('90');
    await holeDialog.getByTestId('hole-end-bound').selectOption('throughAll');
    await expect(holeDialog.getByRole('button', { name: '确认' })).toBeEnabled();
    await page.screenshot({ path: 'test-results/hole-05-countersink-dialog.png' });
    await holeDialog.getByRole('button', { name: '确认' }).click();
    await expect(holeDialog).toBeHidden({ timeout: 90_000 });
    await page.screenshot({ path: 'test-results/hole-06-countersink-result.png' });

    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'hole']);
    expect(tree.every((row) => row.status === 0), `特征状态：${JSON.stringify(tree.map((r) => r.status))}`).toBe(true);

    const mass = await getMassPropertiesRpc(ctx, token);
    const removedMm3 = baseVolumeMm3 - mass.reduce((sum, m) => sum + m.volume, 0);
    // 主孔 Ø5 贯通（62.5π）+ 90° 锥台（顶 R5→底 R2.5、深 2.5；锥体 36.458π，
    // 其中 φ5×2.5=15.625π 已被主孔覆盖）→ 83.333π mm³。
    const expectedRemoved = Math.PI * (62.5 + (2.5 / 3) * (25 + 12.5 + 6.25) - 15.625);
    console.log(`[hole-countersink] base=${baseVolumeMm3.toFixed(3)} removed=${removedMm3.toFixed(3)} expected=${expectedRemoved.toFixed(3)} mm³`);
    expect(Math.abs(removedMm3 - expectedRemoved) / expectedRemoved, '倒角孔去材量误差').toBeLessThan(0.01);
  });
});
