/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Onshape UI 对齐验收（2026-11-02，用户五项）：
 * 1) ViewCube 在场、朝向同步、面点击换标准视图；
 * 2) 默认几何图元（Origin/Top/Front/Right）+ 眼睛开关；
 * 3) ViewCube 下拉显示模式（渲染设置；持久化写穿）；
 * 4) 进入/退出草图**不改相机**（Onshape live 2026-11-13：不转正、不自动取景、
 *    不回放；相机交给用户；「缩放到合适大小」= 可见内容取景，见
 *    e2e/sketch-camera-fit.spec.ts）。
 *
 * 每轮重置 B 种子（tutorial2 同款隔离纪律），不依赖历史 scope 内容。
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { forceOnshapeViewCube, getApiToken, openSeedImodelEditor } from './helpers';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed';

interface CameraSnapshot {
  rotation: number[][];
  origin: number[];
  extents: number[];
}

async function readCamera(page: Page): Promise<CameraSnapshot> {
  return page.evaluate(() => {
    const vp = (window as any).iModelAppForDebugger.viewManager.selectedView;
    return {
      rotation: vp.view.getRotation().toJSON(),
      origin: vp.view.getOrigin().toJSON(),
      extents: vp.view.getExtents().toJSON(),
    };
  });
}

async function readCubeTransform(page: Page): Promise<string> {
  const transform = await page.evaluate(() =>
    (document.querySelector('.part-studio-viewcube__cube') as HTMLElement | null)?.style.transform ?? '');
  // 浏览器序列化 matrix3d 会插空格；比较去空白。
  return transform.replace(/\s+/g, '');
}

async function readStoredDisplaySettings(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('luban.partStudio.displaySettings.v3');
    return raw ? JSON.parse(raw) as Record<string, unknown> : null;
  });
}

function expectCameraUnchanged(a: CameraSnapshot, b: CameraSnapshot): void {
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++)
      expect(b.rotation[i]![j]!, `rotation[${i}][${j}] 不得变化`).toBeCloseTo(a.rotation[i]![j]!, 9);
    expect(b.origin[i]!, `origin[${i}] 不得变化`).toBeCloseTo(a.origin[i]!, 9);
    expect(b.extents[i]!, `extents[${i}] 不得变化`).toBeCloseTo(a.extents[i]!, 9);
  }
}

test.describe('Onshape UI 对齐（2026-11-02）', () => {
  test('ViewCube / 默认几何 / 显示模式 / 草图相机', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    await openSeedImodelEditor(page, seed);
    // 产品默认已是官方 iTwin ViewCube；本用例断言的是 Onshape 自研模式
    // （面点击/罗盘/菜单），显式回退。
    await forceOnshapeViewCube(page);

    // ── 2) 默认几何图元树 ────────────────────────────────────────────────
    const datum = page.getByTestId('tree-datum-group');
    await expect(datum).toBeVisible();
    for (const label of ['Origin', 'Top', 'Front', 'Right'])
      await expect(datum.getByText(label, { exact: true })).toBeVisible();
    await expect(page.getByText('默认几何图元', { exact: true })).toBeVisible();

    // ── 1) ViewCube 在场 + 朝向同步 ─────────────────────────────────────
    await expect(page.getByTestId('part-studio-viewcube')).toBeVisible();
    for (const face of ['front', 'back', 'left', 'right', 'top', 'bottom'])
      await expect(page.getByTestId(`viewcube-face-${face}`)).toBeAttached();
    expect(await readCubeTransform(page)).toContain('matrix3d(');

    // 面点击 → Front 标准视图；cube 同步（程序化换视图不依赖 onViewChanged）。
    await page.getByTestId('viewcube-face-front').click({ force: true });
    await expect.poll(async () => (await readCamera(page)).rotation).toEqual([
      [1, 0, 0], [0, 0, 1], [0, -1, 0],
    ]);
    await expect.poll(() => readCubeTransform(page))
      .toBe('matrix3d(1,0,0,0,0,0,1,0,0,-1,0,0,0,0,0,1)');

    // ── 3) ViewCube 菜单（2026-11-02 Onshape 菜单结构；未实现项隐藏）──────
    await page.getByTestId('viewcube-menu-trigger').click();
    await expect(page.getByTestId('viewcube-menu')).toBeVisible();
    for (const id of [
      'viewcube-menu-iso', 'viewcube-menu-dimetric', 'viewcube-menu-trimetric',
      'viewcube-menu-graphics', 'viewcube-menu-zoom-fit', 'viewcube-menu-zoom-window',
      'viewcube-menu-perspective', 'viewcube-menu-shaded', 'viewcube-menu-hidden',
      'viewcube-menu-high-quality',
    ])
      await expect(page.getByTestId(id)).toBeVisible();
    // 2026-11-05 live 对齐：未实现项保留完整菜单外观但禁用 + aria-disabled，
    // 不再隐藏（用户裁决以 live 16 项为准）。
    for (const id of [
      'viewcube-menu-named-views', 'viewcube-menu-normal-to-sketch',
      'viewcube-menu-tangent-edges', 'viewcube-menu-highlight-boundary',
      'viewcube-menu-section',
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
      await expect(page.getByTestId(id)).toHaveAttribute('aria-disabled', 'true');
    }

    // 带边着色子菜单 → 隐藏边移除；写穿持久化。
    await page.getByTestId('viewcube-menu-shaded').click();
    await expect(page.getByTestId('viewcube-submenu-shaded')).toBeVisible();
    await page.getByTestId('viewcube-mode-hidden-removed').click();
    await expect.poll(() => readStoredDisplaySettings(page))
      .toMatchObject({ mode: 'hidden-removed' });
    // 复位。
    await page.getByTestId('viewcube-menu-shaded').click();
    await page.getByTestId('viewcube-mode-shaded').click();
    await expect.poll(() => readStoredDisplaySettings(page)).toMatchObject({ mode: 'shaded' });

    // 隐藏边子菜单 → 隐藏边可见（再复位）。
    await page.getByTestId('viewcube-menu-hidden').click();
    await expect(page.getByTestId('viewcube-submenu-hidden')).toBeVisible();
    await page.getByTestId('viewcube-mode-hidden-visible').click();
    await expect.poll(() => readStoredDisplaySettings(page))
      .toMatchObject({ mode: 'hidden-visible' });
    await page.getByTestId('viewcube-menu-shaded').click();
    await page.getByTestId('viewcube-mode-shaded').click();

    // 高质量视图是 checkable：默认 4 已开启，第一次点击关闭（1），再点恢复 4。
    await page.getByTestId('viewcube-menu-high-quality').click();
    await expect.poll(() => readStoredDisplaySettings(page))
      .toMatchObject({ antialiasSamples: 1 });
    await page.getByTestId('viewcube-menu-high-quality').click();
    await expect.poll(() => readStoredDisplaySettings(page))
      .toMatchObject({ antialiasSamples: 4 });

    // 图形首选项 → 左侧独立对话框（2026-11-05 live 对齐；不再打开右侧 dock）。
    await page.getByTestId('viewcube-menu-graphics').click();
    await expect(page.getByTestId('part-studio-graphics-dialog')).toBeVisible();
    await expect(page.getByTestId('part-studio-dock-body')).toHaveCount(0);
    await page.getByTestId('gfx-confirm').click();
    await expect(page.getByTestId('part-studio-graphics-dialog')).toHaveCount(0);

    // 眼睛开关只写 datum 切片，不动画布隐藏集；按初始有效值取反断言（有体时
    // 自动规则可能已隐藏该平面，不能写死 false）。
    const initialTop = await page.evaluate(() =>
      (window as any).__lubanE2EApp.usePartStudioStore.getState().datum.visibility.top as boolean);
    await page.getByTestId('tree-row-datum-visibility-top').click();
    await expect.poll(() => page.evaluate(() =>
      (window as any).__lubanE2EApp.usePartStudioStore.getState().datum.visibility.top,
    )).toBe(!initialTop);
    expect(await page.evaluate(() =>
      (window as any).__lubanE2EApp.usePartStudioStore.getState().canvas.hiddenIds,
    )).toEqual([]);
    await page.getByTestId('tree-row-datum-visibility-top').click();
    await expect.poll(() => page.evaluate(() =>
      (window as any).__lubanE2EApp.usePartStudioStore.getState().datum.visibility.top,
    )).toBe(initialTop);

    // ── 4) 草图相机：进入/退出均不改相机（Onshape live 2026-11-13）─────────
    const before = await readCamera(page);
    await page.getByRole('button', { name: '草图', exact: true }).click();
    const dialog = page.getByTestId('part-studio-sketch-dialog');
    await expect(dialog).toBeVisible();
    // 2026-11-13：平面字段无下拉——树内基准面点击即选面并自动创建草图。
    await page.getByTestId('part-studio-feature-list')
      .getByRole('button', { name: 'Front', exact: true }).click();
    await expect(
      page.getByRole('toolbar', { name: '草图工具' })
        .or(dialog.getByTestId('part-studio-sketch-dialog-error')),
    ).toBeVisible({ timeout: 60_000 });
    if ((await dialog.getByTestId('part-studio-sketch-dialog-error').count()) > 0)
      throw new Error(`insertSketch 拒收: ${await dialog.getByTestId('part-studio-sketch-dialog-error').textContent()}`);

    await expect.poll(() => page.evaluate(() =>
      (window as any).__lubanE2EApp.usePartStudioStore.getState().sketch.activeSketchPlane !== null,
    )).toBe(true);
    // Onshape live：选平面/进入草图编辑不转正、不缩放、不回放相机。
    await page.waitForTimeout(600);
    expectCameraUnchanged(before, await readCamera(page));

    // 退出（绿色 ✓）：同样不改相机（无需也禁止「恢复快照」）。
    await dialog.getByRole('button', { name: '确认' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await page.waitForTimeout(400);
    expectCameraUnchanged(before, await readCamera(page));
  });
});
