/**
 * WARNING LABEL 同几何文档族（Onshape EDU/Professional/Quickstart，2026-11-09）。
 *
 * 三个文档的 Part Studio 与 Bench Vise WARNING LABEL 同几何（5 特征、1 body、
 * 0.8193532 mm³）；converter 只 dropped decal/mateConnector（非几何）。本 spec
 * 为 B1 覆盖率提供逐文档真栈证据，避免只凭一个同名 PS 宣称文档族完成。
 */
import { expect, test } from '@playwright/test';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../../seed.js';
import { runScenarioFile } from './run-file.js';

const VARIANTS = [
  {
    label: 'Onshape EDU Quickstart',
    name: 'E2E - WARNING LABEL EDU',
    scenario: 'scenarios/Onshape-Training-6942f3f3544f9bd9e108f8e8-e555b5ba06d23d8616106ebf.scenario.json',
  },
  {
    label: 'Onshape Professional Discovery Quickstart',
    name: 'E2E - WARNING LABEL Pro',
    scenario: 'scenarios/Onshape-Training-829f23dc709160ef04981bb9-3d00215dabd688d945e3b696.scenario.json',
  },
  {
    label: 'Onshape Quickstart',
    name: 'E2E - WARNING LABEL Quickstart',
    scenario: 'scenarios/Onshape-Training-e19cf45a2f0dc72c0322ed7c-7a23879e4fe55b3a28166506.scenario.json',
  },
] as const;

test.describe('WARNING LABEL 文档族回放', () => {
  for (const variant of VARIANTS) {
    test(`${variant.label} → 0.8193532 mm³ / 1 body / push+重开`, async ({ page, request }) => {
      test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
      const { volumes, expected } = await runScenarioFile(page, request, {
        scenario: variant.scenario,
        name: variant.name,
        reset: true,
      });
      console.log(`[warning-variant:${variant.label}] volumes=${JSON.stringify(volumes)} expected=${JSON.stringify(expected)}`);
      expect(volumes).toHaveLength(1);
      expect(volumes[0]).toBeCloseTo(expected[0]!, 4);
    });
  }
});
