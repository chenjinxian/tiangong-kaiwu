/**
 * 示例 iModel 演示 #10：Tutorial 2 - Build Your First Part - iOS（Onshape）。
 *
 * 场景：scenarios/Onshape-d4232cec2345103a74d1d381-25c55355695ddf868ec46c44.scenario.json
 *
 * 原示例：Front 平面 Sketch（2 大圆 + 2 切线 + 2 内圆，17 条约束）→
 * Extrude 1 NEW 25 mm（3 个材料面域）→ Extrude 2 ADD 50 mm（Onshape 为 imprint-face，
 * 本复刻按同一草图的左环面域 1 对称 50 mm，几何等价）→ Chamfer 2 mm（3 条 cap 边）。
 * 目标 157478.9 mm³。
 *
 * 构建方式（诚实标注）：
 * - 草图：RPC 精确复原（实体 + 全部 17 条约束；求解 dof=0）；
 * - 两次拉伸、倒角：真实 UI；
 * - 倒角 3 条边 = Onshape 采集的 CAP_EDGE 语义：Extrude 2 端盖 r25 外圆 +
 *   Extrude 2 端盖 r10 孔边 + Extrude 1 端盖 r10 孔边（+y/-y 两侧分别取景拾取）。
 */
import { expect, test } from '@playwright/test';
import type { SketchConstraintDto, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
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

const EXAMPLE_NAME = 'Tutorial 2 - Build Your First Part - iOS';
const DEMO_DIR = 'demo-artifacts/examples/tutorial-2-ios';
const EXPECTED_VOLUME_MM3 = 157478.9;
type Range = { low: { x: number; y: number; z: number }; high: { x: number; y: number; z: number } };

const PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: -1, z: 0 },
  xDir: { x: 1, y: 0, z: 0 },
};
const ENTITIES: SketchEntityDto[] = [
  { kind: 'circle', id: 1, center: { x: 0, y: 0 }, radius: 25 },
  { kind: 'circle', id: 2, center: { x: 90, y: 0 }, radius: 17.5 },
  { kind: 'line', id: 3, p1: { x: 2.083333333333326, y: 24.913043214794584 }, p2: { x: 91.45833333333334, y: 17.439130250356207 } },
  { kind: 'line', id: 4, p1: { x: 2.083333333333326, y: -24.91304321479458 }, p2: { x: 91.45833333333334, y: -17.439130250356204 } },
  { kind: 'circle', id: 5, center: { x: 0, y: 0 }, radius: 10 },
  { kind: 'circle', id: 6, center: { x: 90, y: 0 }, radius: 10 },
];
const CONSTRAINTS: SketchConstraintDto[] = [
  { kind: 'coincident', id: 1, refs: [{ entity: 1, part: 'center' }, { origin: true }] },
  { kind: 'diameter', id: 2, refs: [1], value: 50 },
  { kind: 'diameter', id: 4, refs: [2], value: 35 },
  { kind: 'distance', id: 5, refs: [{ entity: 2, part: 'center' }, { entity: 1, part: 'center' }], value: 90 },
  { kind: 'coincident', id: 6, refs: [{ entity: 3, part: 'start' }, 1] },
  { kind: 'coincident', id: 7, refs: [{ entity: 3, part: 'end' }, 2] },
  { kind: 'tangent', id: 8, refs: [3, 2] },
  { kind: 'coincident', id: 9, refs: [{ entity: 4, part: 'start' }, 1] },
  { kind: 'coincident', id: 10, refs: [{ entity: 4, part: 'end' }, 2] },
  { kind: 'tangent', id: 11, refs: [4, 2] },
  { kind: 'tangent', id: 12, refs: [3, 1] },
  { kind: 'tangent', id: 13, refs: [4, 1] },
  { kind: 'coincident', id: 14, refs: [{ entity: 5, part: 'center' }, { entity: 1, part: 'center' }] },
  { kind: 'coincident', id: 15, refs: [{ entity: 6, part: 'center' }, { entity: 2, part: 'center' }] },
  { kind: 'diameter', id: 16, refs: [6], value: 20 },
  { kind: 'equal', id: 17, refs: [6, 5] },
];
const RANGE: Range = { low: { x: -40, y: -35, z: -35 }, high: { x: 120, y: 35, z: 35 } };

test.describe('示例 iModel：Tutorial 2 iOS', () => {
  test('约束草图 + 两次拉伸 + 倒角 → 推送 → 重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 1_200_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, EXAMPLE_NAME, {
      reset: process.env.EXAMPLE_RESET === '1',
    });
    let ctx = await openExampleEditor(page, ids);
    await demoShot(page, {
      dir: DEMO_DIR, index: 1, slug: 'part-studio',
      title: '1. 打开对应 iModel', detail: `${EXAMPLE_NAME} · 空白 Part Studio。`,
    });

    const lease = await borrowWriteLease(ctx, token, 'example-ios-sketch');
    const sketch = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: ENTITIES, constraints: CONSTRAINTS, plane: PLANE,
    }, lease, token);
    assertFeatureOpOk(sketch, 'iOS Sketch');
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
      title: '2. 精确复原 Sketch（17 约束，dof=0）', detail: '2 大圆 + 2 切线 + 2 内圆；RPC 走同一 FeatureOp/求解器管道。',
    });
    await sketchDialog.getByRole('button', { name: '确认' }).click();
    await expect(sketchDialog).toBeHidden({ timeout: 30_000 });

    const dialog = page.getByTestId('part-studio-feature-dialog');
    const openExtrude = async (regions: number[], opts: { scope: '新建' | '加入'; distance: string; symmetric?: boolean }) => {
      await page.getByRole('button', { name: '拉伸', exact: true }).click({ timeout: 30_000 });
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await frameStandardView(page, 4, RANGE, { left: 0.15, right: 0.05, top: 0.12, bottom: 0.1 });
      await chooseProfileRegionsInViewport(page, regions);
      if (opts.scope !== '新建') await dialog.getByRole('tab', { name: opts.scope }).click({ timeout: 15_000 });
      await dialog.getByLabel('深度').fill(opts.distance, { timeout: 10_000 });
      if (opts.symmetric) {
        const box = dialog.getByTestId('part-studio-feature-dialog-symmetric-flat').locator('input');
        if (!(await box.isChecked())) await box.check();
      }
      await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 20_000 });
    };
    const confirmExtrude = async (label: string) => {
      await dialog.getByRole('button', { name: '确认' }).click({ timeout: 30_000 });
      await expect(
        featureList.getByRole('button', { name: /拉伸/ }).last()
          .or(dialog.getByTestId('part-studio-feature-dialog-error')),
      ).toBeVisible({ timeout: 180_000 });
      if ((await dialog.getByTestId('part-studio-feature-dialog-error').count()) > 0)
        throw new Error(`${label}拒收: ${await dialog.getByTestId('part-studio-feature-dialog-error').textContent()}`);
      await expect(dialog).toBeHidden({ timeout: 30_000 });
    };

    await openExtrude([0, 1, 2], { scope: '新建', distance: '25' });
    await demoShot(page, {
      dir: DEMO_DIR, index: 3, slug: 'extrude-1-dialog',
      title: '3. 真实 UI 拉伸 1（新建，25 mm）', detail: '3 个材料面域；孔面域不参与拉伸。',
    });
    await confirmExtrude('拉伸 1');
    await page.waitForTimeout(2_500);
    await frameStandardView(page, 4, RANGE, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    await demoShot(page, {
      dir: DEMO_DIR, index: 4, slug: 'extrude-1-result',
      title: '4. 拉伸 1 结果', detail: 'E1 后体积约 116.8 cm³。',
    });

    await openExtrude([1], { scope: '加入', distance: '50', symmetric: true });
    await demoShot(page, {
      dir: DEMO_DIR, index: 5, slug: 'extrude-2-dialog',
      title: '5. 真实 UI 拉伸 2（加入，对称 50 mm）', detail: '左环面域 1；原示例为 imprint-face，本例按同草图等价面域。',
    });
    await confirmExtrude('拉伸 2');
    await page.waitForTimeout(2_500);
    await frameStandardView(page, 4, RANGE, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    const mass2 = await getMassPropertiesRpc(ctx, token);
    const volume2 = mass2.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[ios-example] E2 volume=${volume2.toFixed(1)} mm³`);
    await demoShot(page, {
      dir: DEMO_DIR, index: 6, slug: 'extrude-2-result',
      title: '6. 拉伸 2 结果', detail: `E2 后体积 ${volume2.toFixed(1)} mm³（目标 ${EXPECTED_VOLUME_MM3}）。`,
    });

    // 倒角：真实 UI。Onshape 的 3 条 CAP_EDGE 分处 +y / −y 端盖，按朝向分别取景拾取。
    await page.getByRole('button', { name: '倒角', exact: true }).click({ timeout: 30_000 });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    const addEdge = dialog.getByTestId('part-studio-feature-dialog-add-edge');
    await addEdge.click();
    await expect(addEdge).toHaveAttribute('aria-pressed', 'true');
    const chips = dialog.getByTestId('part-studio-feature-dialog-edge-chips').locator('li');
    const canvasBox = await page.getByTestId('part-studio-viewport').locator('canvas').first().boundingBox();
    if (!canvasBox) throw new Error('倒角拾取：无画布');
    const picks = [
      { view: 5, world: { x: 0, y: 25, z: 25 }, label: 'Extrude 2 端盖 r25' },
      { view: 5, world: { x: 0, y: 25, z: 10 }, label: 'Extrude 2 端盖 r10' },
      { view: 4, world: { x: 90, y: -25, z: 10 }, label: 'Extrude 1 端盖 r10' },
    ];
    let currentView = 0;
    for (const pick of picks) {
      if (pick.view !== currentView) {
        await frameStandardView(page, pick.view, RANGE, { left: 0.15, right: 0.05, top: 0.12, bottom: 0.1 });
        currentView = pick.view;
      }
      const [screen] = await projectWorld(page, { x: canvasBox.x, y: canvasBox.y }, [pick.world]);
      if (!screen) throw new Error(`${pick.label} 投影失败`);
      await dataPoint(page, screen.x, screen.y);
    }
    await expect(chips, '三条 cap 边应全部入集').toHaveCount(3, { timeout: 15_000 });
    await addEdge.click();
    await expect(addEdge).toHaveAttribute('aria-pressed', 'false');
    await dialog.getByRole('textbox', { name: '距离' }).fill('2');
    await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 15_000 });
    // 后端影子求值几何 → TileRpc 动态预览（2026-11-08 接入 chamfer）。
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    await frameStandardView(page, 6, RANGE, { left: 0.55, right: 0.05, top: 0.08, bottom: 0.22 });
    await demoShot(page, {
      dir: DEMO_DIR, index: 7, slug: 'chamfer-dialog',
      title: '7. 真实 UI 倒角（3 条 cap 边 + 2 mm）', detail: 'Extrude 2 端盖 r25/r10 + Extrude 1 端盖 r10；equal distance 2 mm。',
    });
    await dialog.getByRole('button', { name: '确认' }).click({ timeout: 30_000 });
    await expect(
      featureList.getByRole('button', { name: /倒角/ })
        .or(dialog.getByTestId('part-studio-feature-dialog-error')),
    ).toBeVisible({ timeout: 180_000 });
    if ((await dialog.getByTestId('part-studio-feature-dialog-error').count()) > 0)
      throw new Error(`倒角拒收: ${await dialog.getByTestId('part-studio-feature-dialog-error').textContent()}`);
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    await page.waitForTimeout(2_500);
    await frameStandardView(page, 6, RANGE, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    const mass = await getMassPropertiesRpc(ctx, token);
    const volume = mass.reduce((sum, entry) => sum + entry.volume, 0);
    const tree = await getFeatureTreeRpc(ctx, token);
    console.log(`[ios-example] final volume=${volume.toFixed(3)} expected=${EXPECTED_VOLUME_MM3}`);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'extrude', 'chamfer']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.001);
    expect(mass.length).toBe(1);
    await demoShot(page, {
      dir: DEMO_DIR, index: 8, slug: 'chamfer-result',
      title: '8. 倒角结果', detail: `3 条 cap 边 2 mm；最终体积 ${volume.toFixed(1)} mm³（目标 ${EXPECTED_VOLUME_MM3}）。`,
    });

    await pushExampleChanges(page, `Onshape example: ${EXAMPLE_NAME}`);
    const changesets = await listExampleChangesets(request, token, ctx.imodelId);
    expect(changesets.some((entry) => (entry.description ?? '').includes(EXAMPLE_NAME))).toBe(true);
    await demoShot(page, {
      dir: DEMO_DIR, index: 9, slug: 'pushed',
      title: '9. 推送到 hub', detail: '示例 changeset 已持久化。',
    });

    await page.reload();
    await openExampleEditor(page, ids);
    const reopened = await getFeatureTreeRpc(ctx, token);
    expect(reopened.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'extrude', 'chamfer']);
    const reopenedMass = await getMassPropertiesRpc(ctx, token);
    expect(reopenedMass.reduce((sum, entry) => sum + entry.volume, 0) / EXPECTED_VOLUME_MM3).toBeGreaterThan(0.98);
    await page.waitForTimeout(2_000);
    await frameStandardView(page, 6, RANGE, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    await demoShot(page, {
      dir: DEMO_DIR, index: 10, slug: 'reopened',
      title: '10. 重开 iModel 验证', detail: '特征树 4 项、单 body、体积仍在。',
    });
  });
});
