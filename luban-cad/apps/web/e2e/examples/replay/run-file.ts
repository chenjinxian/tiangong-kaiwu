/**
 * 通用 scenario 文件执行器（test-only）。把“读 scenario → 建链 → 逐 body/重开”
 * 抽成 helper，供 env 驱动的批处理 spec 与单示例回归 spec 共用；不新增产品 API。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { getApiToken, getFeatureTreeRpc, getMassPropertiesRpc } from '../../helpers.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from '../imodel.js';
import { DEFAULT_DATA_ROOT } from '../registry.js';
import { resolveScenarioEdges } from './edge-resolver.js';
import { runScenario } from './run.js';
import type { ParityScenario } from './scenario-to-op.js';

export interface RunScenarioFileOptions {
  scenario: string;
  name: string;
  reset?: boolean;
  skipSketchConstraints?: boolean;
  tolerance?: number;
}

export function resolveScenarioFile(rel: string): string {
  return path.isAbsolute(rel) ? rel : path.join(DEFAULT_DATA_ROOT, rel);
}

export async function runScenarioFile(
  page: Page,
  request: APIRequestContext,
  options: RunScenarioFileOptions,
): Promise<{ scenario: ParityScenario; volumes: number[]; expected: number[] }> {
  const file = resolveScenarioFile(options.scenario);
  const scenario = JSON.parse(readFileSync(file, 'utf8')) as ParityScenario;
  const expected = ((scenario.expected as { bodies?: Array<{ volumeM3?: number }> } | undefined)?.bodies || [])
    .map((body) => Number(body.volumeM3 || 0) * 1e9)
    .filter((volume) => volume > 0)
    .sort((a, b) => a - b);
  expect(expected.length, `scenario ${file} 无逐 body 体积证据`).toBeGreaterThan(0);
  expect(scenario.features.length).toBeGreaterThan(0);

  const token = await getApiToken();
  const ids = await ensureExampleImodel(request, token, options.name, { reset: options.reset ?? true });
  const ctx = await openExampleEditor(page, ids);
  const built = await runScenario(ctx, scenario, token, {
    skipSketchConstraints: options.skipSketchConstraints ?? false,
    edgeResolver: (feature, fullScenario) => resolveScenarioEdges(page, ctx, fullScenario, feature, token),
  });
  const expectedTypes = scenario.features.map((feature) => feature.type);
  expect(built.steps.map((step) => step.type)).toEqual(expectedTypes);

  await page.reload();
  await openExampleEditor(page, ids);
  const tree = await getFeatureTreeRpc(ctx, token);
  expect(tree.map((row) => row.featureType)).toEqual(expectedTypes);
  expect(tree.every((row) => row.status === 0)).toBe(true);

  const tolerance = options.tolerance
    ?? Number((scenario.expected as { tolerance?: number } | undefined)?.tolerance || 0.005);
  const volumes = (await getMassPropertiesRpc(ctx, token))
    .map((item) => item.volume)
    .sort((a, b) => a - b);
  expect(volumes.length, `body 数：实际 ${volumes.length}，期望 ${expected.length}`).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(Math.abs(volumes[i]! - expected[i]!) / expected[i]!, `body[${i}] 体积超差`).toBeLessThan(tolerance);
  }

  await pushExampleChanges(page, `${options.name} (scenario-file)`);
  await page.reload();
  await openExampleEditor(page, ids);
  expect((await getFeatureTreeRpc(ctx, token)).map((row) => row.featureType)).toEqual(expectedTypes);
  const reopened = (await getMassPropertiesRpc(ctx, token)).map((item) => item.volume).sort((a, b) => a - b);
  expect(reopened.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(Math.abs(reopened[i]! - expected[i]!) / expected[i]!).toBeLessThan(tolerance);
  }
  return { scenario, volumes, expected };
}
