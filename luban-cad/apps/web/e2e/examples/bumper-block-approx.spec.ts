/**
 * 能力覆盖轨（非严格，2026-11-09）：Bumper Block 的 CAP_FACE 起始面已从
 * “误标 imprintFace / region 0 近似”改为产品既有 extrude 的
 * **startOffsetMm + draft** 通道：
 * - Extrude 1：草图面域 [0]，blind 40 → 360,000 mm³；
 * - Extrude 2：CAP_FACE 从 Extrude 1 顶面 z=40 再拉 40 + 10° 拔模，
 *   replay 映射为同草图/面域 + `startOffsetMm=40`，实测 **657,764.787 mm³**；
 * - 采集目标 636,731.499，当前 **+3.30%**（旧近似 −45.5%）。Fillet 1 仍无几何
 *   变化（12 边 blend 内核阻塞），是剩余体积差的主要来源；严格轮次保持
 *   blocked-kernel，本 spec 只做能力覆盖与差异记录（volumePolicy=record）。
 *
 * 若后续实现 faceExtrude 起始面/draft 或修复 12 边 fillet，再升级为严格门。
 */
import { expect, test } from '@playwright/test';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { isExampleDataAvailable } from './registry.js';
import { runScenarioFile } from './replay/run-file.js';

test.describe('能力覆盖轨：Bumper Block（CAP_FACE 起始面已映射；12 边 fillet 仍阻塞）', () => {
  test('整链回放 → 树/status/body/重开；体积差异仅记录', async ({ page, request }) => {
    test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 1_200_000);
    const result = await runScenarioFile(page, request, {
      scenario: 'scenarios/Explore-Onshape-Models-7c199f0e3db618e8abeb0d95-f664ba9907810c60c6fba5e2.scenario.json',
      name: 'Onshape example: Bumper Block (CAP_FACE startOffset)',
      reset: true,
      skipSketchConstraints: true,
      volumePolicy: 'record',
      statusPolicy: 'record',
    });
    const actual = result.volumes.reduce((sum, volume) => sum + volume, 0);
    const expected = result.expected.reduce((sum, volume) => sum + volume, 0);
    const relative = Math.abs(actual - expected) / expected;
    console.log(
      `[bumper-approx] actual=${actual.toFixed(3)} expected=${expected.toFixed(3)} ` +
      `delta=${((actual - expected) / expected * 100).toFixed(3)}%`,
    );
    // 能力覆盖轨的宽松门：证明 CAP_FACE 起始面已真正加料，并记录剩余差异。
    // 严格门仍由 12 边 fillet 内核阻塞，不得据此宣称示例 complete。
    expect(actual).toBeGreaterThan(0);
    expect(relative).toBeLessThan(0.10);
  });
});
