/**
 * 草图「插入 DXF 或 DWG」真栈验收（2026-11-12 首切片）。
 *
 * 覆盖：草图编辑态点 ribbon → 文件选择 → ASCII DXF 解析（LINE/CIRCLE/ARC/
 * POINT/直线段 LWPOLYLINE、$INSUNITS=mm）→ 一次 updateSketch 并入当前草图 → 重载后仍在。
 * DWG/空 DXF 的拒收由纯逻辑与代码路径覆盖，不在本 spec 造二进制夹具。
 */
import path from 'node:path';
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

function kinds(sketch: SketchDto | undefined): string[] {
  return (sketch?.entities ?? []).map((entity) => entity.kind).sort();
}

test.describe('草图 DXF 导入（Onshape 对拍首切片）', () => {
  test('LINE/CIRCLE/ARC/POINT/LWPOLYLINE 导入并重载持久', async ({ page, request }) => {
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
    const lease = await borrowWriteLease(ctx, token, 'sketch-dxf-import');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: [], constraints: [], plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    const enterSketch = async (): Promise<void> => {
      await page.reload();
      ctx = await openWithRetry();
      const sketchRow = page.getByTestId(`tree-row-${sketchId}`);
      await expect(sketchRow).toBeVisible({ timeout: 60_000 });
      await sketchRow.dblclick({ timeout: 30_000 });
      await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });
    };
    await enterSketch();

    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '插入 DXF 或 DWG', exact: true }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(path.resolve(process.cwd(), 'e2e/fixtures/import-sample.dxf'));

    await expect.poll(async () => kinds(await getSketchRpc(ctx, sketchId, token)), {
      timeout: 40_000,
      intervals: [600, 1000, 2000, 3000],
    }).toEqual(['arc', 'circle', 'line', 'line', 'line', 'point']);

    const sketch = await getSketchRpc(ctx, sketchId, token);
    const line = sketch?.entities.find((entity) => entity.kind === 'line');
    const circle = sketch?.entities.find((entity) => entity.kind === 'circle');
    const arc = sketch?.entities.find((entity) => entity.kind === 'arc');
    expect(line).toMatchObject({ p1: { x: -10, y: 0 }, p2: { x: 0, y: 0 } });
    // LWPOLYLINE（直线段）展开为两条 line；POINT 映射为草图点。
    const polyline = (sketch?.entities ?? []).filter((entity) => entity.kind === 'line'
      && typeof entity.p1 !== 'number' && entity.p1.y === -10);
    expect(polyline).toHaveLength(2);
    const point = sketch?.entities.find((entity) => entity.kind === 'point');
    expect(point).toMatchObject({ kind: 'point', x: -20, y: 0 });
    expect(circle).toMatchObject({ center: { x: 10, y: 0 }, radius: 5 });
    expect(arc?.kind === 'arc' ? arc.radius : undefined).toBeCloseTo(4, 9);
    expect(arc?.kind === 'arc' ? arc.sweepAngle : undefined).toBeCloseTo(Math.PI / 2, 9);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('part-studio-sketch-dialog')).toHaveCount(0);

    // 重载后仍在（一次 updateSketch 已落库）。
    await enterSketch();
    expect(kinds(await getSketchRpc(ctx, sketchId, token))).toEqual(['arc', 'circle', 'line', 'line', 'line', 'point']);
    await page.keyboard.press('Escape');
  });
});
