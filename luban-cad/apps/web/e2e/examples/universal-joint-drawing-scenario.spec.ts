/**
 * Universal Joint（Exercise: Universal Joint Drawing / Universal Joint）真实
 * scenario 重建：3 extrude + Chamfer 10（6 条 SWEPT_FACE + 2 条 SWEPT_EDGE）+
 * 2 hole + featureMirror。
 *
 * 工作队列把该 PS 标为「面边界选择器（capFace/sweptFace）待真栈验收」——
 * 本 spec 即该验收：sweptFace 走 edge-resolver 的 extrude 端面边界边展开，
 * 逐条 resolveEdgeRef 后交产品 chamfer；期望单 body 685170.906 mm³。
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

const EXAMPLE_NAME = 'E2E - Universal Joint Drawing Scenario';
const SCENARIO = path.join(
  DEFAULT_DATA_ROOT,
  'scenarios',
  'Onshape-Training-Repo-e9d0c09c321135c022f0b9ec-246cb5ff42dc64d150df7457.scenario.json',
);
const EXPECTED_TOTAL_MM3 = 685170.9058337001;
const EXPECTED_TREE = [
  'sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude',
  'chamfer', 'sketch', 'hole', 'sketch', 'hole', 'featureMirror',
];

test.describe('Universal Joint Drawing scenario rebuild', () => {
  // known-red（blocked-selector / 上游分叉）：Chamfer 10 的 8 条 query 中
  // 6 条 SWEPT_FACE。未裁剪面（entity 18）已展开 4 条边通过；entity 10
  // （Sketch 8 正侧 u=+36.195）在最终体上 matches=0。调试证据：最终体全部边
  // x ≤ 0（存在镜像侧 x=−36.195 的对应边），正侧整块几何不存在——不是
  // “面被裁剪后边界不完整”，而是 Extrude 10/11/12 的 region/imprint 回放把
  // 正侧体丢掉/镜像（Extrude 12 intersect 后仅剩半体，Mirror 1 在 Chamfer 之后）。
  // 因此扫掠面按草图环重建无法命中缺失的面；真解先修上游体分叉，再谈 face split。
  test.fail();
  test('sweptFace 面边界倒角 + 双孔 + featureMirror → 树/体积/推送重开', async ({ page, request }) => {
    test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 1_500_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, EXAMPLE_NAME, { reset: true });
    const ctx = await openExampleEditor(page, ids);
    const scenario = JSON.parse(readFileSync(SCENARIO, 'utf8')) as ParityScenario;

    const built = await runScenario(ctx, scenario, token, {
      skipSketchConstraints: true,
      edgeResolver: (feature, fullScenario, bodyContext) =>
        resolveScenarioEdges(page, ctx, fullScenario, feature, token, bodyContext),
    });
    expect(built.steps.map((step) => step.type)).toEqual(EXPECTED_TREE);
    expect(built.notes.some((note) => note.includes('constraints=dropped'))).toBe(true);

    const mass = async () => {
      const items = await getMassPropertiesRpc(ctx, token);
      return {
        count: items.length,
        total: items.reduce((sum, item) => sum + item.volume, 0),
      };
    };
    let result = await mass();
    console.log(`[universal-joint-drawing] bodies=${result.count} total=${result.total.toFixed(3)} expected=${EXPECTED_TOTAL_MM3.toFixed(3)}`);
    expect(result.count).toBe(1);
    expect(Math.abs(result.total - EXPECTED_TOTAL_MM3) / EXPECTED_TOTAL_MM3).toBeLessThan(0.01);

    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(EXPECTED_TREE);
    expect(tree.every((row) => row.status === 0)).toBe(true);

    await pushExampleChanges(page, 'Universal Joint Drawing scenario');
    await page.reload();
    await openExampleEditor(page, ids);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(EXPECTED_TREE);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    result = await mass();
    expect(result.count).toBe(1);
    expect(Math.abs(result.total - EXPECTED_TOTAL_MM3) / EXPECTED_TOTAL_MM3).toBeLessThan(0.01);
  });
});
