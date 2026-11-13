/**
 * 示例 iModel 演示 #6：Intro to CAD - 1.2-1.4（Onshape Training Repo）。
 *
 * 场景：scenarios/Onshape-Training-Repo-dfc6e33c9313a1939829f0ca-caa02e4e60b8a5fe0b0251bc.scenario.json
 *
 * 原示例：Front 基准面草图（2 圆 + 2 切线，3 个拉伸面域）→ 20 mm NEW，
 * Plane 1（Front 偏移 −20，反转法线）→ Sketch 2 落在 Plane 1（不参与拉伸）。
 * 目标单 body 85157.342 mm³。
 *
 * Sketch 1 / 拉伸走真实 UI（多面域视口点选）；Plane 1 与「草图落在自定义平面」
 * 走真实 cPlane/Sketch 对话框（v1.29），Sketch 2 的实体按采集数据经 RPC 注入
 * 到已建草图（避免 6 条曲线的鼠标级重绘）。
 */
import { expect, test } from '@playwright/test';
import type { SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
  getSketchRpc,
} from '../helpers.js';
import {
  chooseProfileRegionsInViewport,
  disableSnap,
  frameStandardView,
} from '../tutorial2-helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { demoShot } from './demo.js';
import {
  ensureExampleImodel,
  listExampleChangesets,
  openExampleEditor,
  pushExampleChanges,
} from './imodel.js';

const EXAMPLE_NAME = 'Intro to CAD 1.2-1.4';
const DEMO_DIR = 'demo-artifacts/examples/intro-to-cad';
const EXPECTED_VOLUME_MM3 = 85157.342;
type Range = { low: { x: number; y: number; z: number }; high: { x: number; y: number; z: number } };
type Ctx = Awaited<ReturnType<typeof openExampleEditor>>;

const PLANE_1: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: -1, z: 0 },
  xDir: { x: 1, y: 0, z: 0 },
};
const PLANE_2: SketchPlaneDto = {
  origin: { x: 0, y: -20, z: 0 },
  normal: { x: 0, y: -1, z: 0 },
  xDir: { x: 1, y: 0, z: 0 },
};

/** Sketch 1 —— 两个圆 + 两条切线，形成 3 个可选面域。 */
const SKETCH_1: SketchEntityDto[] = [
  { kind: 'circle', id: 1, center: { x: 0, y: 0 }, radius: 25 },
  { kind: 'circle', id: 2, center: { x: 80, y: 0 }, radius: 12.5 },
  { kind: 'line', id: 3, p1: { x: 80, y: 12.5 }, p2: { x: 3.9554523830435393, y: 24.685104748521432 } },
  { kind: 'line', id: 4, p1: { x: 81.953125, y: -12.346469241624302 }, p2: { x: 0, y: -25.310879886733307 } },
];

/** Sketch 2 —— 背面偏移草图（不参与拉伸）。 */
const SKETCH_2: SketchEntityDto[] = [
  { kind: 'circle', id: 1, center: { x: 0, y: 0 }, radius: 25 },
  { kind: 'circle', id: 2, center: { x: 80, y: 0 }, radius: 12.5 },
  { kind: 'circle', id: 3, center: { x: 0, y: 0 }, radius: 12.5 },
  { kind: 'line', id: 4, p1: { x: 69.11326789286673, y: 6.142398882156519 }, p2: { x: 20.789125388151724, y: 13.885685636500108 } },
  { kind: 'line', id: 5, p1: { x: 69.1844580849444, y: -6.266901394123883 }, p2: { x: 20.76141155685997, y: -13.927088359261653 } },
  { kind: 'circle', id: 6, center: { x: 80, y: 0 }, radius: 5 },
];

const RANGE_SKETCH_1: Range = {
  low: { x: -35, y: -15, z: -40 }, high: { x: 100, y: 15, z: 40 },
};
const RANGE_SKETCH_2: Range = {
  low: { x: -35, y: -40, z: -40 }, high: { x: 100, y: 0, z: 40 },
};
const RANGE_FINAL: Range = {
  low: { x: -35, y: -40, z: -40 }, high: { x: 100, y: 15, z: 40 },
};

async function insertSketch(
  ctx: Ctx, token: string, entities: SketchEntityDto[], plane: SketchPlaneDto, label: string,
): Promise<string> {
  const lease = await borrowWriteLease(ctx, token, `example-intro-${label}`);
  const result = await applyFeatureOpRpc(ctx, {
    kind: 'insertSketch', entities, constraints: [], plane,
  }, lease, token);
  assertFeatureOpOk(result, label);
  if (!result.featureId) throw new Error(`${label} 未返回 featureId`);
  return result.featureId;
}

async function openNewestSketch(page: Parameters<typeof demoShot>[0], range: Range): Promise<void> {
  const featureList = page.getByTestId('part-studio-feature-list');
  const sketchRow = featureList.getByRole('button', { name: /草图/ }).last();
  await expect(sketchRow).toBeVisible({ timeout: 60_000 });
  await sketchRow.dblclick();
  const sketchDialog = page.getByTestId('part-studio-sketch-dialog');
  await expect(sketchDialog).toBeVisible({ timeout: 30_000 });
  await frameStandardView(page, 4, range, { left: 0.3, right: 0.15, top: 0.15, bottom: 0.12 });
  await disableSnap(page);
  await expect(sketchDialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 30_000 });
}

async function finishSketch(page: Parameters<typeof demoShot>[0]): Promise<void> {
  const sketchDialog = page.getByTestId('part-studio-sketch-dialog');
  await sketchDialog.getByRole('button', { name: '确认' }).click();
  await expect(sketchDialog).toBeHidden({ timeout: 30_000 });
}

/** v1.29：真实 UI 建 Plane 1（Front 偏移 −20 + 反转法线，与采集平面一致）。 */
async function createPlane1ViaUi(page: Parameters<typeof demoShot>[0]): Promise<void> {
  await page.getByRole('button', { name: '平面', exact: true }).click();
  const dialog = page.getByTestId('part-studio-cplane-dialog');
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog).toHaveAttribute('aria-label', '平面 1');
  await dialog.getByTestId('cplane-reference-chip').click();
  await dialog.getByRole('option', { name: 'Front 平面' }).click();
  await dialog.getByTestId('cplane-offset').selectOption('offset');
  await dialog.getByTestId('cplane-offset-distance').fill('-20');
  await dialog.getByTestId('cplane-flip-normal').check();
  await demoShot(page, {
    dir: DEMO_DIR, index: 5, slug: 'cplane-dialog',
    title: '5. 真实 UI 创建 Plane 1', detail: '图元 Front 平面；偏移 −20 mm；反转法线。',
  });
  await dialog.getByRole('button', { name: '确认' }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
  await expect(
    page.getByTestId('part-studio-feature-list').getByRole('button', { name: /平面 1/ }),
  ).toBeVisible({ timeout: 60_000 });
}

/** 新建草图：平面下拉选 Plane 1，确认后进入编辑态（空草图先建壳）。 */
async function createSketch2OnPlane1ViaUi(page: Parameters<typeof demoShot>[0]): Promise<void> {
  await page.getByRole('button', { name: '草图', exact: true }).click();
  const dialog = page.getByTestId('part-studio-sketch-dialog');
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  // 2026-11-13：平面字段无下拉——树内 cPlane 行选中即成为草图平面（并自动创建）。
  await page.getByTestId('part-studio-feature-list')
    .getByRole('button', { name: /平面 1/ }).click();
  await demoShot(page, {
    dir: DEMO_DIR, index: 6, slug: 'sketch-on-plane',
    title: '6. 草图落在自定义平面', detail: '草图平面 = Plane 1（cPlane 特征引用）。',
  });
  // 同一对话框保持打开（pending 编辑）：平面字段显示来源平面，× 可清除后重选。
  await expect(dialog.getByTestId('sketch-plane-chip')).toHaveText(/平面 1/, { timeout: 60_000 });
}

test.describe('示例 iModel：Intro to CAD 1.2-1.4', () => {
  test('多面域草图 + 20 mm 拉伸 → 背面草图 → 推送 → 重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, EXAMPLE_NAME, {
      reset: process.env.EXAMPLE_RESET === '1',
    });
    let ctx: Ctx = await openExampleEditor(page, ids);
    await demoShot(page, {
      dir: DEMO_DIR, index: 1, slug: 'part-studio',
      title: '1. 打开对应 iModel', detail: `${EXAMPLE_NAME} · 空白 Part Studio。`,
    });

    await insertSketch(ctx, token, SKETCH_1, PLANE_1, 'Sketch 1');
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    await openNewestSketch(page, RANGE_SKETCH_1);
    await demoShot(page, {
      dir: DEMO_DIR, index: 2, slug: 'sketch-1',
      title: '2. 精确复原 Sketch 1', detail: 'Front 基准面；2 圆 + 2 切线，3 个可选面域。',
    });
    await finishSketch(page);

    const dialog = page.getByTestId('part-studio-feature-dialog');
    await page.getByRole('button', { name: '拉伸', exact: true }).click();
    await expect(dialog).toBeVisible();
    await frameStandardView(page, 4, RANGE_SKETCH_1, { left: 0.15, right: 0.05, top: 0.12, bottom: 0.1 });
    await chooseProfileRegionsInViewport(page, [0, 1, 2]);
    await dialog.getByLabel('深度').fill('20');
    await demoShot(page, {
      dir: DEMO_DIR, index: 3, slug: 'extrude-dialog',
      title: '3. 真实 UI 拉伸（新建，20 mm）', detail: '在视口点选面域 0 + 1 + 2。',
    });
    await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 20_000 });
    await dialog.getByRole('button', { name: '确认' }).click();
    await expect(
      page.getByTestId('part-studio-feature-list').getByRole('button', { name: /拉伸/ }).last()
        .or(dialog.getByTestId('part-studio-feature-dialog-error')),
    ).toBeVisible({ timeout: 180_000 });
    if ((await dialog.getByTestId('part-studio-feature-dialog-error').count()) > 0)
      throw new Error(`拉伸被拒收: ${await dialog.getByTestId('part-studio-feature-dialog-error').textContent()}`);
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await page.waitForTimeout(3_000);
    await frameStandardView(page, 6, RANGE_FINAL, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    await demoShot(page, {
      dir: DEMO_DIR, index: 4, slug: 'extrude-result',
      title: '4. 拉伸结果', detail: '单 body，真实内核求值。',
    });

    await createPlane1ViaUi(page);
    await createSketch2OnPlane1ViaUi(page);

    // 空草图已由 UI 建壳（plane 快照 + sourceFeatureId）；按采集数据注入精确实体。
    let tree = await getFeatureTreeRpc(ctx, token);
    const cplane = tree.find((row) => row.featureType === 'cPlane');
    expect(cplane).toBeDefined();
    const sketch2 = tree.filter((row) => row.featureType === 'sketch').at(-1)!;
    const lease = await borrowWriteLease(ctx, token, 'example-intro-sketch-2');
    const seeded = await applyFeatureOpRpc(ctx, {
      kind: 'updateSketch', sketchId: sketch2.id, entities: SKETCH_2, constraints: [],
    }, lease, token);
    assertFeatureOpOk(seeded, 'Sketch 2 实体注入');
    const stored = await getSketchRpc(ctx, sketch2.id, token);
    expect(stored?.plane?.sourceFeatureId).toBe(cplane!.id);
    expect(stored?.plane?.origin).toEqual(PLANE_2.origin);
    expect(stored?.plane?.normal).toEqual(PLANE_2.normal);
    expect(stored?.plane?.xDir).toEqual(PLANE_2.xDir);

    await page.reload();
    ctx = await openExampleEditor(page, ids);
    await openNewestSketch(page, RANGE_SKETCH_2);
    await demoShot(page, {
      dir: DEMO_DIR, index: 7, slug: 'sketch-2',
      title: '7. 精确复原 Sketch 2（Plane 1 上）', detail: 'Plane 1 = Front 偏移 −20 + 反转法线；原示例保留为未拉伸草图。',
    });
    await finishSketch(page);

    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'cPlane', 'sketch']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const mass = await getMassPropertiesRpc(ctx, token);
    const volumeMm3 = mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[intro-to-cad] volume=${volumeMm3.toFixed(3)} mm³ expected=${EXPECTED_VOLUME_MM3}`);
    expect(Math.abs(volumeMm3 - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.02);
    expect(mass.length).toBe(1);
    await page.waitForTimeout(2_000);
    await frameStandardView(page, 6, RANGE_FINAL, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    await demoShot(page, {
      dir: DEMO_DIR, index: 8, slug: 'result',
      title: '8. 最终模型', detail: `单 body；体积 ${volumeMm3.toFixed(3)} mm³（目标 ${EXPECTED_VOLUME_MM3}）。`,
    });

    await pushExampleChanges(page, `Onshape example: ${EXAMPLE_NAME}`);
    const changesets = await listExampleChangesets(request, token, ctx.imodelId);
    expect(changesets.some((changeset) => (changeset.description ?? '').includes('自动保存') || (changeset.description ?? '').includes(EXAMPLE_NAME))).toBe(true);
    await demoShot(page, {
      dir: DEMO_DIR, index: 9, slug: 'pushed',
      title: '9. 推送到 hub', detail: '示例 changeset 已持久化（含 cPlane 特征）。',
    });

    await page.reload();
    await openExampleEditor(page, ids);
    const reopened = await getFeatureTreeRpc(ctx, token);
    expect(reopened.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'cPlane', 'sketch']);
    const reopenedMass = await getMassPropertiesRpc(ctx, token);
    expect(reopenedMass.reduce((sum, entry) => sum + entry.volume, 0)).toBeGreaterThan(EXPECTED_VOLUME_MM3 * 0.98);
    await page.waitForTimeout(2_000);
    await frameStandardView(page, 6, RANGE_FINAL, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    await demoShot(page, {
      dir: DEMO_DIR, index: 10, slug: 'reopened',
      title: '10. 重开 iModel 验证', detail: '特征树（含 Plane 1）与体积仍在。',
    });
  });
});
