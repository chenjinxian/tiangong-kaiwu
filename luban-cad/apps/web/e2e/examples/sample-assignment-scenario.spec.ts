/**
 * T1/T2/T4：Sample Assignment（Alignment Plate）真实 scenario 全链重建。
 *
 * 9 特征：4 sketch + 4 extrude + chamfer。两条“切除孔”的 Onshape 面域短码无法
 * 静态映射到本地 region 下标，本 spec 使用**显式、可审计**的草图/面域映射：
 * - Cut 2 holes：Sketch 2 → regions [0,1]；
 * - Cut 2 more holes：Sketch 3（源 FtB4EYw28Ij2hDn_1）→ regions [0,1]；
 * 其余 imprintFace 由 runner 按“引用实体为孔洞边界/外环”的草图面域解析。
 * chamfer 4 条 SWEPT_EDGE 由 edgeResolver（共享端点消歧）解析。
 * 约束以 skip 保留 Onshape 解算坐标（converter 有 DISTANCE refs 缺口），
 * 步骤 notes 必须登记 constraints=dropped，不宣称约束树完整。
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

const EXAMPLE_NAME = 'E2E - Sample Assignment RPC';
const SCENARIO = path.join(
  DEFAULT_DATA_ROOT,
  'scenarios',
  'Sample-Assignment-d1989636af28eb77f9e99c58.scenario.json',
);

function withAuditedRegions(scenario: ParityScenario): ParityScenario {
  return {
    ...scenario,
    features: scenario.features.map((feature) => {
      if (feature.name === 'Cut 2 holes') {
        return {
          ...feature,
          params: {
            ...feature.params,
            selection: {
              kind: 'sketchRegions',
              sketchFeatureId: 'FarP0dnYC7HcDfB_1',
              regionIndex: 0,
              regions: [0, 1],
            },
          },
        };
      }
      if (feature.name === 'Cut 2 more holes') {
        return {
          ...feature,
          params: {
            ...feature.params,
            selection: {
              kind: 'sketchRegions',
              sketchFeatureId: 'FtB4EYw28Ij2hDn_1',
              regionIndex: 0,
              regions: [0, 1],
            },
          },
        };
      }
      return feature;
    }),
  };
}

test.describe('Sample Assignment scenario rebuild', () => {
  test('9 特征 → 特征树/体积/推送重开', async ({ page, request }) => {
    test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, EXAMPLE_NAME, { reset: true });
    const ctx = await openExampleEditor(page, ids);
    const raw = JSON.parse(readFileSync(SCENARIO, 'utf8')) as ParityScenario;
    const scenario = withAuditedRegions(raw);
    const expected = ((raw.expected as { volumeM3?: number } | undefined)?.volumeM3 ?? 0) * 1e9;
    expect(expected).toBeGreaterThan(0);

    const built = await runScenario(ctx, scenario, token, {
      skipSketchConstraints: true,
      edgeResolver: (feature, fullScenario) =>
        resolveScenarioEdges(page, ctx, fullScenario, feature, token),
    });
    expect(built.steps.map((step) => step.type)).toEqual([
      'sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude', 'chamfer',
    ]);
    expect(built.notes.some((note) => note.includes('edgeResolver=Chamfer 1'))).toBe(true);

    await page.reload();
    await openExampleEditor(page, ids);
    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual([
      'sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude', 'chamfer',
    ]);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const mass = await getMassPropertiesRpc(ctx, token);
    expect(mass.length).toBe(1);
    const volume = mass.reduce((sum, item) => sum + item.volume, 0);
    console.log(`[sample-scenario] volume=${volume.toFixed(3)} expected=${expected.toFixed(3)}`);
    expect(Math.abs(volume - expected) / expected).toBeLessThan(0.005);

    await pushExampleChanges(page, 'T1 sample assignment scenario');
    await page.reload();
    await openExampleEditor(page, ids);
    const reopened = await getFeatureTreeRpc(ctx, token);
    expect(reopened.map((row) => row.featureType)).toEqual(tree.map((row) => row.featureType));
    const reopenedVolume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(reopenedVolume - expected) / expected).toBeLessThan(0.005);
  });
});
