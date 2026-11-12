/**
 * 示例 iModel 演示 #3：Postman（Explore Onshape Models）。
 *
 * 场景：scenarios/Postman-33a4bc9ff219a1b984926eb4.scenario.json
 * Top 平面（sketchMatrix 已归一化）→ 圆角矩形 → 0.5 mm 拉伸 NEW。
 *
 * 为什么草图走 RPC：该示例的角圆半径仅 1.60176 mm，全图缩放下屏幕尺寸小于
 * 拾取阈值；纯鼠标绘制会出现漏线/漏圆与 7% 体积偏差。这里采用“采集数据精确
 * 复原草图（单一建模管道 RPC）+ 真实 UI 拉伸”的混合演示，并在步骤字幕里明确
 * 标注；不伪装成纯鼠标级复刻。
 */
import { expect, test, type Page } from '@playwright/test';
import type { SketchEntityDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
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

const EXAMPLE_NAME = 'Postman';
const DEMO_DIR = 'demo-artifacts/examples/postman';
type Ctx = Awaited<ReturnType<typeof openExampleEditor>>;

const LINES: Array<{ id: number; p1: [number, number]; p2: [number, number] }> = [
  { id: 1, p1: [48.371760739297216, -26.18], p2: [48.371760739297216, 26.18] },
  { id: 3, p1: [46.77000000000001, 27.7817607392972], p2: [-46.76999999999998, 27.7817607392972] },
  { id: 5, p1: [-48.37176073929718, 26.18], p2: [-48.37176073929719, -26.18] },
  { id: 7, p1: [-46.76999999999998, -27.7817607392972], p2: [46.77000000000001, -27.7817607392972] },
];
const CIRCLES: Array<{ id: number; center: [number, number]; radius: number }> = [
  { id: 2, center: [46.77000000000001, 26.18], radius: 1.6017607392972149 },
  { id: 4, center: [-46.76999999999998, 26.18], radius: 1.6017607392972097 },
  { id: 6, center: [-46.76999999999998, -26.18], radius: 1.6017607392972149 },
  { id: 8, center: [46.77000000000001, -26.18], radius: 1.6017607392972149 },
];

function exactEntities(): SketchEntityDto[] {
  return [
    ...LINES.map((line): SketchEntityDto => ({
      kind: 'line', id: line.id,
      p1: { x: line.p1[0], y: line.p1[1] }, p2: { x: line.p2[0], y: line.p2[1] },
    })),
    ...CIRCLES.map((circle): SketchEntityDto => ({
      kind: 'circle', id: circle.id,
      center: { x: circle.center[0], y: circle.center[1] }, radius: circle.radius,
    })),
  ].sort((a, b) => a.id - b.id);
}

async function canvasHub(page: Page): Promise<{ x: number; y: number }> {
  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 90_000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas boundingBox 不可得');
  return { x: box.x, y: box.y };
}

test.describe('示例 iModel：Postman', () => {
  test('精确草图（RPC）+ 真实 UI 拉伸 → 推送 → 重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, EXAMPLE_NAME, {
      reset: process.env.EXAMPLE_RESET === '1',
    });
    let ctx: Ctx = await openExampleEditor(page, ids);
    await demoShot(page, {
      dir: DEMO_DIR, index: 1, slug: 'part-studio',
      title: '1. 打开对应 iModel', detail: `${EXAMPLE_NAME} · 空白 Part Studio；后续步骤将建立真实特征。`,
    });

    // 采集数据精确复原草图：Top 平面 + 4 线 + 4 圆（无约束，与原示例一致）。
    const lease = await borrowWriteLease(ctx, token, 'example-postman');
    const sketch = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: exactEntities(),
      constraints: [],
      plane: {
        origin: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: 0, z: 1 },
        xDir: { x: 1, y: 0, z: 0 },
      },
    }, lease, token);
    if (!sketch.ok || !sketch.featureId) throw new Error(`精确草图插入失败: ${!sketch.ok ? sketch.error : '无 featureId'}`);
    const sketchId = sketch.featureId;
    console.log(`[postman-example] sketch=${sketchId} entities=${exactEntities().length}`);

    // 重新加载以让前端同步服务端已提交的精确草图。
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    await canvasHub(page);
    const featureList = page.getByTestId('part-studio-feature-list');
    const sketchRow = featureList.getByRole('button', { name: /草图/ }).first();
    await expect(sketchRow).toBeVisible({ timeout: 60_000 });
    await sketchRow.dblclick();
    const sketchDialog = page.getByTestId('part-studio-sketch-dialog');
    await expect(sketchDialog).toBeVisible({ timeout: 30_000 });
    await frameStandardView(page, 0, {
      low: { x: -60, y: -40, z: -5 }, high: { x: 60, y: 40, z: 5 },
    }, { left: 0.6, right: 0.35, top: 0.2, bottom: 0.15 });
    await disableSnap(page);
    await demoShot(page, {
      dir: DEMO_DIR, index: 2, slug: 'exact-sketch',
      title: '2. 按采集数据复原草图', detail: 'Top 平面、4 条切线 + 4 个角圆；RPC 走同一 FeatureOp 管道。',
    });
    await expect(sketchDialog.getByRole('button', { name: '确认' })).toBeVisible();
    await sketchDialog.getByRole('button', { name: '确认' }).click();
    await expect(sketchDialog).toBeHidden({ timeout: 30_000 });

    const dialog = page.getByTestId('part-studio-feature-dialog');
    await page.getByRole('button', { name: '拉伸', exact: true }).click();
    await expect(dialog).toBeVisible();
    await frameStandardView(page, 6, {
      low: { x: -70, y: -50, z: -5 }, high: { x: 70, y: 50, z: 20 },
    }, { left: 0.15, right: 0.05 });
    await chooseProfileRegionsInViewport(page, [0]);
    await dialog.getByLabel('深度').fill('0.5');
    await demoShot(page, {
      dir: DEMO_DIR, index: 3, slug: 'extrude-dialog',
      title: '3. 真实 UI 拉伸 0.5 mm', detail: '选择 Sketch 1 面域 0；新建实体。',
    });
    await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 20_000 });
    await dialog.getByRole('button', { name: '确认' }).click();
    await expect(
      featureList.getByRole('button', { name: /拉伸/ }).or(dialog.getByTestId('part-studio-feature-dialog-error')),
    ).toBeVisible({ timeout: 120_000 });
    if ((await dialog.getByTestId('part-studio-feature-dialog-error').count()) > 0)
      throw new Error(`拉伸被拒收: ${await dialog.getByTestId('part-studio-feature-dialog-error').textContent()}`);
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await frameStandardView(page, 6, {
      low: { x: -70, y: -50, z: -5 }, high: { x: 70, y: 50, z: 20 },
    }, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    await demoShot(page, {
      dir: DEMO_DIR, index: 4, slug: 'extrude-result',
      title: '4. 拉伸结果', detail: '单 body，真实内核求值。',
    });

    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const mass = await getMassPropertiesRpc(ctx, token);
    const volumeCm3 = mass.reduce((sum, entry) => sum + entry.volume, 0) / 1000;
    console.log(`[postman-example] volume=${volumeCm3.toFixed(4)} cm³ expected=2.6866`);
    expect(Math.abs(volumeCm3 - 2.6866) / 2.6866).toBeLessThan(0.02);

    await pushExampleChanges(page, `Onshape example: ${EXAMPLE_NAME}`);
    const changesets = await listExampleChangesets(request, token, ctx.imodelId);
    expect(changesets.some((changeset) => (changeset.description ?? '').includes('自动保存') || (changeset.description ?? '').includes(EXAMPLE_NAME))).toBe(true);
    await demoShot(page, {
      dir: DEMO_DIR, index: 5, slug: 'pushed',
      title: '5. 推送到 hub', detail: '示例 changeset 已持久化。',
    });

    await page.reload();
    await canvasHub(page);
    await page.waitForTimeout(4_000);
    await frameStandardView(page, 6, {
      low: { x: -70, y: -50, z: -5 }, high: { x: 70, y: 50, z: 20 },
    }, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    const reopened = await getFeatureTreeRpc(ctx, token);
    expect(reopened.map((row) => row.featureType)).toEqual(['sketch', 'extrude']);
    const reopenedMass = await getMassPropertiesRpc(ctx, token);
    expect(reopenedMass.reduce((sum, entry) => sum + entry.volume, 0) / 1000).toBeGreaterThan(2);
    await demoShot(page, {
      dir: DEMO_DIR, index: 6, slug: 'reopened',
      title: '6. 重开 iModel 验证', detail: '特征树与体积仍在。',
    });
  });
});
