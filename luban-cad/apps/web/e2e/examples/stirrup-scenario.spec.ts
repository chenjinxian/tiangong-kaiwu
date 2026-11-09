/**
 * Stirrup（Exercise: Hand Brake Update / Stirrup）真实 scenario 重建。
 *
 * 17 特征：多 sketch/extrude + 3 个 fillet（CAP_EDGE）+ Extrude 8 的
 * 第二方向 UP_TO_SURFACE。2026-11-08 切片：converter 把第二方向
 * UP_TO_SURFACE 按已解算深度（25 mm）转 blind + approximate（与主方向
 * up-to 静态近似同口径），translator 显式标 approximate。
 *
 * 期望（采集 per-part nominal）：2 body，13599.1767 + 1507.9645 =
 * 15107.1412 mm³。约束 refs 未全映射 → 全局 skipSketchConstraints 并登记。
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

const EXAMPLE_NAME = 'E2E - Stirrup Scenario';
const SCENARIO = path.join(
  DEFAULT_DATA_ROOT,
  'scenarios',
  'Onshape-Training-Repo-91f152e2325e166b5ae98f4d-08f0afd8b421be6a2ef6c8f4.scenario.json',
);
const EXPECTED_TOTAL_MM3 = 15107.141163716563;
const EXPECTED_BODY_MM3 = [1507.9644737231031, 13599.17668999346];
const EXPECTED_TREE = [
  'sketch', 'extrude', 'sketch', 'fillet', 'extrude', 'sketch', 'extrude',
  'extrude', 'sketch', 'extrude', 'extrude', 'fillet', 'sketch', 'extrude',
  'fillet', 'sketch', 'extrude',
];

test.describe('Stirrup scenario rebuild', () => {
  // known-red（blocked-capability，imprint 补集面）：第二方向 UP_TO_SURFACE 已由
  // converter/translator 静态近似（合成真栈
  // `replay/extrude-second-direction-approximate.spec.ts` 验证）。
  // 真正阻塞：Sketch 2 是 3 个不相交 9×20 矩形；Extrude 2（REMOVE throughAll）
  // 的 e7/e12 sign=−1 被回放解释为“相邻矩形区域”（regions 1,2），只切掉
  // 500.171 mm³；Onshape 切的是实体端面的**补集面**（圆面减三个矩形孔）。
  // 前缀体积 15707.942 → 14660.744 → 14160.573 → … → 12495.533（−17.3%）；
  // 随后 Fillet 2 CAP_EDGE（草图槽边）无匹配。证据：私有仓
  // `ui-evidence/stirrup-20261108/{stirrup-full,stirrup-lubancad-prefix}.png`；
  // 根因记录 ADR-0006「Stirrup imprint 补集面」/任务 #106。
  // 需要实体面枚举/face split；不得用相邻区域冒充补集面或放宽容差。
  test.fail();
  test('第二方向 UP_TO_SURFACE 静态近似 + 3 圆角 → 逐体体积/推送重开', async ({ page, request }) => {
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
    expect(built.notes.some((note) => note.includes('secondDirection=UP_TO_SURFACE→blind'))).toBe(true);
    expect(built.notes.some((note) => note.includes('constraints=dropped'))).toBe(true);

    const mass = async () => {
      const items = await getMassPropertiesRpc(ctx, token);
      return {
        count: items.length,
        volumes: items.map((item) => item.volume).sort((a, b) => a - b),
      };
    };
    let result = await mass();
    let total = result.volumes.reduce((sum, volume) => sum + volume, 0);
    console.log(
      `[stirrup] bodies=${result.volumes.map((volume) => volume.toFixed(3)).join(',')} ` +
      `total=${total.toFixed(3)} expected=${EXPECTED_TOTAL_MM3.toFixed(3)}`,
    );
    expect(result.count).toBe(2);
    expect(Math.abs(total - EXPECTED_TOTAL_MM3) / EXPECTED_TOTAL_MM3).toBeLessThan(0.01);
    for (let index = 0; index < EXPECTED_BODY_MM3.length; index++) {
      const expected = EXPECTED_BODY_MM3[index]!;
      expect(Math.abs(result.volumes[index]! - expected) / expected).toBeLessThan(0.01);
    }

    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(EXPECTED_TREE);
    expect(tree.every((row) => row.status === 0)).toBe(true);

    await pushExampleChanges(page, 'Stirrup up-to second direction scenario');
    await page.reload();
    await openExampleEditor(page, ids);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(EXPECTED_TREE);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    result = await mass();
    total = result.volumes.reduce((sum, volume) => sum + volume, 0);
    expect(result.count).toBe(2);
    expect(Math.abs(total - EXPECTED_TOTAL_MM3) / EXPECTED_TOTAL_MM3).toBeLessThan(0.01);
  });
});
