/**
 * 示例 iModel 演示 #5：Exercise: Creating Mate Connectors（Onshape Training Repo）。
 *
 * 场景：scenarios/Onshape-Training-Repo-8343b562bd9a180d26b486b1-761c6b9a50b16a1a6b34d89a.scenario.json
 *
 * 原示例：3 张 Front 偏移平面草图（x=0/2/4）+ 3 次 2 mm 拉伸：
 *   Sketch 1 → Extrude 1(new) → Sketch 2 → Extrude 2(new, 合并后的圆头槽面域) → Sketch 3 → Extrude 3(remove, 反向)。
 * 目标 2 个 body：JHD 11704.085 mm³ + JKD 10039.241 mm³ = 21743.326 mm³。
 *
 * 构建方式：草图按采集数据经 RPC 精确复原（偏移平面经 SketchPlaneDto 原样落库）；
 * 三次拉伸都走真实 UI 对话框，移除步骤显式选择目标实体与反向。
 *
 * 面域重建说明：采集数据用两条完整 r10 圆表达圆头（Onshape 面域引擎按重叠
 * 几何并集处理）；本仓面域检测不合并重叠闭环，因此按同一几何重建为“精确切点
 * 角度 + 半圆弧”的单一外环（内孔仍为 r5 圆）。重建后面积与体积等价，且外环
 * 与内孔的拓扑关系与原示例一致。
 */
import { expect, test } from '@playwright/test';
import type { SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getBodiesRpc,
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

const EXAMPLE_NAME = 'Exercise - Creating Mate Connectors';
const DEMO_DIR = 'demo-artifacts/examples/mate-connectors';
const EXPECTED_VOLUME_MM3 = 21743.326;
const EXPECTED_BODY_MM3 = [11704.085, 10039.241];

type Ctx = Awaited<ReturnType<typeof openExampleEditor>>;
type Range = { low: { x: number; y: number; z: number }; high: { x: number; y: number; z: number } };

function frontPlane(x: number): SketchPlaneDto {
  return {
    origin: { x, y: 0, z: 0 },
    normal: { x: 1, y: 0, z: 0 },
    xDir: { x: 0, y: 1, z: 0 },
  };
}

/**
 * Sketch 1 —— 两端 r10 圆头 + 两条切线 + 两个 r5 内孔。
 * 采集数据里圆头是两条完整轮廓圆（Onshape 按“重叠几何并集”成面域）；本仓
 * 面域识别不合并重叠闭环，故按同一几何重建为 2 段切线 + 2 段半圆弧（端点取
 * 采集切点精确角度），使外环+内孔拓扑与原示例一致；面积/体积不受影响。
 */
const PI = Math.PI;
const SKETCH_1: SketchEntityDto[] = [
  { kind: 'circle', id: 1, center: { x: -31.37823560854279, y: 470 }, radius: 5 },
  { kind: 'circle', id: 2, center: { x: -175.71580290594648, y: 220.0000000000065 }, radius: 5 },
  { kind: 'line', id: 3, p1: { x: -31.37823560854279, y: 470 }, p2: { x: -175.71580290594648, y: 220.00000000000654 }, construction: true },
  { kind: 'arc', id: 4, center: { x: -31.37823560854279, y: 470 }, radius: 10, startAngle: 5 * PI / 6, sweepAngle: -PI },
  { kind: 'arc', id: 5, center: { x: -175.71580290594648, y: 220.00000000000654 }, radius: 10, startAngle: -PI / 6, sweepAngle: -PI },
  { kind: 'line', id: 6, p1: { x: -22.717981570698417, y: 465 }, p2: { x: -167.0555488681021, y: 215.0000000000065 } },
  { kind: 'line', id: 7, p1: { x: -40.03848964638716, y: 475 }, p2: { x: -184.37605694379084, y: 225.0000000000066 } },
];

/** Sketch 2 —— 第二个圆头槽（外环 + r5 孔）；圆头同样以精确切点角度重建。 */
const SKETCH_2: SketchEntityDto[] = [
  { kind: 'circle', id: 1, center: { x: 111.83194789468736, y: 233.77965274866006 }, radius: 5, construction: true },
  { kind: 'line', id: 2, p1: { x: 111.83194789468737, y: 233.77965274865997 }, p2: { x: -86.88526487352738, y: 373.8590051358349 }, construction: true },
  { kind: 'circle', id: 3, center: { x: -189.60755293168353, y: 153.49819384744953 }, radius: 5 },
  { kind: 'line', id: 4, p1: { x: -189.60755293168353, y: 153.4981938474495 }, p2: { x: -86.88526487352732, y: 373.8590051358349 }, construction: true },
  { kind: 'arc', id: 5, center: { x: -189.60755293168353, y: 153.4981938474495 }, radius: 10, startAngle: -0.4362068911050496, sweepAngle: -PI },
  { kind: 'arc', id: 6, center: { x: -86.88526487352732, y: 373.8590051358349 }, radius: 10, startAngle: 2.7053857624847426, sweepAngle: -PI },
  { kind: 'line', id: 7, p1: { x: -198.67116078659086, y: 157.72323972323144 }, p2: { x: -95.94887272843467, y: 378.0840510116168 } },
  { kind: 'line', id: 8, p1: { x: -180.54394507677617, y: 149.27314797166756 }, p2: { x: -77.82165701861999, y: 369.63395926005296 } },
];

/** Sketch 3 —— r5 通孔（移除）。 */
const SKETCH_3: SketchEntityDto[] = [
  { kind: 'circle', id: 1, center: { x: -86.88526487352732, y: 373.8590051358349 }, radius: 5 },
];

const RANGE_SKETCH_1: Range = {
  low: { x: -10, y: -195, z: 205 }, high: { x: 15, y: -15, z: 485 },
};
const RANGE_SKETCH_2: Range = {
  low: { x: -10, y: -205, z: 135 }, high: { x: 15, y: -65, z: 390 },
};
const RANGE_SKETCH_3: Range = {
  low: { x: -10, y: -100, z: 355 }, high: { x: 15, y: -75, z: 390 },
};
const RANGE_FINAL: Range = {
  low: { x: -10, y: -210, z: 130 }, high: { x: 15, y: -20, z: 490 },
};

async function insertSketch(
  ctx: Ctx,
  token: string,
  entities: SketchEntityDto[],
  plane: SketchPlaneDto,
  label: string,
): Promise<string> {
  const lease = await borrowWriteLease(ctx, token, `example-mate-${label}`);
  const result = await applyFeatureOpRpc(ctx, {
    kind: 'insertSketch', entities, constraints: [], plane,
  }, lease, token);
  assertFeatureOpOk(result, label);
  if (!result.featureId) throw new Error(`${label} 未返回 featureId`);
  return result.featureId;
}

async function openNewestSketch(
  page: Parameters<typeof demoShot>[0],
  range: Range,
): Promise<void> {
  const featureList = page.getByTestId('part-studio-feature-list');
  const sketchRow = featureList.getByRole('button', { name: /草图/ }).last();
  await expect(sketchRow).toBeVisible({ timeout: 60_000 });
  await sketchRow.dblclick();
  const sketchDialog = page.getByTestId('part-studio-sketch-dialog');
  await expect(sketchDialog).toBeVisible({ timeout: 30_000 });
  await frameStandardView(page, 3, range, { left: 0.3, right: 0.15, top: 0.15, bottom: 0.12 });
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
  options: {
    scope: '新建' | '移除';
    distance: string;
    regions: number[];
    range: Range;
    directionBackward?: boolean;
    targetBodyName?: string;
    throughAll?: boolean;
  },
): Promise<void> {
  const dialog = page.getByTestId('part-studio-feature-dialog');
  await page.getByRole('button', { name: '拉伸', exact: true }).click({ timeout: 30_000 });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await frameStandardView(page, 3, options.range, { left: 0.15, right: 0.05, top: 0.12, bottom: 0.1 });
  await chooseProfileRegionsInViewport(page, options.regions);
  if (options.scope !== '新建')
    await dialog.getByRole('tab', { name: options.scope }).click({ timeout: 15_000 });
  if (options.throughAll) {
    // 2026-11-05：UI 终止条件接入 ADR-0005 endBound；throughAll 时距离框只读。
    await dialog.getByLabel('终止条件').selectOption('throughAll', { timeout: 10_000 });
    await expect(dialog.getByLabel('深度')).toBeDisabled({ timeout: 10_000 });
  } else {
    await dialog.getByLabel('深度').fill(options.distance, { timeout: 10_000 });
  }
  if (options.directionBackward) {
    // 方向段默认展开（SECTIONS.direction.defaultExpanded=true）；再点标题会折叠。
    await dialog.getByRole('button', { name: '方向', exact: true }).click();
    await dialog.getByLabel('方向').selectOption('backward', { timeout: 10_000 });
  }
  if (options.targetBodyName) {
    await expect(dialog.getByTestId('part-studio-feature-dialog-target-body')).toBeVisible({ timeout: 20_000 });
    await dialog.getByLabel('目标实体').selectOption({ label: options.targetBodyName }, { timeout: 10_000 });
  }
  await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 20_000 });
  await dialog.getByRole('button', { name: '确认' }).click({ timeout: 30_000 });
  await expect(
    page.getByTestId('part-studio-feature-list').getByRole('button', { name: /拉伸/ }).last()
      .or(dialog.getByTestId('part-studio-feature-dialog-error')),
  ).toBeVisible({ timeout: 180_000 });
  if ((await dialog.getByTestId('part-studio-feature-dialog-error').count()) > 0)
    throw new Error(`拉伸被拒收: ${await dialog.getByTestId('part-studio-feature-dialog-error').textContent()}`);
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

test.describe('示例 iModel：Mate Connectors', () => {
  test('三张偏移平面草图 + 新建×2 + 反向移除 → 推送 → 重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 1_200_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, EXAMPLE_NAME, {
      reset: process.env.EXAMPLE_RESET === '1',
    });
    let ctx: Ctx = await openExampleEditor(page, ids);
    await demoShot(page, {
      dir: DEMO_DIR, index: 1, slug: 'part-studio',
      title: '1. 打开对应 iModel', detail: `${EXAMPLE_NAME} · 空白 Part Studio。`,
    });

    // ── Sketch 1 (x=0) → Extrude NEW 2 ─────────────────────────────────────
    await insertSketch(ctx, token, SKETCH_1, frontPlane(0), 'Sketch 1');
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    await openNewestSketch(page, RANGE_SKETCH_1);
    await demoShot(page, {
      dir: DEMO_DIR, index: 2, slug: 'sketch-1',
      title: '2. 精确复原 Sketch 1', detail: 'Front 基准面；两端 r10 圆头 + r5 内孔。',
    });
    await finishSketch(page);
    await uiExtrude(page, { scope: '新建', distance: '2', regions: [0], range: RANGE_SKETCH_1 });
    await demoShot(page, {
      dir: DEMO_DIR, index: 3, slug: 'extrude-1',
      title: '3. 真实 UI 拉伸（新建，2 mm）', detail: 'Sketch 1 面域 0 → 第 1 个 body。',
    });

    // ── Sketch 2 (x=2) → Extrude NEW 2（圆头槽并集面域） ────────────────────
    await insertSketch(ctx, token, SKETCH_2, frontPlane(2), 'Sketch 2');
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    await openNewestSketch(page, RANGE_SKETCH_2);
    await demoShot(page, {
      dir: DEMO_DIR, index: 4, slug: 'sketch-2',
      title: '4. 精确复原 Sketch 2', detail: 'Front 基准面偏移 x=2；两个拉伸面域。',
    });
    await finishSketch(page);
    await uiExtrude(page, { scope: '新建', distance: '2', regions: [0], range: RANGE_SKETCH_2 });
    await demoShot(page, {
      dir: DEMO_DIR, index: 5, slug: 'extrude-2',
      title: '5. 真实 UI 拉伸（新建）', detail: '圆头槽面域 0（外环 + r5 孔）→ 第 2 个 body。',
    });

    // ── Sketch 3 (x=4) → Extrude REMOVE 反向 25（目标 = 第 2 个 body） ──────
    const extrude2 = (await getFeatureTreeRpc(ctx, token)).filter((row) => row.featureType === 'extrude').at(-1)!;
    const bodies = await getBodiesRpc(ctx, token);
    const secondBody = bodies.find((body) => body.sourceFeatureId === extrude2.id);
    if (!secondBody) throw new Error('未找到第 2 个拉伸的 body');
    console.log(`[mate-example] target body=${secondBody.name} key=${secondBody.bodyKey}`);
    await insertSketch(ctx, token, SKETCH_3, frontPlane(4), 'Sketch 3');
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    await openNewestSketch(page, RANGE_SKETCH_3);
    await demoShot(page, {
      dir: DEMO_DIR, index: 6, slug: 'sketch-3',
      title: '6. 精确复原 Sketch 3', detail: 'Front 基准面偏移 x=4；r5 通孔。',
    });
    await finishSketch(page);
    await uiExtrude(page, {
      scope: '移除', distance: '25', regions: [0], range: RANGE_SKETCH_3,
      directionBackward: true, targetBodyName: secondBody.name, throughAll: true,
    });
    await demoShot(page, {
      dir: DEMO_DIR, index: 7, slug: 'extrude-3',
      title: '7. 真实 UI 拉伸（移除，完全贯穿）', detail: `目标实体 ${secondBody.name}；Sketch 3 面域 0；终止条件 = 完全贯穿。`,
    });

    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const mass = await getMassPropertiesRpc(ctx, token);
    const volumeMm3 = mass.reduce((sum, entry) => sum + entry.volume, 0);
    console.log(`[mate-example] volume=${volumeMm3.toFixed(3)} mm³ expected=${EXPECTED_VOLUME_MM3} bodies=${JSON.stringify(mass.map((m) => m.volume.toFixed(1)))}`);
    expect(Math.abs(volumeMm3 - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.03);
    expect(mass.length).toBe(2);
    const sortedBodies = [...mass].map((m) => m.volume).sort((a, b) => a - b);
    const sortedExpected = [...EXPECTED_BODY_MM3].sort((a, b) => a - b);
    for (let i = 0; i < 2; i++)
      expect(Math.abs(sortedBodies[i]! - sortedExpected[i]!) / sortedExpected[i]!).toBeLessThan(0.03);
    await page.waitForTimeout(2_000);
    await frameStandardView(page, 6, RANGE_FINAL, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    await demoShot(page, {
      dir: DEMO_DIR, index: 8, slug: 'result',
      title: '8. 最终模型（2 个 body）', detail: `体积 ${volumeMm3.toFixed(3)} mm³（目标 ${EXPECTED_VOLUME_MM3}）；逐 body ${mass.map((m) => m.volume.toFixed(1)).join(' / ')}。`,
    });

    await pushExampleChanges(page, `Onshape example: ${EXAMPLE_NAME}`);
    const changesets = await listExampleChangesets(request, token, ctx.imodelId);
    expect(changesets.some((changeset) => (changeset.description ?? '').includes(EXAMPLE_NAME))).toBe(true);
    await demoShot(page, {
      dir: DEMO_DIR, index: 9, slug: 'pushed',
      title: '9. 推送到 hub', detail: '示例 changeset 已持久化。',
    });

    await page.reload();
    await openExampleEditor(page, ids);
    const reopened = await getFeatureTreeRpc(ctx, token);
    expect(reopened.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude']);
    const reopenedMass = await getMassPropertiesRpc(ctx, token);
    const reopenedVolume = reopenedMass.reduce((sum, entry) => sum + entry.volume, 0);
    expect(reopenedVolume).toBeGreaterThan(EXPECTED_VOLUME_MM3 * 0.97);
    expect(reopenedMass.length).toBe(2);
    await page.waitForTimeout(2_000);
    await frameStandardView(page, 6, RANGE_FINAL, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    await demoShot(page, {
      dir: DEMO_DIR, index: 10, slug: 'reopened',
      title: '10. 重开 iModel 验证', detail: `特征树 6 项、2 body、体积 ${reopenedVolume.toFixed(1)} mm³。`,
    });
  });
});
