/**
 * T2：边选择器真栈验收（CAP_EDGE → 持久边 → 标准 FeatureOp）。
 *
 * 合成链路（test-only）：圆草图 → 10 mm 拉伸 → 端盖圆边 1 mm 倒角。
 * 边由页面 dev-only 只读拓扑枚举 → 本仓几何唯一匹配 → resolveEdgeRef →
 * chamfer FeatureOp；不新增产品建模 API，也不猜任意边 id。
 *
 * 2026-11-06 追加真实 PS：Tutorial 2 iOS First Part（sketch + 2 extrude +
 * chamfer）。imprintFace 由 runner 按“查询引用的草图实体作为孔洞边界”选择
 * 草图面域（face split 仍未实现，步骤标 approximate），随后倒角边正常解析。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  getApiToken,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
} from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import {
  ensureExampleImodel,
  openExampleEditor,
  pushExampleChanges,
} from './imodel.js';
import { DEFAULT_DATA_ROOT, isExampleDataAvailable } from './registry.js';
import { resolveScenarioEdges } from './replay/edge-resolver.js';
import { runScenario } from './replay/run.js';
import type { ParityScenario } from './replay/scenario-to-op.js';

const EXAMPLE_NAME = 'E2E - Edge Selector';
const IOS_SCENARIO = path.join(
  DEFAULT_DATA_ROOT,
  'scenarios',
  'Tutorial-2---Build-Your-First-Part---iOS-25c55355695ddf868ec46c44.scenario.json',
);
const CYLINDER_VOLUME_MM3 = Math.PI * 5 * 5 * 10;
/** 45° 等距 1 mm 圆边倒角：三角形截面 0.5，形心半径 R−1/3。 */
const CHAMFER_LOSS_MM3 = Math.PI * (5 - 1 / 3);
const EXPECTED_VOLUME_MM3 = CYLINDER_VOLUME_MM3 - CHAMFER_LOSS_MM3;

function syntheticScenario(): ParityScenario {
  return {
    schemaVersion: 1,
    id: 'e2e-cap-edge-synthetic',
    name: 'T2 CAP_EDGE synthetic',
    units: 'mm',
    features: [
      {
        type: 'sketch',
        name: 'Sketch 1',
        sourceFeatureId: 'sketch-1',
        params: {
          plane: {
            origin: { x: 0, y: 0, z: 0 },
            normal: { x: 0, y: 0, z: 1 },
            xDir: { x: 1, y: 0, z: 0 },
          },
          entities: [
            { kind: 'circle', id: 1, center: { x: 0, y: 0 }, radius: 5 },
          ],
          constraints: [],
        },
      },
      {
        type: 'extrude',
        name: 'Extrude 1',
        sourceFeatureId: 'extrude-1',
        params: {
          operation: 'new',
          endBound: 'blind',
          depthMm: 10,
          symmetric: false,
          oppositeDirection: false,
          selection: {
            kind: 'sketchRegions',
            sketchFeatureId: 'sketch-1',
            regionIndex: 0,
            regions: [0],
          },
        },
      },
      {
        type: 'chamfer',
        name: 'Chamfer 1',
        sourceFeatureId: 'chamfer-1',
        params: {
          chamferType: 'EQUAL_OFFSETS',
          widthMm: 1,
          width1Mm: 1,
          width2Mm: 1,
          angleDeg: 45,
          tangentPropagation: true,
          edges: [
            {
              selector: {
                kind: 'capEdge',
                sketchFeatureId: 'sketch-1',
                sketchEntityId: 1,
                sketchEntityKind: 'circle',
                isStart: false,
                operationSourceIds: ['extrude-1'],
              },
            },
          ],
        },
      },
    ],
    expected: { volumeM3: EXPECTED_VOLUME_MM3 * 1e-9, bodyCount: 1 },
    provenance: { capturedAt: '2026-11-06', status: 'complete', missing: [] },
  };
}

test.describe('T2 edge selector replay', () => {
  test('CAP_EDGE 倒角 → 3 特征/体积/推送重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, EXAMPLE_NAME, { reset: true });
    const ctx = await openExampleEditor(page, ids);
    const scenario = syntheticScenario();

    const built = await runScenario(ctx, scenario, token, {
      edgeResolver: (feature, fullScenario) =>
        resolveScenarioEdges(page, ctx, fullScenario, feature, token),
    });
    expect(built.featureIds.length).toBe(3);
    expect(built.steps.map((step) => step.type)).toEqual(['sketch', 'extrude', 'chamfer']);
    // 边解析必须真的发生（不允许空 refs 冒充通过）。
    expect(built.notes.some((note) => note.includes('edgeResolver=Chamfer 1'))).toBe(true);

    await page.reload();
    await openExampleEditor(page, ids);
    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'chamfer']);
    expect(tree.every((row) => row.status === 0)).toBe(true);

    const mass = await getMassPropertiesRpc(ctx, token);
    expect(mass.length).toBe(1);
    const volume = mass.reduce((sum, item) => sum + item.volume, 0);
    console.log(
      `[edge-selector] volume=${volume.toFixed(3)} expected≈${EXPECTED_VOLUME_MM3.toFixed(3)} ` +
      `cylinder=${CYLINDER_VOLUME_MM3.toFixed(3)}`,
    );
    expect(volume).toBeLessThan(CYLINDER_VOLUME_MM3);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.02);

    await pushExampleChanges(page, 'T2 edge selector replay');
    await page.reload();
    await openExampleEditor(page, ids);
    const reopened = await getFeatureTreeRpc(ctx, token);
    expect(reopened.map((row) => row.featureType)).toEqual(tree.map((row) => row.featureType));
    const reopenedVolume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(reopenedVolume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.02);
  });

  /**
   * 真实 PS 验收：Tutorial 2 iOS First Part。
   * - imprintFace：Extrude 2 的查询引用草图圆 5；runner 选择“圆 5 为孔洞边界”
   *   的最大面域（region 1），保留内孔；
   * - chamfer：3 条 CAP_EDGE 由 edgeResolver 解析；
   * - 目标体积取采集 per-part nominal（157,478.9 mm³）。
   * 约束以 skip 保留 Onshape 解算坐标（converter 有 HORIZONTAL 单点缺口），
   * notes 必须登记 constraints=dropped。
   */
  test('真实 iOS First Part：imprint 面域 + 3 条 CAP_EDGE 倒角', async ({ page, request }) => {
    test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - iOS Imprint', { reset: true });
    const ctx = await openExampleEditor(page, ids);
    const scenario = JSON.parse(readFileSync(IOS_SCENARIO, 'utf8')) as ParityScenario;
    const expected = ((scenario.expected as { volumeM3?: number } | undefined)?.volumeM3 ?? 0) * 1e9;
    expect(expected).toBeGreaterThan(0);

    const built = await runScenario(ctx, scenario, token, {
      skipSketchConstraints: true,
      edgeResolver: (feature, fullScenario) =>
        resolveScenarioEdges(page, ctx, fullScenario, feature, token),
    });
    expect(built.steps.map((step) => step.type)).toEqual(['sketch', 'extrude', 'extrude', 'chamfer']);
    expect(built.notes.some((note) => note.includes('imprintFace→草图面域 1'))).toBe(true);
    expect(built.notes.some((note) => note.includes('edgeResolver=Chamfer 1'))).toBe(true);

    await page.reload();
    await openExampleEditor(page, ids);
    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'extrude', 'chamfer']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const mass = await getMassPropertiesRpc(ctx, token);
    expect(mass.length).toBe(1);
    const volume = mass.reduce((sum, item) => sum + item.volume, 0);
    console.log(`[ios-imprint] volume=${volume.toFixed(3)} expected=${expected.toFixed(3)}`);
    expect(Math.abs(volume - expected) / expected).toBeLessThan(0.005);

    await pushExampleChanges(page, 'T2/T4 iOS imprint + cap edge');
    await page.reload();
    await openExampleEditor(page, ids);
    const reopened = await getFeatureTreeRpc(ctx, token);
    expect(reopened.map((row) => row.featureType)).toEqual(tree.map((row) => row.featureType));
    const reopenedVolume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(reopenedVolume - expected) / expected).toBeLessThan(0.005);
  });

  // 真实 PS 探针（Exercise: Hand Brake Update / Master Cylinder Piston，2026-11-06）：
  // SWEPT_EDGE 已由 `$left` 相邻实体消歧到唯一共享端点，revolve + chamfer 均 status=0；
  // 但 revolve 的 region 0 映射产物体积 5358.127 vs 采集 7125.274 mm³（−24.8%），
  // 阻塞在**面域索引**而非边选择器。该探针不作为绿门，待 T4 区域解析后回访。
});
