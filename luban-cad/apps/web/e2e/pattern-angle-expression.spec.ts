/**
 * ADR-0020 S12 真栈验收：body 环形阵列（circular pattern）**总角度表达式**
 * （web UI，shared 1.80）。
 *
 * 前置（未发布，本机必须就绪）：
 * - shared 1.80 工作树（`PatternParams.angleExpression` / `FeaturePatternParams.angleExpression`）
 *   + 新后端 modeling-server（写/预览边界权威求值、`updateVariables` 传播物化
 *   `angle`），以源码模式启动 MS：`scripts/start-ms-host.ps1 -Source <luban-backend>\modeling-server`。
 * - Vite 以 `VITE_EDITOR_AUTOSAVE=0`（原生 undo 栈不被自动保存在中间清空）+
 *   `VITE_B_MODEL_ENABLED=true VITE_E2E_HOOKS=true` 运行（其余真栈 spec 同）。
 *
 * 链路（2×2×5 盒、x 10..12 / y −1..1 → 20 mm³，远离原点便于验证旋转）：
 * 1) RPC 建变量 ang=90 + 草图/拉伸；
 * 2) UI 环形阵列 count 4、总角度 `#ang`（聚焦原文/失焦求值 90）→ 部分角
 *    step=90/(4−1)=30°，四实例 **80 mm³**、质心 (6.507, 6.507)；树 params
 *    `{kind:'circular', count:4, angle:90, axis:'Z', angleExpression:'#ang'}`，
 *    标题/树行为「环形阵列 N」；
 * 3) 变量 ang 90→360 → 360° 均分 90°，质心 (0,0)、体积不变，树 angle=360；
 * 4) 原生 Ribbon Undo 一次 → ang=90/质心 6.507，Redo → 360/(0,0)；
 * 5) 树行双击编辑：失焦显示 360、聚焦显示 `#ang`；
 * 6) push + 冷重开：表达式/物化角度/四实例几何保持。
 *
 * 说明：FEATURE 环形阵列（`FeaturePatternParams.angleExpression`）本切片只做
 * 单测覆盖（`FeaturePatternDialog.test.tsx`）；既有 circular e2e
 * （`feature-contracts` / `feature-toolbar-variants`）随本切片一并回归。
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

test.describe('ADR-0020 S12 body 环形阵列总角度表达式（真栈）', () => {
  test('`#ang` count 4 → 80 mm³ → 变量 90→360 → undo/redo → push+冷重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Pattern Angle Expression UI', {
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
    const lease = await borrowWriteLease(ctx, token, 'pattern-angle-expression-ui');
    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

    // 2×2×5 盒在 x 10..12 / y −1..1：远离原点，部分角实例互不重叠。
    const sketch = rectangleSketch(2, 2, 10, -1);
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
        // 角度变量：种类 angle（deg）。
        variables: [{ id: 'v1', name: 'ang', expression: '90', type: 'angle' }],
      } as FeatureOp,
      '变量 ang=90',
    );
    expect(await getVariablesRpc(ctx, token)).toEqual([
      expect.objectContaining({ id: 'v1', name: 'ang', expression: '90', type: 'angle' }),
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
    expect((await mass()).volume).toBeCloseTo(20, 1);

    // 2) UI 环形阵列：count 4、总角度 `#ang` → 部分角 90°（step 30°）四实例 80 mm³。
    const patternGroup = page.getByTestId('part-studio-ribbon-dropdown-LinearPattern');
    await patternGroup.getByRole('button', { name: '线性阵列 ▾' }).click({ timeout: 30_000 });
    await page.getByRole('menuitem', { name: '环形阵列', exact: true }).click();
    const dialog = page.getByTestId('part-studio-feature-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    // S12 命名：circular 新建标题 = 环形阵列 N（显示伪类型 patternCircular）。
    await expect(dialog).toHaveAttribute('aria-label', '环形阵列 1');
    const count = dialog.getByRole('textbox', { name: '实例数' });
    await count.fill('4');
    const angle = dialog.getByRole('textbox', { name: '总角度（度）' });
    await expect(angle).toHaveAttribute('data-expression-field', 'angleDeg');
    await angle.click();
    await angle.fill('#ang');
    expect(await angle.inputValue()).toBe('#ang'); // 聚焦=表达式原文
    await page.keyboard.press('Tab');
    await expect(angle).toHaveValue('90'); // 失焦=本地求值（ang=90）
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    const confirm = dialog.getByRole('button', { name: '确认' });
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    await confirm.click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    await expect.poll(async () => (await mass()).volume, {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeCloseTo(80, 0);
    let result = await mass();
    // 30° 步进（0/30/60/90°）：质心 = 11·(1+cos30+cos60+cos90)/4 ≈ 6.5066。
    expect(result.centroidX).toBeCloseTo(6.5066, 3);
    expect(result.centroidY).toBeCloseTo(6.5066, 3);
    expect(result.bodies).toBe(1); // 实例含原件并 Union 成单 body（四 lump）
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'pattern']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[2]!.params).toMatchObject({
      kind: 'circular',
      count: 4,
      angle: 90,
      axis: 'Z',
      angleExpression: '#ang',
    });
    const patternId = tree[2]!.id;
    // 树行默认名对齐 live「环形阵列 N」。
    await expect(page.getByTestId(`tree-row-${patternId}`)).toContainText('环形阵列 1', {
      timeout: 60_000,
    });

    // 3) 变量对话框 ang 90→360：后端把总角度物化为 360（360° 均分 90°、质心 0,0）。
    const variableRow = page.getByTestId('tree-variable-v1');
    await expect(variableRow).toBeVisible({ timeout: 60_000 });
    expect(await variableRow.textContent()).toContain('#ang = 90');
    await variableRow.dblclick({ timeout: 30_000 });
    const variablesDialog = page.getByTestId('variables-dialog');
    await expect(variablesDialog).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('variables-name-input')).toHaveValue('ang');
    await page.getByTestId('variables-value-input').fill('360');
    await page.getByTestId('variables-value-input').press('Tab');
    await expect(page.getByTestId('variables-confirm')).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId('variables-confirm').click();
    await expect(variablesDialog).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(async () => Math.abs((await mass()).centroidX), {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeLessThan(0.01);
    expect((await mass()).volume).toBeCloseTo(80, 0);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree[2]!.params).toMatchObject({ angle: 360, angleExpression: '#ang' });
    expect(tree.every((row) => row.status === 0)).toBe(true);

    // 4) 原生 Ribbon Undo 一次 → ang=90 / 质心 6.5066；Redo → 360 / (0,0)。
    const undoButton = page.getByTestId('part-studio-ribbon-undo');
    await expect(undoButton).toBeEnabled({ timeout: 30_000 });
    await undoButton.click();
    await expect.poll(async () => (await mass()).centroidX, {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeCloseTo(6.5066, 3);
    await expect(variableRow).toContainText('#ang = 90', { timeout: 30_000 });
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree[2]!.params).toMatchObject({ angle: 90, angleExpression: '#ang' });
    const redoButton = page.getByTestId('part-studio-ribbon-redo');
    await expect(redoButton).toBeEnabled({ timeout: 30_000 });
    await redoButton.click();
    await expect.poll(async () => Math.abs((await mass()).centroidX), {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeLessThan(0.01);
    await expect(variableRow).toContainText('#ang = 360', { timeout: 30_000 });

    // 5) 树行双击编辑：失焦=物化值 360、聚焦=表达式原文；取消不写。
    await page.getByTestId(`tree-row-${patternId}`).dblclick({ timeout: 30_000 });
    const editDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(editDialog).toBeVisible({ timeout: 30_000 });
    const editAngle = editDialog.getByRole('textbox', { name: '总角度（度）' });
    await expect(editAngle).toHaveValue('360', { timeout: 30_000 });
    await editAngle.click();
    await expect(editAngle).toHaveValue('#ang');
    await page.keyboard.press('Tab');
    await expect(editAngle).toHaveValue('360');
    // 判别式取消零写：先把值改成 180，若取消误提交，树内物化角度会变成 180。
    // 用真实键盘路径（点击后聚焦态显示表达式原文；fill 会拼成 `#ang180`）。
    await editAngle.click();
    await expect(editAngle).toHaveValue('#ang');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('180');
    await expect(editAngle).toHaveValue('180');
    await editDialog.getByRole('button', { name: '取消' }).click();
    await expect(editDialog).toBeHidden();
    const afterCancel = await getFeatureTreeRpc(ctx, token);
    expect(afterCancel[2]!.params).toMatchObject({ angle: 360, angleExpression: '#ang' });

    // 6) push + 冷重开：表达式/物化角度/四实例几何保持。
    await pushExampleChanges(page, 'pattern angle expression UI acceptance');
    await reloadWithFlush(page);
    ctx = await openWithRetry();
    await expect(page.getByTestId(`tree-row-${patternId}`)).toBeVisible({ timeout: 60_000 });
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'pattern']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[2]!.params).toMatchObject({
      kind: 'circular',
      count: 4,
      angle: 360,
      axis: 'Z',
      angleExpression: '#ang',
    });
    expect(await getVariablesRpc(ctx, token)).toEqual([
      expect.objectContaining({ id: 'v1', name: 'ang', expression: '360', type: 'angle' }),
    ]);
    await expect.poll(async () => (await mass()).volume, {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeCloseTo(80, 0);
    result = await mass();
    expect(Math.abs(result.centroidX)).toBeLessThan(0.01);
    expect(Math.abs(result.centroidY)).toBeLessThan(0.01);
  });
});
