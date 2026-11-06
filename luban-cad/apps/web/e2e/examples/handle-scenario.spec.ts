/**
 * Handle（Exercise: Hand Brake Update / Handle）真实 scenario 全链重建。
 *
 * 12 特征：Main Sketch → Extrude 1（对称 8）→ Fillet 1（30，两条 SWEPT_EDGE）→
 * Sketch 2 → Extrude 2（10 + 第二方向 120，新体）→ Sketch 3 → Extrude 3（remove，
 * booleanScope=Extrude 2 body）→ Plane 1（PLANE_POINT，front 翻转，origin (0,-12.5,0)）
 * → Sketch 4（落 Plane 1）→ Hole 1（3 点沉头孔 Ø9.75/5、Ø5.5 throughAll）→
 * Sketch 5 → Extrude 4（remove，booleanScope=Extrude 1 body）。
 *
 * 期望（采集 per-part nominal）：body 数 2，体积 38314.765 + 68563.589 =
 * 106878.354 mm³。约束 refs 未全映射时沿用全局 skipSketchConstraints 口径并登记。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { getApiToken, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './imodel.js';
import { DEFAULT_DATA_ROOT, isExampleDataAvailable } from './registry.js';
import { resolveScenarioEdges } from './replay/edge-resolver.js';
import { runScenario } from './replay/run.js';
import type { ParityScenario } from './replay/scenario-to-op.js';

const EXAMPLE_NAME = 'E2E - Handle Scenario';
const SCENARIO = path.join(
  DEFAULT_DATA_ROOT,
  'scenarios',
  'Onshape-Training-Repo-91f152e2325e166b5ae98f4d-6b46e106bd5fea88962c08d0.scenario.json',
);
const EXPECTED_TOTAL_MM3 = 106878.35417789813;
const EXPECTED_BODY_MM3 = [38314.76521525296, 68563.58896264517];
const EXPECTED_TREE = [
  'sketch', 'extrude', 'fillet', 'sketch', 'extrude', 'sketch',
  'extrude', 'cPlane', 'sketch', 'hole', 'sketch', 'extrude',
];

test.describe('Handle scenario rebuild', () => {
  test('cPlane 平面点 + 第二方向 + 多体 scope + 沉头孔 → 树/逐体体积/推送重开', async ({ page, request }) => {
    test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 1_200_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, EXAMPLE_NAME, { reset: true });
    const ctx = await openExampleEditor(page, ids);
    const scenario = JSON.parse(readFileSync(SCENARIO, 'utf8')) as ParityScenario;

    const built = await runScenario(ctx, scenario, token, {
      skipSketchConstraints: true,
      edgeResolver: (feature, fullScenario) =>
        resolveScenarioEdges(page, ctx, fullScenario, feature, token),
    });
    expect(built.steps.map((step) => step.type)).toEqual(EXPECTED_TREE);
    expect(built.notes.some((note) => note.includes('PLANE_POINT'))).toBe(true);
    expect(built.notes.some((note) => note.includes('booleanScope'))).toBe(true);
    expect(built.notes.some((note) => note.includes('constraints=dropped'))).toBe(true);

    await page.reload();
    await openExampleEditor(page, ids);
    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(EXPECTED_TREE);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const mass = await getMassPropertiesRpc(ctx, token);
    expect(mass.length).toBe(2);
    const volumes = mass.map((item) => item.volume).sort((a, b) => a - b);
    const total = volumes.reduce((sum, volume) => sum + volume, 0);
    console.log(
      `[handle-scenario] bodies=${volumes.map((volume) => volume.toFixed(3)).join(',')} ` +
      `total=${total.toFixed(3)} expected=${EXPECTED_TOTAL_MM3.toFixed(3)}`,
    );
    expect(Math.abs(total - EXPECTED_TOTAL_MM3) / EXPECTED_TOTAL_MM3).toBeLessThan(0.005);
    for (let index = 0; index < EXPECTED_BODY_MM3.length; index++) {
      const expected = EXPECTED_BODY_MM3[index]!;
      expect(Math.abs(volumes[index]! - expected) / expected).toBeLessThan(0.005);
    }

    await pushExampleChanges(page, 'Handle cPlane/mergeScope scenario');
    await page.reload();
    await openExampleEditor(page, ids);
    const reopened = await getFeatureTreeRpc(ctx, token);
    expect(reopened.map((row) => row.featureType)).toEqual(tree.map((row) => row.featureType));
    const reopenedMass = await getMassPropertiesRpc(ctx, token);
    expect(reopenedMass.length).toBe(2);
    const reopenedTotal = reopenedMass.reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(reopenedTotal - total) / total).toBeLessThan(0.005);
  });
});
