/**
 * 草图绘制画布读数（2026-11-16 E6/S5 + W12 + W15 Onshape live）：第一点落定
 * 后只移动光标（不落后续点）——
 * - 拐角矩形：宽/高数值贴在对应边旁（蓝色文字、随边旋转），同项尺寸不再
 *   渲染光标旁白卡片；
 * - 直线：长度读数贴线显示（随线旋转）；
 * - 中心点圆：`Ø` 直径点标签水平落在圆心→光标半径段中点（半径卡被替代）；
 * - 三点圆弧：起点/终点已锚、光标为弧上点时 `R` 半径点标签水平落在弧角向
 *   中点外侧（半径卡被替代）。
 * 全部 Esc 退出工具、取消草图 = 不提交任何几何。
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
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

/** 等工具真正退出（Esc 后工具实例卸载；toolId 不变即旧实例仍在）。 */
async function expectToolExited(page: Page, toolId: string): Promise<void> {
  await expect.poll(() => page.evaluate(() => {
    const im = (window as unknown as { __lubanE2E?: { coreFrontend: { IModelApp: { _toolAdmin?: { activeTool?: { toolId?: string } } } } } })
      .__lubanE2E?.coreFrontend?.IModelApp;
    return (im?._toolAdmin)?.activeTool?.toolId;
  }), { timeout: 15_000 }).not.toBe(toolId);
}

/** 从内联 style 提取 rotate 角度（与覆盖层同一布局语义）。 */
function rotationDeg(style: string | null): number {
  const match = /rotate\((-?[\d.]+)deg\)/.exec(style ?? '');
  return match ? Number(match[1]) : Number.NaN;
}

test.describe('草图绘制画布读数（E6/S5 + W12）', () => {
  test('矩形宽/高、直线长度、圆 Ø 直径读数可见；Esc 退出不提交', async ({ page, request }) => {
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

    // Esc 退出工具（未落第二点=未提交）。
    await page.keyboard.press('Escape');
    await expectToolExited(page, 'Sketch.Rectangle');

    // ── W12 直线：长度读数贴在线上方、随线旋转（live：中点略上方） ──
    await activate(page, '线');
    await clickWorld(page, hub, P(0, 0));
    await hoverWorld(page, hub, P(10, 10));
    const lengthLabel = page.getByTestId('sketch-draw-edge-label-length');
    await expect(lengthLabel, '直线上应有贴线长度读数').toBeVisible({ timeout: 10_000 });
    const lengthText = (await lengthLabel.textContent())?.trim() ?? '';
    expect(lengthText).toMatch(/^\d+(\.\d+)?$/);
    expect(Number(lengthText)).toBeGreaterThan(0);
    // 45° 线：读数随线旋转但保持正立（CSS rotate 值域 −90°..90°）。
    const lineRotation = rotationDeg(await lengthLabel.getAttribute('style'));
    expect(Number.isNaN(lineRotation)).toBe(false);
    expect(Math.abs(lineRotation)).toBeGreaterThan(0.5);
    expect(Math.abs(lineRotation)).toBeLessThanOrEqual(90.0001);
    // live：直线拖拽同一帧只有旋转的长度读数，角度卡也不渲染 → 无白卡片。
    await expect(page.getByTestId('sketch-tool-feedback')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expectToolExited(page, 'Sketch.Line');

    // ── W12 中心点圆：Ø 直径点标签水平落在半径段中点 ──
    // 圆心 P(0,0)、光标 P(10,0) → 半径 10 mm、直径 ≈20 mm（像素取整容差 ±1，
    // 与 tutorial2 贴边宽断言同口径）。
    await activate(page, '中心点圆');
    await clickWorld(page, hub, P(0, 0));
    await hoverWorld(page, hub, P(10, 0));
    const diameterLabel = page.getByTestId('sketch-draw-point-label-diameter');
    await expect(diameterLabel, '圆心→光标半径段中点应有 Ø 直径读数').toBeVisible({ timeout: 10_000 });
    const diameterText = (await diameterLabel.textContent())?.trim() ?? '';
    expect(diameterText.startsWith('Ø'), `直径读数应以 Ø 开头：${diameterText}`).toBe(true);
    const diameterValue = Number(diameterText.slice('Ø'.length));
    expect(diameterValue).toBeGreaterThan(19);
    expect(diameterValue).toBeLessThan(21);
    // 点标签水平不旋转（只有居中平移）。
    expect(await diameterLabel.getAttribute('style')).not.toContain('rotate');
    // 半径读数已由 Ø 点标签替代 → 不再渲染白卡片；阶段提示 pill 保留。
    await expect(page.getByTestId('sketch-tool-feedback')).toHaveCount(0);
    await expect(page.getByTestId('sketch-tool-hint')).toBeVisible();
    await page.keyboard.press('Escape');
    await expectToolExited(page, 'Sketch.CenterCircle');

    // ── W15 三点圆弧：起点→终点→弧上点拖动时的 R 半径点标签 ──
    // 起点 P(0,0)、终点 P(10,0)、弧上点 P(5,5) → 过三点圆半径 5 mm；标签
    // 水平落在弧角向中点外侧（live：R 前缀、无白卡片）。
    await activate(page, '三点圆弧');
    await clickWorld(page, hub, P(0, 0));
    await clickWorld(page, hub, P(10, 0));
    await hoverWorld(page, hub, P(5, 5));
    const radiusLabel = page.getByTestId('sketch-draw-point-label-radius');
    await expect(radiusLabel, '三点圆弧拖拽应有 R 半径点标签').toBeVisible({ timeout: 10_000 });
    const radiusText = (await radiusLabel.textContent())?.trim() ?? '';
    expect(radiusText.startsWith('R'), `半径读数应以 R 开头：${radiusText}`).toBe(true);
    const arcRadius = Number(radiusText.slice('R'.length));
    expect(Number.isFinite(arcRadius)).toBe(true);
    expect(arcRadius).toBeGreaterThan(0);
    // 点标签水平不旋转（只有居中平移）。
    expect(await radiusLabel.getAttribute('style')).not.toContain('rotate');
    // 半径读数已由 R 点标签替代 → 无白卡片；阶段提示 pill 保留。
    await expect(page.getByTestId('sketch-tool-feedback')).toHaveCount(0);
    await expect(page.getByTestId('sketch-tool-hint')).toBeVisible();
    await page.keyboard.press('Escape');
    await expectToolExited(page, 'Sketch.Arc3Point');

    // 取消新建草图（本用例未提交任何几何）。
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
  });
});
