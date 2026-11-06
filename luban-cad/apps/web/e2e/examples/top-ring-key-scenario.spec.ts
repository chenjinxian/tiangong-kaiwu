/**
 * Intro to CAD - 4-1-4.4 - Teamwork Makes the Dream Work / Top, Ring, Key。
 *
 * 12 特征：5 sketch + 3 extrude + fillet + revolve + hole + chamfer；
 * 逐 body 目标 2998.143019 mm³。converter 已保存 Onshape 解算坐标，但 Sketch 5
 * 的剩余约束在本地 solver 下报 conflicting（SILHOUETTED/PROJECTED 未映射），
 * 因此本回归以 skipSketchConstraints 保留解算坐标，notes 必须登记 constraints=dropped；
 * 不得据此宣称约束树完整。
 *
 * 3 条 CAP_EDGE/SWEPT_EDGE 由 edge-resolver 几何唯一匹配；feature 全 status=0。
 */
import { expect, test } from '@playwright/test';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { isExampleDataAvailable } from './registry.js';
import { runScenarioFile } from './replay/run-file.js';

const SCENARIO =
  'scenarios/Onshape-Training-Repo-c969987a0583a98e07e7a50f-7ccba0a5bf292c11e3ea592d.scenario.json';
const EXPECTED_MM3 = 2998.14301903484;

test.describe('Top, Ring, Key scenario rebuild', () => {
  test('12 特征 → 逐 body 2998.143 mm³ → push+重开', async ({ page, request }) => {
    test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const result = await runScenarioFile(page, request, {
      scenario: SCENARIO,
      name: 'E2E - Top Ring Key',
      reset: true,
      skipSketchConstraints: true,
      tolerance: 0.01,
    });
    expect(result.scenario.features.map((feature) => feature.type)).toEqual([
      'sketch', 'extrude', 'fillet', 'sketch', 'revolve',
      'sketch', 'hole', 'sketch', 'extrude', 'sketch', 'extrude', 'chamfer',
    ]);
    expect(result.volumes).toHaveLength(1);
    expect(Math.abs(result.volumes[0]! - EXPECTED_MM3) / EXPECTED_MM3).toBeLessThan(0.01);
  });
});
