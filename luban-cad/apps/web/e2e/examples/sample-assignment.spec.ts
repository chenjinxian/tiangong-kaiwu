/**
 * 示例 iModel 演示 #12：Sample Assignment（Explore Onshape Models）。
 *
 * 场景：scenarios/Sample-Assignment-d1989636af28eb77f9e99c58.scenario.json
 * Part Studio "Alignment Plate"：63.5 × 26.035 × 6.35 底板 →
 * 1×⌀11.43 通孔 + 1×⌀6.35 通孔 + 一个圆头槽通孔（各自只选一个面域，
 * 与采集的 regionIndex 0 一致）→ 四条竖边 1.524 mm OFFSET_ANGLE 倒角。
 * 目标 8915.8599 mm³，1 body。
 *
 * 构建方式：四张草图按采集实体经 RPC 精确复原（偏移平面经 SketchPlaneDto
 * 落库）；四次拉伸与倒角均为真实 UI。倒角使用「距离-角度」模式
 * （mode=3，距离 1.524 mm + 45°），对应采集的 OFFSET_ANGLE。
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

const EXAMPLE_NAME = 'Sample Assignment';
const DEMO_DIR = 'demo-artifacts/examples/sample-assignment';
const EXPECTED_VOLUME_MM3 = 8915.859905;
type Range = { low: { x: number; y: number; z: number }; high: { x: number; y: number; z: number } };
type Ctx = Awaited<ReturnType<typeof openExampleEditor>>;

const PLANE_0: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 },
};
const PLANE_TOP: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 6.35 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 },
};

/** Sketch 1 —— 63.5 × 26.035 外框。 */
const SKETCH_1: SketchEntityDto[] = [
  { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 63.5, y: 0 } },
  { kind: 'line', id: 2, p1: { x: 0, y: 26.035 }, p2: { x: 63.5, y: 26.035 } },
  { kind: 'line', id: 3, p1: { x: 0, y: 0 }, p2: { x: 0, y: 26.035 } },
  { kind: 'line', id: 4, p1: { x: 63.5, y: 0 }, p2: { x: 63.5, y: 26.035 } },
];
/** Sketch 2 —— 两圆；采集 regionIndex 0 只选其中一个（⌀11.43）。 */
const SKETCH_2: SketchEntityDto[] = [
  { kind: 'circle', id: 1, center: { x: 48.26, y: 0 }, radius: 5.715 },
  { kind: 'circle', id: 2, center: { x: 15.24, y: 0 }, radius: 5.715 },
];
/** Sketch 3 —— 两圆；采集 regionIndex 0 只选其中一个（⌀6.35）。 */
const SKETCH_3: SketchEntityDto[] = [
  { kind: 'circle', id: 1, center: { x: 56.134, y: 26.035 }, radius: 3.175 },
  { kind: 'circle', id: 2, center: { x: 7.366, y: 26.035 }, radius: 3.175 },
];
/**
 * Sketch 4 —— 圆头槽。采集用“两线 + 两端整圆”，Onshape 面域按重叠几何并集；
 * 本仓面域引擎不合并重叠闭环，故按同一并集外边界重建为单一闭合外环
 * （两线 + 两个半圆弧；面积 = 矩形 + 整圆 = 110.233 mm²，与 Onshape 等价）。
 */
const SKETCH_4: SketchEntityDto[] = [
  { kind: 'line', id: 1, p1: { x: 19.05, y: 16.51 }, p2: { x: 38.1, y: 16.51 } },
  { kind: 'arc', id: 2, center: { x: 38.1, y: 14.097 }, radius: 2.413, startAngle: Math.PI / 2, sweepAngle: -Math.PI },
  { kind: 'line', id: 3, p1: { x: 38.1, y: 11.684 }, p2: { x: 19.05, y: 11.684 } },
  { kind: 'arc', id: 4, center: { x: 19.05, y: 14.097 }, radius: 2.413, startAngle: -Math.PI / 2, sweepAngle: -Math.PI },
];
const NO_CONSTRAINTS: SketchConstraintDto[] = [];

const RANGE: Range = { low: { x: -12, y: -12, z: -6 }, high: { x: 78, y: 40, z: 18 } };
const RANGE_TOP: Range = { low: { x: -8, y: -8, z: -4 }, high: { x: 72, y: 34, z: 12 } };

async function insertSketch(ctx: Ctx, token: string, entities: SketchEntityDto[], plane: SketchPlaneDto, label: string): Promise<string> {
  const lease = await borrowWriteLease(ctx, token, `example-sample-${label}`);
  const result = await applyFeatureOpRpc(ctx, {
    kind: 'insertSketch', entities, constraints: NO_CONSTRAINTS, plane,
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

async function openExtrude(
  page: Parameters<typeof demoShot>[0],
  options: {
    scope: '新建' | '移除';
    distance?: string;
    regions: number[];
    throughAll?: boolean;
    directionBackward?: boolean;
  },
): Promise<void> {
  const dialog = page.getByTestId('part-studio-feature-dialog');
  await page.getByRole('button', { name: '拉伸', exact: true }).click({ timeout: 30_000 });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await frameStandardView(page, 0, RANGE_TOP, { left: 0.2, right: 0.1, top: 0.12, bottom: 0.1 });
  await chooseProfileRegionsInViewport(page, options.regions);
  if (options.scope !== '新建') await dialog.getByRole('tab', { name: options.scope }).click({ timeout: 15_000 });
  if (options.throughAll) {
    await dialog.getByLabel('终止条件').selectOption('throughAll', { timeout: 10_000 });
    await expect(dialog.getByLabel('深度')).toBeDisabled({ timeout: 10_000 });
  } else {
    await dialog.getByLabel('深度').fill(options.distance ?? '', { timeout: 10_000 });
  }
  if (options.directionBackward) {
    await dialog.getByRole('button', { name: '方向', exact: true }).click();
    await dialog.getByLabel('方向').selectOption('backward', { timeout: 10_000 });
  }
  await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 20_000 });
}

async function confirmExtrude(page: Parameters<typeof demoShot>[0], label: string): Promise<void> {
  const dialog = page.getByTestId('part-studio-feature-dialog');
  await dialog.getByRole('button', { name: '确认' }).click({ timeout: 30_000 });
  await expect(
    page.getByTestId('part-studio-feature-list').getByRole('button', { name: /拉伸/ }).last()
      .or(dialog.getByTestId('part-studio-feature-dialog-error')),
  ).toBeVisible({ timeout: 180_000 });
  if ((await dialog.getByTestId('part-studio-feature-dialog-error').count()) > 0)
    throw new Error(`${label}拒收: ${await dialog.getByTestId('part-studio-feature-dialog-error').textContent()}`);
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

test.describe('示例 iModel：Sample Assignment', () => {
  test('底板 + 3 次通孔移除 + 4 竖边倒角 → 推送 → 重开', async ({ page, request }) => {
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

    // ── Sketch 1 → Extrude NEW 6.35 ────────────────────────────────────────
    await insertSketch(ctx, token, SKETCH_1, PLANE_0, 'Sketch 1（外框）');
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    await openNewestSketch(page, RANGE);
    await demoShot(page, {
      dir: DEMO_DIR, index: 2, slug: 'sketch-1',
      title: '2. 精确复原 Sketch 1（63.5 × 26.035）', detail: 'Top 平面外框；采集实体经同一 FeatureOp 管道写入。',
    });
    await finishSketch(page);
    await openExtrude(page, { scope: '新建', distance: '6.35', regions: [0] });
    await demoShot(page, {
      dir: DEMO_DIR, index: 3, slug: 'extrude-1-dialog',
      title: '3. 真实 UI 拉伸（新建，6.35 mm）', detail: '单面域、方向 +Z、新建实体。',
    });
    await confirmExtrude(page, '拉伸 1');
    await frameStandardView(page, 6, RANGE, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    await demoShot(page, {
      dir: DEMO_DIR, index: 4, slug: 'extrude-1-result',
      title: '4. 底板结果', detail: '63.5 × 26.035 × 6.35 mm 底板。',
    });

    // ── Sketch 2 → Cut 2 × ⌀11.43 half notches ─────────────────────────────
    await insertSketch(ctx, token, SKETCH_2, PLANE_TOP, 'Sketch 2（⌀11.43）');
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    await openNewestSketch(page, RANGE_TOP);
    await demoShot(page, {
      dir: DEMO_DIR, index: 5, slug: 'sketch-2',
      title: '5. 精确复原 Sketch 2（2 × ⌀11.43）', detail: 'Top 面偏移 z=6.35；两圆圆心落在板边，按采集同时选择两个面域。',
    });
    await finishSketch(page);
    await openExtrude(page, { scope: '移除', regions: [0, 1], throughAll: true, directionBackward: true });
    await demoShot(page, {
      dir: DEMO_DIR, index: 6, slug: 'cut-1-dialog',
      title: '6. 真实 UI 移除（2 面域，完全贯穿）', detail: '两圆面域、反向、完全贯穿；圆心在板边形成两个半圆缺口。',
    });
    await confirmExtrude(page, 'Cut 2 holes');

    // ── Sketch 3 → Cut 2 × ⌀6.35 half notches ──────────────────────────────
    await insertSketch(ctx, token, SKETCH_3, PLANE_TOP, 'Sketch 3（⌀6.35）');
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    await openNewestSketch(page, RANGE_TOP);
    await demoShot(page, {
      dir: DEMO_DIR, index: 7, slug: 'sketch-3',
      title: '7. 精确复原 Sketch 3（2 × ⌀6.35）', detail: 'Top 面偏移 z=6.35；同样选择两个面域。',
    });
    await finishSketch(page);
    await openExtrude(page, { scope: '移除', regions: [0, 1], throughAll: true, directionBackward: true });
    await demoShot(page, {
      dir: DEMO_DIR, index: 8, slug: 'cut-2-dialog',
      title: '8. 真实 UI 移除（2 面域，完全贯穿）', detail: '两圆面域、反向、完全贯穿。',
    });
    await confirmExtrude(page, 'Cut 2 more holes');

    // ── Sketch 4 → Cut the rounded slot ────────────────────────────────────
    await insertSketch(ctx, token, SKETCH_4, PLANE_TOP, 'Sketch 4（圆头槽）');
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    await openNewestSketch(page, RANGE_TOP);
    await demoShot(page, {
      dir: DEMO_DIR, index: 9, slug: 'sketch-4',
      title: '9. 精确复原 Sketch 4（圆头槽）', detail: '两线 + 两半圆弧的并集外边界（原示例为两整圆，面域并集语义等价）。',
    });
    await finishSketch(page);
    await openExtrude(page, { scope: '移除', regions: [0], throughAll: true, directionBackward: true });
    await demoShot(page, {
      dir: DEMO_DIR, index: 10, slug: 'cut-slot-dialog',
      title: '10. 真实 UI 移除圆头槽（完全贯穿）', detail: '单一面域、反向、完全贯穿。',
    });
    await confirmExtrude(page, 'Extrude 2');

    // ── Chamfer：四条竖边，1.524 mm（OFFSET_ANGLE 45° 等价等距）────────────
    await page.waitForTimeout(2_000);
    await frameStandardView(page, 6, RANGE, { left: 0.15, right: 0.05, top: 0.12, bottom: 0.1 });
    const chamferDialog = page.getByTestId('part-studio-feature-dialog');
    await page.getByRole('button', { name: '倒角', exact: true }).click({ timeout: 30_000 });
    await expect(chamferDialog).toBeVisible({ timeout: 30_000 });
    const addEdge = chamferDialog.getByTestId('part-studio-feature-dialog-add-edge');
    await addEdge.click();
    const chips = chamferDialog.getByTestId('part-studio-feature-dialog-edge-chips').locator('li');
    const chipCount = async (): Promise<number> => chips.count().catch(() => 0);
    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const canvasBox = await canvas.boundingBox();
    if (!canvasBox) throw new Error('倒角拾取：无画布');
    const hub = { x: canvasBox.x, y: canvasBox.y };
    const pick = async (view: number, world: { x: number; y: number; z: number }, expected: number): Promise<void> => {
      // 直视图下把模型整体推到对话框右侧，四条竖边都清晰可点。
      await frameStandardView(page, view, RANGE, { left: 0.5, right: 0.05, top: 0.2, bottom: 0.2 });
      const candidates = [world, { x: world.x, y: world.y, z: 1.6 }, { x: world.x, y: world.y, z: 4.75 }];
      for (const candidate of candidates) {
        const [screen] = await projectWorld(page, hub, [candidate]);
        if (!screen) continue;
        await dataPoint(page, screen.x, screen.y);
        const count = await chipCount();
        console.log(`[sample-assignment] pick view=${view} (${world.x},${world.y},${candidate.z}) chips=${count}`);
        if (count === expected) return;
        if (count > expected) throw new Error(`倒角拾取多选了边（期望 ${expected}）`);
      }
      await page.screenshot({ path: 'test-results/sample-chamfer-pick-fail.png' });
      throw new Error(`倒角拾取未命中 (${world.x},${world.y})`);
    };
    await pick(5, { x: 0, y: 26.035, z: 3.175 }, 1);
    await pick(5, { x: 63.5, y: 26.035, z: 3.175 }, 2);
    await pick(4, { x: 0, y: 0, z: 3.175 }, 3);
    await pick(4, { x: 63.5, y: 0, z: 3.175 }, 4);
    await addEdge.click();
    await expect(addEdge).toHaveAttribute('aria-pressed', 'false');
    await chamferDialog.getByRole('combobox', { name: '倒角类型' }).selectOption('distanceAngle');
    await chamferDialog.getByRole('textbox', { name: '距离' }).fill('1.524');
    await chamferDialog.getByRole('textbox', { name: '角度' }).fill('45');
    await expect(chamferDialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 15_000 });
    await frameStandardView(page, 6, RANGE, { left: 0.55, right: 0.05, top: 0.08, bottom: 0.22 });
    await demoShot(page, {
      dir: DEMO_DIR, index: 11, slug: 'chamfer-dialog',
      title: '11. 真实 UI 倒角（4 条竖边，距离-角度 1.524 mm / 45°）',
      detail: '与采集的 OFFSET_ANGLE 一致；载荷 mode=3。',
    });
    await chamferDialog.getByRole('button', { name: '确认' }).click({ timeout: 30_000 });
    await expect(
      page.getByTestId('part-studio-feature-list').getByRole('button', { name: /倒角/ })
        .or(chamferDialog.getByTestId('part-studio-feature-dialog-error')),
    ).toBeVisible({ timeout: 180_000 });
    if ((await chamferDialog.getByTestId('part-studio-feature-dialog-error').count()) > 0)
      throw new Error(`倒角拒收: ${await chamferDialog.getByTestId('part-studio-feature-dialog-error').textContent()}`);
    await expect(chamferDialog).toBeHidden({ timeout: 30_000 });

    await page.reload();
    ctx = await openExampleEditor(page, ids);
    await page.waitForTimeout(3_000);
    await frameStandardView(page, 6, RANGE, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual([
      'sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude', 'chamfer',
    ]);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const mass = await getMassPropertiesRpc(ctx, token);
    const volume = mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[sample-assignment] volume=${volume.toFixed(3)} expected=${EXPECTED_VOLUME_MM3}`);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);
    expect(mass.length).toBe(1);
    await demoShot(page, {
      dir: DEMO_DIR, index: 12, slug: 'result',
      title: '12. 最终模型', detail: `特征树 9 项；体积 ${volume.toFixed(3)} mm³（目标 ${EXPECTED_VOLUME_MM3}）。`,
    });

    await pushExampleChanges(page, `Onshape example: ${EXAMPLE_NAME}`);
    const changesets = await listExampleChangesets(request, token, ctx.imodelId);
    expect(changesets.some((entry) => (entry.description ?? '').includes(EXAMPLE_NAME))).toBe(true);
    await demoShot(page, {
      dir: DEMO_DIR, index: 13, slug: 'pushed',
      title: '13. 推送到 hub', detail: '示例 changeset 已持久化。',
    });

    await page.reload();
    await openExampleEditor(page, ids);
    const reopened = await getFeatureTreeRpc(ctx, token);
    expect(reopened.map((row) => row.featureType)).toEqual([
      'sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude', 'chamfer',
    ]);
    const reopenedMass = await getMassPropertiesRpc(ctx, token);
    expect(reopenedMass.reduce((sum, entry) => sum + entry.volume, 0) / EXPECTED_VOLUME_MM3).toBeGreaterThan(0.99);
    await page.waitForTimeout(2_000);
    await frameStandardView(page, 6, RANGE, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    await demoShot(page, {
      dir: DEMO_DIR, index: 14, slug: 'reopened',
      title: '14. 重开 iModel 验证', detail: '特征树 9 项、单 body、体积仍在。',
    });
  });
});
