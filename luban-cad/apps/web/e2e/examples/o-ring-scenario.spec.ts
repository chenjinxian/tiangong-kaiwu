/**
 * Exercise: Element Organization / O-Ring：sketch + revolve 单 PS 严格验收。
 * 2026-11-09（P6 数据补齐）：per-part mass 采集后，O-Ring 由“expected 0/无 body”
 * 变为可测 454.927 mm³；本 spec 用通用 scenario-file 严格门验证树/status/body/
 * 推送+冷重开。
 */
import { expect, test } from '@playwright/test';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { isExampleDataAvailable } from './registry.js';
import { runScenarioFile } from './replay/run-file.js';

const CASES = [
  {
    slug: 'o-ring',
    label: 'O-Ring',
    scenario: 'scenarios/Onshape-Training-Repo-58eb97a87053360f6da2f15d-175362f23d8a08be2e01f828.scenario.json',
  },
  {
    slug: 'bushing',
    label: 'Bushing',
    scenario: 'scenarios/Onshape-Training-Repo-58eb97a87053360f6da2f15d-bef3a95b0793f0bd33859cee.scenario.json',
  },
] as const;

test.describe('Element Organization 单 PS 严格验收', () => {
  for (const item of CASES) {
    test(`${item.label}：树/体积/推送重开`, async ({ page, request }) => {
      test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
      test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
      const result = await runScenarioFile(page, request, {
        scenario: item.scenario,
        name: `Onshape example: Element Organization / ${item.label}`,
        reset: true,
        skipSketchConstraints: true,
      });
      const actual = result.volumes.reduce((sum, volume) => sum + volume, 0);
      const expected = result.expected.reduce((sum, volume) => sum + volume, 0);
      console.log(`[${item.slug}] actual=${actual.toFixed(3)} expected=${expected.toFixed(3)}`);
      expect(actual).toBeGreaterThan(0);
      expect(Math.abs(actual - expected) / expected).toBeLessThan(0.005);
    });
  }
});
