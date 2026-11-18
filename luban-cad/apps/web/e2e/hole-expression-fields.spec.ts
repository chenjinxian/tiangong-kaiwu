/**
 * ADR-0020 S8 真栈验收：孔沉头/锥口字段表达式（web UI，shared 1.78）。
 *
 * 前置（未发布，本机必须就绪）：
 * - shared 1.78 工作树（`HoleParams.counterboreDiameterExpression?/
 *   counterboreDepthExpression?`、`countersinkDiameterExpression?/
 *   countersinkAngleExpression?`）+ 新后端 modeling-server（写/预览边界权威
 *   求值并物化 `counterboreDiameterMm`/`counterboreDepthMm`/`countersinkDiameterMm`/
 *   `countersinkAngleDeg`，`updateVariables` 传播物化），以源码模式启动 MS：
 *   `scripts/start-ms-host.ps1 -Source <luban-backend>\modeling-server`。
 * - Vite 以 `VITE_EDITOR_AUTOSAVE=0` + `VITE_B_MODEL_ENABLED=true
 *   VITE_E2E_HOOKS=true` 运行（其余真栈 spec 同）。
 *
 * 链路（20×20×10 板体 + 独立单点草图作孔位；锥口形态由
 * `HoleDialog.test.tsx` 单测覆盖，真栈只走沉头孔）：
 * 1) RPC 建变量 w=10（length）/ h=5（length）+ 20×20 草图 + 拉伸 10 +
 *    单点草图 (10,10)；
 * 2) UI 孔：孔位草图=单点草图 → 点 1 → 沉头孔 → 主孔 `#w`、沉头直径
 *    `#w*1.5`（失焦求值 15）、沉头深度 `#h`（失焦求值 5）→ 完全贯穿 →
 *    树 params `{holeStyle:'counterbore', diameterMm:10, diameterExpression:'#w',
 *    counterboreDiameterMm:15, counterboreDiameterExpression:'#w*1.5',
 *    counterboreDepthMm:5, counterboreDepthExpression:'#h'}`、status=0、
 *    体积 = 4000 − (π·25·10 + π·(56.25−25)·5) ≈ 2723.728 mm³；
 * 3) 变量 h 5→3 → 后端物化 counterboreDepthMm=3、体积增至 ≈ 2920.078；
 * 4) 原生 Ribbon Undo 一次 → h=5 / 快照 5 / 体积恢复，Redo → 3；
 * 5) push + 冷重开：表达式/物化值/几何保持（体积与 Redo 后一致）。
 */
import { expect, test } from '@playwright/test';
import type {
  FeatureOp,
  SketchConstraintDto,
  SketchEntityDto,
  SketchPlaneDto,
} from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
  getVariablesRpc,
  openSeedImodelEditor,
  releaseWriteLease,
} from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { pushExampleChanges } from './examples/imodel.js';

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

/** 20×20 方形草图（8 点 + 4 线 + 10 约束；与 feature-expression-fields 同形）。 */
function rectangleSketch(
  width: number,
  height: number,
): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
  return {
    entities: [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: width, y: 0 },
      { kind: 'point', id: 3, x: width, y: height },
      { kind: 'point', id: 4, x: 0, y: height },
      { kind: 'point', id: 5, x: 0, y: 0 },
      { kind: 'point', id: 6, x: width, y: 0 },
      { kind: 'point', id: 7, x: width, y: height },
      { kind: 'point', id: 8, x: 0, y: height },
      { kind: 'line', id: 11, p1: 5, p2: 6 },
      { kind: 'line', id: 12, p1: 6, p2: 7 },
      { kind: 'line', id: 13, p1: 7, p2: 8 },
      { kind: 'line', id: 14, p1: 8, p2: 5 },
    ],
    constraints: [
      { kind: 'coincident', id: 21, refs: [1, 5] },
      { kind: 'coincident', id: 22, refs: [2, 6] },
      { kind: 'coincident', id: 23, refs: [3, 7] },
      { kind: 'coincident', id: 24, refs: [4, 8] },
      { kind: 'horizontal', id: 25, refs: [11] },
      { kind: 'horizontal', id: 26, refs: [13] },
      { kind: 'vertical', id: 27, refs: [12] },
      { kind: 'vertical', id: 28, refs: [14] },
      { kind: 'distance', id: 29, refs: [1, 2], value: width },
      { kind: 'distance', id: 30, refs: [2, 3], value: height },
    ],
  };
}

/** 20×20×10 板体；沉头孔去除量（主孔 Ø10 贯穿 + Ø15×5 环带）。 */
const PLATE_VOLUME_MM3 = 20 * 20 * 10;
// 主孔 Ø10 → r=5（面积 π·25）；沉头 Ø15 → r=7.5（环面积 π·(56.25−25)）。
// 2026-11-18 首跑发现常量误用 r=2.5（Ø5）——实测体积 2723.750 与正确公式一致。
const COUNTERBORE_REMOVED_MM3 = Math.PI * (5 * 5 * 10 + (7.5 * 7.5 - 5 * 5) * 5);
const COUNTERBORE_DEPTH3_REMOVED_MM3 = Math.PI * (5 * 5 * 10 + (7.5 * 7.5 - 5 * 5) * 3);

async function openWithRetry(
  page: import('@playwright/test').Page,
  seed: Awaited<ReturnType<typeof resetBModelSeed>>,
) {
  try {
    return await openSeedImodelEditor(page, seed);
  } catch {
    await page.reload();
    return await openSeedImodelEditor(page, seed);
  }
}

async function volumeOf(
  ctx: Awaited<ReturnType<typeof openSeedImodelEditor>>,
  token: string,
): Promise<number> {
  const bodies = await getMassPropertiesRpc(ctx, token);
  return bodies.reduce((max, body) => Math.max(max, body.volume), 0);
}

/** 沉头孔行不得夹带任何锥口（countersink）物化/表达式键（样式切换清除口径）。 */
function expectNoCountersinkKeys(params: Record<string, unknown>): void {
  for (const key of [
    'countersinkDiameterMm',
    'countersinkAngleDeg',
    'countersinkDiameterExpression',
    'countersinkAngleExpression',
  ]) {
    expect(key in params, `counterbore 行不应携带 ${key}`).toBe(false);
  }
}

test.describe('ADR-0020 S8 孔沉头字段表达式（真栈）', () => {
  test('`#w` 主孔 + 沉头直径/深度表达式 → 参数/变量重算/undo-redo/push 冷重开', async ({
    page, request,
  }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openWithRetry(page, seed);
    let pointSketchId: string;
    const lease = await borrowWriteLease(ctx, token, 'hole-expression-fields-ui');
    try {
      let result = await applyFeatureOpRpc(ctx, {
        kind: 'updateVariables',
        variables: [
          { id: 'v1', name: 'w', expression: '10', type: 'length' },
          { id: 'v2', name: 'h', expression: '5', type: 'length' },
        ],
      } as FeatureOp, lease, token);
      assertFeatureOpOk(result, '建变量 w=10 / h=5');
      const plate = rectangleSketch(20, 20);
      result = await applyFeatureOpRpc(ctx, {
        kind: 'insertSketch',
        entities: plate.entities,
        constraints: plate.constraints,
        plane: XY_PLANE,
      } as FeatureOp, lease, token);
      assertFeatureOpOk(result, '20×20 板草图');
      const plateSketchId = result.featureId!;
      result = await applyFeatureOpRpc(ctx, {
        kind: 'insertFeature',
        featureType: 'extrude',
        params: {
          profile: [], distance: 10, sketchId: plateSketchId, regions: [0], operation: 'new',
        },
      } as FeatureOp, lease, token);
      assertFeatureOpOk(result, '20×20×10 板体');
      result = await applyFeatureOpRpc(ctx, {
        kind: 'insertSketch',
        entities: [{ kind: 'point', id: 1, x: 10, y: 10 }],
        constraints: [],
        plane: XY_PLANE,
      } as FeatureOp, lease, token);
      assertFeatureOpOk(result, '孔位草图（单点 10,10）');
      pointSketchId = result.featureId!;
    } finally {
      await releaseWriteLease(ctx, lease, token);
    }

    await page.reload();
    ctx = await openWithRetry(page, seed);
    const plateVolume = await volumeOf(ctx, token);
    expect(plateVolume).toBeCloseTo(PLATE_VOLUME_MM3, 0);

    // ── UI 孔：孔位草图 → 点 1 → 沉头孔 + 表达式 ────────────────────────
    await page.getByRole('button', { name: '孔', exact: true }).click({ timeout: 30_000 });
    const dialog = page.getByTestId('part-studio-hole-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog.getByTestId('hole-sketch-select').selectOption(pointSketchId);
    await dialog.getByTestId('hole-locations-toggle').click();
    await expect(dialog.getByTestId('hole-points')).toBeVisible({ timeout: 30_000 });
    await dialog.getByLabel('点 1').check();
    await dialog.getByText('沉头孔').click();

    const diameter = dialog.getByTestId('hole-diameter');
    const cboreDiameter = dialog.getByTestId('hole-cbore-diameter');
    const cboreDepth = dialog.getByTestId('hole-cbore-depth');
    await expect(cboreDiameter).toHaveAttribute('data-expression-field', 'length');
    await expect(cboreDepth).toHaveAttribute('data-expression-field', 'length');
    await diameter.click();
    await diameter.fill('#w');
    expect(await diameter.inputValue()).toBe('#w'); // 聚焦=表达式原文
    await page.keyboard.press('Tab');
    await expect(diameter).toHaveValue('10'); // 失焦=本地求值（w=10）
    await cboreDiameter.click();
    await cboreDiameter.fill('#w*1.5');
    expect(await cboreDiameter.inputValue()).toBe('#w*1.5');
    await page.keyboard.press('Tab');
    await expect(cboreDiameter).toHaveValue('15');
    await cboreDepth.click();
    await cboreDepth.fill('#h');
    expect(await cboreDepth.inputValue()).toBe('#h');
    await page.keyboard.press('Tab');
    await expect(cboreDepth).toHaveValue('5');
    await dialog.getByTestId('hole-end-bound').selectOption('throughAll');
    const confirm = dialog.getByRole('button', { name: '确认' });
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    await confirm.click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'hole']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const holeRow = tree.find((row) => row.featureType === 'hole')!;
    const holeId = holeRow.id;
    expect(holeRow.params).toMatchObject({
      holeStyle: 'counterbore',
      diameterMm: 10,
      diameterExpression: '#w',
      counterboreDiameterMm: 15,
      counterboreDiameterExpression: '#w*1.5',
      counterboreDepthMm: 5,
      counterboreDepthExpression: '#h',
      endBound: 'throughAll',
    });
    expectNoCountersinkKeys(holeRow.params as Record<string, unknown>);
    const holeVolume = await volumeOf(ctx, token);
    console.log(`[hole-expression] volume=${holeVolume.toFixed(3)} expected=${(PLATE_VOLUME_MM3 - COUNTERBORE_REMOVED_MM3).toFixed(3)}`);
    expect(Math.abs(holeVolume - (PLATE_VOLUME_MM3 - COUNTERBORE_REMOVED_MM3))).toBeLessThan(1);

    // ── 变量 h 5→3：后端物化 counterboreDepthMm=3，几何少去材 ───────────
    const variableRow = page.getByTestId('tree-variable-v2');
    await expect(variableRow).toBeVisible({ timeout: 60_000 });
    await variableRow.dblclick({ timeout: 30_000 });
    const variablesDialog = page.getByTestId('variables-dialog');
    await expect(variablesDialog).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('variables-name-input')).toHaveValue('h');
    await page.getByTestId('variables-value-input').fill('3');
    await page.getByTestId('variables-value-input').press('Tab');
    await expect(page.getByTestId('variables-confirm')).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId('variables-confirm').click();
    await expect(variablesDialog).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(async () => {
      const rows = await getFeatureTreeRpc(ctx, token);
      const row = rows.find((entry) => entry.featureType === 'hole');
      return (row?.params as { counterboreDepthMm?: number } | undefined)?.counterboreDepthMm;
    }, { timeout: 90_000, intervals: [2000, 5000, 10_000] }).toBe(3);
    await expect.poll(async () => (await volumeOf(ctx, token)) - holeVolume, {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeGreaterThan(100);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.find((row) => row.featureType === 'hole')!.params).toMatchObject({
      counterboreDepthMm: 3,
      counterboreDiameterExpression: '#w*1.5',
      counterboreDepthExpression: '#h',
    });
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(await getVariablesRpc(ctx, token)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'v1', name: 'w', expression: '10', type: 'length' }),
      expect.objectContaining({ id: 'v2', name: 'h', expression: '3', type: 'length' }),
    ]));
    const depth3Volume = await volumeOf(ctx, token);
    expect(Math.abs(depth3Volume - (PLATE_VOLUME_MM3 - COUNTERBORE_DEPTH3_REMOVED_MM3))).toBeLessThan(1);

    // ── 原生 Ribbon Undo 一次 → h=5 / 快照 5 / 体积恢复；Redo → 3 ───────
    const undoButton = page.getByTestId('part-studio-ribbon-undo');
    await expect(undoButton).toBeEnabled({ timeout: 30_000 });
    await undoButton.click();
    await expect.poll(async () => {
      const rows = await getFeatureTreeRpc(ctx, token);
      const row = rows.find((entry) => entry.featureType === 'hole');
      return (row?.params as { counterboreDepthMm?: number } | undefined)?.counterboreDepthMm;
    }, { timeout: 90_000, intervals: [2000, 5000, 10_000] }).toBe(5);
    await expect.poll(async () => Math.abs((await volumeOf(ctx, token)) - holeVolume), {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeLessThan(0.5);
    const undoneRow = (await getFeatureTreeRpc(ctx, token))
      .find((row) => row.featureType === 'hole')!;
    expect(undoneRow.params).toMatchObject({
      counterboreDiameterExpression: '#w*1.5',
      counterboreDepthExpression: '#h',
    });
    const redoButton = page.getByTestId('part-studio-ribbon-redo');
    await expect(redoButton).toBeEnabled({ timeout: 30_000 });
    await redoButton.click();
    await expect.poll(async () => {
      const rows = await getFeatureTreeRpc(ctx, token);
      const row = rows.find((entry) => entry.featureType === 'hole');
      return (row?.params as { counterboreDepthMm?: number } | undefined)?.counterboreDepthMm;
    }, { timeout: 90_000, intervals: [2000, 5000, 10_000] }).toBe(3);
    await expect.poll(async () => Math.abs((await volumeOf(ctx, token)) - depth3Volume), {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeLessThan(0.5);
    const redoVolume = await volumeOf(ctx, token);

    // ── push + 冷重开：表达式/物化值/几何保持 ───────────────────────────
    await pushExampleChanges(page, 'hole counterbore expression UI acceptance');
    await page.reload();
    ctx = await openWithRetry(page, seed);
    await expect(page.getByTestId(`tree-row-${holeId}`)).toBeVisible({ timeout: 60_000 });
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'hole']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const coldHoleParams = tree.find((row) => row.featureType === 'hole')!.params as Record<string, unknown>;
    expect(coldHoleParams).toMatchObject({
      holeStyle: 'counterbore',
      diameterMm: 10,
      diameterExpression: '#w',
      counterboreDiameterMm: 15,
      counterboreDiameterExpression: '#w*1.5',
      counterboreDepthMm: 3,
      counterboreDepthExpression: '#h',
    });
    expectNoCountersinkKeys(coldHoleParams);
    // 冷重开几何必须是 depth-3 的精确体积，而不只是“等于 live redo 读数”。
    await expect.poll(async () => Math.abs(
      (await volumeOf(ctx, token)) - (PLATE_VOLUME_MM3 - COUNTERBORE_DEPTH3_REMOVED_MM3),
    ), { timeout: 90_000, intervals: [2000, 5000, 10_000] }).toBeLessThan(1);
    await expect.poll(async () => Math.abs((await volumeOf(ctx, token)) - redoVolume), {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeLessThan(0.5);
  });
});
