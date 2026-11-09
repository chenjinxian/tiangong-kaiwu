/**
 * v1.53 / ADR-0005 Phase 6 真栈 UI 验收：extrude 薄壁（bodyType=THIN）。
 *
 * live 证据：ui-evidence/feature-dialogs-20261108/onshape/extrude-upto2-thin.png
 *   （实体|曲面|薄壁 页签；薄壁行序 中间平面 / 厚度 1 / 厚度 2 / 给定深度）。
 * 本切片只接「实体/薄壁 + 单侧厚度」，第二厚度/中间平面不渲染。
 *
 * 10×10 草图、深度 10、壁厚 1（向内）→ 1000 − 8×8×10 = **360 mm³**；push+重开一致。
 */
import { expect, test } from '@playwright/test';
import type { SketchConstraintDto, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
  releaseWriteLease,
} from './helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './examples/imodel.js';

function rectangleSketch(width: number, height: number): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
  return {
    entities: [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: width, y: 0 },
      { kind: 'point', id: 3, x: width, y: height },
      { kind: 'point', id: 4, x: 0, y: height },
      { kind: 'point', id: 5, x: 0, y: 0 },
      { kind: 'point', id: 6, x: width, y: 0 },
      { kind: 'point', id: 7, x: width, y: height },
      { kind: 'point', id: 8, x: 0, y: height },
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

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

const EXPECTED_VOLUME_MM3 = 10 * 10 * 10 - 8 * 8 * 10;

test.describe('Extrude 薄壁 UI（ADR-0005 Phase 6）', () => {
  test('薄壁 1 mm → 360 mm³/push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Extrude Thin Wall UI', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'extrude-thin-wall-ui');

    const sketch = rectangleSketch(10, 10);
    const result = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: sketch.entities, constraints: sketch.constraints, plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(result, '盒体草图');
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openWithRetry();
    await page.getByRole('button', { name: '拉伸', exact: true }).click({ timeout: 30_000 });
    const dialog = page.getByTestId('part-studio-feature-dialog');
    await expect(dialog.getByText('草图 1 的面')).toBeVisible({ timeout: 30_000 });
    const thinTab = dialog.getByRole('tab', { name: '薄壁' });
    await expect(thinTab).toBeEnabled({ timeout: 15_000 });
    await thinTab.click();
    const thickness = dialog.getByRole('textbox', { name: '壁厚' });
    await expect(thickness).toHaveValue('1');
    await expect(dialog.getByTestId('part-studio-feature-dialog-thin-wall-hint')).toBeVisible();
    const confirm = dialog.getByRole('button', { name: '确认' });
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    await confirm.click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    const TREE_TYPES = ['sketch', 'extrude'];
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(TREE_TYPES);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[1]?.params).toMatchObject({ bodyType: 'THIN', thinThicknessMm: 1, distance: 10 });
    let volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    console.log(`[extrude-thin-wall-ui] volume=${volume.toFixed(3)} expected=${EXPECTED_VOLUME_MM3}`);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3)).toBeLessThan(0.5);

    await pushExampleChanges(page, 'extrude thin wall UI acceptance');
    await page.reload();
    ctx = await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(TREE_TYPES);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);
  });

  test('薄壁中间平面 1 mm → 400 mm³/push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Extrude Thin Wall Midplane', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'extrude-thin-wall-midplane');

    const sketch = rectangleSketch(10, 10);
    const result = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: sketch.entities, constraints: sketch.constraints, plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(result, '盒体草图');
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openWithRetry();
    await page.getByRole('button', { name: '拉伸', exact: true }).click({ timeout: 30_000 });
    const dialog = page.getByTestId('part-studio-feature-dialog');
    await expect(dialog.getByText('草图 1 的面')).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('tab', { name: '薄壁' }).click();
    await expect(dialog.getByRole('checkbox', { name: '中间平面' })).not.toBeChecked();
    await dialog.getByRole('checkbox', { name: '中间平面' }).check();
    const confirm = dialog.getByRole('button', { name: '确认' });
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    await confirm.click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    const EXPECTED_MIDPLANE_VOLUME_MM3 = (11 * 11 - 9 * 9) * 10;
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[1]?.params).toMatchObject({ bodyType: 'THIN', thinThicknessMm: 1, thinMidPlane: true, distance: 10 });
    let volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    console.log(`[extrude-thin-wall-midplane] volume=${volume.toFixed(3)} expected=${EXPECTED_MIDPLANE_VOLUME_MM3}`);
    expect(Math.abs(volume - EXPECTED_MIDPLANE_VOLUME_MM3)).toBeLessThan(0.5);

    await pushExampleChanges(page, 'extrude thin wall midplane acceptance');
    await page.reload();
    ctx = await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(volume - EXPECTED_MIDPLANE_VOLUME_MM3) / EXPECTED_MIDPLANE_VOLUME_MM3).toBeLessThan(0.005);
  });

  test('含孔薄壁：4×4 + r0.5 孔，t0.5/depth2 → 18.712 mm³/push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Extrude Thin Wall Hole', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'extrude-thin-wall-hole');

    const rect = rectangleSketch(4, 4);
    const sketchResult = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [
        ...rect.entities,
        { kind: 'point', id: 41, x: 2, y: 2 },
        { kind: 'circle', id: 42, center: 41, radius: 0.5 },
      ],
      constraints: rect.constraints,
      plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(sketchResult, '含孔草图');
    const sketchId = sketchResult.featureId ?? '';
    const extrudeResult = await applyFeatureOpRpc(ctx, {
      kind: 'insertFeature', featureType: 'extrude',
      params: {
        profile: [], distance: 2, sketchId, regions: [0],
        bodyType: 'THIN', thinThicknessMm: 0.5,
      },
    }, lease, token);
    assertFeatureOpOk(extrudeResult, '含孔薄壁');
    await releaseWriteLease(ctx, lease, token);

    const EXPECTED_HOLE_VOLUME_MM3 = (7 + 0.75 * Math.PI) * 2;
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[1]?.params).toMatchObject({ bodyType: 'THIN', thinThicknessMm: 0.5, distance: 2 });
    let volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    console.log(`[extrude-thin-wall-hole] volume=${volume.toFixed(3)} expected=${EXPECTED_HOLE_VOLUME_MM3.toFixed(3)}`);
    expect(Math.abs(volume - EXPECTED_HOLE_VOLUME_MM3)).toBeLessThan(0.5);

    await pushExampleChanges(page, 'extrude thin wall hole acceptance');
    await page.reload();
    ctx = await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(volume - EXPECTED_HOLE_VOLUME_MM3) / EXPECTED_HOLE_VOLUME_MM3).toBeLessThan(0.005);
  });
});
