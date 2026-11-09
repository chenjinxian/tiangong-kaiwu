/**
 * Gaiter（Exercise: Hand Brake Update / Gaiter）真实 scenario 全链重建。
 *
 * 6 特征：Sketch 1 → Revolve 1（全周）→ Fillet 1（1 mm，SWEPT_EDGE）→
 * Shell 1（2 mm 内缩，移除回转两端面）→ Sketch 2 → Extrude 1。
 * Shell 面 query 是 revolve 的 SWEPT_FACE：草图直线与回转轴垂直 → 平面端面；
 * shellFaceResolver 按轴线段/平面/外半径唯一匹配后 resolveFaceRef。
 * 目标体积取采集 per-part nominal 12270.212 mm³；约束沿用 skip 并登记。
 *
 * **known blocked-kernel（2026-11-07）**：shell 两端面解析已成功，但前序
 * Fillet 1（8 条整圆边，1 mm）求值后 body 体积归零（feature status=0 但
 * massproperties 为 0，随后 shell 触发原生 bad allocation）。这不是 shell
 * 面选择器问题；shell 路径已由 `shell-face.spec.ts` 合成真栈验收。本 spec
 * 在 fillet 内核问题关闭前保持 fixme，不伪造绿。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { getApiToken, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './imodel.js';
import { DEFAULT_DATA_ROOT, isExampleDataAvailable } from './registry.js';
import { resolveScenarioEdges } from './replay/edge-resolver.js';
import { runScenario } from './replay/run.js';
import { resolveScenarioShellFaces } from './replay/shell-face-resolver.js';
import type { ParityScenario } from './replay/scenario-to-op.js';

const EXAMPLE_NAME = 'E2E - Gaiter Scenario';
const SCENARIO = path.join(
  DEFAULT_DATA_ROOT,
  'scenarios',
  'Onshape-Training-Repo-91f152e2325e166b5ae98f4d-c405997fc0c2eb182b7d13d1.scenario.json',
);
const EXPECTED_TOTAL_MM3 = 12270.212281622991;
const EXPECTED_TREE = ['sketch', 'revolve', 'fillet', 'shell', 'sketch', 'extrude'];

test.describe('Gaiter scenario rebuild', () => {
  test.fixme('revolve + fillet + shell 端面移除 → 体积/推送重开（blocked-kernel: Fillet 1 零体积）', async ({ page, request }) => {
    test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, EXAMPLE_NAME, { reset: true });
    const ctx = await openExampleEditor(page, ids);
    const scenario = JSON.parse(readFileSync(SCENARIO, 'utf8')) as ParityScenario;

    const built = await runScenario(ctx, scenario, token, {
      skipSketchConstraints: true,
      edgeResolver: (feature, fullScenario, bodyContext) =>
        resolveScenarioEdges(page, ctx, fullScenario, feature, token, bodyContext),
      shellFaceResolver: (feature, fullScenario) =>
        resolveScenarioShellFaces(page, ctx, fullScenario, feature, token),
    });
    expect(built.steps.map((step) => step.type)).toEqual(EXPECTED_TREE);
    const shellStep = built.steps.find((step) => step.type === 'shell');
    expect(shellStep?.approximate).toBe(false);
    expect(shellStep?.notes.join(' ')).toContain('shell faces=');
    expect(built.notes.some((note) => note.includes('constraints=dropped'))).toBe(true);

    await page.reload();
    await openExampleEditor(page, ids);
    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(EXPECTED_TREE);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const mass = await getMassPropertiesRpc(ctx, token);
    expect(mass.length).toBe(1);
    const volume = mass.reduce((sum, item) => sum + item.volume, 0);
    console.log(`[gaiter-scenario] volume=${volume.toFixed(3)} expected=${EXPECTED_TOTAL_MM3.toFixed(3)}`);
    expect(Math.abs(volume - EXPECTED_TOTAL_MM3) / EXPECTED_TOTAL_MM3).toBeLessThan(0.005);

    await pushExampleChanges(page, 'Gaiter shell end-face scenario');
    await page.reload();
    await openExampleEditor(page, ids);
    const reopened = await getFeatureTreeRpc(ctx, token);
    expect(reopened.map((row) => row.featureType)).toEqual(tree.map((row) => row.featureType));
    const reopenedVolume = (await getMassPropertiesRpc(ctx, token))
      .reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(reopenedVolume - volume) / volume).toBeLessThan(0.005);
  });
});
