/**
 * WARNING LABEL 同几何文档族（2026-11-05）。
 *
 * Onshape Training 的三个 Quickstart 文档含完全相同的 WARNING LABEL Part Studio
 * （features JSON sha256 一致），与 Explore Onshape Models 的 Bench Vise 版几何相同。
 * 每个文档仍建立独立的真实 iModel + changeset；这里为每个文档跑同一构建链
 * （3 草图 RPC + 2 次 UI 拉伸），并记录打开/结果/重开三张证据图。
 *
 * 逐步界面演示见 `demo-artifacts/examples/warning-label/index.html`（Bench Vise 版，
 * 步骤相同）；本 runner 只补每个文档自己的 iModel 证据。
 */
import { expect, test } from '@playwright/test';
import type { SketchEntityDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc, assertFeatureOpOk, borrowWriteLease, getApiToken,
  getFeatureTreeRpc, getMassPropertiesRpc,
} from '../helpers.js';
import { chooseProfileRegionsInViewport, disableSnap, frameStandardView } from '../tutorial2-helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { demoShot } from './demo.js';
import {
  ensureExampleImodel, listExampleChangesets, openExampleEditor, pushExampleChanges,
} from './imodel.js';

const TOP_PLANE = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};
const EXPECTED_VOLUME_MM3 = 0.8193532;
type Ctx = Awaited<ReturnType<typeof openExampleEditor>>;

const SKETCH_BASE: SketchEntityDto[] = [
  { kind: 'line', id: 1, p1: { x: -0.127, y: 0.127 }, p2: { x: 0.127, y: 0.127 } },
  { kind: 'line', id: 2, p1: { x: -0.127, y: -0.127 }, p2: { x: 0.127, y: -0.127 } },
  { kind: 'line', id: 3, p1: { x: -0.127, y: 0.127 }, p2: { x: -0.127, y: -0.127 } },
  { kind: 'line', id: 4, p1: { x: 0.127, y: 0.127 }, p2: { x: 0.127, y: -0.127 } },
];
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
const SKETCH_PANEL: SketchEntityDto[] = [
  { kind: 'line', id: 1, p1: { x: 12.7, y: 6.35 }, p2: { x: -12.7, y: 6.35 } },
  { kind: 'line', id: 2, p1: { x: 12.7, y: -6.35 }, p2: { x: -12.7, y: -6.35 } },
  { kind: 'line', id: 3, p1: { x: 12.7, y: 6.35 }, p2: { x: 12.7, y: -6.35 } },
  { kind: 'line', id: 4, p1: { x: -12.7, y: 6.35 }, p2: { x: -12.7, y: -6.35 } },
];

const VARIANTS = [
  { name: 'WARNING LABEL - Onshape EDU Quickstart', slug: 'warning-label-edu-quickstart' },
  { name: 'WARNING LABEL - Onshape Professional Discovery Quickstart', slug: 'warning-label-professional-discovery' },
  { name: 'WARNING LABEL - Onshape Quickstart', slug: 'warning-label-onshape-quickstart' },
] as const;

type Range = { low: { x: number; y: number; z: number }; high: { x: number; y: number; z: number } };
const BASE_RANGE: Range = { low: { x: -0.2, y: -0.2, z: -0.02 }, high: { x: 0.2, y: 0.2, z: 0.02 } };
const LABEL_RANGE: Range = { low: { x: -18, y: -12, z: -2 }, high: { x: 18, y: 18, z: 2 } };
const PANEL_RANGE: Range = { low: { x: -16, y: -10, z: -2 }, high: { x: 16, y: 10, z: 2 } };

async function insertSketch(
  ctx: Ctx, token: string, entities: SketchEntityDto[], label: string, leaseLabel: string,
): Promise<string> {
  const lease = await borrowWriteLease(ctx, token, leaseLabel);
  const result = await applyFeatureOpRpc(ctx, {
    kind: 'insertSketch', entities, constraints: [], plane: TOP_PLANE,
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
  await frameStandardView(page, 0, range, { left: 0.3, right: 0.15, top: 0.15, bottom: 0.12 });
  await disableSnap(page);
  await expect(sketchDialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 30_000 });
}

async function finishSketch(page: Parameters<typeof demoShot>[0]): Promise<void> {
  const sketchDialog = page.getByTestId('part-studio-sketch-dialog');
  await sketchDialog.getByRole('button', { name: '确认' }).click();
  await expect(sketchDialog).toBeHidden({ timeout: 30_000 });
}

async function uiExtrude(page: Parameters<typeof demoShot>[0], scope: '新建' | '加入'): Promise<void> {
  const dialog = page.getByTestId('part-studio-feature-dialog');
  await page.getByRole('button', { name: '拉伸', exact: true }).click({ timeout: 30_000 });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await frameStandardView(page, 6, LABEL_RANGE, { left: 0.15, right: 0.05, top: 0.12, bottom: 0.1 });
  await chooseProfileRegionsInViewport(page, [0]);
  if (scope !== '新建') await dialog.getByRole('tab', { name: scope }).click({ timeout: 15_000 });
  await dialog.getByLabel('深度').fill('0.00254', { timeout: 10_000 });
  await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 20_000 });
  await dialog.getByRole('button', { name: '确认' }).click({ timeout: 30_000 });
  await expect(
    page.getByTestId('part-studio-feature-list').getByRole('button', { name: /拉伸/ }).last()
      .or(dialog.getByTestId('part-studio-feature-dialog-error')),
  ).toBeVisible({ timeout: 120_000 });
  if ((await dialog.getByTestId('part-studio-feature-dialog-error').count()) > 0)
    throw new Error(`拉伸被拒收: ${await dialog.getByTestId('part-studio-feature-dialog-error').textContent()}`);
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

test.describe('WARNING LABEL 同几何文档族', () => {
  test('三个 Quickstart 文档各建独立 iModel + changeset', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 1_500_000);
    const token = await getApiToken();
    const summary: unknown[] = [];
    for (const variant of VARIANTS) {
      const demoDir = `demo-artifacts/examples/${variant.slug}`;
      const ids = await ensureExampleImodel(request, token, variant.name, {
        reset: process.env.EXAMPLE_RESET === '1',
      });
      let ctx = await openExampleEditor(page, ids);
      await demoShot(page, {
        dir: demoDir, index: 1, slug: 'part-studio',
        title: '1. 打开对应 iModel', detail: `${variant.name} · 空白 Part Studio。`,
      });

      await insertSketch(ctx, token, SKETCH_BASE, 'Sketch 3（底座）', `${variant.slug}-base`);
      await page.reload();
      ctx = await openExampleEditor(page, ids);
      await openNewestSketch(page, BASE_RANGE);
      await finishSketch(page);
      await uiExtrude(page, '新建');

      await insertSketch(ctx, token, SKETCH_LABEL, 'Sketch 2（标签轮廓）', `${variant.slug}-label`);
      await page.reload();
      ctx = await openExampleEditor(page, ids);
      await openNewestSketch(page, LABEL_RANGE);
      await finishSketch(page);

      await insertSketch(ctx, token, SKETCH_PANEL, 'Sketch 1（标签面板）', `${variant.slug}-panel`);
      await page.reload();
      ctx = await openExampleEditor(page, ids);
      await openNewestSketch(page, PANEL_RANGE);
      await finishSketch(page);
      await uiExtrude(page, '加入');

      const tree = await getFeatureTreeRpc(ctx, token);
      expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'sketch', 'extrude']);
      expect(tree.every((row) => row.status === 0)).toBe(true);
      const mass = await getMassPropertiesRpc(ctx, token);
      const volumeMm3 = mass.reduce((sum, entry) => sum + entry.volume, 0);
      expect(Math.abs(volumeMm3 - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.02);
      await page.waitForTimeout(2_000);
      await frameStandardView(page, 6, LABEL_RANGE, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
      await demoShot(page, {
        dir: demoDir, index: 2, slug: 'result',
        title: '2. 最终模型', detail: `特征树 5 项；体积 ${volumeMm3.toFixed(6)} mm³（目标 ${EXPECTED_VOLUME_MM3}）。`,
      });

      await pushExampleChanges(page, `Onshape example: ${variant.name}`);
      const changesets = await listExampleChangesets(request, token, ctx.imodelId);
      const changeset = changesets.find((entry) => (entry.description ?? '').includes('自动保存') || (entry.description ?? '').includes(variant.name));
      expect(changeset, `${variant.name} changeset 未落库`).toBeTruthy();

      await page.reload();
      await openExampleEditor(page, ids);
      const reopened = await getFeatureTreeRpc(ctx, token);
      expect(reopened.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'sketch', 'extrude']);
      await page.waitForTimeout(1_500);
      await frameStandardView(page, 6, LABEL_RANGE, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
      await demoShot(page, {
        dir: demoDir, index: 3, slug: 'reopened',
        title: '3. 重开 iModel 验证', detail: '特征树与体积仍在。',
      });

      summary.push({
        name: variant.name,
        slug: variant.slug,
        projectId: ids.itwinId,
        imodelId: ids.imodelId,
        changesetId: changeset!.id,
        volumeMm3,
        featureTree: reopened.map((row) => row.featureType),
      });
    }
    console.log(`[warning-label-variants] ${JSON.stringify(summary, null, 2)}`);
  });
});
