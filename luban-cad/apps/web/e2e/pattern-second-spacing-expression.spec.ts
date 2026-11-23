/**
 * ADR-0020 S9 真栈验收：body 线性阵列**第二方向间距表达式**（web UI，shared 1.79）。
 *
 * 前置（未发布，本机必须就绪）：
 * - shared 1.79 工作树（嵌套 `PatternParams.secondDirection.spacingExpression`）
 *   + 新后端 modeling-server（写/预览边界权威求值、`updateVariables` 传播物化
 *   `secondDirection.spacing`），以源码模式启动 MS：
 *   `scripts/start-ms-host.ps1 -Source <luban-backend>\modeling-server`。
 * - Vite 以 `VITE_EDITOR_AUTOSAVE=0`（原生 undo 栈不被自动保存在中间清空）+
 *   `VITE_B_MODEL_ENABLED=true VITE_E2E_HOOKS=true` 运行（其余真栈 spec 同）。
 *
 * 链路（4×4×5 盒、x/y 2..6 → 80 mm³）：
 * 1) RPC 建变量 w=10 + 草图/拉伸；
 * 2) UI 线性阵列实例数 2、第一方向距离 10、勾选第二个方向（实例数 2、轴 Y）、
 *    第二方向间距 `#w`（聚焦原文/失焦求值 10）→ 2×2 网格 **320 mm³** 质心
 *    (x=9, y=9)；树 params `{kind:'linear', count:2, spacing:10, axis:'X',
 *    secondDirection:{count:2, spacing:10, axis:'Y', spacingExpression:'#w'}}`；
 * 3) 变量对话框 w 10→20 → 后端物化第二方向 spacing=20（质心 y=14，体积不变）；
 * 4) 原生 Ribbon Undo 一次 → w=10/spacing=10/质心 y=9，Redo → 20/14；
 * 5) 树行双击编辑：第二方向间距失焦显示 20、聚焦显示 `#w`；
 * 6) push + 冷重开：嵌套表达式/物化间距/四实例几何保持。
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
  releaseWriteLease, reloadWithFlush } from './helpers';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './examples/imodel.js';

function rectangleSketch(width: number, height: number, x0 = 0, y0 = 0): {
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
} {
  const x1 = x0 + width;
  const y1 = y0 + height;
  return {
    entities: [
      { kind: 'point', id: 1, x: x0, y: y0 },
      { kind: 'point', id: 2, x: x1, y: y0 },
      { kind: 'point', id: 3, x: x1, y: y1 },
      { kind: 'point', id: 4, x: x0, y: y1 },
      { kind: 'point', id: 5, x: x0, y: y0 },
      { kind: 'point', id: 6, x: x1, y: y0 },
      { kind: 'point', id: 7, x: x1, y: y1 },
      { kind: 'point', id: 8, x: x0, y: y1 },
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

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

test.describe('ADR-0020 S9 body 线性阵列第二方向间距表达式（真栈）', () => {
  test('2×2 网格 `#w` 320 mm³ → 变量 10→20 物化 → undo/redo → push+冷重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Pattern Second Spacing Expression UI', {
      reset: true,
    });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await reloadWithFlush(page);
        return openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'pattern-second-spacing-expression-ui');
    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

    const sketch = rectangleSketch(4, 4, 2, 2);
    const sketchId = await apply(
      { kind: 'insertSketch', entities: sketch.entities, constraints: sketch.constraints, plane: XY_PLANE },
      '盒体草图',
    );
    await apply(
      {
        kind: 'insertFeature',
        featureType: 'extrude',
        params: { profile: [], distance: 5, sketchId, regions: [0] },
      },
      '盒体拉伸',
    );
    await apply(
      {
        kind: 'updateVariables',
        variables: [{ id: 'v1', name: 'w', expression: '10' }],
      } as FeatureOp,
      '变量 w=10',
    );
    expect(await getVariablesRpc(ctx, token)).toEqual([
      expect.objectContaining({ id: 'v1', name: 'w', expression: '10', type: 'length' }),
    ]);
    await releaseWriteLease(ctx, lease, token);

    await reloadWithFlush(page);
    ctx = await openWithRetry();
    await expect(page.getByTestId(`tree-row-${sketchId}`)).toBeVisible({ timeout: 60_000 });

    const mass = async () => {
      const items = await getMassPropertiesRpc(ctx, token);
      const volume = items.reduce((sum, item) => sum + item.volume, 0);
      const centroidX = items.reduce((sum, item) => sum + item.centroid.x * item.volume, 0) / volume;
      const centroidY = items.reduce((sum, item) => sum + item.centroid.y * item.volume, 0) / volume;
      return { volume, centroidX, centroidY, bodies: items.length };
    };
    expect((await mass()).volume).toBeCloseTo(80, 1);

    // 2) UI 线性阵列：第一方向 2×10（X）+ 第二方向 2×`#w`（Y）→ 4 实例 320 mm³。
    await page.getByRole('button', { name: '线性阵列', exact: true }).click({ timeout: 30_000 });
    const dialog = page.getByTestId('part-studio-feature-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole('textbox', { name: '实例数' })).toHaveValue('2', { timeout: 30_000 });
    await expect(dialog.getByRole('textbox', { name: '距离' })).toHaveValue('10', { timeout: 30_000 });
    const secondEnabled = dialog.getByRole('checkbox', { name: '第二个方向' });
    await expect(secondEnabled).toBeEnabled({ timeout: 15_000 });
    await secondEnabled.check();
    await expect(dialog.getByRole('textbox', { name: '第二方向实例数量（含原件）' }))
      .toHaveValue('2', { timeout: 15_000 });
    const secondSpacing = dialog.getByRole('textbox', { name: '第二方向间距' });
    await expect(secondSpacing).toHaveAttribute('data-expression-field', 'length');
    await secondSpacing.click();
    await secondSpacing.fill('#w');
    expect(await secondSpacing.inputValue()).toBe('#w'); // 聚焦=表达式原文
    await page.keyboard.press('Tab');
    await expect(secondSpacing).toHaveValue('10'); // 失焦=本地求值（w=10）
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    const confirm = dialog.getByRole('button', { name: '确认' });
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    await confirm.click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    await expect.poll(async () => (await mass()).volume, {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeCloseTo(320, 0);
    let result = await mass();
    expect(result.centroidX).toBeCloseTo(9, 3);
    expect(result.centroidY).toBeCloseTo(9, 3);
    expect(result.bodies).toBe(1); // 实例含原件并 Union 成单 body（四 lump）
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'pattern']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[2]!.params).toMatchObject({
      kind: 'linear',
      count: 2,
      spacing: 10,
      axis: 'X',
      secondDirection: {
        count: 2,
        spacing: 10,
        axis: 'Y',
        spacingExpression: '#w',
      },
    });
    // 顶层不串键：第一方向数值路径不携带表达式。
    expect((tree[2]!.params as Record<string, unknown>).spacingExpression).toBeUndefined();
    const patternId = tree[2]!.id;

    // 3) 变量对话框 w 10→20：后端把第二方向间距物化为 20（质心 y 变化、体积不变）。
    const variableRow = page.getByTestId('tree-variable-v1');
    await expect(variableRow).toBeVisible({ timeout: 60_000 });
    expect(await variableRow.textContent()).toContain('#w = 10 mm');
    await variableRow.dblclick({ timeout: 30_000 });
    const variablesDialog = page.getByTestId('variables-dialog');
    await expect(variablesDialog).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('variables-name-input')).toHaveValue('w');
    await page.getByTestId('variables-value-input').fill('20');
    await page.getByTestId('variables-value-input').press('Tab');
    await expect(page.getByTestId('variables-confirm')).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId('variables-confirm').click();
    await expect(variablesDialog).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(async () => (await mass()).centroidY, {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeCloseTo(14, 3);
    expect((await mass()).volume).toBeCloseTo(320, 0);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree[2]!.params).toMatchObject({
      secondDirection: { spacing: 20, spacingExpression: '#w' },
    });
    expect(tree.every((row) => row.status === 0)).toBe(true);

    // 4) 原生 Ribbon Undo 一次 → w=10 / spacing=10 / 质心 y=9；Redo → 20 / 14。
    const undoButton = page.getByTestId('part-studio-ribbon-undo');
    await expect(undoButton).toBeEnabled({ timeout: 30_000 });
    await undoButton.click();
    await expect.poll(async () => (await mass()).centroidY, {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeCloseTo(9, 3);
    await expect(variableRow).toContainText('#w = 10 mm', { timeout: 30_000 });
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree[2]!.params).toMatchObject({
      secondDirection: { spacing: 10, spacingExpression: '#w' },
    });
    const redoButton = page.getByTestId('part-studio-ribbon-redo');
    await expect(redoButton).toBeEnabled({ timeout: 30_000 });
    await redoButton.click();
    await expect.poll(async () => (await mass()).centroidY, {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeCloseTo(14, 3);
    await expect(variableRow).toContainText('#w = 20 mm', { timeout: 30_000 });

    // 5) 树行双击编辑：第二方向间距失焦=物化值 20、聚焦=表达式原文；取消不写。
    await page.getByTestId(`tree-row-${patternId}`).dblclick({ timeout: 30_000 });
    const editDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(editDialog).toBeVisible({ timeout: 30_000 });
    const editSecondSpacing = editDialog.getByRole('textbox', { name: '第二方向间距' });
    await expect(editSecondSpacing).toHaveValue('20', { timeout: 30_000 });
    await editSecondSpacing.click();
    await expect(editSecondSpacing).toHaveValue('#w');
    await page.keyboard.press('Tab');
    await expect(editSecondSpacing).toHaveValue('20');
    await editDialog.getByRole('button', { name: '取消' }).click();
    await expect(editDialog).toBeHidden();
    // 取消 = 不写：树 params 保持 Redo 后的落库状态（嵌套 spacing 20/表达式原文）。
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree).toHaveLength(3);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[2]!.params).toMatchObject({
      kind: 'linear',
      count: 2,
      spacing: 10,
      axis: 'X',
      secondDirection: {
        count: 2,
        spacing: 20,
        axis: 'Y',
        spacingExpression: '#w',
      },
    });
    expect((await mass()).volume).toBeCloseTo(320, 0);

    // 6) push + 冷重开：嵌套表达式/物化间距/四实例几何保持。
    await pushExampleChanges(page, 'pattern second-direction spacing expression UI acceptance');
    await reloadWithFlush(page);
    ctx = await openWithRetry();
    await expect(page.getByTestId(`tree-row-${patternId}`)).toBeVisible({ timeout: 60_000 });
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'pattern']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[2]!.params).toMatchObject({
      kind: 'linear',
      count: 2,
      spacing: 10,
      axis: 'X',
      secondDirection: {
        count: 2,
        spacing: 20,
        axis: 'Y',
        spacingExpression: '#w',
      },
    });
    expect(await getVariablesRpc(ctx, token)).toEqual([
      expect.objectContaining({ id: 'v1', name: 'w', expression: '20', type: 'length' }),
    ]);
    await expect.poll(async () => (await mass()).volume, {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeCloseTo(320, 0);
    result = await mass();
    expect(result.centroidX).toBeCloseTo(9, 3);
    expect(result.centroidY).toBeCloseTo(14, 3);
  });
});
