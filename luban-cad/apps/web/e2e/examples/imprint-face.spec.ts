/**
 * AIRR imprint-face A1（test-only）：imprintFace 整面匹配 → faceExtrude 真栈验收。
 *
 * 20×20×10 盒 → 顶面 z=10 上画同边界 20×20 矩形 → imprintFace ADD 2 mm。
 * A1 resolver 应把第二段拉伸识别为“草图区域 == 当前 body 顶面”并改走产品
 * faceExtrude（整面沿法向 +Z 拉伸），体积 4000+800=4800 mm³；树第二段为
 * faceExtrude、push+重开一致。失败/多候选时 resolver 回退草图面域近似，
 * 本 spec 会暴露回退（树仍是 extrude）。
 */
import { expect, test } from '@playwright/test';
import { getApiToken, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './imodel.js';
import { resolveImprintFaceRef } from './replay/imprint-face-resolver.js';
import { runScenario } from './replay/run.js';
import type { ParityScenario } from './replay/scenario-to-op.js';

const EXPECTED_VOLUME_MM3 = 20 * 20 * 10 + 20 * 20 * 2;

function rectangle(x0: number, y0: number, size: number, z: number): ParityScenario['features'][number] {
  return {
    type: 'sketch',
    name: `Sketch z=${z}`,
    sourceFeatureId: `sketch-${z}`,
    params: {
      plane: {
        origin: { x: 0, y: 0, z },
        normal: { x: 0, y: 0, z: 1 },
        xDir: { x: 1, y: 0, z: 0 },
      },
      entities: [
        { kind: 'line', id: 1, p1: { x: x0, y: y0 }, p2: { x: x0 + size, y: y0 } },
        { kind: 'line', id: 2, p1: { x: x0 + size, y: y0 }, p2: { x: x0 + size, y: y0 + size } },
        { kind: 'line', id: 3, p1: { x: x0 + size, y: y0 + size }, p2: { x: x0, y: y0 + size } },
        { kind: 'line', id: 4, p1: { x: x0, y: y0 + size }, p2: { x: x0, y: y0 } },
      ],
      constraints: [],
    },
  };
}

function scenario(): ParityScenario {
  return {
    schemaVersion: 1,
    id: 'e2e-imprint-face-a1',
    name: 'imprintFace A1',
    units: 'mm',
    features: [
      rectangle(0, 0, 20, 0),
      {
        type: 'extrude',
        name: 'Box',
        sourceFeatureId: 'box-extrude',
        params: {
          operation: 'new',
          endBound: 'blind',
          depthMm: 10,
          selection: { kind: 'sketchRegions', sketchFeatureId: 'sketch-0', regionIndex: 0, regions: [0] },
        },
      },
      rectangle(0, 0, 20, 10),
      {
        type: 'extrude',
        name: 'Top Add',
        sourceFeatureId: 'top-add',
        params: {
          operation: 'add',
          endBound: 'blind',
          depthMm: 2,
          oppositeDirection: false,
          selection: {
            kind: 'imprintFace',
            sketchFeatureId: 'sketch-10',
            queries: [{ sketchFeatureId: 'sketch-10', sketchEntityId: 1, imprintSign: 1, queryString: '' }],
          },
        },
      },
    ],
    expected: { volumeM3: EXPECTED_VOLUME_MM3 * 1e-9, bodyCount: 1 },
    provenance: { capturedAt: '2026-11-07', status: 'complete', missing: [] },
  };
}

test.describe('imprintFace A1（整面匹配 → faceExtrude）', () => {
  test('盒顶面同边界 imprint ADD 2 mm → 4800 mm³ / 树 faceExtrude / push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Imprint Face A1', { reset: true });
    let ctx = await openExampleEditor(page, ids);
    const built = await runScenario(ctx, scenario(), token, {
      imprintFaceResolver: (_feature, _fullScenario, data) => resolveImprintFaceRef({
        page, ctx, accessToken: token, ...data,
      }),
    });
    expect(built.steps.map((step) => step.type)).toEqual(['sketch', 'extrude', 'sketch', 'extrude']);
    expect(built.steps.map((step) => step.opFeatureType ?? step.type)).toEqual([
      'sketch', 'extrude', 'sketch', 'faceExtrude',
    ]);
    expect(built.steps.at(-1)?.notes.some((note) => note.includes('imprintFace→实体面'))).toBe(true);

    await page.reload();
    ctx = await openExampleEditor(page, ids);
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'faceExtrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    let volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    console.log(`[imprint-face-a1] volume=${volume.toFixed(3)} expected=${EXPECTED_VOLUME_MM3.toFixed(3)}`);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);

    await pushExampleChanges(page, 'imprintFace A1 faceExtrude acceptance');
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'faceExtrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);
  });
});
