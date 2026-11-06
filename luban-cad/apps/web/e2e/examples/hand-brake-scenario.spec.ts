/**
 * T4：Hand Brake（Master Cylinder Piston）真实 scenario 全链重建。
 *
 * 3 特征：sketch（矩形 + 右端圆，轴=底边）→ revolve 全周 → 1 mm 等距倒角。
 * Onshape revolve 的 entities 查询是**轮廓边**（3 条 query），converter 只能给出
 * 面积降序前缀 [0,1,2] 的 best-effort（regionRisk）；本 spec 使用**显式可审计**
 * 面域选择 [0,1]：两块上半平面域（area 340.501 + 88.357），下半镜像域 2/3
 * 不属于旋转轮廓。选择 [0,1] 后 backend 逐域 spin 并 Unite，体积 7125.259 mm³
 * vs 采集 7125.274（0.0002%）。
 * 约束以 skip 保留 Onshape 解算坐标（跨仓 translator 约束 refs 未全映射），
 * notes 必须登记 constraints=dropped。
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

const EXAMPLE_NAME = 'E2E - Hand Brake Scenario';
const SCENARIO = path.join(
  DEFAULT_DATA_ROOT,
  'scenarios',
  'Exercise-Hand-Brake-Update-031b0afd8ef29bf2fd26bf52.scenario.json',
);

function withAuditedRevolveRegions(scenario: ParityScenario): ParityScenario {
  return {
    ...scenario,
    features: scenario.features.map((feature) => {
      if (feature.type !== 'revolve') return feature;
      const params = { ...feature.params } as Record<string, unknown>;
      delete params.regionIndex;
      delete params.regionRisk;
      return {
        ...feature,
        params: {
          ...params,
          regions: [0, 1],
          regionAudit: 'upper-half profile regions 0+1 (areas 340.501, 88.357); lower mirror regions excluded',
        },
      };
    }),
  };
}

test.describe('Hand Brake scenario rebuild', () => {
  test('sketch + 多面域 revolve + SWEPT_EDGE 倒角 → 树/体积/推送重开', async ({ page, request }) => {
    test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, EXAMPLE_NAME, { reset: true });
    const ctx = await openExampleEditor(page, ids);
    const raw = JSON.parse(readFileSync(SCENARIO, 'utf8')) as ParityScenario;
    const scenario = withAuditedRevolveRegions(raw);
    const expected = ((raw.expected as { volumeM3?: number } | undefined)?.volumeM3 ?? 0) * 1e9;
    expect(expected).toBeGreaterThan(0);

    const built = await runScenario(ctx, scenario, token, {
      skipSketchConstraints: true,
      edgeResolver: (feature, fullScenario) =>
        resolveScenarioEdges(page, ctx, fullScenario, feature, token),
    });
    expect(built.steps.map((step) => step.type)).toEqual(['sketch', 'revolve', 'chamfer']);
    expect(built.notes.some((note) => note.includes('edgeResolver=Chamfer 1'))).toBe(true);
    expect(built.notes.some((note) => note.includes('constraints=dropped'))).toBe(true);

    await page.reload();
    await openExampleEditor(page, ids);
    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'revolve', 'chamfer']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const mass = await getMassPropertiesRpc(ctx, token);
    expect(mass.length).toBe(1);
    const volume = mass.reduce((sum, item) => sum + item.volume, 0);
    console.log(`[hand-brake-scenario] volume=${volume.toFixed(3)} expected=${expected.toFixed(3)}`);
    expect(Math.abs(volume - expected) / expected).toBeLessThan(0.005);

    await pushExampleChanges(page, 'T4/R1 hand brake multi-region scenario');
    await page.reload();
    await openExampleEditor(page, ids);
    const reopened = await getFeatureTreeRpc(ctx, token);
    expect(reopened.map((row) => row.featureType)).toEqual(tree.map((row) => row.featureType));
    const reopenedVolume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(reopenedVolume - expected) / expected).toBeLessThan(0.005);
  });
});
