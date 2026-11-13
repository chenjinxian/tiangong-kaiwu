/**
 * v1.31 cPlane 平面点真栈：真实 UI 创建「平面点」cPlane → 草图落在该平面 →
 * 矩形拉伸 20×20×10 = 4000 mm³；push + 重开验证平面快照与树。
 */
import { expect, test } from '@playwright/test';
import type { SketchEntityDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
  getSketchRpc,
} from './helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './examples/imodel.js';

const EXAMPLE_NAME = 'E2E - CPlane Point';
const ORIGIN = { x: 1, y: 2, z: 3 };
const RECTANGLE: SketchEntityDto[] = [
  { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 20, y: 0 } },
  { kind: 'line', id: 2, p1: { x: 20, y: 0 }, p2: { x: 20, y: 20 } },
  { kind: 'line', id: 3, p1: { x: 20, y: 20 }, p2: { x: 0, y: 20 } },
  { kind: 'line', id: 4, p1: { x: 0, y: 20 }, p2: { x: 0, y: 0 } },
];

test.describe('v1.31 cPlane plane point', () => {
  test('UI 平面点 + 草图 + 拉伸 → 4000 mm³/push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, EXAMPLE_NAME, { reset: true });
    let ctx = await openExampleEditor(page, ids);

    await page.getByRole('button', { name: '平面', exact: true }).click();
    const planeDialog = page.getByTestId('part-studio-cplane-dialog');
    await expect(planeDialog).toBeVisible({ timeout: 30_000 });
    await planeDialog.getByTestId('cplane-reference-chip').click();
    await planeDialog.getByRole('option', { name: 'Top 平面' }).click();
    await planeDialog.getByTestId('cplane-mode').selectOption('point');
    await planeDialog.getByTestId('cplane-origin-x').fill(String(ORIGIN.x));
    await planeDialog.getByTestId('cplane-origin-y').fill(String(ORIGIN.y));
    await planeDialog.getByTestId('cplane-origin-z').fill(String(ORIGIN.z));
    await expect(planeDialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 15_000 });
    await planeDialog.getByRole('button', { name: '确认' }).click();
    await expect(planeDialog).toBeHidden({ timeout: 60_000 });

    let tree = await getFeatureTreeRpc(ctx, token);
    const cplane = tree.find((row) => row.featureType === 'cPlane');
    expect(cplane?.status).toBe(0);
    expect(cplane?.params).toMatchObject({ reference: 'top', origin: ORIGIN });

    await page.getByRole('button', { name: '草图', exact: true }).click();
    const sketchDialog = page.getByTestId('part-studio-sketch-dialog');
    await expect(sketchDialog).toBeVisible({ timeout: 30_000 });
    // 2026-11-13：平面字段无下拉——树内 cPlane 行选中即成为草图平面（并自动创建）。
    await page.getByTestId('part-studio-feature-list')
      .getByRole('button', { name: /平面 1/ }).click();
    await expect(sketchDialog.getByTestId('sketch-plane-chip')).toHaveText(/平面 1/, { timeout: 60_000 });

    tree = await getFeatureTreeRpc(ctx, token);
    const sketch = tree.filter((row) => row.featureType === 'sketch').at(-1)!;
    const lease = await borrowWriteLease(ctx, token, 'cplane-point-sketch');
    const seeded = await applyFeatureOpRpc(ctx, {
      kind: 'updateSketch', sketchId: sketch.id, entities: RECTANGLE, constraints: [],
    }, lease, token);
    assertFeatureOpOk(seeded, 'Sketch 1 实体注入');

    const stored = await getSketchRpc(ctx, sketch.id, token);
    expect(stored?.plane?.origin).toEqual(ORIGIN);
    expect(stored?.plane?.normal).toEqual({ x: 0, y: 0, z: 1 });
    expect(stored?.plane?.sourceFeatureId).toBe(cplane!.id);

    const ex = await applyFeatureOpRpc(ctx, {
      kind: 'insertFeature',
      featureType: 'extrude',
      params: {
        profile: [],
        sketchId: sketch.id,
        regions: [0],
        distance: 10,
        operation: 'new',
      },
    }, lease, token);
    assertFeatureOpOk(ex, 'Extrude 1');

    await page.reload();
    ctx = await openExampleEditor(page, ids);
    const reopenedTree = await getFeatureTreeRpc(ctx, token);
    expect(reopenedTree.map((row) => row.featureType)).toEqual(['cPlane', 'sketch', 'extrude']);
    expect(reopenedTree.every((row) => row.status === 0)).toBe(true);
    const volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    console.log(`[cplane-point] volume=${volume.toFixed(3)} expected=4000`);
    expect(Math.abs(volume - 4000) / 4000).toBeLessThan(0.005);

    await pushExampleChanges(page, 'v1.31 cPlane plane point');
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    const reopenedSketch = await getSketchRpc(ctx, reopenedTree.find((row) => row.featureType === 'sketch')!.id, token);
    expect(reopenedSketch?.plane?.origin).toEqual(ORIGIN);
    expect(reopenedSketch?.plane?.sourceFeatureId).toBe(cplane!.id);
  });
});
