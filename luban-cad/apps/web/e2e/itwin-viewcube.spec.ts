/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 官方 iTwin Viewer ViewCube（2026-11-05 用户裁决：默认使用官方；交互手感
 * 比自研好）。自研 Onshape 模式保留为 `?viewcube=onshape` 回退（Onshape
 * UI 复刻演示显式使用）。
 *
 * 覆盖：
 * - 默认渲染官方 `CubeNavigationAid`，自研 ViewCube 不挂载；
 * - locale 命名空间加载后六面标签非空（当前语言可以是中文或英文）；
 * - 点击面中心格触发官方动画 + 本应用 bridge 的真实相机旋转，进入面视图后
 *   四向箭头（`.cube-pointer.cube-visible`）出现；
 * - 官方模式复用 Onshape 相机/渲染菜单（trigger、子菜单、图形首选项）。
 *
 * 每轮重置 B 种子（与 ui-parity/tutorial2 同款隔离纪律）。
 */
import { expect, test } from '@playwright/test';
import { getApiToken, openSeedImodelEditor } from './helpers';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed';

test.describe('官方 iTwin ViewCube（默认）', () => {
  test('默认渲染官方组件、标准视图与相机/渲染菜单', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    await openSeedImodelEditor(page, seed);

    const cube = page.getByTestId('part-studio-itwin-viewcube');
    await expect(cube).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.part-studio-viewcube')).toHaveCount(0);
    await expect(cube.locator('.components-cube-css3d')).toBeVisible();

    const topCenter = cube.locator('[data-testid="nav-cube-face-cell-top-0-0-1"]');
    await expect(topCenter).toBeVisible();
    await expect(topCenter).not.toHaveText('');

    const before = await page.evaluate(() => {
      const vp = (window as any).iModelAppForDebugger.viewManager.selectedView;
      return vp.view.getRotation().toJSON();
    });
    await topCenter.click();
    await expect(cube.locator('.cube-pointer.cube-visible')).toHaveCount(4, { timeout: 10_000 });
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => {
      const vp = (window as any).iModelAppForDebugger.viewManager.selectedView;
      return vp.view.getRotation().toJSON();
    });
    expect(after).not.toEqual(before);

    // 用户钉死：按钮固定不动；右缘与最右边箭头右对齐，上缘与最下面箭头下缘对齐。
    const readLayout = (): Promise<{
      trigger: { x: number; y: number; right: number; top: number };
      downBottom: number;
      rightRight: number;
      cubeBottom: number;
    }> => page.evaluate(() => {
      const rect = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, top: r.top, bottom: r.bottom };
      };
      const root = document.querySelector('[data-testid="part-studio-itwin-viewcube"]')!;
      const faces = Array.from(root.querySelectorAll('[data-testid^="components-cube-face-"]')).map(rect);
      return {
        trigger: rect(root.querySelector('[data-testid="viewcube-menu-trigger"]')!),
        downBottom: rect(root.querySelector('.cube-pointer.cube-down')!).bottom,
        rightRight: rect(root.querySelector('.cube-pointer.cube-right')!).right,
        cubeBottom: Math.max(...faces.map((f) => f.bottom)),
      };
    });
    const faceLayout = await readLayout();
    expect(Math.abs(faceLayout.trigger.right - faceLayout.rightRight)).toBeLessThanOrEqual(1);
    expect(Math.abs(faceLayout.trigger.top - faceLayout.downBottom)).toBeLessThanOrEqual(1);

    // 相机/渲染菜单沿用 Onshape 菜单整套 testid。
    await page.getByTestId('viewcube-menu-trigger').click();
    await expect(page.getByTestId('viewcube-menu')).toBeVisible();
    for (const id of [
      'viewcube-menu-iso', 'viewcube-menu-dimetric', 'viewcube-menu-trimetric',
      'viewcube-menu-graphics', 'viewcube-menu-zoom-fit', 'viewcube-menu-zoom-window',
      'viewcube-menu-perspective', 'viewcube-menu-shaded', 'viewcube-menu-hidden',
      'viewcube-menu-high-quality',
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await page.getByTestId('viewcube-menu-shaded').click();
    await expect(page.getByTestId('viewcube-submenu-shaded')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('viewcube-menu')).toHaveCount(0);

    // 按钮位置固定：切到 ISO（箭头消失）后坐标不变，且不与 cube 投影重合。
    const trigger = page.getByTestId('viewcube-menu-trigger');
    const beforeFixed = await trigger.boundingBox();
    expect(beforeFixed).not.toBeNull();
    await trigger.click();
    await page.getByTestId('viewcube-menu-iso').click();
    await page.waitForTimeout(900);
    const isoLayout = await readLayout();
    expect(Math.abs(isoLayout.trigger.x - beforeFixed!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(isoLayout.trigger.y - beforeFixed!.y)).toBeLessThanOrEqual(1);
    expect(isoLayout.trigger.top).toBeGreaterThanOrEqual(isoLayout.cubeBottom);

    await trigger.click();
    await page.getByTestId('viewcube-menu-graphics').click();
    await expect(page.getByTestId('part-studio-graphics-dialog')).toBeVisible();
    // 2026-11-06 用户校正的图形首选项默认值（真实栈）。
    await expect(page.getByTestId('gfx-row-ao')).toContainText('20 %');
    await expect(page.getByTestId('gfx-row-edge-width')).toContainText('2 px');
  });
});
