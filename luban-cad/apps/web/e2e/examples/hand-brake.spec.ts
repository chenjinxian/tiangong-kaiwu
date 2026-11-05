/**
 * 示例 iModel 演示 #11：Exercise: Hand Brake Update（Onshape Training Repo）。
 *
 * 场景：scenarios/Onshape-Training-Repo-91f152e2325e166b5ae98f4d-031b0afd8ef29bf2fd26bf52.scenario.json
 *
 * 原示例：sketch → Revolve 1（full 360 NEW）→ Chamfer 1（1 mm）。
 * 采集草图由矩形 + 右端 r7.5 圆 + 内线组成；面域引擎当前不合并重叠闭环，
 * 因此按其**面域并集的外边界**重建上半侧单一封闭轮廓（1 线 + 1 大弧 + 2 线，
 * 面积 428.858 mm²），再绕底边全周旋转；体积与 Onshape 目标一致。
 *
 * 构建方式：草图 RPC（重建轮廓）；旋转、倒角均为真实 UI（倒角经视口拾取
 * 左端圆边，equal distance 1 mm）。
 */
import { expect, test } from '@playwright/test';
import type { SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc, assertFeatureOpOk, borrowWriteLease, getApiToken,
  getFeatureTreeRpc, getMassPropertiesRpc,
} from '../helpers.js';
import {
  chooseProfileRegionsInViewport, dataPoint, disableSnap, frameStandardView, projectWorld,
} from '../tutorial2-helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { demoShot } from './demo.js';
import {
  ensureExampleImodel, listExampleChangesets, openExampleEditor, pushExampleChanges,
} from './imodel.js';

const EXAMPLE_NAME = 'Exercise - Hand Brake Update';
const DEMO_DIR = 'demo-artifacts/examples/hand-brake';
const EXPECTED_VOLUME_MM3 = 7125.2741608;
type Range = { low: { x: number; y: number; z: number }; high: { x: number; y: number; z: number } };

const R = 7.5;
const TOP_Y = 5;
const X_TOP = 75 - Math.sqrt(R * R - TOP_Y * TOP_Y);
const SWEEP = Math.atan2(TOP_Y, X_TOP - 75);
const PLANE: SketchPlaneDto = { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: -1, z: 0 }, xDir: { x: 1, y: 0, z: 0 } };
const ENTITIES: SketchEntityDto[] = [
  { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 82.5, y: 0 } },
  { kind: 'arc', id: 2, center: { x: 75, y: 0 }, radius: R, startAngle: 0, sweepAngle: SWEEP },
  { kind: 'line', id: 3, p1: { x: X_TOP, y: TOP_Y }, p2: { x: 0, y: TOP_Y } },
  { kind: 'line', id: 4, p1: { x: 0, y: TOP_Y }, p2: { x: 0, y: 0 } },
];
const RANGE: Range = { low: { x: -10, y: -20, z: -20 }, high: { x: 95, y: 20, z: 20 } };

test.describe('示例 iModel：Hand Brake Update', () => {
  test('并集轮廓 + 全周旋转 + 1 mm 倒角 → 推送 → 重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, EXAMPLE_NAME, {
      reset: process.env.EXAMPLE_RESET === '1',
    });
    let ctx = await openExampleEditor(page, ids);
    await demoShot(page, {
      dir: DEMO_DIR, index: 1, slug: 'part-studio',
      title: '1. 打开对应 iModel', detail: `${EXAMPLE_NAME} · 空白 Part Studio。`,
    });

    const lease = await borrowWriteLease(ctx, token, 'example-hand-brake-sketch');
    const sketch = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: ENTITIES, constraints: [], plane: PLANE,
    }, lease, token);
    assertFeatureOpOk(sketch, 'Hand Brake Sketch');
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    const featureList = page.getByTestId('part-studio-feature-list');
    const sketchRow = featureList.getByRole('button', { name: /草图/ }).last();
    await expect(sketchRow).toBeVisible({ timeout: 60_000 });
    await sketchRow.dblclick();
    const sketchDialog = page.getByTestId('part-studio-sketch-dialog');
    await expect(sketchDialog).toBeVisible({ timeout: 30_000 });
    await frameStandardView(page, 4, RANGE, { left: 0.3, right: 0.15, top: 0.15, bottom: 0.12 });
    await disableSnap(page);
    await expect(sketchDialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 30_000 });
    await demoShot(page, {
      dir: DEMO_DIR, index: 2, slug: 'exact-sketch',
      title: '2. 面域并集外边界轮廓', detail: '1 线 + 1 大弧 + 2 线；面积 428.858 mm²（原示例 4 面域并集的上半侧）。',
    });
    await sketchDialog.getByRole('button', { name: '确认' }).click();
    await expect(sketchDialog).toBeHidden({ timeout: 30_000 });

    // 旋转：面域 0 + 轴线 1 + 全周 + 新建。
    const dialog = page.getByTestId('part-studio-feature-dialog');
    await page.getByRole('button', { name: '旋转', exact: true }).click({ timeout: 30_000 });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await frameStandardView(page, 6, RANGE, { left: 0.15, right: 0.05, top: 0.12, bottom: 0.1 });
    await chooseProfileRegionsInViewport(page, [0]);
    await dialog.getByRole('combobox', { name: '旋转轴' }).selectOption('1', { timeout: 10_000 });
    if (await dialog.getByRole('tab', { name: '新建' }).count() > 0)
      await dialog.getByRole('tab', { name: '新建' }).click();
    await expect(dialog.getByTestId('part-studio-feature-dialog-full-revolve').locator('input')).toBeChecked();
    await demoShot(page, {
      dir: DEMO_DIR, index: 3, slug: 'revolve-dialog',
      title: '3. 真实 UI 旋转 360°（新建）', detail: '面域 0、旋转轴 = 底边 1、全方位、新建。',
    });
    await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 20_000 });
    await dialog.getByRole('button', { name: '确认' }).click({ timeout: 30_000 });
    await expect(
      featureList.getByRole('button', { name: /旋转/ }).or(dialog.getByTestId('part-studio-feature-dialog-error')),
    ).toBeVisible({ timeout: 120_000 });
    if ((await dialog.getByTestId('part-studio-feature-dialog-error').count()) > 0)
      throw new Error(`旋转拒收: ${await dialog.getByTestId('part-studio-feature-dialog-error').textContent()}`);
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await page.waitForTimeout(2_500);
    await frameStandardView(page, 6, RANGE, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    const massRevolve = await getMassPropertiesRpc(ctx, token);
    const volumeRevolve = massRevolve.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[hand-brake] revolve volume=${volumeRevolve.toFixed(3)} mm³`);
    await demoShot(page, {
      dir: DEMO_DIR, index: 4, slug: 'revolve-result',
      title: '4. 全周旋转结果', detail: `单 body；体积 ${volumeRevolve.toFixed(3)} mm³。`,
    });

    // 倒角：真实 UI（ribbon → 视口拾取左端圆边 → equal distance 1 mm）。
    const chamferDialog = page.getByTestId('part-studio-feature-dialog');
    await page.getByRole('button', { name: '倒角', exact: true }).click({ timeout: 30_000 });
    await expect(chamferDialog).toBeVisible({ timeout: 30_000 });
    const addEdge = chamferDialog.getByTestId('part-studio-feature-dialog-add-edge');
    await addEdge.click();
    await expect(addEdge).toHaveAttribute('aria-pressed', 'true');
    await frameStandardView(page, 6, RANGE, { left: 0.15, right: 0.05, top: 0.12, bottom: 0.1 });
    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const canvasBox = await canvas.boundingBox();
    if (!canvasBox) throw new Error('倒角拾取：无画布');
    const chips = chamferDialog.getByTestId('part-studio-feature-dialog-edge-chips').locator('li');
    const chipCount = async (): Promise<number> => chips.count().catch(() => 0);
    const rimPoints = [
      { x: 0, y: 5, z: 0 }, { x: 0, y: 0, z: 5 },
      { x: 0, y: -5, z: 0 }, { x: 0, y: 0, z: -5 },
    ];
    let picked = 0;
    for (const world of rimPoints) {
      if (picked > 0) break;
      const [screen] = await projectWorld(page, { x: canvasBox.x, y: canvasBox.y }, [world]);
      if (!screen) continue;
      await dataPoint(page, screen.x, screen.y);
      picked = await chipCount();
    }
    expect(picked, '应在左端圆边上拾到一条边').toBe(1);
    await addEdge.click();
    await expect(addEdge).toHaveAttribute('aria-pressed', 'false');
    await chamferDialog.getByRole('textbox', { name: '距离' }).fill('1');
    await expect(chamferDialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 15_000 });
    await demoShot(page, {
      dir: DEMO_DIR, index: 5, slug: 'chamfer-dialog',
      title: '5. 真实 UI 倒角（拾取左端圆边 + 1 mm）', detail: '视口拾取边 1 条；equal distance 1 mm。',
    });
    await chamferDialog.getByRole('button', { name: '确认' }).click({ timeout: 30_000 });
    await expect(
      featureList.getByRole('button', { name: /倒角/ })
        .or(chamferDialog.getByTestId('part-studio-feature-dialog-error')),
    ).toBeVisible({ timeout: 120_000 });
    if ((await chamferDialog.getByTestId('part-studio-feature-dialog-error').count()) > 0)
      throw new Error(`倒角拒收: ${await chamferDialog.getByTestId('part-studio-feature-dialog-error').textContent()}`);
    await expect(chamferDialog).toBeHidden({ timeout: 30_000 });
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    await page.waitForTimeout(2_500);
    await frameStandardView(page, 6, RANGE, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    const mass = await getMassPropertiesRpc(ctx, token);
    const volume = mass.reduce((sum, entry) => sum + entry.volume, 0);
    const tree = await getFeatureTreeRpc(ctx, token);
    console.log(`[hand-brake] final volume=${volume.toFixed(3)} expected=${EXPECTED_VOLUME_MM3}`);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'revolve', 'chamfer']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);
    expect(mass.length).toBe(1);
    await demoShot(page, {
      dir: DEMO_DIR, index: 6, slug: 'chamfer-result',
      title: '6. 倒角结果', detail: `左端圆边 1 mm；最终体积 ${volume.toFixed(3)} mm³（目标 ${EXPECTED_VOLUME_MM3}）。`,
    });

    await pushExampleChanges(page, `Onshape example: ${EXAMPLE_NAME}`);
    const changesets = await listExampleChangesets(request, token, ctx.imodelId);
    expect(changesets.some((entry) => (entry.description ?? '').includes(EXAMPLE_NAME))).toBe(true);
    await demoShot(page, {
      dir: DEMO_DIR, index: 7, slug: 'pushed',
      title: '7. 推送到 hub', detail: '示例 changeset 已持久化。',
    });

    await page.reload();
    await openExampleEditor(page, ids);
    const reopened = await getFeatureTreeRpc(ctx, token);
    expect(reopened.map((row) => row.featureType)).toEqual(['sketch', 'revolve', 'chamfer']);
    const reopenedMass = await getMassPropertiesRpc(ctx, token);
    expect(reopenedMass.reduce((sum, entry) => sum + entry.volume, 0) / EXPECTED_VOLUME_MM3).toBeGreaterThan(0.98);
    await page.waitForTimeout(2_000);
    await frameStandardView(page, 6, RANGE, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    await demoShot(page, {
      dir: DEMO_DIR, index: 8, slug: 'reopened',
      title: '8. 重开 iModel 验证', detail: '特征树 3 项、单 body、体积仍在。',
    });
  });
});
