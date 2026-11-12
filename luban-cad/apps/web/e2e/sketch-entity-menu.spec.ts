/**
 * 草图图元右键菜单真栈验收（Onshape live 2026-11-12 证据）。
 *
 * 覆盖：右键曲线 → 菜单（删除草图图元/建构线/拉伸…/旋转…/视图垂直于草图平面/
 * 放大选定对象；复制·变换仍禁用）；建构线翻转走 updateSketch；正视命令把视图
 * Z 轴对齐草图平面法向；Delete 菜单项移除实体；拉伸…/旋转… 退出草图并打开对应
 * 特征对话框（Onshape live 同口径）。
 */
import { expect, test } from '@playwright/test';
import type { SketchDto, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getSketchRpc,
  openSeedImodelEditor,
  releaseWriteLease,
} from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

const LINE: SketchEntityDto[] = [
  { kind: 'line', id: 11, p1: { x: -10, y: 0 }, p2: { x: 10, y: 0 } },
];

interface Vec3 { x: number; y: number; z: number }

async function readViewNormal(page: import('@playwright/test').Page): Promise<Vec3 | null> {
  return page.evaluate(() => {
    const view = (window as unknown as {
      __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { view: { getRotation: () => { rowZ: () => Vec3 } } } | undefined } } } };
    }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView?.view;
    if (!view)
      return null;
    const z = view.getRotation().rowZ();
    return { x: z.x, y: z.y, z: z.z };
  });
}

async function readEye(page: import('@playwright/test').Page): Promise<Vec3 | null> {
  return page.evaluate(() => {
    const view = (window as unknown as {
      __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { view: { getEyePoint: () => Vec3 } } } | undefined } } };
    }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView?.view;
    if (!view)
      return null;
    const eye = view.getEyePoint();
    return { x: eye.x, y: eye.y, z: eye.z };
  });
}

const lineConstruction = (sketch: SketchDto | undefined): boolean | undefined => {
  const line = sketch?.entities.find((entity) => entity.kind === 'line' && entity.id === 11);
  return line ? (line as { construction?: boolean }).construction === true : undefined;
};

test.describe('草图图元右键菜单（Onshape 对拍）', () => {
  test('建构线翻转 / 正视 / 放大 / 删除', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const openWithRetry = async () => {
      try {
        return await openSeedImodelEditor(page, seed);
      } catch {
        await page.reload();
        return openSeedImodelEditor(page, seed);
      }
    };
    let ctx = await openWithRetry();

    const lease = await borrowWriteLease(ctx, token, 'sketch-entity-menu');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: LINE, constraints: [], plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openWithRetry();
    const sketchRow = page.getByTestId(`tree-row-${sketchId}`);
    await expect(sketchRow).toBeVisible({ timeout: 60_000 });
    await sketchRow.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('sketch-entity-picker')).toBeAttached({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const projectOrigin = async (): Promise<{ x: number; y: number }> => {
      const originView = await page.evaluate(() => {
        const vp = (window as unknown as {
          __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { worldToView: (p: { x: number; y: number; z: number }) => { x: number; y: number } } } | undefined } } };
        }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
        if (!vp) return null;
        const v = vp.worldToView({ x: 0, y: 0, z: 0 });
        return { x: v.x, y: v.y };
      });
      expect(originView).not.toBeNull();
      return { x: box!.x + originView!.x, y: box!.y + originView!.y };
    };

    // 相机在「正视/放大」后变化——每次右键前重新投影原点（禁用陈旧屏幕坐标）。
    const openMenu = async (): Promise<void> => {
      const point = await projectOrigin();
      await page.mouse.click(point.x, point.y, { button: 'right' });
      await expect(page.getByTestId('sketch-entity-menu')).toBeVisible({ timeout: 10_000 });
    };

    // ---- 1. 菜单结构与未支持项禁用 ----
    await openMenu();
    const menu = page.getByTestId('sketch-entity-menu');
    for (const name of ['删除草图图元', '建构线', '视图垂直于草图平面', '放大选定对象', '拉伸…', '旋转…']) {
      await expect(menu.getByRole('menuitem', { name })).toBeEnabled();
    }
    for (const name of ['复制草图图元', '变换草图图元']) {
      await expect(menu.getByRole('menuitem', { name })).toBeDisabled();
    }

    // ---- 2. 建构线翻转（updateSketch），再翻回 ----
    await menu.getByTestId('sketch-entity-menu-construction').click();
    await expect.poll(async () => lineConstruction(await getSketchRpc(ctx, sketchId, token)), {
      timeout: 40_000,
      intervals: [600, 1000, 2000, 3000],
    }).toBe(true);
    await openMenu();
    await expect(page.getByTestId('sketch-entity-menu').getByRole('menuitem', { name: '普通图元' })).toBeVisible();
    await page.getByTestId('sketch-entity-menu').getByTestId('sketch-entity-menu-construction').click();
    await expect.poll(async () => lineConstruction(await getSketchRpc(ctx, sketchId, token)), {
      timeout: 40_000,
      intervals: [600, 1000, 2000, 3000],
    }).toBe(false);

    // ---- 3. 视图垂直于草图平面（视图 Z 轴=平面法向） ----
    await openMenu();
    await page.getByTestId('sketch-entity-menu').getByTestId('sketch-entity-menu-view-normal').click();
    await expect.poll(async () => {
      const normal = await readViewNormal(page);
      return normal ? Math.hypot(normal.x, normal.y, normal.z - 1) : 999;
    }, { timeout: 10_000, intervals: [200, 500, 1000] }).toBeLessThan(1e-6);

    // ---- 4. 放大选定对象 → 相机移动 ----
    const eyeBefore = await readEye(page);
    expect(eyeBefore).not.toBeNull();
    await openMenu();
    await page.getByTestId('sketch-entity-menu').getByTestId('sketch-entity-menu-zoom').click();
    await expect.poll(async () => {
      const eye = await readEye(page);
      if (!eye)
        return 0;
      return Math.hypot(eye.x - eyeBefore!.x, eye.y - eyeBefore!.y, eye.z - eyeBefore!.z);
    }, { timeout: 10_000, intervals: [300, 600, 1200] }).toBeGreaterThan(0.01);

    // ---- 5. 删除草图图元 → 实体移除 ----
    await openMenu();
    await page.getByTestId('sketch-entity-menu').getByTestId('sketch-entity-menu-delete').click();
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      return (sketch?.entities ?? []).some((entity) => entity.id === 11);
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBe(false);
  });

  test('拉伸…/旋转…：退出草图并打开对应特征对话框（Onshape live）', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const openWithRetry = async () => {
      try {
        return await openSeedImodelEditor(page, seed);
      } catch {
        await page.reload();
        return openSeedImodelEditor(page, seed);
      }
    };
    const ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'sketch-entity-menu-feature');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: LINE, constraints: [], plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    const again = await openWithRetry();
    expect(again).toBeTruthy();
    const sketchRow = page.getByTestId(`tree-row-${sketchId}`);
    await expect(sketchRow).toBeVisible({ timeout: 60_000 });

    const enterSketchAtOrigin = async (): Promise<void> => {
      await sketchRow.dblclick({ timeout: 30_000 });
      await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('sketch-entity-picker')).toBeAttached({ timeout: 60_000 });
    };
    const openMenu = async (): Promise<void> => {
      const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();
      const origin = await page.evaluate(() => {
        const vp = (window as unknown as {
          __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { worldToView: (p: { x: number; y: number; z: number }) => { x: number; y: number } } } | undefined } } };
        }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
        if (!vp) return null;
        return vp.worldToView({ x: 0, y: 0, z: 0 });
      });
      expect(origin).not.toBeNull();
      await page.mouse.click(box!.x + origin!.x, box!.y + origin!.y, { button: 'right' });
      await expect(page.getByTestId('sketch-entity-menu')).toBeVisible({ timeout: 10_000 });
    };

    // 拉伸… → 草图对话框关闭 + Extrude 对话框。
    await enterSketchAtOrigin();
    await openMenu();
    await page.getByTestId('sketch-entity-menu-extrude').click();
    await expect(page.getByTestId('part-studio-sketch-dialog')).toHaveCount(0, { timeout: 10_000 });
    const extrudeDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(extrudeDialog).toBeVisible({ timeout: 15_000 });
    await expect(extrudeDialog).toHaveAttribute('data-feature', 'extrude');
    await page.keyboard.press('Escape');
    await expect(extrudeDialog).toHaveCount(0, { timeout: 10_000 });

    // 旋转… → 草图对话框关闭 + Revolve 对话框。
    await enterSketchAtOrigin();
    await openMenu();
    await page.getByTestId('sketch-entity-menu-revolve').click();
    await expect(page.getByTestId('part-studio-sketch-dialog')).toHaveCount(0, { timeout: 10_000 });
    const revolveDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(revolveDialog).toBeVisible({ timeout: 15_000 });
    await expect(revolveDialog).toHaveAttribute('data-feature', 'revolve');
    await page.keyboard.press('Escape');
  });
});
