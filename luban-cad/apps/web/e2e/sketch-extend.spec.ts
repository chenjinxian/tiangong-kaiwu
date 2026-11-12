/**
 * 草图延伸真栈验收（Onshape Extend 首切片 2026-11-12）。
 *
 * 覆盖：ribbon「修剪 ▾」→「延伸」（同一按钮下拉，Onshape 口径）→ 点击线
 * 靠近端点的一侧 → 端点沿该方向延伸到最近边界（竖线 x=5）；无边界/非直线
 * 源工具诚实提示且不改数据。提交仍走 updateSketch（可撤销）。
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

const ENTITIES: SketchEntityDto[] = [
  { kind: 'line', id: 11, p1: { x: -10, y: 0 }, p2: { x: 0, y: 0 } },
  { kind: 'line', id: 12, p1: { x: 5, y: -5 }, p2: { x: 5, y: 5 } },
  { kind: 'line', id: 13, p1: { x: -10, y: 8 }, p2: { x: -2, y: 8 } },
];

interface Point { x: number; y: number }

function linePoints(sketch: SketchDto | undefined, id: number): { a: Point; b: Point } | null {
  const entity = sketch?.entities.find((candidate) => candidate.id === id);
  if (!entity || entity.kind !== 'line' || typeof entity.p1 === 'number' || typeof entity.p2 === 'number')
    return null;
  return { a: entity.p1, b: entity.p2 };
}

test.describe('草图延伸（Onshape 对拍）', () => {
  test('修剪下拉「延伸」→ 点击线端延伸到最近边界；无边界不清空几何', async ({ page, request }) => {
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

    const lease = await borrowWriteLease(ctx, token, 'sketch-extend');
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

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const project = async (local: Point): Promise<Point> => {
      const view = await page.evaluate((worldPoint) => {
        const vp = (window as unknown as {
          __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { worldToView: (p: { x: number; y: number; z: number }) => { x: number; y: number } } } | undefined } } };
        }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
        if (!vp) return null;
        const v = vp.worldToView(worldPoint);
        return { x: v.x, y: v.y };
      }, { x: local.x, y: local.y, z: 0 });
      expect(view).not.toBeNull();
      return { x: box!.x + view!.x, y: box!.y + view!.y };
    };

    // 修剪 ▾ → 延伸（Onshape：同一按钮下拉）。
    await page.getByRole('button', { name: '修剪 ▾' }).click();
    const extendItem = page.getByRole('menuitem', { name: '延伸' });
    await expect(extendItem).toBeVisible({ timeout: 10_000 });
    await extendItem.click();

    // 点击线 11 右端点附近 → 延伸到竖线 x=5。
    const nearEndpoint = await project({ x: 0, y: 0 });
    await page.mouse.click(nearEndpoint.x, nearEndpoint.y);
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      return linePoints(sketch, 11)?.b;
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toEqual({ x: 5, y: 0 });
    // 左端点保持。
    expect(linePoints(await getSketchRpc(ctx, sketchId, token), 11)?.a).toEqual({ x: -10, y: 0 });

    // 无边界线（线 13 右端向右没有交点）→ 点击后数据不变（诚实提示，不静默改值）。
    const isolated = await project({ x: -2, y: 8 });
    await page.mouse.click(isolated.x, isolated.y);
    await page.waitForTimeout(1500);
    expect(linePoints(await getSketchRpc(ctx, sketchId, token), 13)).toEqual({
      a: { x: -10, y: 8 }, b: { x: -2, y: 8 },
    });

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
  });
});
