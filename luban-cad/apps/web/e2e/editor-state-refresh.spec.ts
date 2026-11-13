/**
 * 2026-11-13 用户反馈回归（真栈）：
 * 1) 点击「草图」后在视口选择草图平面 → **直接进入草图编辑**（无需再点确认）；
 * 2) 双击草图节点编辑时，下游拉伸体不显示（faces neverDrawn + 拓扑边清空）；
 * 3) 删除拉伸/草图节点后渲染同步（consumed body neverDrawn；树/零件数同步）；
 * 4) 第二个 Part Studio 只显示自己的物理模型（不泄漏第一个 PS 的体）。
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SketchConstraintDto, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getBodiesRpc,
  openSeedImodelEditor,
  releaseWriteLease,
} from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { chooseSketchPlaneInViewport, finishSketch } from './tutorial2-helpers';

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

function rectangleSketch(width: number, height: number): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
  return {
    entities: [
      { kind: 'line', id: 11, p1: { x: 0, y: 0 }, p2: { x: width, y: 0 } },
      { kind: 'line', id: 12, p1: { x: width, y: 0 }, p2: { x: width, y: height } },
      { kind: 'line', id: 13, p1: { x: width, y: height }, p2: { x: 0, y: height } },
      { kind: 'line', id: 14, p1: { x: 0, y: height }, p2: { x: 0, y: 0 } },
    ],
    constraints: [
      { kind: 'horizontal', id: 21, refs: [11] },
      { kind: 'vertical', id: 22, refs: [12] },
      { kind: 'horizontal', id: 23, refs: [13] },
      { kind: 'vertical', id: 24, refs: [14] },
    ],
  };
}

async function viewInfo(page: Page): Promise<{ models: string[]; neverDrawn: string[] }> {
  return page.evaluate(() => {
    const vp = (window as any).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
    const it = (set: any) => (set ? Array.from(set) as string[] : []);
    return { models: it(vp?.view?.modelSelector?.models), neverDrawn: it(vp?.neverDrawn) };
  });
}

async function setupBox(page: Page, request: Parameters<typeof resetBModelSeed>[0]): Promise<{
  ctx: Awaited<ReturnType<typeof openSeedImodelEditor>>;
  token: string;
  sketchId: string;
  extrudeId: string;
  bodyKey: string;
}> {
  const token = await getApiToken();
  const seed = await resetBModelSeed(request, token);
  const openWithRetry = async () => {
    try {
      return await openSeedImodelEditor(page, seed);
    } catch {
      await page.reload();
      return await openSeedImodelEditor(page, seed);
    }
  };
  let ctx = await openWithRetry();
  const lease = await borrowWriteLease(ctx, token, 'editor-state-refresh');
  const rect = rectangleSketch(20, 20);
  const sketch = await applyFeatureOpRpc(ctx, {
    kind: 'insertSketch', entities: rect.entities, constraints: rect.constraints, plane: XY_PLANE,
  }, lease, token);
  assertFeatureOpOk(sketch, '草图');
  const extrude = await applyFeatureOpRpc(ctx, {
    kind: 'insertFeature', featureType: 'extrude',
    params: { profile: [], distance: 10, sketchId: sketch.featureId!, regions: [0], operation: 'new' },
  }, lease, token);
  assertFeatureOpOk(extrude, '拉伸');
  const bodies = await getBodiesRpc(ctx, token);
  const body = bodies.find((item) => item.active !== false && item.authored !== false);
  expect(body).toBeDefined();
  await releaseWriteLease(ctx, lease, token);

  await page.reload();
  ctx = await openWithRetry();
  await expect(page.getByTestId(`tree-row-${extrude.featureId!}`)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('part-studio-part-count')).toHaveText('(1)', { timeout: 60_000 });
  return {
    ctx, token,
    sketchId: sketch.featureId!,
    extrudeId: extrude.featureId!,
    bodyKey: body!.bodyKey,
  };
}

test.describe('编辑器状态/渲染刷新回归（2026-11-13）', () => {
  test('选草图平面即进入编辑（无需确认）', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    await openSeedImodelEditor(page, seed);

    await page.getByRole('button', { name: '草图', exact: true }).click();
    const dialog = page.getByTestId('part-studio-sketch-dialog');
    await expect(dialog).toBeVisible();
    await chooseSketchPlaneInViewport(page, 'front');
    // 不点确认：选平面后应已进入草图编辑（草图工具栏变身）。
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByRole('combobox', { name: '草图平面' })).toContainText('Front');
    // 草图节点已创建（insertSketch 已提交）。
    await finishSketch(page);
    await expect(page.getByTestId('part-studio-feature-list').getByRole('button', { name: /草图/ }).first())
      .toBeVisible({ timeout: 30_000 });
  });

  test('双击草图隐藏下游体；删除拉伸/草图后渲染同步', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const { sketchId, extrudeId, bodyKey } = await setupBox(page, request);

    const before = await viewInfo(page);
    expect(before.neverDrawn).toHaveLength(0);

    // 双击草图进入编辑：下游拉伸体 faces 隐藏（neverDrawn 含 bodyKey）。
    await page.getByTestId(`tree-row-${sketchId}`).dblclick({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });
    await expect.poll(async () => (await viewInfo(page)).neverDrawn, {
      timeout: 20_000,
      intervals: [300, 600, 1200],
    }).toContain(bodyKey);

    await finishSketch(page);
    await expect.poll(async () => (await viewInfo(page)).neverDrawn, {
      timeout: 20_000,
      intervals: [300, 600, 1200],
    }).toHaveLength(0);

    // 删除拉伸：consumed body 隐藏（neverDrawn 含 bodyKey），零件数归零。
    await page.getByTestId(`tree-row-${extrudeId}`).click({ button: 'right' });
    await page.getByRole('menuitem', { name: '删除', exact: true }).click();
    await expect(page.getByTestId(`tree-row-${extrudeId}`)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('part-studio-part-count')).toHaveText('(0)', { timeout: 30_000 });
    await expect.poll(async () => (await viewInfo(page)).neverDrawn, {
      timeout: 20_000,
      intervals: [300, 600, 1200],
    }).toContain(bodyKey);

    // 删除草图：树行移除，渲染不再有可见体。
    await page.getByTestId(`tree-row-${sketchId}`).click({ button: 'right' });
    await page.getByRole('menuitem', { name: '删除', exact: true }).click();
    await expect(page.getByTestId(`tree-row-${sketchId}`)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('part-studio-feature-count')).toHaveText('(4)', { timeout: 30_000 });
  });

  test('第二个 Part Studio 只显示自己的模型（首个 PS 体不泄漏）', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    await setupBox(page, request);
    const studio1 = await viewInfo(page);
    expect(studio1.models).toHaveLength(1);
    const studio1Model = studio1.models[0]!;

    await page.getByTestId('part-studio-new-tab-button').click();
    await page.getByRole('menuitem', { name: '创建 Part Studio' }).click();
    await expect(page.getByRole('tab', { name: 'Part Studio 2' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-part-count')).toHaveText('(0)', { timeout: 60_000 });
    await expect.poll(async () => (await viewInfo(page)).models, {
      timeout: 30_000,
      intervals: [300, 600, 1200],
    }).toHaveLength(1);
    const studio2 = await viewInfo(page);
    expect(studio2.models[0]).not.toBe(studio1Model);

    // 切回 PS1：只显示 PS1 模型；再切 PS2：仍只显示 PS2 模型。
    await page.getByRole('tab', { name: 'Part Studio 1' }).click();
    await expect(page.getByTestId('part-studio-part-count')).toHaveText('(1)', { timeout: 60_000 });
    await expect.poll(async () => (await viewInfo(page)).models, {
      timeout: 30_000,
      intervals: [300, 600, 1200],
    }).toEqual([studio1Model]);
    await page.getByRole('tab', { name: 'Part Studio 2' }).click();
    await expect.poll(async () => (await viewInfo(page)).models, {
      timeout: 30_000,
      intervals: [300, 600, 1200],
    }).toEqual(studio2.models);
  });
});
