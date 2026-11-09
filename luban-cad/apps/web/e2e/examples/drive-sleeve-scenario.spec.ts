/**
 * Drive Sleeve（Exercise: Intermediate/Update Drawing）真实 scenario 全链验收。
 *
 * 8 特征：4 段 extrude → 圆孔 Hole 1（throughAll）→ FACE circular pattern
 * （6 实例/360°，轴=Extrude 2 圆柱面草图圆，源=Hole 1）。converter 已把
 * circularPattern 映射为 featurePattern（hole 源 delta 旋转阵列）；后端
 * FeaturePatternFlow 有同构 hole 源单测。本 spec 用真栈对拍采集体积
 * 1175.0243 cm³ 与 push+重开；Intermediate Drawing / Update Drawing 两份副本
 * 的 Part Studio 同源，均跑严格门。
 *
 * 2026-11-09（P2.2）状态：**严格绿**。面选择查询在被草图线分割的面集上无法
 * 逐条静态反解；场景携带 Onshape bodydetails 面面积 oracle，replay 用
 * shared `selectProfileRegionsByArea` 在 product 面域中选唯一子集：
 * Extrude 1 → 8 面域（10530.0589）、Extrude 2 → 0-4（25208.7599）、
 * Extrude 3 → 2,3（3230.2602）、CAP_FACE Extrude 4 → 5-8（4069.5386）。
 * CAP_FACE 的 `isStart` 修正为上游**起始端盖**（startOffset=0，direction=backward）；
 * hole scope `.opExtrude` 后缀修复后 Hole/pattern status=0。
 * 实测 1,175,022.882 vs 1,175,024.308 mm³（0.00012%），push+冷重开一致。
 *
 * 约束仍以 skip 保留 Onshape 解算坐标（converter 约束 refs 不完整），
 * notes 必须登记 constraints=dropped。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { getApiToken, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './imodel.js';
import { DEFAULT_DATA_ROOT, isExampleDataAvailable } from './registry.js';
import { runScenario } from './replay/run.js';
import type { ParityScenario } from './replay/scenario-to-op.js';

const CASES = [
  {
    name: 'E2E - Drive Sleeve Scenario',
    scenario: 'Onshape-Training-Repo-58d0532589c36a0f85a5c6de-8509862e8b7fffa66b7cf6c2.scenario.json',
  },
  {
    name: 'E2E - Drive Sleeve Scenario (Update Drawing)',
    scenario: 'Onshape-Training-Repo-58d182689922250f86640eb9-b8905f4f50acf9f6bbeebc55.scenario.json',
  },
] as const;

async function runDriveSleeveCase(
  page: Page,
  request: APIRequestContext,
  name: string,
  scenarioFile: string,
): Promise<void> {
  test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
  // 2026-11-09（P2.2）：面选择从逐边唯一面域升级为**面面积证据**选择
  // （Onshape bodydetails 面面积 oracle + shared selectProfileRegionsByArea）。
  // Extrude 1/2/3/4 分别落到 8/5/2/4 个面域；CAP_FACE 的 isStart 语义修正为
  // 上游起始端盖（z=0，方向 backward）。严格门断言树/体积/推送重开。
  test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
  const token = await getApiToken();
  const ids = await ensureExampleImodel(request, token, name, { reset: true });
  const ctx = await openExampleEditor(page, ids);
  const scenarioPath = path.join(DEFAULT_DATA_ROOT, 'scenarios', scenarioFile);
  const raw = JSON.parse(readFileSync(scenarioPath, 'utf8')) as ParityScenario;
  const expected = ((raw.expected as { volumeM3?: number } | undefined)?.volumeM3 ?? 0) * 1e9;
  expect(expected).toBeGreaterThan(0);

  const built = await runScenario(ctx, raw, token, { skipSketchConstraints: true });
  expect(built.steps.map((step) => step.type)).toEqual([
    'sketch', 'extrude', 'extrude', 'extrude', 'extrude', 'sketch', 'hole', 'featurePattern',
  ]);
  const patternStep = built.steps.find((step) => step.type === 'featurePattern');
  expect(patternStep?.notes.some((note) => note.includes('featurePattern'))).toBe(true);
  expect(built.notes.some((note) => note.includes('constraints=dropped'))).toBe(true);

  await page.reload();
  await openExampleEditor(page, ids);
  const tree = await getFeatureTreeRpc(ctx, token);
  console.log('[drive-sleeve-scenario] tree=' + JSON.stringify(
    tree.map((row) => ({ type: row.featureType, status: row.status, error: (row as { error?: string }).error })),
  ));
  console.log('[drive-sleeve-scenario] build notes=' + JSON.stringify(built.notes));
  const preStatusMass = await getMassPropertiesRpc(ctx, token);
  console.log('[drive-sleeve-scenario] pre-status volume=' +
    preStatusMass.reduce((sum, item) => sum + item.volume, 0).toFixed(3));
  expect(tree.map((row) => row.featureType)).toEqual([
    'sketch', 'extrude', 'extrude', 'extrude', 'extrude', 'sketch', 'hole', 'featurePattern',
  ]);
  expect(tree.every((row) => row.status === 0)).toBe(true);
  const mass = await getMassPropertiesRpc(ctx, token);
  expect(mass.length).toBe(1);
  const volume = mass.reduce((sum, item) => sum + item.volume, 0);
  console.log(`[drive-sleeve-scenario] volume=${volume.toFixed(3)} expected=${expected.toFixed(3)}`);
  expect(Math.abs(volume - expected) / expected).toBeLessThan(0.005);

  await pushExampleChanges(page, 'Drive Sleeve FACE circular pattern scenario');
  await page.reload();
  await openExampleEditor(page, ids);
  const reopened = await getFeatureTreeRpc(ctx, token);
  expect(reopened.map((row) => row.featureType)).toEqual(tree.map((row) => row.featureType));
  const reopenedVolume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
  expect(Math.abs(reopenedVolume - expected) / expected).toBeLessThan(0.005);
}

test.describe('Drive Sleeve scenario rebuild', () => {
  for (const item of CASES) {
    test(`${item.name}：4 extrude + hole + FACE circular pattern → 树/体积/推送重开`, async ({ page, request }) => {
      await runDriveSleeveCase(page, request, item.name, item.scenario);
    });
  }
});
