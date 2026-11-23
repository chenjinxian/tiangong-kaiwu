/**
 * ADR-0020 S4c 真栈验收：其他特征数值字段表达式（web UI）。
 *
 * 前置（未发布，本机必须就绪）：
 * - shared 1.74 工作树（typed `*Expression` 键）+ 新后端 modeling-server
 *   （写/预览边界权威求值、`updateVariables` 传播物化），以源码模式启动 MS：
 *   `scripts/start-ms-host.ps1 -Source <luban-backend>\modeling-server`。
 * - Vite 以 `VITE_EDITOR_AUTOSAVE=0` + `VITE_B_MODEL_ENABLED=true
 *   VITE_E2E_HOOKS=true` 运行（其余真栈 spec 同）。
 *
 * 链路（体积/参数读回，不靠截图）：
 * 1) fillet 半径 `#r*2`（UI 拾边）→ radius=2/radiusExpression；原生 undo/redo；
 *    无效 `#nope` ✓ 禁用；数值编辑清除表达式；未触碰编辑保留表达式；
 *    未知 `#newr` + Enter 内联创建再提交；push + 冷重开参数保持。
 * 2) hole 孔径 `#d*2` → diameterMm=6 + 原文；数值编辑清除。
 * 3) shell 厚度 `0 - #t` → defaultDistance=-2（向内派生只读）+ 原文；无效禁用。
 * 4) extrude 第二方向 `#d2*2` → secondDirectionDistanceExpression；
 *    revolve 角度 `#a/2` → 契约弧度 angle（90°）+ angleExpression。
 *
 * 注意：本产品变量为 Part Studio 级单表（ADR-0020 §2.7 D4），所有变量对所有
 * 字段可见；不做 live 的有序可见性。MS 限流 100 req/15min——本 spec 四个用例
 * 各自 reset seed，控制器在干净窗口串行执行。
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

/** 10×10 方形草图（与 feature-expression-ui 同形：8 点 + 4 线 + 10 约束）。 */
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

/** 边拾取（newbody 同款 boresite 采样）：命中至少一条边即停。 */
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

test.describe('ADR-0020 S4c 特征数值字段表达式（真栈）', () => {
  test('fillet 半径表达式 → 参数/undo/redo/无效禁用/数值清除/未触碰保留/内联创建/push 冷重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openWithRetry(page, seed);
    const sketch = rectangleSketch(20, 20);
    let sketchId: string;
    let extrudeId: string;
    const lease = await borrowWriteLease(ctx, token, 'feature-expression-fields-fillet');
    try {
      // 变量 r=1 + 20×20 草图 + 10 mm 拉伸盒体（fillet 需要实体边）。
      let result = await applyFeatureOpRpc(ctx, {
        kind: 'updateVariables',
        variables: [{ id: 'v1', name: 'r', expression: '1' }],
      } as FeatureOp, lease, token);
      assertFeatureOpOk(result, '建变量 r=1');
      result = await applyFeatureOpRpc(ctx, {
        kind: 'insertSketch',
        entities: sketch.entities,
        constraints: sketch.constraints,
        plane: XY_PLANE,
      } as FeatureOp, lease, token);
      assertFeatureOpOk(result, '20×20 草图');
      sketchId = result.featureId!;
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

    // 1) UI 圆角 + 半径 `#r*2` → radius=2 + 表达式原文。
    await frameStandardView(page, 6, BOX_RANGE, { left: 0.35, right: 0.05, top: 0.1, bottom: 0.1 });
    await page.getByRole('button', { name: '圆角', exact: true }).click({ timeout: 30_000 });
    const dialog = page.getByTestId('part-studio-feature-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    const radius = dialog.getByRole('textbox', { name: '半径' });
    await radius.fill('#r*2');
    await dialog.getByTestId('part-studio-feature-dialog-add-edge').click();
    await pickOneEdge(page, dialog);
    await dialog.getByTestId('part-studio-feature-dialog-add-edge').click();
    await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 20_000 });
    await dialog.getByRole('button', { name: '确认' }).click();
    await expect(dialog).toBeHidden({ timeout: 180_000 });
    let tree = await getFeatureTreeRpc(ctx, token);
    const filletRow = tree.find((row) => row.featureType === 'fillet');
    expect(filletRow).toBeTruthy();
    const filletId = filletRow!.id;
    expect(filletRow!.status).toBe(0);
    expect(filletRow!.params).toMatchObject({ radius: 2, radiusExpression: '#r*2' });
    expect(await volumeOf(ctx, token)).toBeLessThan(4000);

    // 2) 原生 undo/redo：撤销回盒体（无 fillet），重做恢复表达式特征。
    const undo = page.getByTestId('part-studio-ribbon-undo');
    const redo = page.getByTestId('part-studio-ribbon-redo');
    await expect(undo).toBeEnabled({ timeout: 30_000 });
    await undo.click();
    await expect.poll(async () => (await getFeatureTreeRpc(ctx, token)).some((row) => row.featureType === 'fillet'),
      { timeout: 60_000, intervals: [800, 1500, 3000] }).toBe(false);
    await expect(redo).toBeEnabled({ timeout: 30_000 });
    await redo.click();
    await expect.poll(async () => {
      const rows = await getFeatureTreeRpc(ctx, token);
      const row = rows.find((entry) => entry.featureType === 'fillet');
      return row?.params;
    }, { timeout: 60_000, intervals: [800, 1500, 3000] })
      .toMatchObject({ radius: 2, radiusExpression: '#r*2' });

    // 2b) 变量变更重算（AIRR §12）：r 1→2 使半径 2→4（去材更多、体积下降），
    //     再恢复 r=1 → 体积回到 fillet 初始值；变量/几何联动可观测。
    const filletVolumeBeforeVariable = await volumeOf(ctx, token);
    const variableRow = page.getByTestId('tree-variable-v1');
    await expect(variableRow).toBeVisible({ timeout: 60_000 });
    await variableRow.dblclick({ timeout: 30_000 });
    const variablesDialog = page.getByTestId('variables-dialog');
    await expect(variablesDialog).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('variables-value-input').fill('2');
    await page.getByTestId('variables-value-input').press('Tab');
    await expect(page.getByTestId('variables-confirm')).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId('variables-confirm').click();
    await expect(variablesDialog).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(async () => filletVolumeBeforeVariable - (await volumeOf(ctx, token)),
      { timeout: 60_000, intervals: [800, 1500, 3000] }).toBeGreaterThan(1);
    await expect(variableRow).toContainText('#r = 2 mm', { timeout: 30_000 });

    await variableRow.dblclick({ timeout: 30_000 });
    await expect(variablesDialog).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('variables-value-input').fill('1');
    await page.getByTestId('variables-value-input').press('Tab');
    await expect(page.getByTestId('variables-confirm')).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId('variables-confirm').click();
    await expect(variablesDialog).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(async () => Math.abs((await volumeOf(ctx, token)) - filletVolumeBeforeVariable),
      { timeout: 60_000, intervals: [800, 1500, 3000] }).toBeLessThan(0.5);
    await expect(variableRow).toContainText('#r = 1 mm', { timeout: 30_000 });

    // 3) 无效表达式 → ✓ 禁用 + aria-invalid（面板保持，取消不改模型）。
    await page.getByTestId(`tree-row-${filletId}`).dblclick({ timeout: 30_000 });
    const invalidDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(invalidDialog).toBeVisible({ timeout: 30_000 });
    const invalidRadius = invalidDialog.getByRole('textbox', { name: '半径' });
    await invalidRadius.click();
    await invalidRadius.fill('#nope');
    await expect(invalidRadius).toHaveAttribute('aria-invalid', 'true');
    // S5：表达式错误走结构化 detail + zh i18n（不再是 shared 中文 message 直出）。
    await expect(invalidDialog.getByText('未知变量: #nope')).toBeVisible();
    await expect(invalidDialog.getByRole('button', { name: '确认' })).toBeDisabled();
    await invalidDialog.getByRole('button', { name: '取消' }).click();
    await expect(invalidDialog).toBeHidden();

    // 4) 数值编辑清除表达式；未触碰保留表达式。
    await page.getByTestId(`tree-row-${filletId}`).dblclick({ timeout: 30_000 });
    const numericDialog = page.getByTestId('part-studio-feature-dialog');
    const numericRadius = numericDialog.getByRole('textbox', { name: '半径' });
    await numericRadius.click();
    await numericRadius.fill('1.5');
    await numericDialog.getByRole('button', { name: '确认' }).click();
    await expect(numericDialog).toBeHidden({ timeout: 180_000 });
    tree = await getFeatureTreeRpc(ctx, token);
    const numericFillet = tree.find((row) => row.featureType === 'fillet')!;
    expect(numericFillet.params).toMatchObject({ radius: 1.5 });
    expect((numericFillet.params as Record<string, unknown>).radiusExpression).toBeUndefined();

    await expect(undo).toBeEnabled({ timeout: 30_000 });
    await undo.click();
    await expect.poll(async () => {
      const rows = await getFeatureTreeRpc(ctx, token);
      return (rows.find((entry) => entry.featureType === 'fillet')?.params as Record<string, unknown> | undefined)
        ?.radiusExpression;
    }, { timeout: 60_000, intervals: [800, 1500, 3000] }).toBe('#r*2');

    await page.getByTestId(`tree-row-${filletId}`).dblclick({ timeout: 30_000 });
    const untouchedDialog = page.getByTestId('part-studio-feature-dialog');
    await untouchedDialog.getByRole('checkbox', { name: '切向延伸' }).click();
    await untouchedDialog.getByRole('button', { name: '确认' }).click();
    await expect(untouchedDialog).toBeHidden({ timeout: 180_000 });
    tree = await getFeatureTreeRpc(ctx, token);
    const untouched = tree.find((row) => row.featureType === 'fillet')!;
    expect(untouched.params).toMatchObject({
      radius: 2, radiusExpression: '#r*2', propagateSmooth: false,
    });

    // 5) 内联创建一次：半径 `#newr` + Enter → 创建面板（名称/值预填）→ 确认 →
    //    字段转有效 → 提交特征。
    await page.getByTestId(`tree-row-${filletId}`).dblclick({ timeout: 30_000 });
    const inlineDialog = page.getByTestId('part-studio-feature-dialog');
    const inlineRadius = inlineDialog.getByRole('textbox', { name: '半径' });
    await inlineRadius.click();
    await inlineRadius.fill('#newr');
    await inlineRadius.press('Enter');
    const inlineVariablesDialog = page.getByTestId('variables-dialog');
    await expect(inlineVariablesDialog).toBeVisible({ timeout: 20_000 });
    await expect(inlineVariablesDialog).toHaveAttribute('data-variant', 'inline-create');
    await expect(page.getByTestId('variables-name-input')).toHaveValue('newr');
    await page.getByTestId('variables-value-input').fill('1');
    await page.getByTestId('variables-value-input').press('Tab');
    await page.getByTestId('variables-confirm').click();
    await expect(inlineVariablesDialog).toHaveCount(0, { timeout: 30_000 });
    // 创建面板会抢焦点：字段失焦时回填显示求值数；聚焦回显表达式原文。
    await expect(inlineDialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 30_000 });
    await inlineRadius.click();
    await expect(inlineRadius).toHaveValue('#newr');
    await inlineRadius.press('Tab');
    await expect(inlineRadius).toHaveValue('1');
    await inlineDialog.getByRole('button', { name: '确认' }).click();
    await expect(inlineDialog).toBeHidden({ timeout: 180_000 });
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.find((row) => row.featureType === 'fillet')!.params)
      .toMatchObject({ radius: 1, radiusExpression: '#newr' });
    expect(await getVariablesRpc(ctx, token)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'newr', expression: '1', type: 'length' }),
    ]));

    // 6) push + 冷重开：表达式/物化值/变量保持。
    await pushExampleChanges(page, 'feature numeric expression fields acceptance');
    await reloadWithFlush(page);
    ctx = await openWithRetry(page, seed);
    await expect(page.getByTestId(`tree-row-${filletId}`)).toBeVisible({ timeout: 60_000 });
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree.find((row) => row.featureType === 'fillet')!.params)
      .toMatchObject({ radius: 1, radiusExpression: '#newr' });
    expect(await getVariablesRpc(ctx, token)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'newr', expression: '1' }),
    ]));
  });

  test('hole 孔径表达式 → mm 物化/参数；数值编辑清除；无效禁用', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openWithRetry(page, seed);
    const boxSketch = rectangleSketch(20, 20);
    let pointSketchId: string;
    const lease = await borrowWriteLease(ctx, token, 'feature-expression-fields-hole');
    try {
      let result = await applyFeatureOpRpc(ctx, {
        kind: 'updateVariables',
        variables: [{ id: 'vd', name: 'd', expression: '3' }],
      } as FeatureOp, lease, token);
      assertFeatureOpOk(result, '建变量 d=3');
      result = await applyFeatureOpRpc(ctx, {
        kind: 'insertSketch',
        entities: boxSketch.entities,
        constraints: boxSketch.constraints,
        plane: XY_PLANE,
      } as FeatureOp, lease, token);
      assertFeatureOpOk(result, '20×20 草图');
      const boxSketchId = result.featureId!;
      result = await applyFeatureOpRpc(ctx, {
        kind: 'insertFeature',
        featureType: 'extrude',
        params: {
          profile: [], distance: 10, sketchId: boxSketchId, regions: [0], operation: 'new',
        },
      } as FeatureOp, lease, token);
      assertFeatureOpOk(result, '20×20×10 盒体');
      // 孔位草图（点 (5,5)）：捕获 id——对话框默认 sketches[0]（盒体矩形），
      // 必须在孔位下拉里显式选中这张点草图，否则孔切在角上。
      result = await applyFeatureOpRpc(ctx, {
        kind: 'insertSketch',
        entities: [{ kind: 'point', id: 1, x: 5, y: 5 }],
        constraints: [],
        plane: XY_PLANE,
      } as FeatureOp, lease, token);
      assertFeatureOpOk(result, '孔位草图');
      pointSketchId = result.featureId!;
    } finally {
      await releaseWriteLease(ctx, lease, token);
    }

    await reloadWithFlush(page);
    ctx = await openWithRetry(page, seed);
    await expect(page.getByTestId('part-studio-canvas')).toBeVisible({ timeout: 60_000 });

    await page.getByRole('button', { name: '孔', exact: true }).click({ timeout: 30_000 });
    const dialog = page.getByTestId('part-studio-hole-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    // 两张草图在场 → 显式选中孔位点草图（不要用默认的盒体矩形）。
    await dialog.getByTestId('hole-sketch-select').selectOption(pointSketchId);
    await dialog.getByTestId('hole-locations-toggle').click();
    await dialog.getByLabel('点 1').click();
    const diameter = dialog.getByTestId('hole-diameter');
    await diameter.fill('#d*2');
    await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 20_000 });
    await dialog.getByRole('button', { name: '确认' }).click();
    await expect(dialog).toBeHidden({ timeout: 180_000 });
    let tree = await getFeatureTreeRpc(ctx, token);
    const holeRow = tree.find((row) => row.featureType === 'hole');
    expect(holeRow).toBeTruthy();
    expect(holeRow!.params).toMatchObject({ diameterMm: 6, diameterExpression: '#d*2' });
    // 板 20×20×10，中心 (5,5) φ6 通孔：4000 − π·3²·10 = 3717.257 mm³。
    const expectedCenteredHole = 4000 - Math.PI * 9 * 10;
    await expect.poll(async () => Math.abs(await volumeOf(ctx, token) - expectedCenteredHole),
      { timeout: 60_000, intervals: [800, 1500, 3000] }).toBeLessThan(0.2);

    // 数值编辑清除表达式（HoleDialog 编辑回显）。
    const holeId = holeRow!.id;
    await page.getByTestId(`tree-row-${holeId}`).dblclick({ timeout: 30_000 });
    const editDialog = page.getByTestId('part-studio-hole-dialog');
    await expect(editDialog).toBeVisible({ timeout: 30_000 });
    const editDiameter = editDialog.getByTestId('hole-diameter');
    await editDiameter.click();
    await editDiameter.fill('8');
    await editDialog.getByRole('button', { name: '确认' }).click();
    await expect(editDialog).toBeHidden({ timeout: 180_000 });
    tree = await getFeatureTreeRpc(ctx, token);
    const numericHole = tree.find((row) => row.featureType === 'hole')!;
    expect(numericHole.params).toMatchObject({ diameterMm: 8 });
    expect((numericHole.params as Record<string, unknown>).diameterExpression).toBeUndefined();

    // 无效表达式 → ✓ 禁用。
    await page.getByTestId(`tree-row-${holeId}`).dblclick({ timeout: 30_000 });
    const invalidDialog = page.getByTestId('part-studio-hole-dialog');
    const invalidDiameter = invalidDialog.getByTestId('hole-diameter');
    await invalidDiameter.click();
    await invalidDiameter.fill('#nope');
    await expect(invalidDiameter).toHaveAttribute('aria-invalid', 'true');
    await expect(invalidDialog.getByRole('button', { name: '确认' })).toBeDisabled();
    await invalidDialog.getByRole('button', { name: '取消' }).click();
  });

  test('shell 负值表达式 → 方向派生只读/参数；无效禁用', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openWithRetry(page, seed);
    const boxSketch = rectangleSketch(20, 20);
    let extrudeId: string;
    const lease = await borrowWriteLease(ctx, token, 'feature-expression-fields-shell');
    try {
      let result = await applyFeatureOpRpc(ctx, {
        kind: 'updateVariables',
        variables: [{ id: 'vt', name: 't', expression: '2' }],
      } as FeatureOp, lease, token);
      assertFeatureOpOk(result, '建变量 t=2');
      result = await applyFeatureOpRpc(ctx, {
        kind: 'insertSketch',
        entities: boxSketch.entities,
        constraints: boxSketch.constraints,
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

    // 顶面选择（shell.spec 同款投影点）。
    await frameStandardView(page, 0, BOX_RANGE, { left: 0.2, right: 0.05, top: 0.15, bottom: 0.1 });
    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('画布不可用');
    const screens = await projectWorld(page, { x: box.x, y: box.y }, [
      { x: 10, y: 10, z: 10 },
      { x: 9, y: 9, z: 10 },
      { x: 11, y: 11, z: 10 },
      { x: 10, y: 11, z: 10 },
    ]);
    for (const screen of screens) {
      await page.mouse.click(screen.x, screen.y);
      await page.waitForTimeout(500);
      const kind = await page.evaluate(() => (window as unknown as {
        __lubanE2EApp: { usePartStudioStore: { getState(): { canvas: { selection: Array<{ kind: string }> } } } };
      }).__lubanE2EApp.usePartStudioStore.getState().canvas.selection[0]?.kind);
      if (kind === 'face') break;
    }
    await expect.poll(() => page.evaluate(() => (window as unknown as {
      __lubanE2EApp: { usePartStudioStore: { getState(): { canvas: { selection: Array<{ kind: string }> } } } };
    }).__lubanE2EApp.usePartStudioStore.getState().canvas.selection.map((entry) => entry.kind)),
    { timeout: 10_000 }).toEqual(['face']);

    await page.getByRole('button', { name: '抽壳', exact: true }).click({ timeout: 30_000 });
    const dialog = page.getByTestId('part-studio-shell-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    const thickness = dialog.getByTestId('part-studio-shell-thickness');
    await thickness.click();
    await thickness.fill('0 - #t');
    const direction = dialog.getByTestId('part-studio-shell-direction');
    await expect(direction).toHaveAttribute('data-direction', 'inward', { timeout: 20_000 });
    await expect(direction).toBeDisabled();
    await expect(dialog.getByTestId('part-studio-shell-confirm')).toBeEnabled({ timeout: 20_000 });
    await dialog.getByTestId('part-studio-shell-confirm').click();
    await expect(dialog).toBeHidden({ timeout: 180_000 });
    let tree = await getFeatureTreeRpc(ctx, token);
    const shellRow = tree.find((row) => row.featureType === 'shell');
    expect(shellRow).toBeTruthy();
    expect(shellRow!.params).toMatchObject({
      defaultDistance: -2,
      defaultDistanceExpression: '0 - #t',
    });
    // 20×20×10 外壳向内 2 mm（顶面移除）= 4000 − 16×16×8 = 1952 mm³。
    expect(Math.abs(await volumeOf(ctx, token) - 1952)).toBeLessThan(1);

    // 无效表达式 → ✓ 禁用。
    await page.getByTestId(`tree-row-${shellRow!.id}`).dblclick({ timeout: 30_000 });
    const invalidDialog = page.getByTestId('part-studio-shell-dialog');
    await expect(invalidDialog).toBeVisible({ timeout: 30_000 });
    const invalidThickness = invalidDialog.getByTestId('part-studio-shell-thickness');
    await invalidThickness.click();
    await invalidThickness.fill('#nope');
    await expect(invalidThickness).toHaveAttribute('aria-invalid', 'true');
    await expect(invalidDialog.getByTestId('part-studio-shell-confirm')).toBeDisabled();
    await invalidDialog.getByRole('button', { name: '取消' }).click();
  });

  test('extrude 第二方向与 revolve 角度表达式 → 顶层/弧度载荷参数', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openWithRetry(page, seed);
    const sketch = rectangleSketch(10, 10);
    let sketchId: string;
    const lease = await borrowWriteLease(ctx, token, 'feature-expression-fields-extrude-revolve');
    try {
      let result = await applyFeatureOpRpc(ctx, {
        kind: 'updateVariables',
        variables: [
          { id: 'v1', name: 'd2', expression: '5' },
          { id: 'v2', name: 'a', expression: '180', type: 'angle' },
        ],
      } as FeatureOp, lease, token);
      assertFeatureOpOk(result, '建变量 d2=5 / a=180');
      result = await applyFeatureOpRpc(ctx, {
        kind: 'insertSketch',
        entities: sketch.entities,
        constraints: sketch.constraints,
        plane: XY_PLANE,
      } as FeatureOp, lease, token);
      assertFeatureOpOk(result, '10×10 草图');
      sketchId = result.featureId!;
    } finally {
      await releaseWriteLease(ctx, lease, token);
    }

    await reloadWithFlush(page);
    ctx = await openWithRetry(page, seed);
    await expect(page.getByTestId(`tree-row-${sketchId}`)).toBeVisible({ timeout: 60_000 });

    // 拉伸：深度 10 + 第二方向 `#d2*2` → 顶层 secondDirectionDistanceExpression。
    await page.getByRole('button', { name: '拉伸', exact: true }).click({ timeout: 30_000 });
    const extrudeDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(extrudeDialog).toBeVisible({ timeout: 30_000 });
    await expect(extrudeDialog.getByText('草图 1 的面')).toBeVisible({ timeout: 60_000 });
    await extrudeDialog.getByTestId('part-studio-feature-dialog-second-direction')
      .locator('input').click();
    const secondDepth = extrudeDialog.getByRole('textbox', { name: '第二方向深度' });
    await secondDepth.fill('#d2*2');
    await expect(extrudeDialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 20_000 });
    await extrudeDialog.getByRole('button', { name: '确认' }).click();
    await expect(extrudeDialog).toBeHidden({ timeout: 180_000 });
    let tree = await getFeatureTreeRpc(ctx, token);
    const extrudeRow = tree.find((row) => row.featureType === 'extrude')!;
    expect(extrudeRow.params).toMatchObject({
      secondDirection: { endBound: 'blind', distanceMm: 10 },
      secondDirectionDistanceExpression: '#d2*2',
    });

    // 旋转：取消全周 + 角度 `#a/2`（90°）→ 契约弧度 + angleExpression 原文。
    await page.getByRole('button', { name: '旋转', exact: true }).click({ timeout: 30_000 });
    const revolveDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(revolveDialog).toBeVisible({ timeout: 30_000 });
    await expect(revolveDialog.getByText('草图 1 的面')).toBeVisible({ timeout: 60_000 });
    await revolveDialog.getByRole('checkbox', { name: '全方位旋转' }).click();
    const angle = revolveDialog.getByRole('textbox', { name: '角度（度）' });
    await angle.fill('#a/2');
    await expect(revolveDialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 20_000 });
    await revolveDialog.getByRole('button', { name: '确认' }).click();
    await expect(revolveDialog).toBeHidden({ timeout: 180_000 });
    tree = await getFeatureTreeRpc(ctx, token);
    const revolveRow = tree.find((row) => row.featureType === 'revolve');
    expect(revolveRow).toBeTruthy();
    const revolveParams = revolveRow!.params as Record<string, unknown>;
    expect(revolveParams).toMatchObject({ fullRevolve: false, angleExpression: '#a/2' });
    expect(revolveParams.angle as number).toBeCloseTo(Math.PI / 2, 10);
  });
});
