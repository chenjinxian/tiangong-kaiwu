/**
 * 草图修剪纵向回归（2026-11-12）：点击点带 y 偏移，验证 view→草图局部反解
 * 使用官方 viewToNpc（旧实现把 y 上下镜像，会修错段落）。竖线 (0,-10..10)
 * 与两条水平边界 y=±3；点击 (0,1) 应移除 [-3,3]，保留上下两段。
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
  { kind: 'line', id: 31, p1: { x: 0, y: -10 }, p2: { x: 0, y: 10 } },
  { kind: 'line', id: 32, p1: { x: -5, y: 3 }, p2: { x: 5, y: 3 } },
  { kind: 'line', id: 33, p1: { x: -5, y: -3 }, p2: { x: 5, y: -3 } },
];

interface Point { x: number; y: number }

function verticalSegments(sketch: SketchDto | undefined): Array<{ a: Point; b: Point }> {
  const out: Array<{ a: Point; b: Point }> = [];
  for (const entity of sketch?.entities ?? []) {
    if (entity.kind !== 'line')
      continue;
    const resolve = (ref: Point | number): Point | null => {
      if (typeof ref === 'number') {
        const point = sketch!.entities.find((candidate) => candidate.id === ref) as
          | { kind?: string; x?: number; y?: number }
          | undefined;
        return point && point.kind === 'point' ? { x: point.x ?? 0, y: point.y ?? 0 } : null;
      }
      return ref;
    };
    const a = resolve(entity.p1);
    const b = resolve(entity.p2);
    if (a && b && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.x) < 1e-6) {
      const lo = Math.min(a.y, b.y);
      const hi = Math.max(a.y, b.y);
      out.push({ a: { x: 0, y: lo }, b: { x: 0, y: hi } });
    }
  }
  return out.sort((left, right) => left.a.y - right.a.y);
}

test.describe('草图修剪（纵向反解回归）', () => {
  test('竖线中间段移除（点击 y=1，非 y=0）→ 保留 [-10,-3] 与 [3,10]', async ({ page, request }) => {
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
    const lease = await borrowWriteLease(ctx, token, 'sketch-trim-vertical');
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
    await page.getByTestId('viewcube-menu-trigger').click();
    await page.getByTestId('viewcube-menu-zoom-fit').click();
    await page.getByTestId('viewcube-menu-trigger').click();
    await page.getByTestId('viewcube-menu-view-normal-to-sketch').click();
    await page.waitForTimeout(600);

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
    }, { x: 0, y: 1, z: 0 });
    expect(view).not.toBeNull();

    await page.getByRole('button', { name: '修剪', exact: true }).click();
    await page.mouse.click(box!.x + view!.x, box!.y + view!.y);

    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      return verticalSegments(sketch).length;
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBe(2);
    const segments = verticalSegments(await getSketchRpc(ctx, sketchId, token));
    expect(segments[0]!.a.y).toBeCloseTo(-10, 6);
    expect(segments[0]!.b.y).toBeCloseTo(-3, 6);
    expect(segments[1]!.a.y).toBeCloseTo(3, 6);
    expect(segments[1]!.b.y).toBeCloseTo(10, 6);
    // 边界线不动。
    const after = await getSketchRpc(ctx, sketchId, token);
    expect(after?.entities.filter((entity) => entity.id === 32 || entity.id === 33)).toHaveLength(2);
    await page.keyboard.press('Escape');
  });
});
