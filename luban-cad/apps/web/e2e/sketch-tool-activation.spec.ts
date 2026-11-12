/**
 * 草图工具退出后的激活态收口（2026-11-12）。
 *
 * Onshape：草图工具（修剪/延伸/圆角/偏移等）Esc 退出后立即回到正常草图编辑
 * （实体可拾取、尺寸可编辑）。本产品 ribbon 的 store.tool.activeToolId 此前
 * 不随工具退出清理，会继续挡住 SketchEntityPicker/尺寸编辑器；本 spec 验证
 * 修剪工具退出后激活态清空且单击草图实体重新可选。
 */
import { expect, test } from '@playwright/test';
import type { SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  openSeedImodelEditor,
  releaseWriteLease,
} from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

const ENTITIES: SketchEntityDto[] = [
  { kind: 'line', id: 11, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
];

test.describe('草图工具退出收口（Onshape 对拍）', () => {
  test('修剪 Esc 退出 → ribbon 激活态清空 → 草图实体可再次单击选中', async ({ page, request }) => {
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
    const lease = await borrowWriteLease(ctx, token, 'sketch-tool-activation');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: ENTITIES, constraints: [], plane: XY_PLANE,
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
    await page.getByRole('button', { name: '正视草图平面' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '缩放到合适大小' }).click();
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const vp = (window as unknown as {
        __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { zoomToVolume?: (v: unknown) => void } | undefined } } } };
      }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
      vp?.zoomToVolume?.({ low: { x: -5, y: -5, z: -2 }, high: { x: 15, y: 5, z: 2 } });
    });
    await page.waitForTimeout(300);

    // 修剪工具（ribbon 主钮）→ Esc 退出。
    await page.getByRole('button', { name: '修剪', exact: true }).click();
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);

    const tooling = await page.evaluate(() => {
      const store = (window as unknown as {
        __lubanE2EApp?: { usePartStudioStore?: { getState: () => { tool: { activeToolId: string | null } } } };
      }).__lubanE2EApp?.usePartStudioStore;
      const admin = (window as unknown as {
        __lubanE2E?: { coreFrontend: { IModelApp: { toolAdmin?: { activeTool?: { toolId?: string }; defaultToolId?: string } } } };
      }).__lubanE2E?.coreFrontend?.IModelApp?.toolAdmin;
      return {
        store: store?.getState().tool.activeToolId ?? null,
        active: admin?.activeTool?.toolId ?? null,
        defaultTool: admin?.defaultToolId ?? null,
      };
    });
    expect(tooling.store).toBeNull();

    // 相机重新钉住后单击直线中点：SketchEntityPicker 应恢复并写入选择权威。
    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const view = await page.evaluate((worldPoint) => {
      const vp = (window as unknown as {
        __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { worldToView: (p: { x: number; y: number; z: number }) => { x: number; y: number } } } | undefined } } };
      }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
      if (!vp) return null;
      const v = vp.worldToView(worldPoint);
      return { x: v.x, y: v.y };
    }, { x: 5, y: 0, z: 0 });
    expect(view).not.toBeNull();
    await page.mouse.click(box!.x + view!.x, box!.y + view!.y);

    await expect.poll(async () => {
      const selection = await page.evaluate(() => {
        const store = (window as unknown as {
          __lubanE2EApp?: { usePartStudioStore?: { getState: () => { canvas: { selection: Array<{ kind: string; entityId?: number }> } } } };
        }).__lubanE2EApp?.usePartStudioStore;
        return store?.getState().canvas.selection ?? [];
      });
      return selection.some((entry) => entry.kind === 'sketchEntity' && entry.entityId === 11);
    }, { timeout: 15_000, intervals: [300, 600, 1000] }).toBe(true);

    // 草图保持编辑态。
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
  });
});
