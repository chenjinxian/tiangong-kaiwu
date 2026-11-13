/**
 * 2026-11-13 真栈验收：草图创建对话框 Onshape 对齐（f4/f5 live 复核）。
 *
 * 1) 新建草图对话框：标题泛称「草图」；平面字段空态（#e2f0fa / 2px rgb(40,80,170)，
 *    42px 堆叠布局）；✓ 禁用浅绿；✗ 透明底（sprite 红 X）；底栏=草图分析工具 + ?，
 *    不显示「成品」。
 * 2) 选 Front 平面 → pending 草图（树行出现）+ 浅蓝草图平面框在视口渲染
 *    （SketchPlanePicker overlay 有像素）+ 平面 chip/清除 ×/时钟。
 * 3) ✗ 取消 = 删除本对话框新建的 pending 草图（树行消失）；已有草图编辑的 ✗
 *    只退出不删。
 * 4) 草图工具栏飞菜单全部变体带 sprite 图标（圆弧 5 项 / 约束 15 项）。
 */
import { expect, test } from '@playwright/test';
import type { FeatureOp, SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getFeatureTreeRpc,
  openSeedImodelEditor,
  releaseWriteLease,
} from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';

function rectangleSketch(width: number, height: number, x0 = 0, y0 = 0): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
  const x1 = x0 + width;
  const y1 = y0 + height;
  return {
    entities: [
      { kind: 'point', id: 1, x: x0, y: y0 },
      { kind: 'point', id: 2, x: x1, y: y0 },
      { kind: 'point', id: 3, x: x1, y: y1 },
      { kind: 'point', id: 4, x: x0, y: y1 },
      { kind: 'point', id: 5, x: x0, y: y0 },
      { kind: 'point', id: 6, x: x1, y: y0 },
      { kind: 'point', id: 7, x: x1, y: y1 },
      { kind: 'point', id: 8, x: x0, y: y1 },
      { kind: 'line', id: 11, p1: 5, p2: 6 },
      { kind: 'line', id: 12, p1: 6, p2: 7 },
      { kind: 'line', id: 13, p1: 7, p2: 8 },
      { kind: 'line', id: 14, p1: 8, p2: 5 },
    ],
    constraints: [
      { kind: 'coincident', id: 21, refs: [1, 5] },
      { kind: 'coincident', id: 22, refs: [2, 6] },
      { kind: 'coincident', id: 23, refs: [3, 7] },
      { kind: 'coincident', id: 24, refs: [4, 8] },
      { kind: 'horizontal', id: 25, refs: [11] },
      { kind: 'horizontal', id: 26, refs: [13] },
      { kind: 'vertical', id: 27, refs: [12] },
      { kind: 'vertical', id: 28, refs: [14] },
      { kind: 'distance', id: 29, refs: [1, 2], value: width },
      { kind: 'distance', id: 30, refs: [2, 3], value: height },
    ],
  };
}

const XY_PLANE = { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } };

/** SketchPlanePicker overlay 非透明像素数（平面框渲染证据）。 */
async function frameAlphaPixels(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('.part-studio-plane-picker') as HTMLCanvasElement | null;
    if (!canvas)
      return -1;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let alpha = 0;
    for (let i = 3; i < data.length; i += 4)
      if (data[i]! > 0)
        alpha++;
    return alpha;
  });
}

/** overlay 非透明像素的屏幕包围盒（平面框形状证据）。 */
async function framePixelBBox(page: import('@playwright/test').Page): Promise<{ width: number; height: number }> {
  return page.evaluate(() => {
    const canvas = document.querySelector('.part-studio-plane-picker') as HTMLCanvasElement | null;
    if (!canvas)
      return { width: 0, height: 0 };
    const { width, height } = canvas;
    const data = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3]! > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return maxX < 0 ? { width: 0, height: 0 } : { width: maxX - minX + 1, height: maxY - minY + 1 };
  });
}

test.describe('草图创建对话框 Onshape 对齐（f4/f5）', () => {
  test('创建态布局/平面框/取消删除/编辑成品/飞菜单图标', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openSeedImodelEditor(page, seed);
    const lease = await borrowWriteLease(ctx, token, 'sketch-create-parity');
    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };
    const base = rectangleSketch(40, 40, -20, -20);
    const baseSketch = await apply(
      { kind: 'insertSketch', entities: base.entities, constraints: base.constraints, plane: XY_PLANE },
      '盒体草图',
    );
    await apply(
      { kind: 'insertFeature', featureType: 'extrude', params: { profile: [], distance: 10, sketchId: baseSketch, regions: [0], operation: 'new' } },
      '盒体拉伸',
    );
    await releaseWriteLease(ctx, lease, token);
    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    const sketchCount = async (): Promise<number> =>
      (await getFeatureTreeRpc(ctx, token)).filter((row) => row.featureType === 'sketch').length;
    expect(await sketchCount()).toBe(1);

    // ── 1) 创建态（未选平面）─────────────────────────────────────────────
    await page.getByRole('button', { name: '草图', exact: true }).click();
    const dialog = page.getByTestId('part-studio-sketch-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.part-studio-sketch-dialog__title')).toHaveText('草图');
    await expect(dialog.locator('.part-studio-sketch-dialog__title')).toHaveCSS('font-size', '16px');
    // Onshape live：平面字段没有下拉选择；创建态也没有「正视草图平面」按钮。
    await expect(dialog.getByRole('listbox')).toHaveCount(0);
    await expect(dialog.getByTestId('sketch-view-normal')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '确认' })).toBeDisabled();
    await expect(dialog.getByTestId('sketch-analysis-tools')).toBeVisible();
    await expect(dialog.getByTestId('sketch-finish')).toHaveCount(0);
    const emptyField = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="sketch-plane-field"]') as HTMLElement;
      const ok = document.querySelector('.part-studio-sketch-dialog__confirm') as HTMLElement;
      const cancel = document.querySelector('.part-studio-sketch-dialog__cancel') as HTMLElement;
      const s = getComputedStyle(el);
      return {
        state: el.getAttribute('data-state'),
        bg: s.backgroundColor,
        border: s.borderColor,
        height: s.height,
        okBg: getComputedStyle(ok).backgroundColor,
        cancelBg: getComputedStyle(cancel).backgroundColor,
      };
    });
    expect(emptyField).toMatchObject({
      state: 'empty',
      bg: 'rgb(226, 240, 250)',
      border: 'rgb(40, 80, 170)',
      height: '42px',
      okBg: 'rgb(217, 233, 212)',
      cancelBg: 'rgba(0, 0, 0, 0)',
    });

    // ── 2) 选 Front 平面 → pending 草图 + 平面框 ─────────────────────────
    expect(await frameAlphaPixels(page)).toBe(0);
    await page.getByRole('button', { name: 'Front', exact: true }).click();
    await expect.poll(sketchCount, { timeout: 60_000, intervals: [1000, 2000, 5000] }).toBe(2);
    await expect(dialog.getByTestId('sketch-plane-chip')).toHaveText('Front 平面');
    await expect(dialog.locator('.part-studio-sketch-dialog__plane-clock')).toBeVisible();
    await expect(dialog.locator('.part-studio-sketch-dialog__plane-clear')).toBeVisible();
    await expect(dialog.getByTestId('sketch-finish')).toHaveCount(0);
    // 2026-11-13 live 二轮实测：平面框是**世界固定长方形**（半宽 2× 基准面、
    // 半高 1.15× 基准面 ≈ 600×345 mm），远大于本用例 40 mm 盒体——默认取景下
    // 框边在视口外。先经 ViewCube 相机菜单「正视草图平面」转正，再滚轮缩小，
    // 验证绘制像素与宽>高形状（正对时投影宽高比 = 600:345，不是正方形）。
    await page.getByTestId('viewcube-menu-trigger').click();
    await page.getByTestId('viewcube-menu-view-normal-to-sketch').click();
    await page.waitForTimeout(500);
    const viewportBox = (await page.getByTestId('part-studio-viewport').boundingBox())!;
    await page.mouse.move(viewportBox.x + viewportBox.width / 2, viewportBox.y + viewportBox.height / 2);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(120);
    }
    await expect.poll(() => frameAlphaPixels(page), { timeout: 20_000 }).toBeGreaterThan(500);
    const frameBox = await framePixelBBox(page);
    expect(frameBox.width / frameBox.height).toBeGreaterThan(1.5);
    expect(frameBox.width / frameBox.height).toBeLessThan(2.0);
    // 2026-11-13 用户复核：选面后视口须同步显示平面框**和草图名文字**。
    const pickerMarker = page.getByTestId('sketch-plane-picker');
    await expect(pickerMarker).toHaveAttribute('data-frame-plane', 'true');
    await expect(pickerMarker).toHaveAttribute('data-frame-label', /^草图 2$/);
    // live computedStyles 字号：字段值/开关行 13.3333px，字段小标签 12px。
    const fonts = await page.evaluate(() => {
      const chip = document.querySelector('[data-testid="sketch-plane-chip"]') as HTMLElement;
      const label = document.querySelector('.part-studio-sketch-dialog__plane-field-label') as HTMLElement;
      const toggle = document.querySelector('.part-studio-sketch-dialog__toggle') as HTMLElement;
      return {
        chip: getComputedStyle(chip).fontSize,
        label: getComputedStyle(label).fontSize,
        toggle: getComputedStyle(toggle).fontSize,
      };
    });
    expect(fonts).toEqual({ chip: '13.3333px', label: '12px', toggle: '13.3333px' });
    const selectedField = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="sketch-plane-field"]') as HTMLElement;
      const s = getComputedStyle(el);
      return { state: el.getAttribute('data-state'), bg: s.backgroundColor, border: s.borderColor };
    });
    expect(selectedField).toEqual({
      state: 'selected',
      bg: 'rgb(251, 253, 254)',
      border: 'rgb(149, 149, 149)',
    });

    // ── 2b) 字段 × 清除：删 pending 草壳但**不关闭对话框**（用户复核）────
    await dialog.getByRole('button', { name: '清除草图平面' }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('sketch-plane-chip')).toHaveCount(0);
    await expect(dialog.locator('.part-studio-sketch-dialog__title')).toHaveText('草图');
    await expect.poll(sketchCount, { timeout: 60_000, intervals: [1000, 2000, 5000] }).toBe(1);
    // 重新选 Front → 再次自动创建 pending 草图（对话框仍在）。
    await page.getByRole('button', { name: 'Front', exact: true }).click();
    await expect.poll(sketchCount, { timeout: 60_000, intervals: [1000, 2000, 5000] }).toBe(2);
    await expect(dialog.getByTestId('sketch-plane-chip')).toHaveText('Front 平面');

    // ── 3) ✗ 取消 → pending 草图删除 ─────────────────────────────────────
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expect.poll(sketchCount, { timeout: 60_000, intervals: [1000, 2000, 5000] }).toBe(1);

    // ── 4) 编辑既有草图：成品按钮；✗ 不删 ────────────────────────────────
    const sketchRow = page.getByTestId(`tree-row-${baseSketch}`);
    await sketchRow.dblclick({ timeout: 30_000 });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByTestId('sketch-finish')).toHaveText('成品');
    // 编辑既有草图：平面字段只读（无下拉），× 禁用。
    await expect(dialog.getByTestId('sketch-plane-chip')).toBeVisible();
    await expect(dialog.getByRole('button', { name: '清除草图平面' })).toBeDisabled();
    // 对话框不再有「正视草图平面」按钮（视图命令在 ViewCube 相机菜单）。
    await expect(dialog.getByTestId('sketch-view-normal')).toHaveCount(0);
    await expect(dialog.getByRole('listbox')).toHaveCount(0);

    // ── 5) 草图工具栏飞菜单全部变体带 sprite 图标 ────────────────────────
    await page.getByRole('button', { name: '三点圆弧 ▾' }).click();
    const arcMenu = page.getByTestId('part-studio-ribbon-menu-Sketch.Arc3Point');
    await expect(arcMenu).toBeVisible();
    const arcRows = await arcMenu.locator('[role="menuitem"]').evaluateAll((els) =>
      els.map((el) => ({ svg: el.querySelector('svg') !== null, paths: el.querySelectorAll('svg path').length })));
    expect(arcRows.length).toBeGreaterThanOrEqual(4);
    for (const row of arcRows) {
      expect(row.svg).toBe(true);
      expect(row.paths).toBeGreaterThan(0);
    }
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: '重合 ▾' }).click();
    const constraintMenu = page.getByTestId('part-studio-ribbon-menu-Sketch.Constraint.Coincident');
    await expect(constraintMenu).toBeVisible();
    const constraintRows = await constraintMenu.locator('[role="menuitem"]').evaluateAll((els) =>
      els.map((el) => ({ svg: el.querySelector('svg') !== null, paths: el.querySelectorAll('svg path').length })));
    expect(constraintRows.length).toBe(15);
    for (const row of constraintRows) {
      expect(row.svg).toBe(true);
      expect(row.paths).toBeGreaterThan(0);
    }
    await page.keyboard.press('Escape');

    // 编辑既有草图的 ✗：只退出、不删除。
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '特征工具' })).toBeVisible({ timeout: 30_000 });
    expect(await sketchCount()).toBe(1);
  });
});
