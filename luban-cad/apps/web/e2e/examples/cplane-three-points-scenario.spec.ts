/**
 * cPlane THREE_POINT（converter frame 派生）回放真栈验收（合成，test-only）：
 * scenario cPlane 三点平面 → 其后草图落该平面 → 拉伸。验证 translator 的
 * threePoints 透传、`constructionApprox` 近似标记、sketch→cPlane 依赖映射。
 *
 * 平面 z=20，草图 10×10 方形，拉伸 10 → 体积 1000 mm³；push+重开一致。
 */
import { expect, test } from '@playwright/test';
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import {
  getApiToken,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
} from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './imodel.js';
import { runScenario } from './replay/run.js';
import type { ParityScenario } from './replay/scenario-to-op.js';

function rectangleSketch(width: number, height: number): {
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
} {
  return {
    entities: [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: width, y: 0 },
      { kind: 'point', id: 3, x: width, y: height },
      { kind: 'point', id: 4, x: 0, y: height },
      { kind: 'line', id: 11, p1: 1, p2: 2 },
      { kind: 'line', id: 12, p1: 2, p2: 3 },
      { kind: 'line', id: 13, p1: 3, p2: 4 },
      { kind: 'line', id: 14, p1: 4, p2: 1 },
    ],
    constraints: [],
  };
}

function syntheticScenario(): ParityScenario {
  const sketch = rectangleSketch(10, 10);
  return {
    schemaVersion: 1,
    id: 'e2e-cplane-three-points',
    name: 'cplane three points',
    units: 'mm',
    features: [
      {
        type: 'cPlane',
        name: 'Plane 1',
        sourceFeatureId: 'plane-1',
        params: {
          reference: 'top',
          threePoints: [
            { x: 0, y: 0, z: 20 },
            { x: 1, y: 0, z: 20 },
            { x: 0, y: 1, z: 20 },
          ],
          constructionApprox: true,
          onshapeType: 'OFFSET',
        },
      },
      {
        type: 'sketch',
        name: 'Sketch 1',
        sourceFeatureId: 'sketch-1',
        params: {
          plane: {
            origin: { x: 0, y: 0, z: 20 },
            normal: { x: 0, y: 0, z: 1 },
            xDir: { x: 1, y: 0, z: 0 },
          },
          planeSourceFeatureId: 'plane-1',
          entities: sketch.entities,
          constraints: sketch.constraints,
        },
      },
      {
        type: 'extrude',
        name: 'Extrude 1',
        sourceFeatureId: 'extrude-1',
        params: {
          operation: 'new',
          endBound: 'blind',
          depthMm: 10,
          selection: { kind: 'sketchRegions', sketchFeatureId: 'sketch-1', regions: [0] },
        },
      },
    ],
  };
}

const EXPECTED_VOLUME_MM3 = 10 * 10 * 10;

test.describe('cPlane THREE_POINT 回放真栈验收', () => {
  test('cPlane 三点平面 → 草图 → 拉伸 1000 mm³，push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - CPlane Three Points Scenario', { reset: true });
    const ctx = await openExampleEditor(page, ids);
    const built = await runScenario(ctx, syntheticScenario(), token);
    expect(built.steps.map((step) => step.type)).toEqual(['cPlane', 'sketch', 'extrude']);
    const cplaneStep = built.steps.find((step) => step.type === 'cPlane');
    expect(cplaneStep?.approximate).toBe(true);
    expect(cplaneStep?.notes.join(' ')).toContain('constructionApprox');

    const volume = (await getMassPropertiesRpc(ctx, token))
      .reduce((sum, item) => sum + item.volume, 0);
    console.log(`[cplane-three-points] volume=${volume.toFixed(3)} expected=${EXPECTED_VOLUME_MM3}`);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.01);

    await pushExampleChanges(page, 'cplane three points scenario');
    await page.reload();
    const reopened = await openExampleEditor(page, ids);
    const tree = await getFeatureTreeRpc(reopened, token);
    expect(tree.map((row) => row.featureType)).toEqual(['cPlane', 'sketch', 'extrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const reopenedVolume = (await getMassPropertiesRpc(reopened, token))
      .reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(reopenedVolume - volume) / volume).toBeLessThan(0.005);
  });
});
