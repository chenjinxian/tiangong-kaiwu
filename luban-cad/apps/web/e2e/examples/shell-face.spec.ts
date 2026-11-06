/**
 * ADR-0008 第一切片真栈验收（合成）：shell 移除面解析。
 *
 * 链路：草图矩形 [0,10]×[0,10] + 轴线 x=0 → 全周 Revolve 成实心圆柱 R10×10
 *   → shell 移除顶面（revolve SWEPT_FACE 端面）→ 内缩 2 mm，得开口杯。
 * 体积解析：原件 π·10²·10 = 3141.593；内腔 π·8²·8（底壁 2 mm、开口顶）
 *   = 1608.495；杯体 = 1533.098 mm³。
 * 面 query 由 shellFaceResolver 按轴线段/平面/外半径唯一匹配 → resolveFaceRef；
 * 与 Gaiter 使用同一 converter 形状（不依赖数据仓）。
 */
import { expect, test } from '@playwright/test';
import type { FeatureOp, SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import {
  getApiToken,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
} from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { ensureExampleImodel, openExampleEditor } from './imodel.js';
import { runScenario } from './replay/run.js';
import type { ParityScenario } from './replay/scenario-to-op.js';
import { resolveScenarioShellFaces } from './replay/shell-face-resolver.js';

const XY_PLANE = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

function syntheticScenario(): ParityScenario {
  // 内联坐标（与 converter 产物同形）：实心矩形 [0,10]×[0,10] + 轴线 x=0。
  const entities: SketchEntityDto[] = [
    { kind: 'line', id: 11, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
    { kind: 'line', id: 12, p1: { x: 10, y: 0 }, p2: { x: 10, y: 10 } },
    { kind: 'line', id: 13, p1: { x: 10, y: 10 }, p2: { x: 0, y: 10 } },
    { kind: 'line', id: 14, p1: { x: 0, y: 10 }, p2: { x: 0, y: 0 } },
    { kind: 'line', id: 15, p1: { x: 0, y: 0 }, p2: { x: 0, y: 10 }, construction: true },
  ];
  const constraints: SketchConstraintDto[] = [];
  return {
    schemaVersion: 1,
    id: 'e2e-shell-face-synthetic',
    name: 'shell face synthetic',
    units: 'mm',
    features: [
      {
        type: 'sketch',
        name: 'Sketch 1',
        sourceFeatureId: 'sketch-1',
        params: { plane: XY_PLANE, entities, constraints },
      },
      {
        type: 'revolve',
        name: 'Revolve 1',
        sourceFeatureId: 'revolve-1',
        params: {
          sketchFeatureId: 'sketch-1',
          regions: [0],
          axisSketchEntityId: 15,
          fullRevolve: true,
          operation: 'new',
        },
      },
      {
        type: 'shell',
        name: 'Shell 1',
        sourceFeatureId: 'shell-1',
        params: {
          defaultDistance: 2,
          distances: 2,
          oppositeDirection: false,
          selection: {
            kind: 'faceQueries',
            queries: [
              {
                kind: 'sweptFace',
                sketchFeatureId: 'sketch-1',
                sketchEntityId: 13,
                operationSourceIds: ['revolve-1'],
              },
            ],
          },
        },
      },
    ],
  };
}

const EXPECTED_VOLUME_MM3 = Math.PI * (10 * 10 * 10 - 8 * 8 * 8);

test.describe('shell 移除面真栈验收', () => {
  test('revolve 顶面移除 + 内缩 2 mm → 开口杯 1533.098 mm³', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Shell Face', { reset: true });
    // 冷 baseline 首次下载可能超过单次画布等待；失败后 reload 一次（缓存已落）。
    const openWithRetry = async (target: { itwinId: string; imodelId: string } = ids) => {
      try {
        return await openExampleEditor(page, target);
      } catch {
        await page.reload();
        return openExampleEditor(page, target);
      }
    };
    const ctx = await openWithRetry();
    const scenario = syntheticScenario();

    const built = await runScenario(ctx, scenario, token, {
      shellFaceResolver: (feature, fullScenario) =>
        resolveScenarioShellFaces(page, ctx, fullScenario, feature, token),
    });
    expect(built.steps.map((step) => step.type)).toEqual(['sketch', 'revolve', 'shell']);
    const shellStep = built.steps.find((step) => step.type === 'shell');
    expect(shellStep?.approximate).toBe(false);
    expect(shellStep?.notes.join(' ')).toContain('shell faces=1');

    const mass = await getMassPropertiesRpc(ctx, token);
    expect(mass.length).toBe(1);
    const volume = mass.reduce((sum, item) => sum + item.volume, 0);
    console.log(`[shell-face] volume=${volume.toFixed(3)} expected=${EXPECTED_VOLUME_MM3.toFixed(3)}`);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.01);

    await page.reload();
    const reopened = await openWithRetry({ itwinId: ids.itwinId, imodelId: ids.imodelId });
    const tree = await getFeatureTreeRpc(reopened, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'revolve', 'shell']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const reopenedVolume = (await getMassPropertiesRpc(reopened, token))
      .reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(reopenedVolume - volume) / volume).toBeLessThan(0.005);
  });
});
