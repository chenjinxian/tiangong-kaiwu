/**
 * Exercise: Basic Drawing / Wheel 示例（scenario-file 真栈，2026-11-08）。
 *
 * 采集：Onshape-Training-Repo/58d051743d98a90f86e9e2ab/4a289bd094a999329a3900af；
 * 2 特征（草图 + 旋转），1 body，逐 body 体积 2.4422937638547922e-3 m³ =
 * **2442293.7639 mm³**。草图含 27 条 MIRROR 约束（18 条 start/end 端点对），
 * 本 spec 走完整 runner + push/重开校验。中心线尺寸按直径语义/2 映射为半径
 * （见 converter CENTERLINE_DIMENSION 注记）。
 */
import { expect, test } from '@playwright/test';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../../seed.js';
import { runScenarioFile } from './run-file.js';

const SCENARIO = 'scenarios/Onshape-Training-Repo-58d051743d98a90f86e9e2ab-4a289bd094a999329a3900af.scenario.json';

test.describe('Exercise: Basic Drawing Wheel 示例回放', () => {
  test('scenario-file → 2442293.76 mm³ / 1 body / push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const { volumes, expected } = await runScenarioFile(page, request, {
      scenario: SCENARIO,
      name: 'E2E - Basic Drawing Wheel Scenario',
      reset: true,
    });
    console.log(`[wheel] volumes=${JSON.stringify(volumes)} expected=${JSON.stringify(expected)}`);
    expect(volumes).toHaveLength(1);
    const relativeError = Math.abs(volumes[0]! - expected[0]!) / expected[0]!;
    expect(relativeError).toBeLessThan(1e-4);
  });
});
