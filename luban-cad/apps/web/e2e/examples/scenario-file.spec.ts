/**
 * 通用场景回放器（test-only）：从 ONSHAPE_PARITY_DATA 读取任意 scenario JSON，
 * 经标准 FeatureOp 建链，逐 body 对拍体积并 push+重开。用于示例覆盖的连续批次。
 *
 * 环境变量：
 * - EXAMPLE_SCENARIO（必填）：scenario 相对 data root 的路径或绝对路径。
 * - EXAMPLE_NAME：iModel 名（缺省取 scenario.id）。
 * - EXAMPLE_RESET=0：复用同名 iModel（缺省重置）。
 * - EXAMPLE_SKIP_CONSTRAINTS=1：只保留 Onshape 解算坐标，不送 solver。
 * - EXAMPLE_TOLERANCE：体积相对容差。
 *
 * 未设置 EXAMPLE_SCENARIO 时该 spec 自动 skip（全量套件不因批处理入口变红）。
 */
import { test } from '@playwright/test';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { isExampleDataAvailable } from './registry.js';
import { runScenarioFile } from './replay/run-file.js';

test.describe('generic scenario file', () => {
  test('scenario → FeatureOp 建链 → 逐 body/重开', async ({ page, request }) => {
    test.skip(!process.env.EXAMPLE_SCENARIO, 'EXAMPLE_SCENARIO 未设置');
    test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 1_200_000);
    const result = await runScenarioFile(page, request, {
      scenario: process.env.EXAMPLE_SCENARIO!,
      name: process.env.EXAMPLE_NAME || 'E2E - scenario file',
      reset: process.env.EXAMPLE_RESET !== '0',
      skipSketchConstraints: process.env.EXAMPLE_SKIP_CONSTRAINTS === '1',
      ...(process.env.EXAMPLE_TOLERANCE ? { tolerance: Number(process.env.EXAMPLE_TOLERANCE) } : {}),
    });
    console.log(`[scenario-file] volumes=${JSON.stringify(result.volumes)} expected=${JSON.stringify(result.expected)}`);
  });
});
