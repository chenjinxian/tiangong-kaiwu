/**
 * featureMirror 转换链真栈验收（ADR-0011 切片 3，test-only translator）。
 *
 * 40×40×10 板 → 圆孔切除 (10,20) r3 → featureMirror 源=切除、平面 YZ x=20 →
 * 镜像孔 (30,20)：去材 2×90π → 期望 16000−180π ≈ 15434.513 mm³；push+重开一致。
 */
import { expect, test } from '@playwright/test';
import { getApiToken, getFeatureTreeRpc, getMassPropertiesRpc } from './helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './examples/imodel.js';
import { runScenario } from './examples/replay/run.js';
import type { ParityScenario } from './examples/replay/scenario-to-op.js';

const EXPECTED_VOLUME_MM3 = 40 * 40 * 10 - 2 * Math.PI * 3 * 3 * 10;
const EXPECTED_MULTI_VOLUME_MM3 = 40 * 40 * 10 - 4 * Math.PI * 3 * 3 * 10;

function featureMirrorScenario(): ParityScenario {
  return {
    schemaVersion: 1,
    id: 'e2e-feature-mirror',
    name: 'featureMirror',
    units: 'mm',
    features: [
      {
        type: 'sketch',
        name: 'Plate Sketch',
        sourceFeatureId: 'plate-sketch',
        params: {
          plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
          entities: [
            { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 40, y: 0 } },
            { kind: 'line', id: 2, p1: { x: 40, y: 0 }, p2: { x: 40, y: 40 } },
            { kind: 'line', id: 3, p1: { x: 40, y: 40 }, p2: { x: 0, y: 40 } },
            { kind: 'line', id: 4, p1: { x: 0, y: 40 }, p2: { x: 0, y: 0 } },
          ],
          constraints: [],
        },
      },
      {
        type: 'extrude',
        name: 'Plate',
        sourceFeatureId: 'plate-extrude',
        params: {
          operation: 'new', endBound: 'blind', depthMm: 10, symmetric: false, oppositeDirection: false,
          selection: { kind: 'sketchRegions', sketchFeatureId: 'plate-sketch', regionIndex: 0, regions: [0] },
        },
      },
      {
        type: 'sketch',
        name: 'Hole Sketch',
        sourceFeatureId: 'hole-sketch',
        params: {
          plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
          entities: [{ kind: 'circle', id: 1, center: { x: 10, y: 20 }, radius: 3 }],
          constraints: [],
        },
      },
      {
        type: 'extrude',
        name: 'Hole Cut',
        sourceFeatureId: 'hole-cut',
        params: {
          operation: 'remove', endBound: 'blind', depthMm: 12, symmetric: false, oppositeDirection: false,
          selection: { kind: 'sketchRegions', sketchFeatureId: 'hole-sketch', regionIndex: 0, regions: [0] },
        },
      },
      {
        type: 'featureMirror',
        name: 'Mirror 1',
        sourceFeatureId: 'hole-mirror',
        params: {
          sourceFeatureId: 'hole-cut',
          planeLine: { origin: { x: 20, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } },
        },
      },
    ],
    expected: { volumeM3: EXPECTED_VOLUME_MM3 * 1e-9, bodyCount: 1 },
    provenance: { capturedAt: '2026-11-07', status: 'complete', missing: [] },
  };
}

function featureMirrorMultiSourceScenario(): ParityScenario {
  return {
    schemaVersion: 1,
    id: 'e2e-feature-mirror-multi',
    name: 'featureMirror multi-source',
    units: 'mm',
    features: [
      {
        type: 'sketch',
        name: 'Plate Sketch',
        sourceFeatureId: 'plate-sketch',
        params: {
          plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
          entities: [
            { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 40, y: 0 } },
            { kind: 'line', id: 2, p1: { x: 40, y: 0 }, p2: { x: 40, y: 40 } },
            { kind: 'line', id: 3, p1: { x: 40, y: 40 }, p2: { x: 0, y: 40 } },
            { kind: 'line', id: 4, p1: { x: 0, y: 40 }, p2: { x: 0, y: 0 } },
          ],
          constraints: [],
        },
      },
      {
        type: 'extrude',
        name: 'Plate',
        sourceFeatureId: 'plate-extrude',
        params: {
          operation: 'new', endBound: 'blind', depthMm: 10, symmetric: false, oppositeDirection: false,
          selection: { kind: 'sketchRegions', sketchFeatureId: 'plate-sketch', regionIndex: 0, regions: [0] },
        },
      },
      ...[
        { name: 'Cut A', source: 'cut-a', y: 15 },
        { name: 'Cut B', source: 'cut-b', y: 25 },
      ].map(({ name, source, y }) => ([
        {
          type: 'sketch' as const,
          name: `${name} Sketch`,
          sourceFeatureId: `${source}-sketch`,
          params: {
            plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
            entities: [{ kind: 'circle' as const, id: 1, center: { x: 10, y }, radius: 3 }],
            constraints: [],
          },
        },
        {
          type: 'extrude' as const,
          name,
          sourceFeatureId: source,
          params: {
            operation: 'remove' as const, endBound: 'blind' as const, depthMm: 12,
            symmetric: false, oppositeDirection: false,
            selection: { kind: 'sketchRegions' as const, sketchFeatureId: `${source}-sketch`, regionIndex: 0, regions: [0] },
          },
        },
      ])).flat(),
      {
        type: 'featureMirror',
        name: 'Mirror 1',
        sourceFeatureId: 'multi-mirror',
        params: {
          sourceFeatureIds: ['cut-a', 'cut-b'],
          planeLine: { origin: { x: 20, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } },
        },
      },
    ],
    expected: { volumeM3: EXPECTED_MULTI_VOLUME_MM3 * 1e-9, bodyCount: 1 },
    provenance: { capturedAt: '2026-11-09', status: 'complete', missing: [] },
  };
}

test.describe('featureMirror（合成全链）', () => {
  test('镜像圆孔切除 → 15434.513 mm³/push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Feature Mirror', { reset: true });
    let ctx = await openExampleEditor(page, ids);
    await runScenario(ctx, featureMirrorScenario(), token);

    await page.reload();
    ctx = await openExampleEditor(page, ids);
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'extrude', 'featureMirror']);
    expect(tree.every((row) => row.status === 0)).toBe(true);

    const mass = async () => {
      const items = await getMassPropertiesRpc(ctx, token);
      return items.reduce((sum, item) => sum + item.volume, 0);
    };
    let volume = await mass();
    console.log(`[feature-mirror] volume=${volume.toFixed(3)} expected=${EXPECTED_VOLUME_MM3.toFixed(3)}`);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);

    await pushExampleChanges(page, 'featureMirror acceptance');
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'extrude', 'featureMirror']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    volume = await mass();
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);
  });

  test('v1.58 多源：两个孔切除一次镜像 → 14869.027 mm³/push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Feature Mirror Multi', { reset: true });
    let ctx = await openExampleEditor(page, ids);
    const built = await runScenario(ctx, featureMirrorMultiSourceScenario(), token);
    expect(built.steps.map((step) => step.type)).toEqual([
      'sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude', 'featureMirror',
    ]);

    await page.reload();
    ctx = await openExampleEditor(page, ids);
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual([
      'sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude', 'featureMirror',
    ]);
    expect(tree.every((row) => row.status === 0)).toBe(true);

    const mass = async () => {
      const items = await getMassPropertiesRpc(ctx, token);
      return items.reduce((sum, item) => sum + item.volume, 0);
    };
    let volume = await mass();
    console.log(`[feature-mirror-multi] volume=${volume.toFixed(3)} expected=${EXPECTED_MULTI_VOLUME_MM3.toFixed(3)}`);
    expect(Math.abs(volume - EXPECTED_MULTI_VOLUME_MM3) / EXPECTED_MULTI_VOLUME_MM3).toBeLessThan(0.005);

    await pushExampleChanges(page, 'featureMirror multi-source acceptance');
    await page.reload();
    ctx = await openExampleEditor(page, ids);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual([
      'sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude', 'featureMirror',
    ]);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    volume = await mass();
    expect(Math.abs(volume - EXPECTED_MULTI_VOLUME_MM3) / EXPECTED_MULTI_VOLUME_MM3).toBeLessThan(0.005);
  });
});
