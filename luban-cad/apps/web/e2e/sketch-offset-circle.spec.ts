/**
 * 草图偏移（圆）真栈验收（2026-11-13，live：圆偏移为同心圆）。
 *
 * RPC 建圆 R10 → 编辑草图 →「偏移」→ 点击圆 → 光标外移 5 mm 点击定距 →
 * getSketch 得到 2 圆（R10 + R15）+ coincident(center)+radius 约束 →
 * undo 回到 1 圆。
 */
import { expect, test } from '@playwright/test';
import type { SketchDto, SketchPlaneDto } from '@luban-cad/shared';
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

interface Pt { x: number; y: number }

function circleRadii(sketch: SketchDto | undefined): number[] {
  return (sketch?.entities ?? [])
    .flatMap((entity) => entity.kind === 'circle' && typeof entity.radius === 'number' ? [entity.radius] : [])
    .sort((a, b) => a - b);
}

test.describe('草图偏移 — 圆（同心圆）', () => {
  test('圆外 5 mm 偏移 → R15 同心圆 + 约束 → undo 回单圆', async ({ page, request }) => {
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

    const lease = await borrowWriteLease(ctx, token, 'sketch-offset-circle');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [{ kind: 'circle', id: 11, center: { x: 0, y: 0 }, radius: 0.01 }],
      constraints: [],
      plane: XY_PLANE,
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
    // 角度/距离对像素敏感：正视草图平面并放大到 R10 视野。
    await page.getByTestId('viewcube-menu-trigger').click();
    await page.getByTestId('viewcube-menu-view-normal-to-sketch').click();
    await page.waitForTimeout(300);
    await page.getByTestId('viewcube-menu-trigger').click();
    await page.getByTestId('viewcube-menu-zoom-fit').click();
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const vp = (window as unknown as {
        __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { zoomToVolume?: (v: unknown) => void } } } } };
      }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
      vp?.zoomToVolume?.({ low: { x: -0.03, y: -0.03, z: -0.001 }, high: { x: 0.03, y: 0.03, z: 0.001 } });
    });
    await page.waitForTimeout(300);

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const project = async (local: Pt): Promise<Pt> => {
      const view = await page.evaluate((worldPoint) => {
        const vp = (window as unknown as {
          __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { worldToView: (p: { x: number; y: number; z: number }) => { x: number; y: number } } } | undefined } } };
        }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
        if (!vp)
          return null;
        const v = vp.worldToView(worldPoint);
        return { x: v.x, y: v.y };
      }, { x: local.x, y: local.y, z: 0 });
      expect(view).not.toBeNull();
      return { x: box!.x + view!.x, y: box!.y + view!.y };
    };

    await page.getByRole('button', { name: '偏移', exact: true }).click();
    const onCircle = await project({ x: 0.01, y: 0 });
    await page.mouse.click(onCircle.x, onCircle.y);
    // 光标外移定侧 → 弹层输入精确距离（米制契约：0.005 m = 5 mm）→ Enter 提交。
    const outside = await project({ x: 0.015, y: 0 });
    await page.mouse.click(outside.x, outside.y);
    await expect(page.getByTestId('sketch-value-popup')).toBeVisible({ timeout: 15_000 });
    const valueInput = page.getByTestId('sketch-value-input');
    await valueInput.fill('0.005');
    await valueInput.press('Enter');

    await expect.poll(async () => circleRadii(await getSketchRpc(ctx, sketchId, token)).length, {
      timeout: 40_000,
      intervals: [600, 1000, 2000, 3000],
    }).toBe(2);
    const committed = await getSketchRpc(ctx, sketchId, token);
    const radii = circleRadii(committed);
    expect(radii[0]!).toBeCloseTo(0.01, 6);
    expect(radii[1]!).toBeCloseTo(0.015, 4);
    const radiusConstraint = (committed?.constraints ?? []).find((constraint) => constraint.kind === 'radius');
    expect(radiusConstraint?.value).toBeCloseTo(0.015, 4);
    const coincident = (committed?.constraints ?? []).find((constraint) => constraint.kind === 'coincident');
    expect(coincident).toBeDefined();
    expect(coincident!.refs.some((ref) => typeof ref === 'object' && 'part' in ref && ref.part === 'center')).toBe(true);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => circleRadii(await getSketchRpc(ctx, sketchId, token)).length, {
      timeout: 30_000,
      intervals: [500, 1000, 2000],
    }).toBe(1);
    const restored = await getSketchRpc(ctx, sketchId, token);
    expect(restored?.constraints ?? []).toHaveLength(0);
  });
});
