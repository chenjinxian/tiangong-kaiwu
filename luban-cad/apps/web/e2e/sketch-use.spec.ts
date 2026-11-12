/**
 * 草图「使用」（Use）真栈验收（2026-11-13）：同 Part Studio 草图→草图投影。
 *
 * 草图 1（圆 R10mm）→ 草图 2 编辑态点「使用」→ 点源圆 → updateSketch 生成
 * projected 圆根实体（后端合成圆心点）→ undo 移除 → 再次使用 → 改源圆半径
 * R20mm → 读本草图即实时重投影为 R20mm（ADR-0009 切片 1a 的联动读面）。
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
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

async function openUseSketch(
  page: Page,
  request: Parameters<typeof resetBModelSeed>[0],
): Promise<{
  ctx: Awaited<ReturnType<typeof openSeedImodelEditor>>;
  sourceId: string;
  consumerId: string;
  token: string;
  project: (x: number, y: number) => Promise<Pt>;
}> {
  const token = await getApiToken();
  const seed = await resetBModelSeed(request, token);
  const openWithRetry = async () => {
    try {
      return await openSeedImodelEditor(page, seed);
    } catch {
      await page.reload();
      return await openSeedImodelEditor(page, seed);
    }
  };
  let ctx = await openWithRetry();
  const lease = await borrowWriteLease(ctx, token, 'sketch-use');
  const source = await applyFeatureOpRpc(ctx, {
    kind: 'insertSketch',
    entities: [{ kind: 'circle', id: 11, center: { x: 0.02, y: 0 }, radius: 0.01 }],
    constraints: [{ kind: 'radius', id: 101, refs: [11], value: 0.01 }],
    plane: XY_PLANE,
  }, lease, token);
  assertFeatureOpOk(source, '源草图');
  const consumer = await applyFeatureOpRpc(ctx, {
    kind: 'insertSketch',
    entities: [{ kind: 'line', id: 21, p1: { x: -0.01, y: 0.03 }, p2: { x: 0.01, y: 0.03 } }],
    constraints: [],
    plane: XY_PLANE,
  }, lease, token);
  assertFeatureOpOk(consumer, '目标草图');
  await releaseWriteLease(ctx, lease, token);

  await page.reload();
  ctx = await openWithRetry();
  const row = page.getByTestId(`tree-row-${consumer.featureId!}`);
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.dblclick({ timeout: 30_000 });
  await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => {
    const vp = (window as any).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView as
      | { zoomToVolume?: (v: unknown) => void }
      | undefined;
    vp?.zoomToVolume?.({ low: { x: -0.06, y: -0.04, z: -0.01 }, high: { x: 0.06, y: 0.05, z: 0.01 } });
  });
  await page.waitForTimeout(400);

  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const project = async (x: number, y: number): Promise<Pt> => {
    const view = await page.evaluate((world) => {
      const vp = (window as any).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView as
        | { worldToView: (p: { x: number; y: number; z: number }) => { x: number; y: number } }
        | undefined;
      if (!vp) return null;
      const v = vp.worldToView(world);
      return { x: v.x, y: v.y };
    }, { x, y, z: 0 });
    expect(view).not.toBeNull();
    return { x: box!.x + view!.x, y: box!.y + view!.y };
  };

  await page.getByRole('button', { name: '使用', exact: true }).click();
  await expect(page.getByTestId('sketch-use-prompt')).toContainText('使用', { timeout: 30_000 });
  return { ctx, sourceId: source.featureId!, consumerId: consumer.featureId!, token, project };
}

function projectedCircle(sketch: SketchDto | undefined, sourceId: string): { radius?: number } | undefined {
  return (sketch?.entities ?? []).find(
    (entity) => entity.kind === 'circle'
      && entity.projected?.kind === 'projected'
      && entity.projected.source.sketchId === sourceId,
  ) as { radius?: number } | undefined;
}

test.describe('草图「使用」（Onshape Use 对拍）', () => {
  test('点源圆 → projected 圆 + undo；改源半径 → 本草图实时重投影', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const { ctx, sourceId, consumerId, token, project } = await openUseSketch(page, request);

    // 源圆右边沿（圆心 x=0.02，R10mm）。
    const onCircle = await project(0.03, 0);
    await page.mouse.click(onCircle.x, onCircle.y);
    await expect.poll(async () => projectedCircle(await getSketchRpc(ctx, consumerId, token), sourceId)?.radius, {
      timeout: 40_000,
      intervals: [500, 1000, 2000],
    }).toBeCloseTo(0.01, 5);
    // 后端合成圆心派生点（root+1），根实体带 projected 标记。
    const afterUse = await getSketchRpc(ctx, consumerId, token);
    expect((afterUse?.entities ?? []).some((entity) => entity.kind === 'point' && entity.projected?.derived === true)).toBe(true);
    // 工具保持激活（可连续使用）。
    await expect(page.getByTestId('sketch-use-prompt')).toBeVisible();

    // undo：移除投影实体。
    await page.keyboard.press('Control+z');
    await expect.poll(async () => projectedCircle(await getSketchRpc(ctx, consumerId, token), sourceId), {
      timeout: 30_000,
      intervals: [500, 1000, 2000],
    }).toBeUndefined();

    // 再次使用 → 改源草图半径 R20mm → 本草图读面联动 R20mm。
    await page.mouse.click(onCircle.x, onCircle.y);
    await expect.poll(async () => projectedCircle(await getSketchRpc(ctx, consumerId, token), sourceId)?.radius, {
      timeout: 40_000,
      intervals: [500, 1000, 2000],
    }).toBeCloseTo(0.01, 5);

    const lease = await borrowWriteLease(ctx, token, 'sketch-use-source-update');
    const currentSource = await getSketchRpc(ctx, sourceId, token);
    const updated = await applyFeatureOpRpc(ctx, {
      kind: 'updateSketch',
      sketchId: sourceId,
      entities: currentSource?.entities ?? [],
      constraints: (currentSource?.constraints ?? []).map((constraint) =>
        constraint.kind === 'radius' ? { ...constraint, value: 0.02 } : constraint),
    }, lease, token);
    assertFeatureOpOk(updated, '源草图改半径');
    await releaseWriteLease(ctx, lease, token);

    await expect.poll(async () => projectedCircle(await getSketchRpc(ctx, consumerId, token), sourceId)?.radius, {
      timeout: 40_000,
      intervals: [500, 1000, 2000],
    }).toBeCloseTo(0.02, 5);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('sketch-use-prompt')).toHaveCount(0);
  });
});
