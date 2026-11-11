/**
 * 私有 live-specs 的批量构建/验证入口（2026-11-11 策略切换）。
 *
 * 数据目录：`$ONSHAPE_PARITY_DATA/live-specs/*.json`（私有）。
 * 每个 spec 独立 iModel；无数据时整个 suite skip，不伪造 fixture。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { DEFAULT_DATA_ROOT, isExampleDataAvailable } from './registry.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

const LIVE_DIR = path.join(DEFAULT_DATA_ROOT, 'live-specs');

function loadSpecs(): LiveSpec[] {
  if (!existsSync(LIVE_DIR)) return [];
  return readdirSync(LIVE_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => JSON.parse(readFileSync(path.join(LIVE_DIR, file), 'utf8')) as LiveSpec);
}

const specs = loadSpecs();

test.describe('live UI 复刻 registry', () => {
  test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
  test.skip(specs.length === 0, 'live-specs 为空');

  for (const spec of specs) {
    test(`${spec.title}（${spec.status}）`, async ({ page, request }) => {
      test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
      const result = await runLiveSpec(page, request, spec);
      const expectedTree = spec.steps
        .filter((step) => step.kind !== 'skipped')
        .map((step) => step.kind === 'sketch' ? 'sketch' : step.kind);
      expect(result.tree.map((row) => row.featureType)).toEqual(expectedTree);
      expect(result.tree.every((row) => row.status === 0)).toBe(true);
      const activeBodies = result.bodies.filter((body) => body.active !== false && body.authored !== false);
      if (spec.expected?.bodyCount !== undefined)
        expect(activeBodies).toHaveLength(spec.expected.bodyCount);
      const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
      if (spec.expected?.volumeMm3 !== undefined) {
        const tolerance = spec.expected.tolerance ?? 0.02;
        console.log(
          `[live] ${spec.id} volume=${volume.toFixed(3)} expected=${spec.expected.volumeMm3.toFixed(3)} ` +
          `delta=${((Math.abs(volume - spec.expected.volumeMm3) / spec.expected.volumeMm3) * 100).toFixed(3)}%`,
        );
        expect(Math.abs(volume - spec.expected.volumeMm3) / spec.expected.volumeMm3).toBeLessThan(tolerance);
      }

      await pushExampleChanges(page, `live ${spec.id}`);
      await page.reload();
      await openExampleEditor(page, result.ids);
      expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
      expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
      expect(await getMassPropertiesRpc(result.ctx, result.token)).toEqual(result.mass);
    });
  }
});
