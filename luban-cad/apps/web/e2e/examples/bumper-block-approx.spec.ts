/**
 * 能力覆盖轨（非严格，2026-11-08 复核）：Bumper Block 的剩余阻塞是面拉伸，
 * 不是拔模。
 *
 * v1.51 拔模已落（converter/translator 真映射，不再 allowApproximateDraft）。
 * 但 Extrude 2 的 selection 是 **imprintFace**：Onshape 从 Extrude 1 的顶面
 * （z=40）向上再拉伸 40 并带 10° 拔模；当前回放把 imprintFace 近似成原草图的
 * region 0（z=0 起），与 Extrude 1 完全重叠 → 该步实测 **add 0**。逐 step 体积
 * （EXAMPLE_DEBUG_VOLUMES=1）：360000 → 360000 → Fillet 354373.149 → Hole
 * 346770.496；采集目标 636731.499（−45.5%）。因此本示例保持 `volumePolicy:
 * 'record'`，严格轮次仍由 scenario-file 轨诚实阻塞；不得把接近似当绿。
 *
 * 真阻塞：ADR-0006 切片 D（face-extrude / imprint-face 的**面平面起点**语义）。
 */
import { test } from '@playwright/test';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { isExampleDataAvailable } from './registry.js';
import { runScenarioFile } from './replay/run-file.js';

test.describe('能力覆盖轨：Bumper Block（拔模已真映射；imprintFace 起点仍是阻塞）', () => {
  test('整链回放 → 树/status/body/重开；体积差异仅记录', async ({ page, request }) => {
    test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 1_200_000);
    const result = await runScenarioFile(page, request, {
      scenario: 'scenarios/Explore-Onshape-Models-7c199f0e3db618e8abeb0d95-f664ba9907810c60c6fba5e2.scenario.json',
      name: 'Onshape example: Bumper Block (approx imprintFace)',
      reset: true,
      skipSketchConstraints: true,
      volumePolicy: 'record',
    });
    const actual = result.volumes.reduce((sum, volume) => sum + volume, 0);
    const expected = result.expected.reduce((sum, volume) => sum + volume, 0);
    console.log(
      `[bumper-approx] actual=${actual.toFixed(3)} expected=${expected.toFixed(3)} ` +
      `delta=${((actual - expected) / expected * 100).toFixed(3)}%`,
    );
  });
});
