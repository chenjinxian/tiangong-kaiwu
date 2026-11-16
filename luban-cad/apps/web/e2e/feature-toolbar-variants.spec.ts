/**
 * W26 真栈验收（live 2026-11-17）：特征工具栏飞菜单组的主钮 = 最近使用变体。
 *
 * live：选行后主钮 label/tooltip/icon 切到该变体并立即激活（对话框或工具），
 * 主钮点击激活当前展示的变体。面混合是无产品通道的变体 → gated 能力引导，
 * 不允许静默 no-op。所有操作仅开/关对话框，不提交几何。
 */
import { expect, test } from '@playwright/test';
import { getApiToken, openSeedImodelEditor } from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';

test.describe('W26 特征工具栏最近使用变体', () => {
  test('线性阵列→环形阵列主钮切换/对话框；回选父行；面混合 gated 引导', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 120_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    await openSeedImodelEditor(page, seed);

    const dialog = page.getByTestId('part-studio-feature-dialog');
    const patternGroup = page.getByTestId('part-studio-ribbon-dropdown-LinearPattern');
    const patternMain = patternGroup.locator('.part-studio-ribbon__tool');
    const patternDefaultIcon = await patternMain.locator('svg').first().evaluate((el) => el.innerHTML);

    // 默认态：主钮 = 线性阵列。
    await expect(patternMain).toHaveAttribute('title', '线性阵列');

    // 选环形阵列：主钮切换（title/label/图标）并立即开圆周阵列对话框。
    await patternGroup.getByRole('button', { name: '线性阵列 ▾' }).click();
    await page.getByRole('menuitem', { name: '环形阵列', exact: true }).click();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(patternMain).toHaveAttribute('title', '环形阵列');
    await expect(patternMain).toHaveAttribute('aria-label', '环形阵列');
    const circularIcon = await patternMain.locator('svg').first().evaluate((el) => el.innerHTML);
    expect(circularIcon).not.toBe(patternDefaultIcon);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // 工具退出不还原主钮；点主钮再次激活当前变体（圆周对话框）。
    await expect(patternMain).toHaveAttribute('title', '环形阵列');
    await patternMain.click();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // 回选父行 → 主钮恢复线性阵列（父行激活同时开线性阵列对话框）。
    await patternGroup.getByRole('button', { name: '线性阵列 ▾' }).click();
    await page.getByTestId('part-studio-ribbon-menu-row-LinearPattern').click();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(patternMain).toHaveAttribute('title', '线性阵列');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    // 主钮打开当前变体（线性阵列对话框）。
    await patternMain.click();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // 圆角→面混合：无产品通道 → 选行/主钮都开能力引导（gated，不静默 no-op）。
    const filletGroup = page.getByTestId('part-studio-ribbon-dropdown-RoundEdges');
    const filletMain = filletGroup.locator('.part-studio-ribbon__tool');
    await filletGroup.getByRole('button', { name: '圆角 ▾' }).click();
    await page.getByRole('menuitem', { name: '面混合', exact: true }).click();
    const guidance = page.getByRole('dialog', { name: '面混合（规划中）' });
    await expect(guidance).toBeVisible({ timeout: 15_000 });
    await guidance.getByRole('button', { name: '知道了' }).click();
    await expect(filletMain).toHaveAttribute('title', '面混合');
    await filletMain.click();
    await expect(page.getByRole('dialog', { name: '面混合（规划中）' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('dialog', { name: '面混合（规划中）' }).getByRole('button', { name: '知道了' }).click();

    // 回选父行恢复圆角主钮（父行激活开 fillet 对话框，关闭后检查主钮）。
    await filletGroup.getByRole('button', { name: '圆角 ▾' }).click();
    await page.getByTestId('part-studio-ribbon-menu-row-RoundEdges').click();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(filletMain).toHaveAttribute('title', '圆角 (shift+f)');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 15_000 });
  });
});
