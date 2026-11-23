/**
 * ADR-0020 S4b 真栈验收：拉伸**深度**字段表达式（web UI）。
 *
 * 前置（未发布，本机必须就绪）：
 * - shared 1.73 工作树（`ExtrudeParams.distanceExpression`）+ 新后端 modeling-server
 *   （schema 01.00.01、写/预览边界权威求值、`updateVariables` 传播物化 `distance`），
 *   以源码模式启动 MS：`scripts/start-ms-host.ps1 -Source <luban-backend>\modeling-server`。
 * - Vite 以 `VITE_EDITOR_AUTOSAVE=0`（原生 undo 栈不被自动保存在中间清空）+
 *   `VITE_B_MODEL_ENABLED=true VITE_E2E_HOOKS=true` 运行（其余真栈 spec 同）。
 *
 * 链路：
 * 1) RPC 建变量 depth=5 + 10×10 草图；
 * 2) UI 拉伸深度 `#depth*2` → 物化 10 → **1000 mm³**（树 params
 *    `{distance:10, distanceExpression:'#depth*2'}`）；
 * 3) 树行双击编辑：失焦显示 `10`、聚焦显示 `#depth*2`；无效 `#nope` 提交被拒
 *    （就地「未知变量」，树不新增）；`#d` 补全选中 `#depth` → 失焦 `5` → **500**；
 * 4) 变量对话框改 depth=10 → **1000**；原生 Ribbon Undo 一次 → 500/变量 5，
 *    Redo → 1000/变量 10（S3d 多事务分组）；
 * 5) 新建「加入」拉伸：先填 `#depth*2` 再切「完全贯穿」→ 距离框禁用、提交载荷
 *    不带 `distanceExpression`（非 blind 清除表达式）；
 * 6) push + 冷重开：表达式/物化距离/体积保持；重开编辑仍失焦 10、聚焦 `#depth`。
 *
 * 说明：本产品变量为 Part Studio 级单表（ADR-0020 §2.7 D4），所有变量对所有
 * 字段可见；不做 live 的有序可见性。
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

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

/** 10×10 方形草图（与 feature-flow-parity 同形：8 点 + 4 线 + 10 约束）。 */
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

test.describe('ADR-0020 S4b 拉伸深度表达式（真栈）', () => {
  test('变量深度 #depth*2 → 1000 → 编辑 #depth 500 → 改变量 1000 → undo/redo → 非 blind 清除 → push+冷重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const openWithRetry = async () => {
      try {
        return await openSeedImodelEditor(page, seed);
      } catch {
        await reloadWithFlush(page);
        return await openSeedImodelEditor(page, seed);
      }
    };
    let ctx = await openWithRetry();
    const volumeOf = async (): Promise<number> => {
      const bodies = await getMassPropertiesRpc(ctx, token);
      return bodies.reduce((max, body) => Math.max(max, body.volume), 0);
    };
    const sketch = rectangleSketch(10, 10);
    let sketchId: string;
    const lease = await borrowWriteLease(ctx, token, 'feature-expression-ui');
    try {
      // 1) 变量 depth=5（RPC 建表）+ 10×10 草图。
      let result = await applyFeatureOpRpc(ctx, {
        kind: 'updateVariables',
        variables: [{ id: 'v1', name: 'depth', expression: '5' }],
      } as FeatureOp, lease, token);
      assertFeatureOpOk(result, '建变量 depth=5');
      result = await applyFeatureOpRpc(ctx, {
        kind: 'insertSketch',
        entities: sketch.entities,
        constraints: sketch.constraints,
        plane: XY_PLANE,
      } as FeatureOp, lease, token);
      assertFeatureOpOk(result, '10×10 草图');
      sketchId = result.featureId!;
      expect(await getVariablesRpc(ctx, token)).toEqual([
        expect.objectContaining({ id: 'v1', name: 'depth', expression: '5', type: 'length' }),
      ]);
    } finally {
      await releaseWriteLease(ctx, lease, token);
    }

    await reloadWithFlush(page);
    ctx = await openWithRetry();
    await expect(page.getByTestId(`tree-row-${sketchId}`)).toBeVisible({ timeout: 60_000 });

    // 2) UI 拉伸深度 `#depth*2` → 10×10×10 = 1000 mm³；载荷携带表达式原文。
    await page.getByRole('button', { name: '拉伸', exact: true }).click();
    const dialog = page.getByTestId('part-studio-feature-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText('草图 1 的面')).toBeVisible({ timeout: 60_000 });
    const depthInput = dialog.getByRole('textbox', { name: '深度' });
    await depthInput.fill('#depth*2');
    // 本地求值与后端同源（聚焦仍显表达式；data-depth-expression 不是缺省 10）。
    const depthRow = dialog.getByTestId('part-studio-feature-dialog-depth-row');
    await expect(depthRow).toHaveAttribute('data-depth-expression', '#depth*2');
    await expect(depthRow).toHaveAttribute('data-depth-value', '10');
    // 预览 overlay portal 在画布容器（不是对话框 DOM 内）。
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-quads', /[1-9]/);
    await dialog.getByRole('button', { name: '确认' }).click();
    await expect(dialog).toBeHidden({ timeout: 180_000 });
    await expect.poll(volumeOf, { timeout: 60_000, intervals: [800, 1500, 3000] })
      .toBeGreaterThan(999);
    expect(await volumeOf()).toBeLessThan(1001);
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const extrudeId = tree[1]!.id;
    expect(tree[1]!.params).toMatchObject({ distance: 10, distanceExpression: '#depth*2' });

    // 3) 编辑：失焦=物化值、聚焦=表达式；无效拒绝；`#` 补全 → #depth → 500。
    await page.getByTestId(`tree-row-${extrudeId}`).dblclick({ timeout: 30_000 });
    const editDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(editDialog).toBeVisible({ timeout: 30_000 });
    const editDepth = editDialog.getByRole('textbox', { name: '深度' });
    await expect(editDepth).toHaveValue('10', { timeout: 30_000 });
    await editDepth.click();
    await expect(editDepth).toHaveValue('#depth*2');
    await page.keyboard.press('Tab');
    await expect(editDepth).toHaveValue('10');

    // 先聚焦（失焦值 → 表达式原文）再改写：聚焦回显是受控派生值，直接 fill
    // 未聚焦输入会与外层 focus 渲染竞态（真栈实测会把新值拼到旧表达式后）。
    await editDepth.click();
    await expect(editDepth).toHaveValue('#depth*2');
    await editDepth.fill('#nope');
    // P3a：无效表达式不得更新幽灵几何（overlay 整体消失，不回落到 Number(draft)）。
    await expect(page.getByTestId('part-studio-feature-preview')).toHaveCount(0);
    await editDialog.getByRole('button', { name: '确认' }).click();
    await expect(editDialog).toBeVisible();
    await expect(editDialog.getByRole('alert')).toContainText('未知变量');
    expect((await getFeatureTreeRpc(ctx, token)).length).toBe(2);

    await editDepth.click();
    await editDepth.fill('#d');
    const autocompleteOption = editDialog.locator(
      '[data-testid="sketch-expression-autocomplete-option"][data-variable-name="depth"]',
    );
    await expect(autocompleteOption).toBeVisible({ timeout: 10_000 });
    await autocompleteOption.click();
    await expect(editDepth).toHaveValue('#depth');
    // P1：选中后补全列表必须关闭（不得被旧 caret 重新打开）。
    await expect(editDialog.getByTestId('sketch-expression-autocomplete')).toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(editDepth).toHaveValue('5');
    await editDialog.getByRole('button', { name: '确认' }).click();
    await expect(editDialog).toBeHidden({ timeout: 180_000 });
    await expect.poll(volumeOf, { timeout: 60_000, intervals: [800, 1500, 3000] })
      .toBeGreaterThan(499);
    expect(await volumeOf()).toBeLessThan(501);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree[1]!.params).toMatchObject({ distance: 5, distanceExpression: '#depth' });

    // 4) 变量对话框 depth 5→10：后端传播物化为 10 → 1000 mm³。
    const variableRow = page.getByTestId('tree-variable-v1');
    await expect(variableRow).toBeVisible({ timeout: 60_000 });
    await variableRow.dblclick({ timeout: 30_000 });
    const variablesDialog = page.getByTestId('variables-dialog');
    await expect(variablesDialog).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('variables-name-input')).toHaveValue('depth');
    await page.getByTestId('variables-value-input').fill('10');
    await page.getByTestId('variables-value-input').press('Tab');
    await expect(page.getByTestId('variables-confirm')).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId('variables-confirm').click();
    await expect(variablesDialog).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(volumeOf, { timeout: 60_000, intervals: [800, 1500, 3000] })
      .toBeGreaterThan(999);
    expect(await volumeOf()).toBeLessThan(1001);
    await expect(variableRow).toContainText('#depth = 10 mm', { timeout: 30_000 });

    // 5) 原生 Ribbon Undo 一次（S3d：变量表/草图/几何同一原生操作）→ 500；
    //    Redo → 1000。提交后立即撤销，避免任何自动保存窗口（本 spec 已关闭自动保存）。
    const undoButton = page.getByTestId('part-studio-ribbon-undo');
    await expect(undoButton).toBeEnabled({ timeout: 30_000 });
    await undoButton.click();
    await expect.poll(volumeOf, { timeout: 60_000, intervals: [800, 1500, 3000] })
      .toBeLessThan(501);
    expect(await volumeOf()).toBeGreaterThan(499);
    await expect(variableRow).toContainText('#depth = 5 mm', { timeout: 30_000 });
    const redoButton = page.getByTestId('part-studio-ribbon-redo');
    await expect(redoButton).toBeEnabled({ timeout: 30_000 });
    await redoButton.click();
    await expect.poll(volumeOf, { timeout: 60_000, intervals: [800, 1500, 3000] })
      .toBeGreaterThan(999);
    expect(await volumeOf()).toBeLessThan(1001);
    await expect(variableRow).toContainText('#depth = 10 mm', { timeout: 30_000 });

    // 6) 非 blind 终止条件清除表达式：新建「加入」拉伸先填 `#depth*2`，
    //    再切「完全贯穿」→ 距离框禁用、载荷不带 distanceExpression。
    await page.getByRole('button', { name: '拉伸', exact: true }).click();
    const throughDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(throughDialog).toBeVisible({ timeout: 30_000 });
    await expect(throughDialog.getByText('草图 1 的面')).toBeVisible({ timeout: 60_000 });
    await throughDialog.getByRole('tab', { name: '加入' }).click();
    const throughDepth = throughDialog.getByRole('textbox', { name: '深度' });
    await throughDepth.fill('#depth*2');
    await throughDialog.getByRole('combobox', { name: '终止条件' }).selectOption('throughAll');
    await expect(throughDepth).toBeDisabled();
    await throughDialog.getByRole('button', { name: '确认' }).click();
    await expect(throughDialog).toBeHidden({ timeout: 180_000 });
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'extrude']);
    const throughRow = tree[2]!;
    expect(throughRow.params).toMatchObject({ endBound: 'throughAll' });
    expect((throughRow.params as Record<string, unknown>).distanceExpression).toBeUndefined();
    expect(throughRow.status).toBe(0);

    // 非 blind 用例只验证载荷清除；撤销该加材特征，回到 1000 mm³ 的表达式基线
    //（撤销后树/体积同时恢复，随后 push 的持久化断言不掺入第二个特征）。
    const undoThrough = page.getByTestId('part-studio-ribbon-undo');
    await expect(undoThrough).toBeEnabled({ timeout: 30_000 });
    await undoThrough.click();
    await expect.poll(volumeOf, { timeout: 60_000, intervals: [800, 1500, 3000] })
      .toBeLessThan(1001);
    expect(await volumeOf()).toBeGreaterThan(999);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude']);
    expect(tree[1]!.params).toMatchObject({ distance: 10, distanceExpression: '#depth' });

    // 7) 表达式 + 对称（便宜组合）：深度不动，勾选对称 → 同一 1000 mm³ 体积
    //    改为跨草图平面居中（质心 z: 5 → 0），updateParams 同时保留
    //    distanceExpression；撤销回到未对称基线。
    await page.getByTestId(`tree-row-${extrudeId}`).dblclick({ timeout: 30_000 });
    const symmetricDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(symmetricDialog).toBeVisible({ timeout: 30_000 });
    await symmetricDialog.getByRole('checkbox', { name: '对称' }).check();
    await symmetricDialog.getByRole('button', { name: '确认' }).click();
    await expect(symmetricDialog).toBeHidden({ timeout: 180_000 });
    await expect.poll(async () => {
      const mass = await getMassPropertiesRpc(ctx, token);
      return Number((mass[0]?.centroid.z ?? Number.NaN).toFixed(3));
    }, { timeout: 60_000, intervals: [800, 1500, 3000] }).toBe(0);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree[1]!.params).toMatchObject({
      distance: 10, distanceExpression: '#depth', symmetric: true,
    });
    await expect(undoThrough).toBeEnabled({ timeout: 30_000 });
    await undoThrough.click();
    // 体积对称前后同为 1000 mm³ → 用树参数/质心判定撤销完成（不能只盯体积）。
    // 既有 edit 合并会显式写 symmetric 布尔（未勾选=false，历史口径不改）。
    await expect.poll(async () => {
      const current = await getFeatureTreeRpc(ctx, token);
      return (current[1]?.params as Record<string, unknown>).symmetric;
    }, { timeout: 60_000, intervals: [800, 1500, 3000] }).toBe(false);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree[1]!.params).toMatchObject({
      distance: 10, distanceExpression: '#depth', symmetric: false,
    });
    const symmetricMass = await getMassPropertiesRpc(ctx, token);
    expect(Math.abs((symmetricMass[0]?.centroid.z ?? Number.NaN) - 5)).toBeLessThan(0.05);

    // 8) push + 冷重开：表达式/物化距离/体积保持；重开编辑仍失焦 10、聚焦 `#depth`。
    await pushExampleChanges(page, 'feature expression UI acceptance');
    await reloadWithFlush(page);
    ctx = await openWithRetry();
    await expect(page.getByTestId(`tree-row-${extrudeId}`)).toBeVisible({ timeout: 60_000 });
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[1]!.params).toMatchObject({ distance: 10, distanceExpression: '#depth' });
    expect(await getVariablesRpc(ctx, token)).toEqual([
      expect.objectContaining({ id: 'v1', name: 'depth', expression: '10', type: 'length' }),
    ]);
    await expect.poll(volumeOf, { timeout: 60_000, intervals: [800, 1500, 3000] })
      .toBeGreaterThan(999);
    expect(await volumeOf()).toBeLessThan(1001);

    await page.getByTestId(`tree-row-${extrudeId}`).dblclick({ timeout: 30_000 });
    const coldDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(coldDialog).toBeVisible({ timeout: 30_000 });
    const coldDepth = coldDialog.getByRole('textbox', { name: '深度' });
    await expect(coldDepth).toHaveValue('10', { timeout: 30_000 });
    await coldDepth.click();
    await expect(coldDepth).toHaveValue('#depth');
    await page.keyboard.press('Tab');
    await expect(coldDepth).toHaveValue('10');
    await coldDialog.getByRole('button', { name: '取消' }).click();
    await expect(coldDialog).toBeHidden();
  });
});
