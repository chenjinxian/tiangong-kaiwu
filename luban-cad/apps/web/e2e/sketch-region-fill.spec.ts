/**
 * ADR-0018 S1f 真栈验收：草图封闭面域填充（Onshape 对拍）。
 *
 * 覆盖：闭合轮廓 + 内孔草图 → getSketch.regions 带外环/孔环采样边界；编辑态
 * 面域填充观测面 ≥1；正视 + 适合窗口后截屏（test-results/sketch-region-fill.png
 * + .json 采样坐标），像素取样由离线 PIL 核对 rgb(228,230,233)。
 */
import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
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

/** 20×10 矩形（4 线）+ 内孔圆 r2（evenodd 应镂空）。 */
const ENTITIES: SketchEntityDto[] = [
  { kind: 'line', id: 11, p1: { x: -10, y: -5 }, p2: { x: 10, y: -5 } },
  { kind: 'line', id: 12, p1: { x: 10, y: -5 }, p2: { x: 10, y: 5 } },
  { kind: 'line', id: 13, p1: { x: 10, y: 5 }, p2: { x: -10, y: 5 } },
  { kind: 'line', id: 14, p1: { x: -10, y: 5 }, p2: { x: -10, y: -5 } },
  { kind: 'circle', id: 21, center: { x: 0, y: 0 }, radius: 2 },
];

test.describe('草图面域填充（ADR-0018 S1f）', () => {
  test('封闭面域填充存在且带孔；截屏留证', async ({ page, request }) => {
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

    const lease = await borrowWriteLease(ctx, token, 'sketch-region-fill');
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
    await expect(page.getByTestId('sketch-entity-picker')).toBeAttached({ timeout: 60_000 });

    // 后端面域读面：至少 1 个外环 + 孔环（矩形内圆）。
    const sketch = await getSketchRpc(ctx, sketchId, token);
    const regions = sketch?.regions ?? [];
    expect(regions.length).toBeGreaterThan(0);
    const withBoundary = regions.filter((region) => (region.outerBoundary?.length ?? 0) >= 3);
    expect(withBoundary.length).toBeGreaterThan(0);
    expect(withBoundary.some((region) => (region.holeBoundaries?.length ?? 0) > 0)).toBe(true);

    // 填充观测面：活动草图面域数 ≥1。
    const marker = page.getByTestId('sketch-region-fills');
    await expect(marker).toHaveAttribute('data-count', /^[1-9]\d*$/, { timeout: 30_000 });

    // 正视 + 适合窗口 → 截屏（像素取证：矩形内、圆外的世界点 (6,0,0)）。
    await page.getByTestId('viewcube-menu-trigger').click();
    await page.getByTestId('viewcube-menu-view-normal-to-sketch').click();
    await page.getByTestId('viewcube-menu-trigger').click();
    await page.getByTestId('viewcube-menu-zoom-fit').click();
    await page.waitForTimeout(800);
    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const sample = await page.evaluate(() => {
      const vp = (window as unknown as {
        __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { worldToView: (p: { x: number; y: number; z: number }) => { x: number; y: number } } | undefined } } } };
      }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
      if (!vp) return null;
      const fill = vp.worldToView({ x: 6, y: 0, z: 0 });
      const hole = vp.worldToView({ x: 1.2, y: 0, z: 0 });
      return { fill: { x: fill.x, y: fill.y }, hole: { x: hole.x, y: hole.y } };
    });
    expect(sample).not.toBeNull();
    const outDir = join(process.cwd(), 'test-results');
    await mkdir(outDir, { recursive: true });
    const pagePoints = {
      fill: { x: Math.round(box!.x + sample!.fill.x), y: Math.round(box!.y + sample!.fill.y) },
      hole: { x: Math.round(box!.x + sample!.hole.x), y: Math.round(box!.y + sample!.hole.y) },
    };
    await writeFile(join(outDir, 'sketch-region-fill.json'), JSON.stringify({
      canvas: box,
      view: sample,
      pagePoints,
    }, null, 2), 'utf8');
    await page.screenshot({ path: join(outDir, 'sketch-region-fill.png') });
  });
});
