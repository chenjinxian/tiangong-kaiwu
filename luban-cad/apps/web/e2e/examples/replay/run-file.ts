/**
 * 通用 scenario 文件执行器（test-only）。把“读 scenario → 建链 → 逐 body/重开”
 * 抽成 helper，供 env 驱动的批处理 spec 与单示例回归 spec 共用；不新增产品 API。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { getApiToken, getFeatureTreeRpc, getMassPropertiesRpc, type BSeedEditorContext } from '../../helpers.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from '../imodel.js';
import { DEFAULT_DATA_ROOT } from '../registry.js';
import { resolveScenarioEdges, type ResolveEdgesResult } from './edge-resolver.js';
import { resolveImprintFaceRef } from './imprint-face-resolver.js';
import { resolveScenarioShellFaces } from './shell-face-resolver.js';
import { runScenario } from './run.js';
import type { ParityScenario, ScenarioFeature } from './scenario-to-op.js';

/** 审计的 test-only 边覆盖回调上下文（在 Fillet/Chamfer 步骤时点调用）。 */
export interface EdgeRefsOverrideArgs {
  feature: ScenarioFeature;
  scenario: ParityScenario;
  page: Page;
  ctx: BSeedEditorContext;
  accessToken: string;
  bodyContext: {
    bodyKeyBySource?: ReadonlyMap<string, string>;
    allBodyKeys?: readonly string[];
  };
}

/**
 * 审计的 test-only 边覆盖（缺省不启用）：按特征返回完整持久边引用。
 * 返回 `undefined` 表示该特征走通用 `resolveScenarioEdges`；返回值必须自行给出
 * 可审计 notes/bodyKeys。仅限显式传入的示例 spec，不是通用 selector 变更。
 */
export type EdgeRefsOverride = (
  args: EdgeRefsOverrideArgs,
) => Promise<ResolveEdgesResult | undefined> | ResolveEdgesResult | undefined;

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
  /**
   * 能力覆盖轨（非严格）：'record' 允许特征树存在非 0 status（如已知 blocked-kernel
   * 的 fillet），只打印表格；严格轨缺省 'strict' 仍要求全 0。
   */
  statusPolicy?: 'strict' | 'record';
  /** 能力覆盖轨：拔模按直壁近似并标 approximate（严格轨禁止）。 */
  allowApproximateDraft?: boolean;
  /**
   * 审计的 test-only 边覆盖（2026-11-09 Bumper Fillet 1）：按特征返回完整
   * 持久边引用，覆盖通用 resolver 的展开结果。仅显式传入的示例 spec 使用；
   * 缺省行为完全不变（仍走 `resolveScenarioEdges`）。
   */
  edgeRefsOverride?: EdgeRefsOverride;
}

export function resolveScenarioFile(rel: string): string {
  return path.isAbsolute(rel) ? rel : path.join(DEFAULT_DATA_ROOT, rel);
}

export async function runScenarioFile(
  page: Page,
  request: APIRequestContext,
  options: RunScenarioFileOptions,
): Promise<{ scenario: ParityScenario; volumes: number[]; expected: number[]; approximateSteps: number }> {
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
    edgeResolver: async (feature, fullScenario, bodyContext) => {
      // 审计覆盖优先（仅显式传入的 spec）；未命中/未提供则保持通用 resolver。
      const override = await options.edgeRefsOverride?.({
        feature,
        scenario: fullScenario,
        page,
        ctx,
        accessToken: token,
        bodyContext,
      });
      if (override !== undefined) return override;
      return resolveScenarioEdges(page, ctx, fullScenario, feature, token, bodyContext);
    },
    shellFaceResolver: (feature, fullScenario, context) =>
      resolveScenarioShellFaces(page, ctx, fullScenario, feature, token, context),
    imprintFaceResolver: (_feature, _fullScenario, data) => resolveImprintFaceRef({
      page, ctx, accessToken: token, ...data,
    }),
  });
  const expectedTypes = scenario.features.map((feature) => feature.type);
  expect(built.steps.map((step) => step.type)).toEqual(expectedTypes);
  const actualOpTypes = built.steps.map((step) => step.opFeatureType ?? step.type);
  // 严格轨定义仍是 tree/status/body/volume/push+reopen；approximate 步骤只记录，
  // 不强制为 0（合法的严格绿示例可能保留已知近似：Intro Part 3 strict 实测
  // approximateSteps=3；Drive Sleeve 的直接 runScenario 严格轨 Extrude 1 亦然），
  // 因此这里不做断言，只在非 record 轨打印警告。
  const strictTrack = options.volumePolicy !== 'record' && options.statusPolicy !== 'record';
  console.log(`[scenario-file] ${options.name} approximateSteps=${built.approximateSteps}`);
  if (strictTrack && built.approximateSteps > 0) {
    console.log(
      `[scenario-file] WARNING ${options.name} approximateSteps=${built.approximateSteps} ` +
      `(${built.steps.filter((step) => step.approximate).map((step) => step.feature).join(', ')})；` +
      `严格门仍为 tree/status/body/volume/push+reopen，不把 approximate 当失败`,
    );
  }

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
  const statusOk = tree.every((row) => row.status === 0);
  if (options.statusPolicy === 'record') {
    if (!statusOk) {
      console.log(
        '[scenario-file] non-zero statuses (recorded, not strict): ' +
        JSON.stringify(tree.map((row) => ({ type: row.featureType, status: row.status, error: (row as { error?: string }).error }))),
      );
    }
  } else {
    expect(statusOk).toBe(true);
  }

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
  const reopenedTree = await getFeatureTreeRpc(ctx, token);
  expect(reopenedTree.map((row) => row.featureType)).toEqual(actualOpTypes);
  // 严格轨（2026-11-09 review）：冷重开后的特征 status 也必须全 0——push 前
  // 的 status 检查不能证明持久化重算仍成功（例如 fillet/hole 依赖缓存态）。
  const reopenedStatusOk = reopenedTree.every((row) => row.status === 0);
  if (options.statusPolicy === 'record') {
    if (!reopenedStatusOk) {
      console.log(
        '[scenario-file] reopened non-zero statuses (recorded, not strict): ' +
        JSON.stringify(reopenedTree.map((row) => ({
          type: row.featureType,
          status: row.status,
          error: (row as { error?: string }).error,
        }))),
      );
    }
  } else {
    expect(
      reopenedStatusOk,
      '冷重开后特征树存在非 0 status: ' + JSON.stringify(reopenedTree.map((row) => ({
        type: row.featureType,
        status: row.status,
        error: (row as { error?: string }).error,
      }))),
    ).toBe(true);
  }
  const reopened = (await getMassPropertiesRpc(ctx, token)).map((item) => item.volume).sort((a, b) => a - b);
  console.log(`[scenario-file] reopened volumes=${JSON.stringify(reopened)}`);
  expect(reopened.length).toBe(expected.length);
  const reference = volumePolicy === 'record' ? volumes : expected;
  for (let i = 0; i < reference.length; i++) {
    expect(Math.abs(reopened[i]! - reference[i]!) / reference[i]!).toBeLessThan(tolerance);
  }
  return { scenario, volumes, expected, approximateSteps: built.approximateSteps };
}
