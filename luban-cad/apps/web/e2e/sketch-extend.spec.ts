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
    await page.getByRole('button', { name: '缩放到合适大小' }).click();
    await page.getByRole('button', { name: '正视草图平面' }).click();
    await page.waitForTimeout(600);

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

    // Onshape 两相：第一击选线 11 右端，第二击点边界竖线 x=5 → 延伸到该边界。
    const nearEndpoint = await project({ x: 0, y: 0 });
    await page.mouse.click(nearEndpoint.x, nearEndpoint.y);
    const boundary = await project({ x: 5, y: 0 });
    await page.mouse.click(boundary.x, boundary.y);
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      return linePoints(sketch, 11)?.b;
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toEqual({ x: 5, y: 0 });
    // 左端点保持。
    expect(linePoints(await getSketchRpc(ctx, sketchId, token), 11)?.a).toEqual({ x: -10, y: 0 });

    // 第一段提交后相机/视图可能因刷新变化：重新正视取景，保证第二段点击坐标稳定。
    await page.getByRole('button', { name: '缩放到合适大小' }).click();
    await page.getByRole('button', { name: '正视草图平面' }).click();
    await page.waitForTimeout(600);

    // 第二击点空白位置 = 自由端点（帮助：没有边界时止于点击位置）。
    const isolated = await project({ x: -2, y: 8 });
    await page.mouse.click(isolated.x, isolated.y);
    const freeTarget = await project({ x: 0, y: 8 });
    await page.mouse.click(freeTarget.x, freeTarget.y);
    // 自由端点落在点击位置（屏幕像素量化，局部坐标容差 0.2）。
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      const b = linePoints(sketch, 13)?.b;
      return b !== undefined && Math.abs(b.x) < 0.2 && Math.abs(b.y - 8) < 0.2;
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBe(true);
    expect(linePoints(await getSketchRpc(ctx, sketchId, token), 13)?.a).toEqual({ x: -10, y: 8 });

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
  });

  test('弧源：端点沿圆周延伸到线边界（扫角增长）', async ({ page, request }) => {
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
    const lease = await borrowWriteLease(ctx, token, 'sketch-extend-arc');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [
        { kind: 'arc', id: 21, center: { x: 0, y: 0 }, radius: 5, startAngle: 0, sweepAngle: Math.PI / 2 },
        { kind: 'line', id: 22, p1: { x: -5, y: -1 }, p2: { x: -5, y: 1 } },
      ],
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
    await page.getByRole('button', { name: '缩放到合适大小' }).click();
    await page.getByRole('button', { name: '正视草图平面' }).click();
    await page.waitForTimeout(600);

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

    await page.getByRole('button', { name: '修剪 ▾' }).click();
    const extendItem = page.getByRole('menuitem', { name: '延伸' });
    await expect(extendItem).toBeVisible({ timeout: 10_000 });
    await extendItem.click();

    // 第一击弧终点 (0,5)；第二击边界线 x=-5 → 扫角 π/2 → π。
    const arcEnd = await project({ x: 0, y: 5 });
    await page.mouse.click(arcEnd.x, arcEnd.y);
    const boundary = await project({ x: -5, y: 0 });
    await page.mouse.click(boundary.x, boundary.y);
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      const arc = sketch?.entities.find((entity) => entity.id === 21);
      return arc && arc.kind === 'arc' ? arc.sweepAngle : undefined;
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBeCloseTo(Math.PI, 6);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
  });
});
