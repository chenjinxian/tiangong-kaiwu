/**
 * 工具栏 live 全量对拍（真栈，2026-11-13）：
 * - 特征「平面 ▾」25 变体 + 父行文案/顺序（私有 live 证据 15-dropdowns.json）；
 * - 草图工具栏约束飞菜单 15 行文案/顺序/keycap（22-sketch-dropdowns.json）；
 * - 快捷键：特征 shift+s 打开草图对话框；草图 l→线、shift+s→点、m→修剪。
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { getApiToken, openSeedImodelEditor } from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { chooseSketchPlaneInViewport, finishSketch } from './tutorial2-helpers';

interface MenuRow { label: string; keys: string[] }

async function readMenu(page: Page, toolId: string): Promise<MenuRow[]> {
  return page.evaluate((id) => {
    const menu = document.querySelector(`[data-testid="part-studio-ribbon-menu-${id}"]`);
    if (!menu)
      return [];
    return [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((row) => ({
      label: row.querySelector('.part-studio-ribbon__menu-label')?.textContent?.trim() ?? '',
      keys: [...row.querySelectorAll('.part-studio-ribbon__shortcut-key')].map((k) => (k.textContent ?? '').trim()),
    }));
  }, toolId);
}

async function activeToolId(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const im = (window as any).__lubanE2E?.coreFrontend?.IModelApp;
    return (im?._toolAdmin ?? im?.toolAdmin)?.activeTool?.toolId;
  });
}

test.describe('工具栏 live 对拍（2026-11-13）', () => {
  test('特征平面▾ 25 变体逐字对齐；shift+s 打开草图对话框', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    await openSeedImodelEditor(page, seed);

    // 1280 视口下工具栏横向可滚动（Onshape 1560 视口不滚）；先滚到末端再点平面▾。
    await page.evaluate(() => {
      const groups = document.querySelector('.part-studio-ribbon__groups') as HTMLElement | null;
      if (groups) groups.scrollLeft = groups.scrollWidth;
    });
    await page.waitForTimeout(250);
    const dropdown = page.getByTestId('part-studio-ribbon-dropdown-cPlane');
    await dropdown.getByRole('button', { name: /▾/ }).click();
    await expect(page.getByTestId('part-studio-ribbon-menu-cPlane')).toBeVisible();
    const rows = await readMenu(page, 'cPlane');
    expect(rows.map((row) => row.label)).toEqual([
      '平面',
      '偏移曲面', '边界曲面', '填充', '移动边界', '直纹曲面', '相互修剪', '约束曲面',
      '螺旋', '3D 拟合样条', '投影曲线', '桥接曲线', '复合曲线', '交点曲线', '修剪曲线',
      '等斜线', '偏移曲线', '等参曲线', '编辑曲线', '路线曲线',
      '配合连接器', '派生', '变量', '查询变量', '复合零件', '标记',
    ]);
    expect(rows.find((row) => row.label === '配合连接器')?.keys).toEqual(['ctrl', 'm']);
    await page.keyboard.press('Escape');

    // Onshape 特征态 shift+s = 创建新草图（打开草图对话框待选平面）。
    await page.mouse.move(900, 400);
    await page.keyboard.press('Shift+S');
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeHidden({ timeout: 30_000 });
  });

  test('草图约束飞菜单 15 行文案/keycap 逐字对齐；l/shift+s/m 快捷键生效', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    await openSeedImodelEditor(page, seed);

    await page.getByRole('button', { name: '草图', exact: true }).click();
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
    await chooseSketchPlaneInViewport(page, 'front');
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const constraints = page.getByTestId('part-studio-ribbon-dropdown-Sketch.Constraint.Coincident');
    await constraints.getByRole('button', { name: /▾/ }).click();
    await expect(page.getByTestId('part-studio-ribbon-menu-Sketch.Constraint.Coincident')).toBeVisible();
    const rows = await readMenu(page, 'Sketch.Constraint.Coincident');
    expect(rows).toEqual([
      { label: '重合', keys: ['i'] },
      { label: '同心', keys: ['shift', 'o'] },
      { label: '平行', keys: ['b'] },
      { label: '相切', keys: ['t'] },
      { label: '水平', keys: ['h'] },
      { label: '竖直', keys: ['v'] },
      { label: '垂直', keys: ['shift', 'l'] },
      { label: '等长', keys: ['e'] },
      { label: '中点', keys: ['shift', 'm'] },
      { label: '法向', keys: ['shift', 'k'] },
      { label: '穿透', keys: ['shift', 'g'] },
      { label: '对称', keys: ['shift', 'q'] },
      { label: '固定', keys: ['shift', 'j'] },
      { label: '曲率', keys: ['shift', 'u'] },
      { label: '草图流', keys: [] },
    ]);
    await page.keyboard.press('Escape');

    // 草图态快捷键（live keycap 直接生效）：l=线、shift+s=点、m=修剪。
    // 先等 store 真正进入草图（工具栏在平面已选但 insertSketch 回包前也会显示）。
    await expect.poll(() => page.evaluate(() =>
      (window as any).__lubanE2EApp?.usePartStudioStore?.getState().sketch.isActive,
    ), { timeout: 30_000 }).toBe(true);
    await page.mouse.move(900, 400);
    await page.keyboard.press('l');
    await expect.poll(() => activeToolId(page), { timeout: 15_000, intervals: [200, 400, 800] }).toBe('Sketch.Line');
    await page.keyboard.press('Shift+S');
    await expect.poll(() => activeToolId(page), { timeout: 15_000, intervals: [200, 400, 800] }).toBe('Sketch.Point');
    await page.keyboard.press('m');
    await expect.poll(() => activeToolId(page), { timeout: 15_000, intervals: [200, 400, 800] }).toBe('Sketch.Trim');

    await finishSketch(page);
  });
});
