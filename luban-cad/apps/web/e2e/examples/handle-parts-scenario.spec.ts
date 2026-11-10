/**
 * Handle Parts（Exercise: Clamp / Handle Parts）真实 scenario 全链重建。
 *
 * 11 特征：Sketch 1（18 实体三轮廓）→ 三个 NEW revolve（同一草图的三个不同
 * 轮廓实体 2/8/5）→ Sketch 2 → Revolve 4（remove）→ Linear pattern 1
 * （featurePattern 源=Revolve 4，15×6.35 沿 Z）→ Plane 1（front 偏移 12.7）→
 * Sketch 3（落 Plane 1）→ Hole 1（Ø5.613 blind，booleanScope=Revolve 3 体）→
 * Fillet 1（SWEPT_EDGE 3.175）。
 *
 * v1.50：converter 保留 revolve 轮廓实体 id（profileEntityIds），回放器按
 * `SketchRegionDto` 边界映射真实面域——旧口径三个 NEW revolve 全部盲取 region 0，
 * 三体体积不可能对拍（本 spec 即该缺陷的验收）。
 *
 * 期望（采集 per-part nominal）：body 数 3，体积
 * 11878.505 + 30931.280 + 105770.915 = 148580.700 mm³。
 * 约束 refs 未全映射 → 全局 skipSketchConstraints 并登记 constraints=dropped。
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
import type { ParityScenario } from './replay/scenario-to-op.js';

const EXAMPLE_NAME = 'E2E - Handle Parts Scenario';
const SCENARIO = path.join(
  DEFAULT_DATA_ROOT,
  'scenarios',
  'Onshape-Training-Repo-77b4962142829dd1aefd7588-d40504762c5aa9c4a33ac886.scenario.json',
);
const EXPECTED_TOTAL_MM3 = 148580.700127897;
const EXPECTED_BODY_MM3 = [11878.505473553936, 30931.28015328296, 105770.9145010601];
const EXPECTED_TREE = [
  'sketch', 'revolve', 'revolve', 'revolve', 'sketch', 'revolve',
  'featurePattern', 'cPlane', 'sketch', 'hole', 'fillet',
];

test.describe('Handle Parts scenario rebuild', () => {
  // v1.65（ADR-0015 B6.3）多目标 fillet（6 条 SWEPT_EDGE / 3 body）+ featurePattern
  // 多体 remove 已真栈验证。2026-11-11 根因定位：Threaded Shaft 的 +4.2% 不是
  // 圆角问题，而是 converter 把 Linear pattern 1 的 directionOne（上游 revolve 的
  // SWEPT_FACE）映射成草图线方向世界 +Z；15 个 remove 实例全落在轴外，仅去材
  // 27.993 mm³（应约 1.3e3）。改用旋转轴 -X 后，最终 Threaded Shaft 30,944.712
  // vs 30,931.280（+0.043%），Stopper/Handle 均在 0.001% 内，整链 148,594.286
  // vs 148,580.700（+0.009%），冷重开一致。
  test('草图轮廓实体→真实面域 + 三 NEW revolve + featurePattern remove + 多体孔/圆角 → 逐体体积/重开', async ({ page, request }) => {
    test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 1_500_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, EXAMPLE_NAME, { reset: true });
    const ctx = await openExampleEditor(page, ids);
    const scenario = JSON.parse(readFileSync(SCENARIO, 'utf8')) as ParityScenario;

    const built = await runScenario(ctx, scenario, token, {
      skipSketchConstraints: true,
      edgeResolver: (feature, fullScenario, bodyContext) =>
        resolveScenarioEdges(page, ctx, fullScenario, feature, token, bodyContext),
    });
    expect(built.steps.map((step) => step.type)).toEqual(EXPECTED_TREE);
    // profileEntityIds 必须收敛到真实面域（不能走近似回退）。
    const profileNotes = built.notes.filter((note) => note.includes('profile 实体'));
    expect(profileNotes.length).toBe(4);
    expect(profileNotes.every((note) => note.includes('→ 面域'))).toBe(true);
    expect(built.notes.some((note) => note.includes('constraints=dropped'))).toBe(true);

    const mass = async () => {
      const items = await getMassPropertiesRpc(ctx, token);
      return {
        count: items.length,
        volumes: items.map((item) => item.volume).sort((a, b) => a - b),
      };
    };
    let result = await mass();
    let total = result.volumes.reduce((sum, volume) => sum + volume, 0);
    console.log(
      `[handle-parts] bodies=${result.volumes.map((volume) => volume.toFixed(3)).join(',')} ` +
      `total=${total.toFixed(3)} expected=${EXPECTED_TOTAL_MM3.toFixed(3)}`,
    );
    expect(result.count).toBe(3);
    expect(Math.abs(total - EXPECTED_TOTAL_MM3) / EXPECTED_TOTAL_MM3).toBeLessThan(0.01);
    for (let index = 0; index < EXPECTED_BODY_MM3.length; index++) {
      const expected = EXPECTED_BODY_MM3[index]!;
      expect(Math.abs(result.volumes[index]! - expected) / expected).toBeLessThan(0.01);
    }

    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(EXPECTED_TREE);
    expect(tree.every((row) => row.status === 0)).toBe(true);

    await pushExampleChanges(page, 'Handle Parts profile-region scenario');
    await page.reload();
    await openExampleEditor(page, ids);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(EXPECTED_TREE);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    result = await mass();
    total = result.volumes.reduce((sum, volume) => sum + volume, 0);
    expect(result.count).toBe(3);
    expect(Math.abs(total - EXPECTED_TOTAL_MM3) / EXPECTED_TOTAL_MM3).toBeLessThan(0.01);
  });
});
