/**
 * W26/W27/W29 真栈验收（live 2026-11-17）：特征工具栏飞菜单组的主钮 = 最近
 * 使用变体，平面/框架/钣金飞菜单子项的 live sprite 图标，以及特征对话框打开
 * 期间对应主钮的激活态。
 *
 * live：选行后主钮 label/tooltip/icon 切到该变体并立即激活（对话框或工具），
 * 主钮点击激活当前展示的变体。面混合是无产品通道的变体 → gated 能力引导，
 * 不允许静默 no-op。W27 行图标：平面 26 / 框架 5 / 钣金 12 行，每行专属
 * sprite；薄片/角点 tooltip = 页签/尖角。W29：特征对话框打开期间对应主钮
 * aria-pressed=true（拉伸/圆角/环形阵列），关闭即恢复。所有操作仅开/关菜单与
 * 对话框，不提交几何。
 */
import type { Locator } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { getApiToken, openSeedImodelEditor } from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';

test.describe('W26/W27/W29 特征工具栏最近使用变体、子项图标与对话框激活态', () => {
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

  test('W29 特征对话框打开期间主钮压按；关闭恢复（拉伸/圆角/环形阵列）', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 120_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    await openSeedImodelEditor(page, seed);

    const dialog = page.getByTestId('part-studio-feature-dialog');

    // 拉伸：点主钮开对话框 → 主钮压按；Escape 关闭 → 恢复。
    const extrudeMain = page.getByTestId('part-studio-ribbon').getByRole('button', { name: '拉伸', exact: true });
    await expect(extrudeMain).toHaveAttribute('aria-pressed', 'false');
    await extrudeMain.click();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(extrudeMain).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(extrudeMain).toHaveAttribute('aria-pressed', 'false');

    // 圆角：同姿态（飞菜单组主钮）。
    const filletGroup = page.getByTestId('part-studio-ribbon-dropdown-RoundEdges');
    const filletMain = filletGroup.locator('.part-studio-ribbon__tool');
    await expect(filletMain).toHaveAttribute('aria-pressed', 'false');
    await filletMain.click();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(filletMain).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(filletMain).toHaveAttribute('aria-pressed', 'false');

    // 环形阵列：选行开圆周阵列对话框 → 组主钮（标签环形阵列）压按；Escape 恢复
    // （变体保持环形阵列，不回退线性）。
    const patternGroup = page.getByTestId('part-studio-ribbon-dropdown-LinearPattern');
    const patternMain = patternGroup.locator('.part-studio-ribbon__tool');
    await patternGroup.getByRole('button', { name: '线性阵列 ▾' }).click();
    await page.getByRole('menuitem', { name: '环形阵列', exact: true }).click();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(patternMain).toHaveAttribute('title', '环形阵列');
    await expect(patternMain).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(patternMain).toHaveAttribute('aria-pressed', 'false');
    await expect(patternMain).toHaveAttribute('title', '环形阵列');
  });

  test('W27 平面/框架/钣金飞菜单行数与 live 子项 sprite 对齐', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 120_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    await openSeedImodelEditor(page, seed);

    const iconHtml = async (row: Locator): Promise<string> =>
      row.locator('.part-studio-ribbon__menu-icon svg').first().evaluate((el) => el.innerHTML);

    const openFlyout = async (toolId: string, label: string): Promise<{ group: Locator; menu: Locator }> => {
      const group = page.getByTestId(`part-studio-ribbon-dropdown-${toolId}`);
      // 平面/框架/钣金组在 ribbon 横向滚动容器末端：先滚入视野并等滚动事件落定，
      // 否则 RibbonDropdown 的 scroll 收合监听会把刚打开的菜单立即关掉。
      await group.evaluate((el) => el.scrollIntoView({ block: 'nearest', inline: 'center' }));
      await page.waitForTimeout(300);
      await group.getByRole('button', { name: `${label} ▾` }).click();
      const menu = page.getByTestId(`part-studio-ribbon-menu-${toolId}`);
      await expect(menu).toBeVisible({ timeout: 10_000 });
      return { group, menu };
    };

    const assertRows = async (menu: Locator, count: number): Promise<void> => {
      await expect(menu.getByRole('menuitem')).toHaveCount(count);
      for (const row of await menu.getByRole('menuitem').all())
        expect(await row.locator('.part-studio-ribbon__menu-icon svg').count()).toBe(1);
    };

    // 平面 ▾：父行 + 25 子项；代表子项图标互不相同且异于组主图标。
    const plane = await openFlyout('cPlane', '平面');
    await assertRows(plane.menu, 26);
    const planeMainIcon = await plane.group.locator('.part-studio-ribbon__tool svg').first().evaluate((el) => el.innerHTML);
    const offsetIcon = await iconHtml(page.getByTestId('part-studio-ribbon-menu-row-offsetSurface'));
    const boundaryIcon = await iconHtml(page.getByTestId('part-studio-ribbon-menu-row-boundarySurface'));
    expect(offsetIcon).not.toBe(planeMainIcon);
    expect(boundaryIcon).not.toBe(planeMainIcon);
    expect(offsetIcon).not.toBe(boundaryIcon);
    await page.keyboard.press('Escape');
    await expect(plane.menu).toHaveCount(0);

    // 框架 ▾：父行 + 4 子项。
    const frame = await openFlyout('frame', '框架');
    await assertRows(frame.menu, 5);
    const frameMainIcon = await frame.group.locator('.part-studio-ribbon__tool svg').first().evaluate((el) => el.innerHTML);
    const frameTrimIcon = await iconHtml(page.getByTestId('part-studio-ribbon-menu-row-frameTrim'));
    const gussetIcon = await iconHtml(page.getByTestId('part-studio-ribbon-menu-row-gusset'));
    expect(frameTrimIcon).not.toBe(frameMainIcon);
    expect(frameTrimIcon).not.toBe(gussetIcon);
    await page.keyboard.press('Escape');
    await expect(frame.menu).toHaveCount(0);

    // 钣金模型 ▾：父行 + 11 子项；薄片/角点行 title 与 live tooltip 一致。
    const sheetMetal = await openFlyout('sheetMetalStart', '钣金模型');
    await assertRows(sheetMetal.menu, 12);
    const sheetMetalMainIcon = await sheetMetal.group.locator('.part-studio-ribbon__tool svg').first().evaluate((el) => el.innerHTML);
    const flangeIcon = await iconHtml(page.getByTestId('part-studio-ribbon-menu-row-flange'));
    const hemIcon = await iconHtml(page.getByTestId('part-studio-ribbon-menu-row-hem'));
    expect(flangeIcon).not.toBe(sheetMetalMainIcon);
    expect(flangeIcon).not.toBe(hemIcon);
    await expect(page.getByTestId('part-studio-ribbon-menu-row-tab')).toHaveAttribute('title', '页签');
    await expect(page.getByTestId('part-studio-ribbon-menu-row-corner')).toHaveAttribute('title', '尖角');
    await page.keyboard.press('Escape');
    await expect(sheetMetal.menu).toHaveCount(0);
  });
});
