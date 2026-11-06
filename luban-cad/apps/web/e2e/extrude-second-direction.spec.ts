/**
 * T4 切片：拉伸第二方向（v1.24 `ExtrudeParams.secondDirection`）。
 *
 * 真实 UI：矩形草图 20×20 → 拉伸 10 + 第二方向 5（契约缺省=主方向相反侧）→
 * 体积 = 400 × 15 = 6000 mm³。断言树/status/体积/push+重开。
 */
import { expect, test } from '@playwright/test';
import {
  getApiToken,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
} from './helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './examples/imodel.js';
import { runScenario } from './examples/replay/run.js';
import type { ParityScenario } from './examples/replay/scenario-to-op.js';

const EXAMPLE_NAME = 'E2E - Extrude Second Direction';
const AREA_MM2 = 20 * 20;
const EXPECTED_VOLUME_MM3 = AREA_MM2 * (10 + 5);

function sketchScenario(): ParityScenario {
  return {
    schemaVersion: 1,
    id: 'e2e-extrude-second-direction-sketch',
    name: 'T4 second direction sketch',
    units: 'mm',
    features: [{
      type: 'sketch',
      name: 'Sketch 1',
      sourceFeatureId: 'sketch-1',
      params: {
        plane: {
          origin: { x: 0, y: 0, z: 0 },
          normal: { x: 0, y: 0, z: 1 },
          xDir: { x: 1, y: 0, z: 0 },
        },
        entities: [
          { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 20, y: 0 } },
          { kind: 'line', id: 2, p1: { x: 20, y: 0 }, p2: { x: 20, y: 20 } },
          { kind: 'line', id: 3, p1: { x: 20, y: 20 }, p2: { x: 0, y: 20 } },
          { kind: 'line', id: 4, p1: { x: 0, y: 20 }, p2: { x: 0, y: 0 } },
        ],
        constraints: [],
      },
    }],
    expected: { volumeM3: 0, bodyCount: 0 },
    provenance: { capturedAt: '2026-11-06', status: 'complete', missing: [] },
  };
}

test.describe('T4 extrude second direction', () => {
  test('UI 拉伸 10 + 第二方向 5 → 体积 6000/重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, EXAMPLE_NAME, { reset: true });
    const ctx = await openExampleEditor(page, ids);
    await runScenario(ctx, sketchScenario(), token);

    await page.reload();
    await openExampleEditor(page, ids);
    await page.getByRole('button', { name: '拉伸', exact: true }).click({ timeout: 30_000 });
    const dialog = page.getByTestId('part-studio-feature-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    // 单草图自动选中；等面域 chip（读面就绪）。
    await expect(dialog.getByText('草图 1 的面')).toBeVisible({ timeout: 30_000 });
    const depth = dialog.getByRole('textbox', { name: '深度' });
    await depth.fill('10');
    await dialog.getByTestId('part-studio-feature-dialog-second-direction')
      .locator('input').check();
    await dialog.getByTestId('part-studio-feature-dialog-second-depth').fill('5');
    await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 15_000 });
    await dialog.getByRole('button', { name: '确认' }).click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    console.log(`[extrude-2nd] volume=${volume.toFixed(3)} expected=${EXPECTED_VOLUME_MM3}`);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);

    await pushExampleChanges(page, 'T4 extrude second direction');
    await page.reload();
    await openExampleEditor(page, ids);
    const reopened = await getFeatureTreeRpc(ctx, token);
    expect(reopened.map((row) => row.featureType)).toEqual(['sketch', 'extrude']);
    const reopenedVolume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(reopenedVolume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);
  });
});
