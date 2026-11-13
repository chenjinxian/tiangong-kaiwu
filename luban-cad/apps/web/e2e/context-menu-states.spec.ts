/**
 * 画布右键菜单的状态差异（Onshape live `ui-evidence/context-menus-20261113`）：
 * - 特征模式空白：全部显示 / 选择 / 创建选定内容… / 缩放到合适大小 / 等轴测；
 * - 特征对话框打开：首两项 确认 <特征> / 取消（确认/取消经对话框命令槽与 ✓/✗ 同源）；
 * - 草图模式：确认 <草图> 前置 + 复制草图/曲线分析/选择组/缩放/视图垂直于草图平面；
 * - 草图工具激活：首项 退出 <工具>；右键**不**直接退出工具（菜单承担退出）。
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  openSeedImodelEditor,
  releaseWriteLease,
} from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { activate, finishSketch } from './tutorial2-helpers';

const FRONT: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  xDir: { x: 1, y: 0, z: 0 },
};

async function canvasBox(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 90_000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas boundingBox 不可得');
  return { x: box.x, y: box.y, w: box.width, h: box.height };
}

async function rightClick(page: Page, point: { x: number; y: number }, menuName = '画布菜单'): Promise<void> {
  await page.mouse.move(point.x - 20, point.y - 14);
  await page.waitForTimeout(120);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(page.getByRole('menu', { name: menuName })).toBeVisible({ timeout: 10_000 });
}

async function activeTool(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const im = (window as any).__lubanE2E?.coreFrontend?.IModelApp;
    return (im?._toolAdmin ?? im?.toolAdmin)?.activeTool?.toolId;
  });
}

async function enterEmptyFrontSketch(page: Page, request: Parameters<typeof resetBModelSeed>[0]) {
  const token = await getApiToken();
  const seed = await resetBModelSeed(request, token);
  let ctx = await openSeedImodelEditor(page, seed);
  const lease = await borrowWriteLease(ctx, token, 'context-menu');
  const created = await applyFeatureOpRpc(ctx, {
    kind: 'insertSketch', entities: [], constraints: [], plane: FRONT,
  }, lease, token);
  assertFeatureOpOk(created, '草图');
  const sketchId = created.featureId!;
  await releaseWriteLease(ctx, lease, token);
  await page.reload();
  ctx = await openSeedImodelEditor(page, seed);
  const row = page.getByTestId(`tree-row-${sketchId}`);
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.dblclick({ timeout: 30_000 });
  await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => page.evaluate(() =>
    (window as any).__lubanE2EApp?.usePartStudioStore?.getState().sketch.isActive,
  ), { timeout: 30_000 }).toBe(true);
  return { ctx, token, sketchId };
}

test.describe('画布右键菜单状态差异（Onshape 2026-11-13）', () => {
  test('特征模式空白菜单；特征对话框打开时前置 确认/取消（取消经命令槽收合对话框）', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 240_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    await openSeedImodelEditor(page, seed);
    const box = await canvasBox(page);

    // 空白态（左下远离模型/面板）。
    await rightClick(page, { x: box.x + box.w * 0.12, y: box.y + box.h * 0.86 });
    const menu = page.getByRole('menu', { name: '画布菜单' });
    for (const name of ['全部显示', '选择', '创建选定内容…', '缩放到合适大小', '等轴测视图']) {
      await expect(menu.getByRole('menuitem', { name })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    // 打开拉伸对话框（ribbon 特征工具），右键 → 确认 拉伸 / 取消 前置。
    const featureToolbar = page.getByRole('toolbar', { name: '特征工具' });
    await featureToolbar.getByRole('button', { name: '拉伸', exact: true }).click();
    const dialog = page.getByTestId('part-studio-feature-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });

    await rightClick(page, { x: box.x + box.w * 0.12, y: box.y + box.h * 0.86 });
    await expect(menu.getByRole('menuitem', { name: '确认 拉伸' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: '取消' })).toBeVisible();
    await menu.getByRole('menuitem', { name: '取消' }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect.poll(() => page.evaluate(() =>
      (window as any).__lubanE2EApp?.usePartStudioStore?.getState().dialog.active,
    ), { timeout: 15_000 }).toBeNull();
  });

  test('草图模式空白菜单：确认 草图 / 复制草图 / 全部显示 / 视图垂直于草图平面；菜单确认退出草图', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 240_000);
    await enterEmptyFrontSketch(page, request);
    const box = await canvasBox(page);

    await rightClick(page, { x: box.x + box.w * 0.75, y: box.y + box.h * 0.78 }, '草图空白菜单');
    const menu = page.getByRole('menu', { name: '草图空白菜单' });
    await expect(menu.getByRole('menuitem', { name: /^确认 草图/ })).toBeVisible();
    for (const name of ['复制草图', '全部显示', '曲线/曲面分析…', '选择创建选定内容…', '创建选定内容…', '选择其他…', '缩放到合适大小', '视图垂直于草图平面']) {
      await expect(menu.getByRole('menuitem', { name, exact: true })).toBeVisible();
    }
    await menu.getByRole('menuitem', { name: /^确认 草图/ }).click();
    await expect(page.getByRole('toolbar', { name: '特征工具' })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => page.evaluate(() =>
      (window as any).__lubanE2EApp?.usePartStudioStore?.getState().sketch.isActive,
    ), { timeout: 15_000 }).toBe(false);
  });

  test('草图工具激活：右键前置 退出 线；右键不退出工具，菜单项退出工具', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 240_000);
    await enterEmptyFrontSketch(page, request);
    const box = await canvasBox(page);
    await activate(page, '线');

    await rightClick(page, { x: box.x + box.w * 0.75, y: box.y + box.h * 0.78 }, '草图空白菜单');
    const menu = page.getByRole('menu', { name: '草图空白菜单' });
    await expect(menu.getByRole('menuitem', { name: '退出 线' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /^确认 草图/ })).toBeVisible();
    // 右键不退出工具（Onshape：退出由菜单项/Esc 承担）。
    expect(await activeTool(page)).toBe('Sketch.Line');

    await menu.getByRole('menuitem', { name: '退出 线' }).click();
    await expect.poll(() => activeTool(page), { timeout: 15_000, intervals: [200, 400, 800] })
      .not.toBe('Sketch.Line');
    // 草图仍在编辑（只退工具，不退草图）。
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
    await finishSketch(page);
  });
});
