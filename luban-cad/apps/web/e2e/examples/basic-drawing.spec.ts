/**
 * 示例 iModel 演示 #2：Exercise: Basic Drawing（Onshape Training Repo）。
 *
 * 用户 2026-11-05 明确要求：每个 Onshape 示例在 luban-cad 中都有**对应的真实
 * iModel**，并用真实 UI 逐步演示，最后把特征推送持久化；重开 iModel 后特征树/
 * 体积仍必须存在。
 *
 * 场景来源：私有 onshape-parity-data 的
 * scenarios/Exercise-Basic-Drawing-4a289bd094a999329a3900af.scenario.json
 * （Right 平面、20 条线含 2 条构造线、全周旋转 NEW；expected 2442.2938 cm³）。
 *
 * 运行：
 *   npx playwright test e2e/examples/basic-drawing.spec.ts --reporter=line
 *   EXAMPLE_RESET=1 ... # 重建示例 iModel（默认复用并在此基础上重新构建）
 */
import { expect, test, type Page } from '@playwright/test';
import {
  getApiToken,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
} from '../helpers.js';
import {
  activate,
  chooseProfileRegionsInViewport,
  chooseSketchPlaneInViewport,
  clickWorld,
  disableSnap,
  finishSketch,
  frameStandardView,
  type Vec3,
} from '../tutorial2-helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { demoShot } from './demo.js';
import {
  ensureExampleImodel,
  listExampleChangesets,
  openExampleEditor,
  pushExampleChanges,
} from './imodel.js';

const EXAMPLE_NAME = 'Exercise - Basic Drawing';
const DEMO_DIR = 'demo-artifacts/examples/exercise-basic-drawing';

type Ctx = Awaited<ReturnType<typeof openExampleEditor>>;

/** 与 scenario 一致的 20 条线（局部草图坐标，mm）。 */
const LINES: Array<{ id: number; p1: [number, number]; p2: [number, number]; construction?: boolean }> = [
  { id: 1, p1: [-66.09390676021576, 0], p2: [66.09390676021576, 0], construction: true },
  { id: 2, p1: [0, 0], p2: [0, 121.97904019103741], construction: true },
  { id: 3, p1: [0, 100], p2: [-20, 100] },
  { id: 4, p1: [-20, 100], p2: [-20, 125] },
  { id: 5, p1: [-20, 125], p2: [-37.5, 125] },
  { id: 6, p1: [-37.5, 125], p2: [-37.5, 82.5] },
  { id: 7, p1: [-37.5, 82.5], p2: [-20, 82.5] },
  { id: 8, p1: [-20, 82.5], p2: [-20, 37.5] },
  { id: 9, p1: [-20, 37.5], p2: [-50, 37.5] },
  { id: 10, p1: [-50, 37.5], p2: [-50, 12.5] },
  { id: 11, p1: [-50, 12.5], p2: [0, 12.5] },
  { id: 12, p1: [0, 100], p2: [20, 100] },
  { id: 13, p1: [20, 100], p2: [20, 125] },
  { id: 14, p1: [20, 125], p2: [37.5, 125] },
  { id: 15, p1: [37.5, 125], p2: [37.5, 82.5] },
  { id: 16, p1: [37.5, 82.5], p2: [20, 82.5] },
  { id: 17, p1: [20, 82.5], p2: [20, 37.5] },
  { id: 18, p1: [20, 37.5], p2: [50, 37.5] },
  { id: 19, p1: [50, 37.5], p2: [50, 12.5] },
  { id: 20, p1: [50, 12.5], p2: [0, 12.5] },
];

/** Right 平面 frame：局部 (u,v) → 世界 (0,u,v)。 */
function rightPlane(u: number, v: number): Vec3 {
  return { x: 0, y: u, z: v };
}

async function canvasHub(page: Page): Promise<{ x: number; y: number }> {
  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 90_000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas boundingBox 不可得');
  return { x: box.x, y: box.y };
}

async function sketchView(page: Page): Promise<void> {
  await frameStandardView(page, 3, {
    low: { x: -10, y: -75, z: -15 }, high: { x: 10, y: 75, z: 135 },
  }, { left: 0.55, right: 0.05 });
  await disableSnap(page);
}

async function createRightSketch(page: Page): Promise<void> {
  await page.getByRole('button', { name: '草图', exact: true }).click();
  const dialog = page.getByTestId('part-studio-sketch-dialog');
  await expect(dialog).toBeVisible();
  await chooseSketchPlaneInViewport(page, 'right');
  await dialog.getByRole('button', { name: '确认' }).click();
  await expect(
    page.getByRole('toolbar', { name: '草图工具' }).or(dialog.getByTestId('part-studio-sketch-dialog-error')),
  ).toBeVisible({ timeout: 60_000 });
  if ((await dialog.getByTestId('part-studio-sketch-dialog-error').count()) > 0)
    throw new Error(`insertSketch 拒收: ${await dialog.getByTestId('part-studio-sketch-dialog-error').textContent()}`);
}

async function drawLine(page: Page, hub: { x: number; y: number }, a: [number, number], b: [number, number]): Promise<void> {
  await activate(page, '线');
  await clickWorld(page, hub, rightPlane(...a));
  await clickWorld(page, hub, rightPlane(...b));
  await page.waitForTimeout(180);
}

test.describe('示例 iModel：Exercise - Basic Drawing', () => {
  test('真实 UI 建草图 + 全周旋转 → 推送 → 重开验证', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, EXAMPLE_NAME, {
      reset: process.env.EXAMPLE_RESET === '1',
    });
    const ctx: Ctx = await openExampleEditor(page, ids);
    const hub = await canvasHub(page);
    await demoShot(page, {
      dir: DEMO_DIR, index: 1, slug: 'part-studio',
      title: '1. 打开对应 iModel', detail: `${EXAMPLE_NAME} · 空白 Part Studio（iModel ${ids.imodelId}）`,
    });

    await createRightSketch(page);
    await sketchView(page);
    await demoShot(page, {
      dir: DEMO_DIR, index: 2, slug: 'right-plane-sketch',
      title: '2. 新建 Right 平面草图', detail: '与 Onshape 原示例同一平面；相机自动正对草图。',
    });

    // 构造线模式开：画轴线 1 + 中线 2。
    const construction = page.getByRole('toolbar', { name: '草图工具' })
      .getByRole('button', { name: '构造', exact: true });
    await construction.click();
    for (const line of LINES.filter((l) => l.construction)) await drawLine(page, hub, line.p1, line.p2);
    await construction.click();
    await demoShot(page, {
      dir: DEMO_DIR, index: 3, slug: 'construction-lines',
      title: '3. 两条构造线', detail: '水平构造线 = 旋转轴；竖直构造线 = 中心线（均不参与轮廓）。',
    });

    // 18 条轮廓线（按 Onshape 顺序；端点重合由 auto-weld 自动落 coincident）。
    for (const line of LINES.filter((l) => !l.construction)) await drawLine(page, hub, line.p1, line.p2);
    await demoShot(page, {
      dir: DEMO_DIR, index: 4, slug: 'profile-lines',
      title: '4. 18 条轮廓线完成', detail: '左右对称轮廓闭合；端点重合自动落约束，形成可旋转面域。',
    });

    await finishSketch(page);
    await demoShot(page, {
      dir: DEMO_DIR, index: 5, slug: 'sketch-finished',
      title: '5. 完成草图', detail: '退出草图模式；特征树新增 Sketch 1。',
    });

    // 旋转：面域 0 + 轴线 1 + 新建。
    const dialog = page.getByTestId('part-studio-feature-dialog');
    const featureList = page.getByTestId('part-studio-feature-list');
    await page.getByRole('button', { name: '旋转', exact: true }).click();
    await expect(dialog).toBeVisible();
    await frameStandardView(page, 6, {
      low: { x: -110, y: -110, z: -20 }, high: { x: 110, y: 110, z: 160 },
    }, { left: 0.15, right: 0.05 });
    await chooseProfileRegionsInViewport(page, [0]);
    await dialog.getByRole('combobox', { name: '旋转轴' }).selectOption('1');
    if (await dialog.getByRole('tab', { name: '新建' }).count() > 0)
      await dialog.getByRole('tab', { name: '新建' }).click();
    await expect(dialog.getByTestId('part-studio-feature-dialog-full-revolve').locator('input')).toBeChecked();
    await demoShot(page, {
      dir: DEMO_DIR, index: 6, slug: 'revolve-dialog',
      title: '6. 旋转 360°（新建）', detail: '面域 0、旋转轴 = 构造线 1、全方位、操作=新建。',
    });
    await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 20_000 });
    await dialog.getByRole('button', { name: '确认' }).click();
    await expect(
      featureList.getByRole('button', { name: /旋转/ }).or(dialog.getByTestId('part-studio-feature-dialog-error')),
    ).toBeVisible({ timeout: 120_000 });
    if ((await dialog.getByTestId('part-studio-feature-dialog-error').count()) > 0)
      throw new Error(`旋转被拒收: ${await dialog.getByTestId('part-studio-feature-dialog-error').textContent()}`);
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await frameStandardView(page, 6, {
      low: { x: -135, y: -135, z: -10 }, high: { x: 135, y: 135, z: 145 },
    }, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    await demoShot(page, {
      dir: DEMO_DIR, index: 7, slug: 'revolve-result',
      title: '7. 全周旋转结果', detail: '单 body；Real kernel 求值，特征树 Sketch 1 → 旋转 1。',
    });

    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'revolve']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const mass = await getMassPropertiesRpc(ctx, token);
    const volumeCm3 = mass.reduce((sum, entry) => sum + entry.volume, 0) / 1000;
    console.log(`[basic-drawing] volume=${volumeCm3.toFixed(4)} cm³ expected=2442.2938`);
    expect(Math.abs(volumeCm3 - 2442.2938) / 2442.2938).toBeLessThan(0.01);

    // 持久化：显式推送 → 校验 hub changeset → 重开同一 iModel。
    await pushExampleChanges(page, `Onshape example: ${EXAMPLE_NAME}`);
    const changesets = await listExampleChangesets(request, token, ctx.imodelId);
    expect(
      changesets.some((changeset) => (changeset.description ?? '').includes('自动保存') || (changeset.description ?? '').includes(EXAMPLE_NAME)),
      `hub changeset 应包含示例描述：${JSON.stringify(changesets.slice(-3))}`,
    ).toBe(true);
    await demoShot(page, {
      dir: DEMO_DIR, index: 8, slug: 'pushed',
      title: '8. 推送到 hub', detail: '特征已写入 changeset；iModel 可被其他会话重新打开。',
    });

    await page.reload();
    await expect(page.getByTestId('part-studio-viewport').locator('canvas').first()).toBeVisible({ timeout: 120_000 });
    await page.waitForTimeout(5_000);
    await frameStandardView(page, 6, {
      low: { x: -135, y: -135, z: -10 }, high: { x: 135, y: 135, z: 145 },
    }, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    const reopened = await getFeatureTreeRpc(ctx, token);
    expect(reopened.map((row) => row.featureType)).toEqual(['sketch', 'revolve']);
    const reopenedMass = await getMassPropertiesRpc(ctx, token);
    const reopenedVolume = reopenedMass.reduce((sum, entry) => sum + entry.volume, 0) / 1000;
    expect(reopenedVolume).toBeGreaterThan(2400);
    await demoShot(page, {
      dir: DEMO_DIR, index: 9, slug: 'reopened',
      title: '9. 重开 iModel 验证', detail: `特征树与体积仍在：${reopenedVolume.toFixed(3)} cm³。`,
    });
  });
});
