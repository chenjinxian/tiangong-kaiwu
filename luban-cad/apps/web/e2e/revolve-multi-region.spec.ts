/**
 * T4/v1.30：多面域旋转真实 UI（RevolveParams.regions）。
 *
 * 草图 = 两个 y>0 的矩形 + 一条 y=0 的轴线段。旋转对话框在视口点选两个面域
 * （共用 extrude 的 ProfilePicker 多选），轴选 line 31，全周旋转。期望：
 * 两矩形分别绕 x 轴成环柱 π(10²−5²)·10 + π(20²−15²)·10 = 2500π mm³。
 */
import { expect, test } from '@playwright/test';
import { getApiToken, getFeatureTreeRpc, getMassPropertiesRpc } from './helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './examples/imodel.js';
import { runScenario } from './examples/replay/run.js';
import type { ParityScenario } from './examples/replay/scenario-to-op.js';
import { chooseProfileRegionsInViewport, frameStandardView } from './tutorial2-helpers.js';

const EXAMPLE_NAME = 'E2E - Revolve Multi Region';
const EXPECTED_VOLUME_MM3 = 2500 * Math.PI;
const RANGE = { low: { x: -5, y: -5, z: -5 }, high: { x: 15, y: 25, z: 5 } };

function sketchScenario(): ParityScenario {
  return {
    schemaVersion: 1,
    id: 'e2e-revolve-multi-region-sketch',
    name: 'v1.30 revolve multi-region sketch',
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
          { kind: 'line', id: 11, p1: { x: 0, y: 5 }, p2: { x: 10, y: 5 } },
          { kind: 'line', id: 12, p1: { x: 10, y: 5 }, p2: { x: 10, y: 10 } },
          { kind: 'line', id: 13, p1: { x: 10, y: 10 }, p2: { x: 0, y: 10 } },
          { kind: 'line', id: 14, p1: { x: 0, y: 10 }, p2: { x: 0, y: 5 } },
          { kind: 'line', id: 21, p1: { x: 0, y: 15 }, p2: { x: 10, y: 15 } },
          { kind: 'line', id: 22, p1: { x: 10, y: 15 }, p2: { x: 10, y: 20 } },
          { kind: 'line', id: 23, p1: { x: 10, y: 20 }, p2: { x: 0, y: 20 } },
          { kind: 'line', id: 24, p1: { x: 0, y: 20 }, p2: { x: 0, y: 15 } },
          { kind: 'line', id: 31, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
        ],
        constraints: [],
      },
    }],
    expected: { volumeM3: 0, bodyCount: 0 },
    provenance: { capturedAt: '2026-11-06', status: 'complete', missing: [] },
  };
}

test.describe('v1.30 revolve multi-region UI', () => {
  test('视口点选 2 个面域 + 轴 → 体积 2500π/重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, EXAMPLE_NAME, { reset: true });
    const ctx = await openExampleEditor(page, ids);
    await runScenario(ctx, sketchScenario(), token);

    await page.reload();
    await openExampleEditor(page, ids);
    // StandardViewIndex.Top=1（X 右、Y 上）；草图在 XY 平面，必须正对而非侧视。
    await frameStandardView(page, 1, RANGE, { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 });
    await page.getByRole('button', { name: '旋转', exact: true }).click({ timeout: 30_000 });
    const dialog = page.getByTestId('part-studio-feature-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    // 多面域不自动预选（Onshape 视口点选语义）；逐域拾取。
    await chooseProfileRegionsInViewport(page, [0, 1]);
    await dialog.getByRole('combobox', { name: '旋转轴' }).selectOption('31');
    await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 15_000 });
    await dialog.getByRole('button', { name: '确认' }).click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'revolve']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    console.log(`[revolve-multi] volume=${volume.toFixed(3)} expected=${EXPECTED_VOLUME_MM3.toFixed(3)}`);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);

    await pushExampleChanges(page, 'v1.30 revolve multi-region UI');
    await page.reload();
    await openExampleEditor(page, ids);
    const reopened = await getFeatureTreeRpc(ctx, token);
    expect(reopened.map((row) => row.featureType)).toEqual(['sketch', 'revolve']);
    const reopenedVolume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(reopenedVolume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);
  });
});
