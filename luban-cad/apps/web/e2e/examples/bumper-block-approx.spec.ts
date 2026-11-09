/**
 * 能力覆盖轨（非严格，2026-11-09 复核）：Bumper Block 的剩余阻塞是**上游实体面
 * 起始拉伸**（CAP_FACE），不是拔模，也不是 imprint 草图面域。
 *
 * 2026-11-09 分类纠正：Extrude 2 的 qCompressed 解码后是
 * `FQ77...opExtrude + CAP_FACE`（从 Extrude 1 顶面 z=40 再拉 40 + 10° 拔模），
 * converter 不再误标 imprintFace，而是 `selection.kind='face'`；translator 以
 * `BlockedCapabilityError('face-extrude')` 诚实阻塞。旧近似路径（region 0 从
 * z=0 叠加，体积 −45.5%）已退役，不得把该近似当绿。
 *
 * 真阻塞：产品 faceExtrude 缺起始面/draft 语义 + 12 边 fillet 内核；严格轮次
 * 保持 blocked-selector/kernel。
 */
import { test } from '@playwright/test';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { isExampleDataAvailable } from './registry.js';
import { runScenarioFile } from './replay/run-file.js';

test.describe('能力覆盖轨：Bumper Block（拔模已真映射；imprintFace 起点仍是阻塞）', () => {
  test('整链回放 → 树/status/body/重开；体积差异仅记录', async ({ page, request }) => {
    test.fail(true, 'known-blocked: CAP_FACE start-face extrude (faceExtrude lacks start-face/draft)');
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
