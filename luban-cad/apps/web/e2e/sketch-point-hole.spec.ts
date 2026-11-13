/**
 * Sketch.Point → HoleDialog 集成真栈（2026-11-09）。
 *
 * 点工具的用途之一是孔位：矩形板（含矩形中心点）+ 点工具新点 (10,0) →
 * 拉伸成体 → 孔对话框选择新点（列表最后一个）→ throughAll → 去材 = πr²t。
 */
import { expect, test } from '@playwright/test';
import { getApiToken, getFeatureTreeRpc, getMassPropertiesRpc, getSketchRpc, openSeedImodelEditor } from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import {
  P,
  activate,
  chooseSketchPlaneInViewport,
  clickWorld,
  disableSnap,
  finishSketch,
  setStandardView,
} from './tutorial2-helpers.js';

test.describe('Sketch.Point → 孔位', () => {
  test('点工具新点作为孔位 → throughAll 去材 π·2.5²·10', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 120_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const ctx = await openSeedImodelEditor(page, seed);

    await page.getByRole('button', { name: '草图', exact: true }).click();
    const dialog = page.getByTestId('part-studio-sketch-dialog');
    await expect(dialog).toBeVisible();
    await chooseSketchPlaneInViewport(page, 'front');
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const hub = { x: box.x, y: box.y };
    await setStandardView(page, 4, {
      low: { x: -100, y: -100, z: -100 }, high: { x: 100, y: 100, z: 100 },
    });
    await disableSnap(page);

    await activate(page, '拐角矩形');
    await clickWorld(page, hub, P(-20, 10));
    await clickWorld(page, hub, P(20, -10));
    await page.waitForTimeout(1_200);
    await activate(page, '点');
    await clickWorld(page, hub, P(10, 0));
    await page.waitForTimeout(1_200);

    const sketch = await (async () => {
      const tree = await getFeatureTreeRpc(ctx, token);
      const id = tree.filter((row) => row.featureType === 'sketch').at(-1)?.id;
      expect(id).toBeTruthy();
      return (await getSketchRpc(ctx, id!, token))!;
    })();
    expect(sketch.entities.filter((e) => e.kind === 'point').length).toBeGreaterThanOrEqual(2);

    await finishSketch(page);
    const featureDialog = page.getByTestId('part-studio-feature-dialog');
    await page.getByRole('button', { name: '拉伸', exact: true }).click();
    await expect(featureDialog).toBeVisible();
    await featureDialog.getByLabel('深度').fill('10');
    await expect(featureDialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 20_000 });
    await featureDialog.getByRole('button', { name: '确认' }).click();
    await expect(featureDialog).toBeHidden({ timeout: 90_000 });
    const baseVolume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, m) => sum + m.volume, 0);

    await page.getByRole('button', { name: '孔', exact: true }).click();
    const holeDialog = page.getByTestId('part-studio-hole-dialog');
    await expect(holeDialog).toBeVisible();
    await holeDialog.getByTestId('hole-locations-toggle').click();
    const points = holeDialog.getByTestId('hole-points');
    await expect(points).toBeVisible({ timeout: 30_000 });
    const checkboxes = points.getByRole('checkbox');
    const count = await checkboxes.count();
    expect(count).toBeGreaterThanOrEqual(2);
    await checkboxes.last().check();
    await holeDialog.getByTestId('hole-end-bound').selectOption('throughAll');
    await expect(holeDialog.getByRole('button', { name: '确认' })).toBeEnabled();
    await holeDialog.getByRole('button', { name: '确认' }).click();
    await expect(holeDialog).toBeHidden({ timeout: 90_000 });

    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'hole']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, m) => sum + m.volume, 0);
    const removed = baseVolume - volume;
    const expected = Math.PI * 2.5 * 2.5 * 10;
    console.log(`[point-hole] removed=${removed.toFixed(3)} expected=${expected.toFixed(3)} mm³`);
    expect(Math.abs(removed - expected) / expected).toBeLessThan(0.01);
  });
});
