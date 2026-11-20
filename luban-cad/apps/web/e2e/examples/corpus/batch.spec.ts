/**
 * Corpus batch runner (W6-E4, 2026-11-19).
 *
 * Driven entirely by `ONSHAPE_BATCH_FILE` (produced by the private parity tooling
 * from the tri-state registry / work queue). One Playwright test per entry; each
 * entry gets its own example iModel and runs the generic scenario-file pipeline
 * (build → tree/status/body-volume → push + cold reopen). When the batch entry
 * carries `expectedBodies` with centroids, bodies are additionally paired by
 * centroid and checked per body (never against a collapsed total).
 *
 * Optional `BATCH_REPORT_FILE` receives one JSONL row per entry (passed/failed).
 * Without a batch file the spec is skipped, so normal suite runs are unchanged.
 *
 * Usage (repo dev stack):
 *   $env:ONSHAPE_BATCH_FILE = 'D:\Github\onshape-parity-data\batches\W1.json'
 *   $env:BATCH_REPORT_FILE  = 'D:\Github\onshape-parity-data\reports\batches\W1.jsonl'
 *   corepack pnpm@10 exec playwright test e2e/examples/corpus/batch.spec.ts
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../../seed.js';
import { isExampleDataAvailable } from '../registry.js';
import { runScenarioFile } from '../replay/run-file.js';
import { parseBatchFile, type BatchEntry } from './batch-file.js';
import { compareBodies } from './compare-bodies.js';

const batchPath = process.env.ONSHAPE_BATCH_FILE;
const reportPath = process.env.BATCH_REPORT_FILE;
const batch = batchPath ? parseBatchFile(readFileSync(batchPath, 'utf8'), batchPath) : undefined;

function report(row: Record<string, unknown>): void {
  if (!reportPath) return;
  try {
    appendFileSync(reportPath, `${JSON.stringify({ at: new Date().toISOString(), ...row })}\n`, 'utf8');
  } catch (error) {
    console.warn(`[corpus-batch] report write failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function scenarioOptions(entry: BatchEntry) {
  return {
    scenario: entry.scenario,
    name: entry.name ?? `E2E - Batch - ${entry.key}`,
    reset: entry.reset ?? true,
    ...(entry.tolerance !== undefined ? { tolerance: entry.tolerance } : {}),
    ...(entry.volumePolicy !== undefined ? { volumePolicy: entry.volumePolicy } : {}),
    ...(entry.statusPolicy !== undefined ? { statusPolicy: entry.statusPolicy } : {}),
    ...(entry.requireExact !== undefined ? { requireExact: entry.requireExact } : {}),
    ...(entry.skipSketchConstraints !== undefined ? { skipSketchConstraints: entry.skipSketchConstraints } : {}),
    ...(entry.allowApproximateDraft !== undefined ? { allowApproximateDraft: entry.allowApproximateDraft } : {}),
  };
}

test.describe(batch ? `corpus batch: ${batch.name}` : 'corpus batch (requires ONSHAPE_BATCH_FILE)', () => {
  if (!batch) {
    test('no batch file configured', () => {
      test.skip(true, '设置 ONSHAPE_BATCH_FILE 并运行 e2e/examples/corpus/batch.spec.ts');
    });
    return;
  }

  for (const entry of batch.entries) {
    test(entry.key, async ({ page, request }) => {
      test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
      test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
      try {
        const result = await runScenarioFile(page, request, scenarioOptions(entry));
        let bodyComparison: ReturnType<typeof compareBodies> | undefined;
        if (entry.expectedBodies !== undefined) {
          const actual = result.reopenedMass.map((body) => ({
            volume: body.volume,
            centroid: [body.centroid.x, body.centroid.y, body.centroid.z] as const,
          }));
          bodyComparison = compareBodies(actual, entry.expectedBodies, {
            volumeTolerance: entry.tolerance ?? 0.005,
            centroidToleranceMm: 0.05,
          });
          expect(
            bodyComparison.ok,
            `逐 body 配对失败：\n${bodyComparison.errors.join('\n')}`,
          ).toBe(true);
        }
        report({
          status: 'passed',
          key: entry.key,
          scenario: entry.scenario,
          volumes: result.volumes,
          expected: result.expected,
          approximateSteps: result.approximateSteps,
          ...(bodyComparison ? { bodyPairs: bodyComparison.pairs } : {}),
          // opt-in 四维严格门报告（未开启时不出现，缺省路径零变化）。
          ...(result.strictGate !== undefined ? { strictGate: result.strictGate } : {}),
        });
      } catch (error) {
        report({
          status: 'failed',
          key: entry.key,
          scenario: entry.scenario,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    });
  }
});
