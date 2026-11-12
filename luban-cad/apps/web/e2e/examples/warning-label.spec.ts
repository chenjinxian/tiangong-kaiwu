/**
 * 示例 iModel 演示 #4：Bench Vise - WARNING LABEL（Explore Onshape Models）。
 *
 * 场景：scenarios/Explore-Onshape-Models-85bd160fa9e256ec1938a5e7-a33d659d2e6cf76c8f9ddef5.scenario.json
 *
 * 原示例特征（按时间序）：Sketch 3 → Extrude 2(new) → Sketch 2 → Sketch 1 → Extrude 1(add)。
 * 草图全部在 Top 平面；两张矩形草图 + 一张带 3 个圆角弧的标签轮廓。
 * 原 Extrude 1 的 selection 是 imprintFace（对已有面 imprint 后加料）；本复刻用等价的
 * “Sketch 1 面域 0 → ADD 0.00254”来落同一条建模管道，几何结果一致。
 *
 * 构建方式：草图按采集数据经 RPC 精确复原（混合方式，演示页显式标注）；两次拉伸
 * 都走真实 UI 对话框。
 */
import { expect, test } from '@playwright/test';
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
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

const EXAMPLE_NAME = 'WARNING LABEL - Bench Vise';
const DEMO_DIR = 'demo-artifacts/examples/warning-label';
const TOP_PLANE = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};
// 注意量纲：scenario expected = 8.193532e-10 m³ = 0.8193532 mm³（不是 cm³）。
const EXPECTED_VOLUME_MM3 = 0.8193532;

type Ctx = Awaited<ReturnType<typeof openExampleEditor>>;

/** Sketch 3 —— 0.254 × 0.254 的底座方板。 */
const SKETCH_BASE: SketchEntityDto[] = [
  { kind: 'line', id: 1, p1: { x: -0.127, y: 0.127 }, p2: { x: 0.127, y: 0.127 } },
  { kind: 'line', id: 2, p1: { x: -0.127, y: -0.127 }, p2: { x: 0.127, y: -0.127 } },
  { kind: 'line', id: 3, p1: { x: -0.127, y: 0.127 }, p2: { x: -0.127, y: -0.127 } },
  { kind: 'line', id: 4, p1: { x: 0.127, y: 0.127 }, p2: { x: 0.127, y: -0.127 } },
];

/** Sketch 2 —— 标签轮廓（3 条直边 + 3 个圆角弧 + 2 条构造线）。 */
const SKETCH_LABEL: SketchEntityDto[] = [
  { kind: 'line', id: 1, p1: { x: 11.380177284632465, y: -5.046348418708139 }, p2: { x: 1.3198227153673279, y: 12.378696837416461 } },
  { kind: 'line', id: 2, p1: { x: -1.319822715367261, y: 12.378696837416404 }, p2: { x: -11.380177284632495, y: -5.046348418708131 } },
  { kind: 'line', id: 3, p1: { x: -10.06035456926501, y: -7.332348418708154 }, p2: { x: 10.060354569264979, y: -7.332348418708152 } },
  { kind: 'line', id: 4, p1: { x: 6.35, y: 3.6661742093540792 }, p2: { x: -12.7, y: -7.332348418708156 }, construction: true },
  { kind: 'line', id: 6, p1: { x: 12.7, y: -7.332348418708156 }, p2: { x: -6.35, y: 3.666174209353946 }, construction: true },
  { kind: 'line', id: 7, p1: { x: 0, y: 14.664696837416304 }, p2: { x: 0, y: -7.332348418708152 }, construction: true },
  { kind: 'circle', id: 9, center: { x: 0, y: 11.616696837416523 }, radius: 1.5240000000000002 },
  { kind: 'circle', id: 11, center: { x: 10.060354569264979, y: -5.808348418708151 }, radius: 1.5240000000000002 },
  { kind: 'circle', id: 13, center: { x: -10.06035456926501, y: -5.808348418708155 }, radius: 1.5240000000000002 },
];

/** Sketch 1 —— 25.4 × 12.7 的标签面板。 */
const SKETCH_PANEL: SketchEntityDto[] = [
  { kind: 'line', id: 1, p1: { x: 12.7, y: 6.35 }, p2: { x: -12.7, y: 6.35 } },
  { kind: 'line', id: 2, p1: { x: 12.7, y: -6.35 }, p2: { x: -12.7, y: -6.35 } },
  { kind: 'line', id: 3, p1: { x: 12.7, y: 6.35 }, p2: { x: 12.7, y: -6.35 } },
  { kind: 'line', id: 4, p1: { x: -12.7, y: 6.35 }, p2: { x: -12.7, y: -6.35 } },
];

const NO_CONSTRAINTS: SketchConstraintDto[] = [];

async function insertSketch(
  ctx: Ctx,
  token: string,
  entities: SketchEntityDto[],
  label: string,
): Promise<string> {
  // 页面每次 reload 后浏览器会话会重新成为写租约持有者——逐次探测借用，沿用当前 holder。
  const lease = await borrowWriteLease(ctx, token, `example-warning-label-${label}`);
  const result = await applyFeatureOpRpc(ctx, {
    kind: 'insertSketch',
    entities,
    constraints: NO_CONSTRAINTS,
    plane: TOP_PLANE,
  }, lease, token);
  assertFeatureOpOk(result, label);
  if (!result.featureId) throw new Error(`${label} 未返回 featureId`);
  return result.featureId;
}

async function openNewestSketch(
  page: Parameters<typeof demoShot>[0],
  range: { low: { x: number; y: number; z: number }; high: { x: number; y: number; z: number } },
): Promise<void> {
  const featureList = page.getByTestId('part-studio-feature-list');
  const sketchRow = featureList.getByRole('button', { name: /草图/ }).last();
  await expect(sketchRow).toBeVisible({ timeout: 60_000 });
  await sketchRow.dblclick();
  const sketchDialog = page.getByTestId('part-studio-sketch-dialog');
  await expect(sketchDialog).toBeVisible({ timeout: 30_000 });
  await frameStandardView(page, 0, range, { left: 0.3, right: 0.15, top: 0.15, bottom: 0.12 });
  await disableSnap(page);
  await expect(sketchDialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 30_000 });
}

async function finishSketch(page: Parameters<typeof demoShot>[0]): Promise<void> {
  const sketchDialog = page.getByTestId('part-studio-sketch-dialog');
  await sketchDialog.getByRole('button', { name: '确认' }).click();
  await expect(sketchDialog).toBeHidden({ timeout: 30_000 });
}

async function uiExtrude(
  page: Parameters<typeof demoShot>[0],
  options: { scope: '新建' | '加入'; distance: string; regionIndex?: number },
): Promise<void> {
  const dialog = page.getByTestId('part-studio-feature-dialog');
  await page.getByRole('button', { name: '拉伸', exact: true }).click();
  await expect(dialog).toBeVisible();
  await frameStandardView(page, 6, {
    low: { x: -18, y: -12, z: -2 }, high: { x: 18, y: 18, z: 2 },
  }, { left: 0.15, right: 0.05, top: 0.12, bottom: 0.1 });
  await chooseProfileRegionsInViewport(page, [options.regionIndex ?? 0]);
  if (options.scope !== '新建') await dialog.getByRole('tab', { name: options.scope }).click();
  await dialog.getByLabel('深度').fill(options.distance);
  await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 20_000 });
  await dialog.getByRole('button', { name: '确认' }).click();
  await expect(
    page.getByTestId('part-studio-feature-list').getByRole('button', { name: /拉伸/ }).last()
      .or(dialog.getByTestId('part-studio-feature-dialog-error')),
  ).toBeVisible({ timeout: 120_000 });
  if ((await dialog.getByTestId('part-studio-feature-dialog-error').count()) > 0)
    throw new Error(`拉伸被拒收: ${await dialog.getByTestId('part-studio-feature-dialog-error').textContent()}`);
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

test.describe('示例 iModel：WARNING LABEL', () => {
  test('三草图 + 两次拉伸 → 推送 → 重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, EXAMPLE_NAME, {
      reset: process.env.EXAMPLE_RESET === '1',
    });
    let ctx: Ctx = await openExampleEditor(page, ids);
    await demoShot(page, {
      dir: DEMO_DIR, index: 1, slug: 'part-studio',
      title: '1. 打开对应 iModel', detail: `${EXAMPLE_NAME} · 空白 Part Studio；后续步骤将建立真实特征。`,
    });

    // ── Sketch 3 → Extrude NEW ─────────────────────────────────────────────
    await insertSketch(ctx, token, SKETCH_BASE, 'Sketch 3（底座）');
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    await openNewestSketch(page, {
      low: { x: -0.2, y: -0.2, z: -0.02 }, high: { x: 0.2, y: 0.2, z: 0.02 },
    });
    await demoShot(page, {
      dir: DEMO_DIR, index: 2, slug: 'sketch-base',
      title: '2. 精确复原 Sketch 3（底座）', detail: 'Top 平面 0.254 × 0.254；采集数据经同一 FeatureOp 管道写入。',
    });
    await finishSketch(page);
    await uiExtrude(page, { scope: '新建', distance: '0.00254' });
    await demoShot(page, {
      dir: DEMO_DIR, index: 3, slug: 'extrude-new',
      title: '3. 真实 UI 拉伸（新建）', detail: '面域 0、深 0.00254 mm、新建实体。',
    });

    // ── Sketch 2（仅轮廓，不拉伸） ──────────────────────────────────────────
    await insertSketch(ctx, token, SKETCH_LABEL, 'Sketch 2（标签轮廓）');
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    await openNewestSketch(page, {
      low: { x: -18, y: -12, z: -2 }, high: { x: 18, y: 18, z: 2 },
    });
    await demoShot(page, {
      dir: DEMO_DIR, index: 4, slug: 'sketch-label',
      title: '4. 精确复原 Sketch 2（标签轮廓）', detail: '3 条直边 + 3 个圆角弧 + 3 条构造线；不参与拉伸。',
    });
    await finishSketch(page);

    // ── Sketch 1 → Extrude ADD ─────────────────────────────────────────────
    await insertSketch(ctx, token, SKETCH_PANEL, 'Sketch 1（标签面板）');
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    await openNewestSketch(page, {
      low: { x: -16, y: -10, z: -2 }, high: { x: 16, y: 10, z: 2 },
    });
    await demoShot(page, {
      dir: DEMO_DIR, index: 5, slug: 'sketch-panel',
      title: '5. 精确复原 Sketch 1（标签面板）', detail: 'Top 平面 25.4 × 12.7。',
    });
    await finishSketch(page);
    await uiExtrude(page, { scope: '加入', distance: '0.00254' });
    await demoShot(page, {
      dir: DEMO_DIR, index: 6, slug: 'extrude-add',
      title: '6. 真实 UI 拉伸（加入）', detail: '面域 0、深 0.00254 mm、加入已有实体（等价于原 imprintFace add）。',
    });

    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'sketch', 'extrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const mass = await getMassPropertiesRpc(ctx, token);
    const volumeMm3 = mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[warning-label] volume=${volumeMm3.toFixed(6)} mm³ expected=${EXPECTED_VOLUME_MM3}`);
    expect(Math.abs(volumeMm3 - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.02);
    // 提交后前端有一次延迟 zoomToFit；等它落定后再取景。
    await page.waitForTimeout(3_000);
    await frameStandardView(page, 6, {
      low: { x: -18, y: -12, z: -2 }, high: { x: 18, y: 18, z: 2 },
    }, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    await page.waitForTimeout(1_500);
    await frameStandardView(page, 6, {
      low: { x: -18, y: -12, z: -2 }, high: { x: 18, y: 18, z: 2 },
    }, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    await demoShot(page, {
      dir: DEMO_DIR, index: 7, slug: 'result',
      title: '7. 最终模型', detail: `特征树 5 项；体积 ${volumeMm3.toFixed(4)} mm³（目标 ${EXPECTED_VOLUME_MM3}）。`,
    });

    await pushExampleChanges(page, `Onshape example: ${EXAMPLE_NAME}`);
    const changesets = await listExampleChangesets(request, token, ctx.imodelId);
    expect(changesets.some((changeset) => (changeset.description ?? '').includes('自动保存') || (changeset.description ?? '').includes(EXAMPLE_NAME))).toBe(true);
    await demoShot(page, {
      dir: DEMO_DIR, index: 8, slug: 'pushed',
      title: '8. 推送到 hub', detail: '示例 changeset 已持久化。',
    });

    await page.reload();
    await openExampleEditor(page, ids);
    const reopened = await getFeatureTreeRpc(ctx, token);
    expect(reopened.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'sketch', 'extrude']);
    const reopenedMass = await getMassPropertiesRpc(ctx, token);
    expect(reopenedMass.reduce((sum, entry) => sum + entry.volume, 0)).toBeGreaterThan(EXPECTED_VOLUME_MM3 * 0.98);
    await page.waitForTimeout(2_000);
    await frameStandardView(page, 6, {
      low: { x: -18, y: -12, z: -2 }, high: { x: 18, y: 18, z: 2 },
    }, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    await demoShot(page, {
      dir: DEMO_DIR, index: 9, slug: 'reopened',
      title: '9. 重开 iModel 验证', detail: '特征树与体积仍在。',
    });
  });
});
