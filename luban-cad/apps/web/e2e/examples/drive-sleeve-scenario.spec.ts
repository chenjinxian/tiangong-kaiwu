/**
 * Drive Sleeve（Exercise: Intermediate Drawing）真实 scenario 全链验收。
 *
 * 8 特征：4 段 extrude → 圆孔 Hole 1（throughAll）→ FACE circular pattern
 * （6 实例/360°，轴=Extrude 2 圆柱面草图圆，源=Hole 1）。converter 已把
 * circularPattern 映射为 featurePattern（hole 源 delta 旋转阵列）；后端
 * FeaturePatternFlow 有同构 hole 源单测。本 spec 用真栈对拍采集体积
 * 1175.0243 cm³ 与 push+重开。
 *
 * 约束仍以 skip 保留 Onshape 解算坐标（converter 约束 refs 不完整），
 * notes 必须登记 constraints=dropped。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { getApiToken, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './imodel.js';
import { DEFAULT_DATA_ROOT, isExampleDataAvailable } from './registry.js';
import { runScenario } from './replay/run.js';
import type { ParityScenario } from './replay/scenario-to-op.js';

const EXAMPLE_NAME = 'E2E - Drive Sleeve Scenario';
const SCENARIO = path.join(
  DEFAULT_DATA_ROOT,
  'scenarios',
  'Onshape-Training-Repo-58d0532589c36a0f85a5c6de-8509862e8b7fffa66b7cf6c2.scenario.json',
);

test.describe('Drive Sleeve scenario rebuild', () => {
  test('4 extrude + hole + FACE circular pattern → 树/体积/推送重开', async ({ page, request }) => {
    test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
    // known-red（2026-11-07 A2 首步后）：NEW 拉伸多查询收敛到主导材料面后，
    // backend 回放 1357113.4 vs 1175024.3 mm³（+15.50%）；web 真栈约 +20.1%。
    // 剩余偏差来自 add/remove imprint 的子面/起始面语义（face split 未实现）。
    // 保留完整断言作为转绿信号：若意外通过，Playwright 报 unexpected pass，须复核。
    test.fail(true, 'known-red: imprintFace NEW 主导面域后仍 +15.5%~+20.1%（子面/起始面待 A2）');
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, EXAMPLE_NAME, { reset: true });
    const ctx = await openExampleEditor(page, ids);
    const raw = JSON.parse(readFileSync(SCENARIO, 'utf8')) as ParityScenario;
    const expected = ((raw.expected as { volumeM3?: number } | undefined)?.volumeM3 ?? 0) * 1e9;
    expect(expected).toBeGreaterThan(0);

    const built = await runScenario(ctx, raw, token, { skipSketchConstraints: true });
    expect(built.steps.map((step) => step.type)).toEqual([
      'sketch', 'extrude', 'extrude', 'extrude', 'extrude', 'sketch', 'hole', 'featurePattern',
    ]);
    const patternStep = built.steps.find((step) => step.type === 'featurePattern');
    expect(patternStep?.notes.some((note) => note.includes('featurePattern'))).toBe(true);
    expect(built.notes.some((note) => note.includes('constraints=dropped'))).toBe(true);

    await page.reload();
    await openExampleEditor(page, ids);
    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual([
      'sketch', 'extrude', 'extrude', 'extrude', 'extrude', 'sketch', 'hole', 'featurePattern',
    ]);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const mass = await getMassPropertiesRpc(ctx, token);
    expect(mass.length).toBe(1);
    const volume = mass.reduce((sum, item) => sum + item.volume, 0);
    console.log(`[drive-sleeve-scenario] volume=${volume.toFixed(3)} expected=${expected.toFixed(3)}`);
    expect(Math.abs(volume - expected) / expected).toBeLessThan(0.005);

    await pushExampleChanges(page, 'Drive Sleeve FACE circular pattern scenario');
    await page.reload();
    await openExampleEditor(page, ids);
    const reopened = await getFeatureTreeRpc(ctx, token);
    expect(reopened.map((row) => row.featureType)).toEqual(tree.map((row) => row.featureType));
    const reopenedVolume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(reopenedVolume - expected) / expected).toBeLessThan(0.005);
  });
});
