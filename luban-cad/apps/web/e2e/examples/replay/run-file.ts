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
import { resolveImprintFaceRef } from './imprint-face-resolver.js';
import { resolveScenarioShellFaces } from './shell-face-resolver.js';
import { runScenario } from './run.js';
import type { ParityScenario } from './scenario-to-op.js';

export interface RunScenarioFileOptions {
  scenario: string;
  name: string;
  reset?: boolean;
  skipSketchConstraints?: boolean;
  tolerance?: number;
  /**
   * 能力覆盖轨（非严格）：'record' 只记录实际体积与采集目标的差异、不把目标当
   * 断言；仍断言 tree/status/body 数/push+重开。严格示例必须保持缺省 'strict'。
   */
  volumePolicy?: 'strict' | 'record';
  /** 能力覆盖轨：拔模按直壁近似并标 approximate（严格轨禁止）。 */
  allowApproximateDraft?: boolean;
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
    ...(options.allowApproximateDraft ? { allowApproximateDraft: true } : {}),
    edgeResolver: (feature, fullScenario, bodyContext) => resolveScenarioEdges(page, ctx, fullScenario, feature, token, bodyContext),
    shellFaceResolver: (feature, fullScenario, context) =>
      resolveScenarioShellFaces(page, ctx, fullScenario, feature, token, context),
    imprintFaceResolver: (_feature, _fullScenario, data) => resolveImprintFaceRef({
      page, ctx, accessToken: token, ...data,
    }),
  });
  const expectedTypes = scenario.features.map((feature) => feature.type);
  expect(built.steps.map((step) => step.type)).toEqual(expectedTypes);
  const actualOpTypes = built.steps.map((step) => step.opFeatureType ?? step.type);

  // 冷重开稳定性（2026-11-08 Bumper Block 严格轨实测）：重逻辑链 push 前的首次
  // reload 偶发 90s 内不出 canvas（MS health 仍 200）；重试一次并记录提交前体积，
  // 便于把几何失败与冷开抖动区分。
  const prebuiltVolumes = (await getMassPropertiesRpc(ctx, token)).map((item) => item.volume).sort((a, b) => a - b);
  console.log(`[scenario-file] pre-reopen volumes=${JSON.stringify(prebuiltVolumes)}`);
  const openWithRetry = async () => {
    try {
      return await openExampleEditor(page, ids);
    } catch {
      await page.reload();
      await page.waitForTimeout(3_000);
      return openExampleEditor(page, ids);
    }
  };
  await page.reload();
  await openWithRetry();
  const tree = await getFeatureTreeRpc(ctx, token);
  if (process.env.EXAMPLE_DEBUG_TREE === '1')
    console.log('[scenario-file] tree', JSON.stringify(tree.map((row) => ({ featureType: row.featureType, status: row.status, error: (row as { error?: string }).error })), null, 1));
  expect(tree.map((row) => row.featureType)).toEqual(actualOpTypes);
  expect(tree.every((row) => row.status === 0)).toBe(true);

  const tolerance = options.tolerance
    ?? Number((scenario.expected as { tolerance?: number } | undefined)?.tolerance || 0.005);
  const volumes = (await getMassPropertiesRpc(ctx, token))
    .map((item) => item.volume)
    .sort((a, b) => a - b);
  expect(volumes.length, `body 数：实际 ${volumes.length}，期望 ${expected.length}`).toBe(expected.length);
  const volumePolicy = options.volumePolicy ?? 'strict';
  if (volumePolicy === 'record') {
    // 能力覆盖轨：不把采集目标当严格断言，只记录差异（approximate 已在步骤 notes）。
    console.log(
      `[scenario-file] ${options.name} approximate volumes=${JSON.stringify(volumes)} ` +
      `expected=${JSON.stringify(expected)}`,
    );
    expect(volumes.every((volume) => volume > 0)).toBe(true);
  } else {
    for (let i = 0; i < expected.length; i++) {
      expect(Math.abs(volumes[i]! - expected[i]!) / expected[i]!, `body[${i}] 体积超差`).toBeLessThan(tolerance);
    }
  }

  await pushExampleChanges(page, `${options.name} (scenario-file)`);
  await page.reload();
  await openWithRetry();
  expect((await getFeatureTreeRpc(ctx, token)).map((row) => row.featureType)).toEqual(actualOpTypes);
  const reopened = (await getMassPropertiesRpc(ctx, token)).map((item) => item.volume).sort((a, b) => a - b);
  expect(reopened.length).toBe(expected.length);
  const reference = volumePolicy === 'record' ? volumes : expected;
  for (let i = 0; i < reference.length; i++) {
    expect(Math.abs(reopened[i]! - reference[i]!) / reference[i]!).toBeLessThan(tolerance);
  }
  return { scenario, volumes, expected };
}
