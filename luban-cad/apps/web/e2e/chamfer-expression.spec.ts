/**
 * ADR-0020 S7 真栈验收：倒角数值字段表达式（web UI，shared 1.77）。
 *
 * 前置（未发布，本机必须就绪）：
 * - shared 1.77 工作树（`ChamferParams.values1Expression/values2Expression`）
 *   + 新后端 modeling-server（写/预览边界权威求值、`updateVariables` 传播
 *   物化 `values1`/`values2`），以源码模式启动 MS：
 *   `scripts/start-ms-host.ps1 -Source <luban-backend>\modeling-server`。
 * - Vite 以 `VITE_EDITOR_AUTOSAVE=0` + `VITE_B_MODEL_ENABLED=true
 *   VITE_E2E_HOOKS=true` 运行（其余真栈 spec 同）。
 *
 * 链路（20×20×10 盒体，本切片真栈只覆盖距离-角度；等距离/两个距离由
 * `FeatureDialog.test.tsx` 单测覆盖）：
 * 1) RPC 建变量 sp=2（length）/ ang=45（angle）+ 草图 + 拉伸盒体；
 * 2) UI 倒角 距离和角度：距离 `#sp`（聚焦原文/失焦求值 2）+ 角度 `#ang`
 *    （度求值 45，载荷弧度 π/4）→ 树 params
 *    `{mode:3, values1:2, values1Expression:'#sp', values2Expression:'#ang'}`、
 *    `values2≈π/4`、status=0、体积小于盒体；
 * 3) 树行双击编辑回显：失焦=物化数、聚焦=表达式原文；取消零写（树 params 不变）；
 * 4) 变量 sp 2→4 → 后端物化 values1=4 且几何更新（体积进一步下降）；
 * 5) 原生 Ribbon Undo 一次 → sp=2/values1=2/体积恢复，Redo → 4；两条路径均
 *    保持 values2=π/4 与两个表达式原文；
 * 6) push + 冷重开：体积与 Redo 后完全一致 + 表达式/物化值保持。
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
  releaseWriteLease, reloadWithFlush } from './helpers';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { pushExampleChanges } from './examples/imodel.js';
import { frameStandardView, projectWorld } from './tutorial2-helpers.js';

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

const BOX_RANGE = { low: { x: 0, y: 0, z: 0 }, high: { x: 20, y: 20, z: 10 } };

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

async function openWithRetry(
  page: import('@playwright/test').Page,
  seed: Awaited<ReturnType<typeof resetBModelSeed>>,
) {
  try {
    return await openSeedImodelEditor(page, seed);
  } catch {
    await reloadWithFlush(page);
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

/** 边拾取（feature-expression-fields 同款 boresite 采样）：命中至少一条边即停。 */
async function pickOneEdge(
  page: import('@playwright/test').Page,
  dialog: import('@playwright/test').Locator,
): Promise<void> {
  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('画布不可用');
  const candidates = [
    { x: 0, y: 0, z: 5 },
    { x: 20, y: 0, z: 5 },
    { x: 20, y: 20, z: 5 },
    { x: 0, y: 20, z: 5 },
    { x: 10, y: 0, z: 10 },
    { x: 20, y: 10, z: 10 },
    { x: 10, y: 20, z: 10 },
    { x: 0, y: 10, z: 10 },
  ];
  const screens = await projectWorld(page, { x: box.x, y: box.y }, candidates);
  const chipCount = async (): Promise<number> =>
    dialog.getByTestId('part-studio-feature-dialog-edge-chips').locator('li').count()
      .catch(() => 0);
  for (const screen of screens) {
    if (await chipCount() > 0) break;
    await page.mouse.move(screen.x - 15, screen.y + 12);
    await page.waitForTimeout(120);
    await page.mouse.move(screen.x, screen.y);
    await page.waitForTimeout(350);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(500);
  }
  expect(await chipCount(), '应在盒体上拾到至少一条边').toBeGreaterThan(0);
}

test.describe('ADR-0020 S7 倒角距离-角度表达式（真栈）', () => {
  test('`#sp` + `#ang` → 参数/编辑回显/变量重算/undo-redo/push 冷重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openWithRetry(page, seed);
    const sketch = rectangleSketch(20, 20);
    let extrudeId: string;
    const lease = await borrowWriteLease(ctx, token, 'chamfer-expression-ui');
    try {
      let result = await applyFeatureOpRpc(ctx, {
        kind: 'updateVariables',
        variables: [
          { id: 'v1', name: 'sp', expression: '2', type: 'length' },
          { id: 'v2', name: 'ang', expression: '45', type: 'angle' },
        ],
      } as FeatureOp, lease, token);
      assertFeatureOpOk(result, '建变量 sp=2 / ang=45');
      result = await applyFeatureOpRpc(ctx, {
        kind: 'insertSketch',
        entities: sketch.entities,
        constraints: sketch.constraints,
        plane: XY_PLANE,
      } as FeatureOp, lease, token);
      assertFeatureOpOk(result, '20×20 草图');
      const sketchId = result.featureId!;
      result = await applyFeatureOpRpc(ctx, {
        kind: 'insertFeature',
        featureType: 'extrude',
        params: {
          profile: [], distance: 10, sketchId, regions: [0], operation: 'new',
        },
      } as FeatureOp, lease, token);
      assertFeatureOpOk(result, '20×20×10 盒体');
      extrudeId = result.featureId!;
    } finally {
      await releaseWriteLease(ctx, lease, token);
    }

    await reloadWithFlush(page);
    ctx = await openWithRetry(page, seed);
    await expect(page.getByTestId(`tree-row-${extrudeId}`)).toBeVisible({ timeout: 60_000 });
    const boxVolume = await volumeOf(ctx, token);
    expect(boxVolume).toBeCloseTo(4000, 0);

    // 1) UI 倒角 距离和角度：距离 `#sp`、角度 `#ang`。
    await frameStandardView(page, 6, BOX_RANGE, { left: 0.35, right: 0.05, top: 0.1, bottom: 0.1 });
    await page.getByRole('button', { name: '倒角', exact: true }).click({ timeout: 30_000 });
    const dialog = page.getByTestId('part-studio-feature-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('combobox', { name: '倒角类型' }).selectOption('distanceAngle');
    const distance = dialog.getByRole('textbox', { name: '距离' });
    const angle = dialog.getByRole('textbox', { name: '角度' });
    await expect(distance).toHaveAttribute('data-expression-field', 'length');
    await expect(angle).toHaveAttribute('data-expression-field', 'angleRadFromDeg');
    await distance.click();
    await distance.fill('#sp');
    expect(await distance.inputValue()).toBe('#sp'); // 聚焦=表达式原文
    await page.keyboard.press('Tab');
    await expect(distance).toHaveValue('2'); // 失焦=本地求值（sp=2）
    await angle.click();
    await angle.fill('#ang');
    expect(await angle.inputValue()).toBe('#ang');
    await page.keyboard.press('Tab');
    await expect(angle).toHaveValue('45'); // 度书写；提交为契约弧度
    await dialog.getByTestId('part-studio-feature-dialog-add-edge').click();
    await pickOneEdge(page, dialog);
    await dialog.getByTestId('part-studio-feature-dialog-add-edge').click();
    const confirm = dialog.getByRole('button', { name: '确认' });
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    await confirm.click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    let tree = await getFeatureTreeRpc(ctx, token);
    const chamferRow = tree.find((row) => row.featureType === 'chamfer');
    expect(chamferRow).toBeTruthy();
    const chamferId = chamferRow!.id;
    expect(chamferRow!.status).toBe(0);
    expect(chamferRow!.params).toMatchObject({
      mode: 3,
      values1: 2,
      values1Expression: '#sp',
      values2Expression: '#ang',
    });
    const storedValues2 = (chamferRow!.params as { values2?: number }).values2 ?? Number.NaN;
    expect(storedValues2).toBeCloseTo(Math.PI / 4, 6);
    const chamferVolume = await volumeOf(ctx, token);
    expect(chamferVolume).toBeLessThan(boxVolume);

    // 2) 树行双击编辑回显：失焦=物化数、聚焦=表达式原文；取消不写。
    await page.getByTestId(`tree-row-${chamferId}`).dblclick({ timeout: 30_000 });
    const editDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(editDialog).toBeVisible({ timeout: 30_000 });
    const editDistance = editDialog.getByRole('textbox', { name: '距离' });
    const editAngle = editDialog.getByRole('textbox', { name: '角度' });
    await expect(editDistance).toHaveValue('2', { timeout: 30_000 });
    // 先断言两字段的失焦回显；Tab 会把焦点移到角度字段（聚焦态正确显示表达式，
    // 不是回归），故角度断言放在聚焦距离字段之前。
    await expect(editAngle).toHaveValue('45');
    await editDistance.click();
    await expect(editDistance).toHaveValue('#sp');
    await page.keyboard.press('Tab');
    await expect(editDistance).toHaveValue('2');
    // 焦点已落到角度字段（显示 `#ang`）；聚焦取消钮使其失焦再断言求值数。
    await editDialog.getByRole('button', { name: '取消' }).focus();
    await expect(editAngle).toHaveValue('45');
    await editAngle.click();
    await expect(editAngle).toHaveValue('#ang');
    await page.keyboard.press('Tab');
    await expect(editAngle).toHaveValue('45');
    await editDialog.getByRole('button', { name: '取消' }).click();
    await expect(editDialog).toBeHidden();
    // 取消不得写库：树 params 与提交时完全一致（表达式/物化值均未变）。
    const treeAfterCancel = await getFeatureTreeRpc(ctx, token);
    expect(treeAfterCancel.find((row) => row.featureType === 'chamfer')!.params).toMatchObject({
      mode: 3,
      values1: 2,
      values1Expression: '#sp',
      values2Expression: '#ang',
    });
    expect(((treeAfterCancel.find((row) => row.featureType === 'chamfer')!.params as {
      values2?: number;
    }).values2 ?? Number.NaN)).toBeCloseTo(Math.PI / 4, 6);

    // 3) 变量 sp 2→4：后端把 values1 物化为 4，几何进一步去材（体积下降）。
    const variableRow = page.getByTestId('tree-variable-v1');
    await expect(variableRow).toBeVisible({ timeout: 60_000 });
    await variableRow.dblclick({ timeout: 30_000 });
    const variablesDialog = page.getByTestId('variables-dialog');
    await expect(variablesDialog).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('variables-name-input')).toHaveValue('sp');
    await page.getByTestId('variables-value-input').fill('4');
    await page.getByTestId('variables-value-input').press('Tab');
    await expect(page.getByTestId('variables-confirm')).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId('variables-confirm').click();
    await expect(variablesDialog).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(async () => {
      const rows = await getFeatureTreeRpc(ctx, token);
      const row = rows.find((entry) => entry.featureType === 'chamfer');
      return (row?.params as { values1?: number } | undefined)?.values1;
    }, { timeout: 90_000, intervals: [2000, 5000, 10_000] }).toBe(4);
    await expect.poll(async () => chamferVolume - (await volumeOf(ctx, token)), {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeGreaterThan(10);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.find((row) => row.featureType === 'chamfer')!.params).toMatchObject({
      values1: 4,
      values1Expression: '#sp',
      values2Expression: '#ang',
    });
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(await getVariablesRpc(ctx, token)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'v1', name: 'sp', expression: '4', type: 'length' }),
      expect.objectContaining({ id: 'v2', name: 'ang', expression: '45', type: 'angle' }),
    ]));

    // 4) 原生 Ribbon Undo 一次 → sp=2 / values1=2 / 体积恢复；Redo → 4。
    const undoButton = page.getByTestId('part-studio-ribbon-undo');
    await expect(undoButton).toBeEnabled({ timeout: 30_000 });
    await undoButton.click();
    await expect.poll(async () => {
      const rows = await getFeatureTreeRpc(ctx, token);
      const row = rows.find((entry) => entry.featureType === 'chamfer');
      return (row?.params as { values1?: number } | undefined)?.values1;
    }, { timeout: 90_000, intervals: [2000, 5000, 10_000] }).toBe(2);
    await expect.poll(async () => Math.abs((await volumeOf(ctx, token)) - chamferVolume), {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeLessThan(0.5);
    // undo 后角度表达式/物化弧度同样保持（只回退变量与距离，不丢 values2）。
    const undoneRow = (await getFeatureTreeRpc(ctx, token))
      .find((row) => row.featureType === 'chamfer')!;
    expect(undoneRow.params).toMatchObject({
      values1Expression: '#sp',
      values2Expression: '#ang',
    });
    expect(((undoneRow.params as { values2?: number }).values2 ?? Number.NaN))
      .toBeCloseTo(Math.PI / 4, 6);
    const redoButton = page.getByTestId('part-studio-ribbon-redo');
    await expect(redoButton).toBeEnabled({ timeout: 30_000 });
    await redoButton.click();
    await expect.poll(async () => {
      const rows = await getFeatureTreeRpc(ctx, token);
      const row = rows.find((entry) => entry.featureType === 'chamfer');
      return (row?.params as { values1?: number } | undefined)?.values1;
    }, { timeout: 90_000, intervals: [2000, 5000, 10_000] }).toBe(4);
    const redoneRow = (await getFeatureTreeRpc(ctx, token))
      .find((row) => row.featureType === 'chamfer')!;
    expect(redoneRow.params).toMatchObject({
      values1: 4,
      values1Expression: '#sp',
      values2Expression: '#ang',
    });
    expect(((redoneRow.params as { values2?: number }).values2 ?? Number.NaN))
      .toBeCloseTo(Math.PI / 4, 6);
    // Redo 后几何回到物化 4 的状态；冷重开必须保持同一体积（不是仅“小于盒体”）。
    await expect.poll(async () => chamferVolume - (await volumeOf(ctx, token)), {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeGreaterThan(10);
    const redoVolume = await volumeOf(ctx, token);

    // 5) push + 冷重开：表达式/物化值/几何保持。
    await pushExampleChanges(page, 'chamfer distance-angle expression UI acceptance');
    await reloadWithFlush(page);
    ctx = await openWithRetry(page, seed);
    await expect(page.getByTestId(`tree-row-${chamferId}`)).toBeVisible({ timeout: 60_000 });
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'chamfer']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree.find((row) => row.featureType === 'chamfer')!.params).toMatchObject({
      mode: 3,
      values1: 4,
      values1Expression: '#sp',
      values2Expression: '#ang',
    });
    expect(((tree.find((row) => row.featureType === 'chamfer')!.params as { values2?: number }).values2 ?? Number.NaN))
      .toBeCloseTo(Math.PI / 4, 6);
    await expect.poll(async () => Math.abs((await volumeOf(ctx, token)) - redoVolume), {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeLessThan(0.5);
  });
});
