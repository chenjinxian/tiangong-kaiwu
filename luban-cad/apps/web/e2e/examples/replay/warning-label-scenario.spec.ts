/**
 * WARNING LABEL / Bench Vise 示例（scenario-file 真栈，2026-11-08）。
 *
 * 采集：Explore-Onshape-Models/85bd160fa9e256ec1938a5e7/a33d659d2e6cf76c8f9ddef5；
 * 5 特征（sketch/extrude/sketch/sketch/extrude），1 body，逐 body 体积
 * 8.193532e-10 m³ = **0.8193532 mm³**（runner 单位口径）。converter 只 dropped decal/mateConnector
 * （非几何），几何层 complete；本 spec 走完整 scenario runner + 逐 body/树/status/
 * push+重开校验，不用近似体积。
 */
import { expect, test } from '@playwright/test';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../../seed.js';
import { runScenarioFile } from './run-file.js';

const SCENARIO = 'scenarios/Explore-Onshape-Models-85bd160fa9e256ec1938a5e7-a33d659d2e6cf76c8f9ddef5.scenario.json';

test.describe('WARNING LABEL 示例回放', () => {
  test('scenario-file → 0.8193532 mm³ / 1 body / push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const { volumes, expected } = await runScenarioFile(page, request, {
      scenario: SCENARIO,
      name: 'E2E - Warning Label Scenario',
      reset: true,
    });
    console.log(`[warning-label] volumes=${JSON.stringify(volumes)} expected=${JSON.stringify(expected)}`);
    expect(volumes).toHaveLength(1);
    expect(volumes[0]).toBeCloseTo(expected[0]!, 4);
  });
});
