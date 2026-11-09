/**
 * DRILL HOTD（Onshape Training Repo）示例验收。
 *
 * 2026-11-09（P6/P4.2）：
 * - ENG_BEARING 的 Sketch 2 建在**对称拉伸** Extrude 1 的端盖上（±depth/2）；
 *   converter 的 CAP_FACE 草图平面推导已支持 symmetric 端盖。
 * - CONNECTING_ROD 的 FULL_ROUND fillet 仍为 blocked-capability（转换器只支持
 *   EDGE 类型），先登记 known-red，不冒充完成。
 */
import { expect, test } from '@playwright/test';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { isExampleDataAvailable } from './registry.js';
import { runScenarioFile } from './replay/run-file.js';

const CASES = [
  {
    slug: 'eng-bearing',
    label: 'ENG_BEARING',
    elementId: '3da4bf9863d73b9c523edfc3',
    strict: true,
  },
  {
    slug: 'connecting-rod',
    label: 'CONNECTING_ROD',
    elementId: '6b82d01d81b1c9cf1073f6dc',
    strict: false,
    reason: 'known-red: FULL_ROUND fillet 未映射（几何不完整，严格体积断言失败）',
  },
] as const;

test.describe('DRILL HOTD examples', () => {
  for (const item of CASES) {
    test(`${item.label}：整链回放 → 树/体积/推送重开`, async ({ page, request }) => {
      test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
      test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
      if (!item.strict) test.fail(true, item.reason);
      const result = await runScenarioFile(page, request, {
        scenario: `scenarios/Onshape-Training-Repo-2778b69a09d8fcb9a54e08dc-${item.elementId}.scenario.json`,
        name: `Onshape example: DRILL HOTD / ${item.label}`,
        reset: true,
        skipSketchConstraints: true,
        ...(item.strict ? {} : { volumePolicy: 'record' as const, statusPolicy: 'record' as const }),
      });
      const actual = result.volumes.reduce((sum, volume) => sum + volume, 0);
      const expected = result.expected.reduce((sum, volume) => sum + volume, 0);
      console.log(`[drill-hotd] ${item.label} actual=${actual.toFixed(3)} expected=${expected.toFixed(3)} delta=${((actual - expected) / expected * 100).toFixed(3)}%`);
      expect(actual).toBeGreaterThan(0);
      expect(Math.abs(actual - expected) / expected).toBeLessThan(0.005);
    });
  }
});
