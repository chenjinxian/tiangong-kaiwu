/**
 * booleanBodies 场景真栈：两个独立 box（20×20×10，重叠 10×20）→ unite/subtract。
 * 合成链路，验证 scenario → body 源特征 id → getBodies bodyKey → 标准 FeatureOp。
 */
import { expect, test } from '@playwright/test';
import type { SketchEntityDto } from '@luban-cad/shared';
import { getApiToken, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './imodel.js';
import { runScenario } from './replay/run.js';
import type { ParityScenario } from './replay/scenario-to-op.js';

function rectangle(x0: number, x1: number): SketchEntityDto[] {
  return [
    { kind: 'line', id: 1, p1: { x: x0, y: 0 }, p2: { x: x1, y: 0 } },
    { kind: 'line', id: 2, p1: { x: x1, y: 0 }, p2: { x: x1, y: 20 } },
    { kind: 'line', id: 3, p1: { x: x1, y: 20 }, p2: { x: x0, y: 20 } },
    { kind: 'line', id: 4, p1: { x: x0, y: 20 }, p2: { x: x0, y: 0 } },
  ];
}

function booleanScenario(operation: 'unite' | 'subtract'): ParityScenario {
  return {
    schemaVersion: 1,
    id: `e2e-boolean-bodies-${operation}`,
    name: `booleanBodies ${operation}`,
    units: 'mm',
    features: [
      {
        type: 'sketch', name: 'Sketch 1', sourceFeatureId: 's1',
        params: { entities: rectangle(0, 20), constraints: [] },
      },
      {
        type: 'extrude', name: 'Extrude 1', sourceFeatureId: 'e1',
        params: {
          operation: 'new', endBound: 'blind', depthMm: 10,
          selection: { kind: 'sketchRegions', sketchFeatureId: 's1', regions: [0] },
        },
      },
      {
        type: 'sketch', name: 'Sketch 2', sourceFeatureId: 's2',
        params: { entities: rectangle(10, 30), constraints: [] },
      },
      {
        type: 'extrude', name: 'Extrude 2', sourceFeatureId: 'e2',
        params: {
          operation: 'new', endBound: 'blind', depthMm: 10,
          selection: { kind: 'sketchRegions', sketchFeatureId: 's2', regions: [0] },
        },
      },
      {
        type: 'booleanBodies', name: 'Boolean 1', sourceFeatureId: 'b1',
        params: {
          operation,
          targetSourceFeatureIds: ['e1'],
          toolSourceFeatureIds: ['e2'],
          keepTools: false,
        },
      },
    ],
    expected: { volumeM3: 0, bodyCount: 1 },
    provenance: { capturedAt: '2026-11-06', status: 'complete', missing: [] },
  };
}

const CASES = [
  { operation: 'unite' as const, expected: 6000 },
  { operation: 'subtract' as const, expected: 2000 },
];

for (const { operation, expected } of CASES) {
  test.describe(`booleanBodies ${operation}`, () => {
    test(`两 box ${operation} → ${expected} mm³/push+重开`, async ({ page, request }) => {
      test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
      const token = await getApiToken();
      const ids = await ensureExampleImodel(request, token, `E2E - Boolean Bodies ${operation}`, { reset: true });
      const ctx = await openExampleEditor(page, ids);
      const scenario = booleanScenario(operation);
      const built = await runScenario(ctx, scenario, token);
      expect(built.steps.map((step) => step.type)).toEqual([
        'sketch', 'extrude', 'sketch', 'extrude', 'booleanBodies',
      ]);

      await page.reload();
      await openExampleEditor(page, ids);
      const tree = await getFeatureTreeRpc(ctx, token);
      expect(tree.map((row) => row.featureType)).toEqual([
        'sketch', 'extrude', 'sketch', 'extrude', 'booleanBodies',
      ]);
      expect(tree.every((row) => row.status === 0)).toBe(true);
      const mass = await getMassPropertiesRpc(ctx, token);
      expect(mass.length).toBe(1);
      const volume = mass.reduce((sum, item) => sum + item.volume, 0);
      console.log(`[boolean-bodies-${operation}] volume=${volume.toFixed(3)} expected=${expected}`);
      expect(Math.abs(volume - expected) / expected).toBeLessThan(0.005);

      await pushExampleChanges(page, `booleanBodies ${operation}`);
      await page.reload();
      await openExampleEditor(page, ids);
      const reopened = await getFeatureTreeRpc(ctx, token);
      expect(reopened.map((row) => row.featureType)).toEqual(tree.map((row) => row.featureType));
      const reopenedVolume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
      expect(Math.abs(reopenedVolume - expected) / expected).toBeLessThan(0.005);
    });
  });
}
