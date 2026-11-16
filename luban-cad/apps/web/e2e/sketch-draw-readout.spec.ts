/**
 * 草图绘制贴边读数（2026-11-16 E6/S5 Onshape live）：拐角矩形第一点落定后
 * 只移动光标（不落第二点），宽/高数值应贴在对应边旁（蓝色文字、随边旋转），
 * 且同项尺寸不再渲染光标旁白卡片。Esc 退出工具、取消草图 = 不提交。
 */
import { expect, test } from '@playwright/test';
import { getApiToken, openSeedImodelEditor } from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import {
  P,
  activate,
  chooseSketchPlaneInViewport,
  clickWorld,
  disableSnap,
  hoverWorld,
  setStandardView,
} from './tutorial2-helpers.js';

test.describe('草图矩形贴边读数（E6/S5）', () => {
  test('拖拽中宽/高贴边标签可见且无白卡片；Esc 退出不提交', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 120_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    await openSeedImodelEditor(page, seed);

    await page.getByRole('button', { name: '草图', exact: true }).click();
    const dialog = page.getByTestId('part-studio-sketch-dialog');
    await expect(dialog).toBeVisible();
    await chooseSketchPlaneInViewport(page, 'front');
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const hub = { x: box.x, y: box.y };
    await setStandardView(page, 4, {
      low: { x: -100, y: -100, z: -100 }, high: { x: 100, y: 100, z: 100 },
    });
    await disableSnap(page);

    await activate(page, '拐角矩形');
    // 第一点落定；随后只移动鼠标（不第二次点击，形状不提交）。
    await clickWorld(page, hub, P(0, 0));
    await hoverWorld(page, hub, P(10, 5));

    const widthLabel = page.getByTestId('sketch-draw-edge-label-width');
    const heightLabel = page.getByTestId('sketch-draw-edge-label-height');
    await expect(widthLabel, '宽边旁应有实时数值').toBeVisible({ timeout: 10_000 });
    await expect(heightLabel, '高边旁应有实时数值').toBeVisible({ timeout: 10_000 });

    const widthValue = (await widthLabel.textContent())?.trim() ?? '';
    const heightValue = (await heightLabel.textContent())?.trim() ?? '';
    expect(widthValue).toMatch(/^\d+(\.\d+)?$/);
    expect(heightValue).toMatch(/^\d+(\.\d+)?$/);
    expect(Number(widthValue)).toBeGreaterThan(0);
    expect(Number(heightValue)).toBeGreaterThan(0);

    // 贴边标签随边旋转且保持正立（CSS rotate 值域 −90°..90°）。
    const rotations = await Promise.all([widthLabel, heightLabel].map(async (label) => {
      const transform = (await label.getAttribute('style')) ?? '';
      const match = /rotate\((-?[\d.]+)deg\)/.exec(transform);
      return match ? Number(match[1]) : Number.NaN;
    }));
    for (const rotation of rotations) {
      expect(Number.isNaN(rotation)).toBe(false);
      expect(Math.abs(rotation)).toBeLessThanOrEqual(90.0001);
    }

    // 这两项尺寸已贴边 → 不再渲染白卡片；阶段提示 pill 保留。
    await expect(page.getByTestId('sketch-tool-feedback')).toHaveCount(0);
    await expect(page.getByTestId('sketch-tool-hint')).toBeVisible();

    // Esc 退出工具（未落第二点=未提交），取消新建草图。
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => {
      const im = (window as unknown as { __lubanE2E?: { coreFrontend: { IModelApp: { _toolAdmin?: { activeTool?: { toolId?: string } } } } } })
        .__lubanE2E?.coreFrontend?.IModelApp;
      return (im?._toolAdmin)?.activeTool?.toolId;
    }), { timeout: 15_000 }).not.toBe('Sketch.Rectangle');
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
  });
});
