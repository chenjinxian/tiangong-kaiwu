/**
 * ADR-0017 Stage C（真栈）：Onshape「插入新页签」菜单 + 自动命名。
 *
 * 覆盖：
 *  1) 「+」打开「插入新页签」菜单：Onshape 顺序（live 证据
 *     ui-evidence/editor-flow-parity-20261112），未支持项禁用并标「未支持」；
 *  2) 「创建 Part Studio」新建 scope：页签 +1、自动命名 Part Studio 2/3、
 *     URL 换 `?model=`、新页签 active；
 *  3) 切页签只换 URL：Briefcase 连接键不变、连接态仍「已连接」。
 */
import { expect, test } from '@playwright/test';
import {
  getApiToken,
  openSeedImodelEditor,
  readModelScopeId,
  readOpenBriefcaseInfo,
} from './helpers';
import { resetBModelSeed, type SeedImodelRef } from './seed';

test.describe('插入新页签（Stage C）', () => {
  let seed: SeedImodelRef | undefined;
  test.beforeEach(async ({ page, request }) => {
    test.setTimeout(900_000);
    seed = await resetBModelSeed(request, await getApiToken());
    await openSeedImodelEditor(page, seed);
  });

  test('菜单结构 + 连续创建自动命名 + 切换不重建连接', async ({ page }) => {
    expect(seed).toBeTruthy();
    const tabStrip = page.getByTestId('part-studio-tab-strip');
    const tabs = tabStrip.locator('[data-studio-id]');
    await expect(tabs).toHaveCount(1, { timeout: 60_000 });
    const firstScope = readModelScopeId(page);
    expect(firstScope).toBeTruthy();
    await expect(tabStrip.locator(`[data-studio-id="${firstScope}"]`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const connectionBefore = await readOpenBriefcaseInfo(page);

    // ── 1) 菜单结构（顺序 / 禁用 / 未支持标注）─────────────────────────────
    await page.getByTestId('part-studio-new-tab-button').click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    const labels = await menu.getByRole('menuitem').allTextContents();
    expect(labels.map((label) => label.replace(/\s+/g, ''))).toEqual([
      '应用程序未支持',
      '创建材料库未支持',
      '创建FeatureStudio未支持',
      '创建CAMStudio未支持',
      '创建PCBStudio未支持',
      '创建RenderStudio未支持',
      '创建PartStudio',
      '创建装配体未支持',
      '创建VariableStudio未支持',
      '创建工程图…未支持',
      '创建文件夹未支持',
      '导入…未支持',
    ]);
    await expect(menu.getByRole('separator')).toHaveCount(3);
    await expect(menu.getByRole('menuitem', { name: /创建装配体/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(menu.getByRole('menuitem', { name: '创建 Part Studio' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );

    // ── 2) 连续创建：自动命名 Part Studio 2 / 3 ────────────────────────────
    await menu.getByRole('menuitem', { name: '创建 Part Studio' }).click();
    await expect(tabs).toHaveCount(2, { timeout: 60_000 });
    const secondScope = readModelScopeId(page);
    expect(secondScope).toBeTruthy();
    expect(secondScope).not.toBe(firstScope);
    await expect(tabStrip.locator(`[data-studio-id="${secondScope}"]`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(tabStrip.locator(`[data-studio-id="${secondScope}"]`)).toContainText(
      'Part Studio 2',
    );

    await page.getByTestId('part-studio-new-tab-button').click();
    await page.getByRole('menu').getByRole('menuitem', { name: '创建 Part Studio' }).click();
    await expect(tabs).toHaveCount(3, { timeout: 60_000 });
    const thirdScope = readModelScopeId(page);
    expect(thirdScope).toBeTruthy();
    await expect(tabStrip.locator(`[data-studio-id="${thirdScope}"]`)).toContainText(
      'Part Studio 3',
    );

    // ── 3) 切回第一页签：只换 URL，连接键稳定 ──────────────────────────────
    await tabStrip.locator(`[data-studio-id="${firstScope}"]`).click();
    await expect(page).toHaveURL(new RegExp(`[?&]model=${firstScope}`), { timeout: 30_000 });
    await expect(tabStrip.locator(`[data-studio-id="${firstScope}"]`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('part-studio-status-connection')).toHaveText('已连接', {
      timeout: 60_000,
    });
    const connectionAfter = await readOpenBriefcaseInfo(page);
    expect(connectionAfter.key).toBe(connectionBefore.key);
  });
});
