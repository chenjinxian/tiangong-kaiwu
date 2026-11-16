/**
 * W23 真栈验收（live 2026-11-17）：草图工具栏飞菜单组的主钮 = 最近使用变体。
 *
 * live：选行后主钮 label/tooltip/icon 切到该变体并立即激活；工具退出
 * （Escape）不还原；退出并重进草图编辑仍保持。主钮点击激活当前展示的变体。
 */
import { expect, test } from '@playwright/test';
import { getApiToken, openSeedImodelEditor } from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { chooseSketchPlaneInViewport, finishSketch } from './tutorial2-helpers.js';

async function iconMarkup(locator: import('@playwright/test').Locator): Promise<string> {
  return locator.locator('svg').first().evaluate((el) => el.innerHTML);
}

test.describe('W23 草图工具栏最近使用变体', () => {
  test('选变体→主钮切换/激活→Escape 保持→重进草图保持', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 180_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    await openSeedImodelEditor(page, seed);

    await page.getByRole('button', { name: '草图', exact: true }).click();
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
    await chooseSketchPlaneInViewport(page, 'front');
    const toolbar = page.getByRole('toolbar', { name: '草图工具' });
    await expect(toolbar).toBeVisible({ timeout: 60_000 });

    // 默认态：圆弧组主钮 = 三点圆弧 (a)。
    const arcDropdown = toolbar.getByTestId('part-studio-ribbon-dropdown-Sketch.Arc3Point');
    const arcMain = arcDropdown.locator('.part-studio-ribbon__tool');
    await expect(arcMain).toHaveAttribute('title', '三点圆弧 (a)');
    const arcDefaultIcon = await iconMarkup(arcMain);

    // 飞菜单选圆心圆弧：主钮 title/aria/图标全部切到该变体，并立即激活工具。
    await arcDropdown.getByRole('button', { name: '三点圆弧 ▾' }).click();
    const centerArcRow = page.getByRole('menuitem', { name: '圆心圆弧', exact: true });
    const centerArcIcon = await iconMarkup(centerArcRow);
    expect(centerArcIcon).not.toBe(arcDefaultIcon);
    await centerArcRow.click();
    await expect(arcMain).toHaveAttribute('title', '圆心圆弧');
    await expect(arcMain).toHaveAttribute('aria-label', '圆心圆弧');
    expect(await iconMarkup(arcMain)).toBe(centerArcIcon);
    await expect(arcMain).toHaveAttribute('aria-pressed', 'true');

    // 主钮激活当前展示的变体：重新点击后仍为圆心圆弧工具激活态。
    await arcMain.click();
    await expect(arcMain).toHaveAttribute('aria-pressed', 'true');

    // 工具退出不还原主钮变体。
    await page.keyboard.press('Escape');
    await expect(arcMain).toHaveAttribute('aria-pressed', 'false', { timeout: 15_000 });
    await expect(arcMain).toHaveAttribute('title', '圆心圆弧');

    // 缩放/矩形组同样记忆：中心点矩形 (r)。
    const rectDropdown = toolbar.getByTestId('part-studio-ribbon-dropdown-Sketch.Rectangle');
    const rectMain = rectDropdown.locator('.part-studio-ribbon__tool');
    await rectDropdown.getByRole('button', { name: '拐角矩形 ▾' }).click();
    await page.getByRole('menuitem', { name: '中心点矩形', exact: true }).click();
    await expect(rectMain).toHaveAttribute('title', '中心点矩形 (r)');
    await expect(rectMain).toHaveAttribute('aria-label', '中心点矩形');
    await page.keyboard.press('Escape');

    // 完成草图后重进：两组主钮仍保持最近使用变体（会话内状态）。
    await finishSketch(page);
    const sketchRow = page.getByTestId('part-studio-feature-list')
      .getByRole('button', { name: /草图 1/ });
    await sketchRow.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });
    const reArcMain = page.getByTestId('part-studio-ribbon-dropdown-Sketch.Arc3Point')
      .locator('.part-studio-ribbon__tool');
    const reRectMain = page.getByTestId('part-studio-ribbon-dropdown-Sketch.Rectangle')
      .locator('.part-studio-ribbon__tool');
    await expect(reArcMain).toHaveAttribute('title', '圆心圆弧');
    await expect(reRectMain).toHaveAttribute('title', '中心点矩形 (r)');

    // 快捷键 a 走同一「最近使用」路径：圆弧组主钮回到三点圆弧 (a)。
    await page.keyboard.press('a');
    await expect(reArcMain).toHaveAttribute('title', '三点圆弧 (a)', { timeout: 15_000 });
  });
});
