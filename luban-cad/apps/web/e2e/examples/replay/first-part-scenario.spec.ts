/**
 * Tutorial 2 - Build a Part / First Part 示例（scenario-file 真栈，2026-11-09）。
 *
 * 采集：Onshape/576aef66e4b0cc2e7f45753d/46033ccdfaf701956cc383a7；
 * 6 特征（草图 + 3 拉伸 + 旋转 + 圆角），1 body，逐 body 体积
 * 3.5756817668004945e-4 m³ = **357568.1767 mm³**。草图 48 约束（含标准 OFFSET、
 * 2 点样条 internal 端点）；converter status=complete。
 */
import { expect, test } from '@playwright/test';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../../seed.js';
import { runScenarioFile } from './run-file.js';

const SCENARIO = 'scenarios/Onshape-576aef66e4b0cc2e7f45753d-46033ccdfaf701956cc383a7.scenario.json';

test.describe('Tutorial 2 First Part 示例回放', () => {
  test('scenario-file → 357568.18 mm³ / 1 body / push+重开', async ({ page, request }) => {
    // 2026-11-09 关闭 known-red：imprintFace 的 +1/−1 是有向边左/右侧，不是
    // “孔侧/外环 + 最大面积”。Extrude 2 的两条查询分别选中 region 2 与 region 4
    // （union），旧实现只取 region 2，少 5,277 mm³。shared
    // `pickImprintRegionByEdgeSide` 统一实现；离线回放与真栈同口径。
    // 目标 357568.177 mm³，尾部切片的数值差在 0.0005% 内。
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const { volumes, expected } = await runScenarioFile(page, request, {
      scenario: SCENARIO,
      name: 'E2E - Tutorial 2 First Part Scenario',
      reset: true,
    });
    console.log(`[first-part] volumes=${JSON.stringify(volumes)} expected=${JSON.stringify(expected)}`);
    expect(volumes).toHaveLength(1);
    const relativeError = Math.abs(volumes[0]! - expected[0]!) / expected[0]!;
    expect(relativeError).toBeLessThan(1e-3);
  });
});
