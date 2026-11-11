/**
 * Links（Exercise: Creating Mate Connectors）scenario 回放：ADR-0015 B6.2
 * 多目标 throughAll REMOVE extrude（Extrude 3 一次切两体）。
 *
 * 约束树仍为 converter dropped（slot FIX/OFFSET + external EQUAL 未映射），本 spec
 * 只验证几何/树/逐体重开；不得据此把该 PS 标 constraints complete。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { getApiToken, getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './imodel.js';
import { DEFAULT_DATA_ROOT, isExampleDataAvailable } from './registry.js';
import { runScenario } from './replay/run.js';
import type { ParityScenario } from './replay/scenario-to-op.js';

const EXAMPLE_NAME = 'E2E - Links Multi Remove';
const SCENARIO = path.join(
  DEFAULT_DATA_ROOT,
  'scenarios',
  'Onshape-Training-Repo-8343b562bd9a180d26b486b1-761c6b9a50b16a1a6b34d89a.scenario.json',
);
const EXPECTED_BODY_MM3 = [10039.241, 11704.085];

test.describe('Links multi-target REMOVE', () => {
  test('Extrude 3 throughAll remove 一次切两体 → 2 body/逐体体积/重开', async ({ page, request }) => {
    test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, EXAMPLE_NAME, { reset: true });
    const ctx = await openExampleEditor(page, ids);
    const scenario = JSON.parse(readFileSync(SCENARIO, 'utf8')) as ParityScenario;
    const built = await runScenario(ctx, scenario, token, { skipSketchConstraints: true });
    expect(built.steps.map((step) => step.type)).toEqual([
      'sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude',
    ]);
    expect(built.notes.some((note) => note.includes('targetBodies='))).toBe(true);

    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual([
      'sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude',
    ]);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    let bodies = await getBodiesRpc(ctx, token);
    expect(bodies.filter((body) => body.active !== false && body.authored !== false)).toHaveLength(2);
    let mass = await getMassPropertiesRpc(ctx, token);
    const volumes = mass.map((item) => item.volume).sort((a, b) => a - b);
    console.log(`[links] bodies=${volumes.map((v) => v.toFixed(3)).join(',')} expected=${EXPECTED_BODY_MM3.join(',')}`);
    expect(volumes).toHaveLength(2);
    for (let index = 0; index < EXPECTED_BODY_MM3.length; index++)
      expect(Math.abs(volumes[index]! - EXPECTED_BODY_MM3[index]!) / EXPECTED_BODY_MM3[index]!).toBeLessThan(0.01);

    await pushExampleChanges(page, 'Links multi-target remove scenario');
    await page.reload();
    await openExampleEditor(page, ids);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    bodies = await getBodiesRpc(ctx, token);
    expect(bodies.filter((body) => body.active !== false && body.authored !== false)).toHaveLength(2);
    mass = await getMassPropertiesRpc(ctx, token);
    expect(mass.map((item) => item.volume).sort((a, b) => a - b)).toEqual(volumes);
  });
});
