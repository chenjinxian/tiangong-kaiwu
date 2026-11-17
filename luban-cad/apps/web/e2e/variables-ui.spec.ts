/**
 * ADR-0020 S3b 真栈验收（UI 级）：Part Studio 变量表 UI + 内联创建/补全。
 *
 * 依赖（未发布，运行前必须在本机就绪）：
 * - shared 1.72 工作树（VariableDto.type/description + 求值器）；
 * - 新后端 modeling-server（schema 01.00.01 + getVariables/updateVariables + 类型
 *   门禁），以源码模式启动 MS：`scripts/start-ms-host.ps1 -Source <luban-backend>\modeling-server`。
 * - **S3d 原生 undo 分组（前置）**：后端把 `updateVariables` 与其 post-commit
 *   `rebuildAll` 包进同一个 TxnManager `begin/endMultiTxnOperation`，一次原生
 *   Ctrl+Z 同时恢复变量表/草图/几何。缺此分组时一次撤销只消费 rebuild 事务、
 *   变量仍停在 20，本 spec 的原生撤销断言会失败（不是前端回归）。
 * - **确定性自动保存（前置）**：dev server 以 `VITE_EDITOR_AUTOSAVE=0` 启动
 *   （或 `VITE_EDITOR_AUTOSAVE_DEBOUNCE_MS` 设到大于测试时长，如 600000）。
 *   默认 20s 自动保存在「变量提交 → 撤销」之间 push 会开新 changeset 会话并
 *   清空原生 undo/redo 栈，原生撤销将失效或撤销错对象。本 spec 的持久化仍走
 *   `pushExampleChanges`（页面桥 `flushAutoPush` 直接 `pushChanges`，与自动保存
 *   开关无关），因此关闭自动保存不影响冷重开验收。`VITE_E2E_HOOKS=true` /
 *   `VITE_B_MODEL_ENABLED=true` 亦必需（其余真栈 spec 同）。
 * - `FeatureOp.undo/redo` 契约（非原生通道）由 `sketch-expressions.spec.ts`
 *   覆盖；本 spec 只断言用户可见的原生工具栏撤销/重做。
 *
 * 链路：
 * 1) 变量命令 → 新建 width=10（长度）→ 树行 `(fx) #width = 10 mm`；源模式
 *    `已测量/来自导入` 诚实禁用（title 有原因）；
 * 2) 草图尺寸输入 `#width`（S2 表达式通道）→ 体积 10×8×5=400；
 * 3) 树行双击编辑 width=20 → 体积 800；undo → 400；redo → 800；
 * 4) 无效表达式 `#nope` → ✓ 禁用（不提交）；
 * 5) 内联创建：高度尺寸输入未知 `#bar` + Enter → 创建面板（名称/当前值预填）
 *    → ✓ → 尺寸字段转有效 → ✓ 提交；树行 `#bar = 8 mm`；
 * 6) push + 冷重开：变量表（width=20/bar=8）与树行/几何保持。
 *
 * 说明：`已测量/来自导入` 的数据源结构未采到（ADR §2.6 D5）→ 只验证诚实禁用；
 * 变量删除的 live 菜单未采到 → 树删除交互由单测覆盖（产品既有 Delete/右键删除），
 * 本 spec 不把推断交互当作 live 证据。
 */
import { expect, test } from '@playwright/test';
import type {
  FeatureOp,
  SketchConstraintDto,
  SketchDto,
  SketchEntityDto,
  SketchPlaneDto,
} from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getMassPropertiesRpc,
  getSketchRpc,
  getVariablesRpc,
  openSeedImodelEditor,
  releaseWriteLease,
} from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { setStandardView } from './tutorial2-helpers.js';
import { pushExampleChanges } from './examples/imodel.js';

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

const WIDTH_CONSTRAINT_ID = 29;
const HEIGHT_CONSTRAINT_ID = 30;

/** 矩形草图（与 S2 sketch-expression-ui 同形：8 点 + 4 线 + 10 约束）。 */
function rectangleSketch(width: number, height: number): {
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
} {
  const entities: SketchEntityDto[] = [
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
  ];
  const constraints: SketchConstraintDto[] = [
    { kind: 'coincident', id: 21, refs: [1, 5] },
    { kind: 'coincident', id: 22, refs: [2, 6] },
    { kind: 'coincident', id: 23, refs: [3, 7] },
    { kind: 'coincident', id: 24, refs: [4, 8] },
    { kind: 'horizontal', id: 25, refs: [11] },
    { kind: 'horizontal', id: 26, refs: [13] },
    { kind: 'vertical', id: 27, refs: [12] },
    { kind: 'vertical', id: 28, refs: [14] },
    { kind: 'length', id: WIDTH_CONSTRAINT_ID, refs: [11], value: width },
    { kind: 'length', id: HEIGHT_CONSTRAINT_ID, refs: [12], value: height },
  ];
  return { entities, constraints };
}

function constraintOf(sketch: SketchDto | undefined, constraintId: number): SketchConstraintDto | undefined {
  return sketch?.constraints.find((candidate) => candidate.id === constraintId);
}

interface Pt { x: number; y: number }

test.describe('ADR-0020 S3b Part Studio 变量 UI（真栈）', () => {
  test('变量建表 → 尺寸引用 → 改变量 → undo/redo → 内联创建 → push+冷重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 720_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const openWithRetry = async () => {
      try {
        return await openSeedImodelEditor(page, seed);
      } catch {
        await page.reload();
        return await openSeedImodelEditor(page, seed);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'variables-ui');
    const volumeOf = async (): Promise<number> => {
      const bodies = await getMassPropertiesRpc(ctx, token);
      return bodies.reduce((max, body) => Math.max(max, body.volume), 0);
    };
    let sketchId: string;
    try {
      // 1) 8×8 矩形草图 + 拉伸 5 → 320 mm³（变量由 UI 建）。
      let result = await applyFeatureOpRpc(ctx, {
        kind: 'insertSketch',
        ...rectangleSketch(8, 8),
        plane: XY_PLANE,
      } as FeatureOp, lease, token);
      assertFeatureOpOk(result, '方形草图');
      sketchId = result.featureId!;
      result = await applyFeatureOpRpc(ctx, {
        kind: 'insertFeature',
        featureType: 'extrude',
        params: { profile: [], distance: 5, sketchId },
      } as FeatureOp, lease, token);
      assertFeatureOpOk(result, '拉伸 5');
      await expect.poll(volumeOf, { timeout: 60_000, intervals: [800, 1500, 3000] })
        .toBeGreaterThan(319);
      expect(await volumeOf()).toBeLessThan(321);
    } finally {
      await releaseWriteLease(ctx, lease, token);
    }

    // 2) 词库/树桥就绪后重开：变量命令 → 新建 width=10（长度）。
    await page.reload();
    ctx = await openWithRetry();
    await expect(page.getByTestId(`tree-row-${sketchId}`)).toBeVisible({ timeout: 60_000 });

    await page.getByTestId('part-studio-ribbon-variables').click();
    const dialog = page.getByTestId('variables-dialog');
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog).toHaveAttribute('data-variant', 'variables');
    await expect(page.getByTestId('variables-dialog-title')).toHaveText('#? = 0 mm');
    // `已测量/来自导入` 诚实禁用 + 真实原因。
    for (const source of ['measured', 'imported']) {
      const button = page.getByTestId(`variables-source-${source}`);
      await expect(button).toBeDisabled();
      expect((await button.getAttribute('title')) ?? '').not.toBe('');
    }
    await expect(page.getByTestId('variables-source-assigned')).toBeEnabled();
    await page.getByTestId('variables-name-input').fill('width');
    await page.getByTestId('variables-value-input').fill('10');
    await page.getByTestId('variables-value-input').press('Tab');
    await page.getByTestId('variables-description-input').fill('宽度');
    await expect(page.getByTestId('variables-dialog-title')).toHaveText('#width = 10 mm');
    await page.getByTestId('variables-confirm').click();
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });
    const variableRow = page.getByTestId('tree-variable-v1');
    await expect(variableRow).toContainText('#width = 10 mm', { timeout: 30_000 });

    // 3) 打开草图 → 宽度尺寸 `#width` → 10×8×5 = 400 mm³。
    await page.getByTestId(`tree-row-${sketchId}`).dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });
    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await setStandardView(page, 0, {
      low: { x: -10, y: -10, z: 0 },
      high: { x: 20, y: 20, z: 10 },
    });
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    const centerOf = async (constraintId: number): Promise<Pt> => {
      const marker = page.locator(`[data-testid="sketch-dimension-label"][data-constraint-id="${constraintId}"]`);
      await expect(marker).toBeAttached({ timeout: 60_000 });
      const center = await marker.getAttribute('data-center');
      expect(center).not.toBeNull();
      const parts = center!.split(',').map(Number);
      return { x: box!.x + (parts[0] ?? 0), y: box!.y + (parts[1] ?? 0) };
    };

    const widthAt = await centerOf(WIDTH_CONSTRAINT_ID);
    await page.mouse.dblclick(widthAt.x, widthAt.y);
    const dimensionInput = page.getByTestId('sketch-dimension-input');
    await expect(dimensionInput).toBeVisible({ timeout: 10_000 });
    await dimensionInput.fill('#width');
    await expect(page.getByTestId('sketch-dimension-confirm')).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId('sketch-dimension-confirm').click();
    await expect(dimensionInput).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(volumeOf, { timeout: 60_000, intervals: [800, 1500, 3000] })
      .toBeGreaterThan(399);
    expect(await volumeOf()).toBeLessThan(401);
    const afterExpression = await getSketchRpc(ctx, sketchId, token);
    expect(constraintOf(afterExpression, WIDTH_CONSTRAINT_ID)?.expression).toBe('#width');

    // 4) 完成草图 → 树行双击编辑变量 width=20 → 20×8×5 = 800 mm³。
    await page.getByTestId('part-studio-sketch-dialog').getByRole('button', { name: '确认' }).click();
    await expect(page.getByTestId('part-studio-sketch-dialog')).toHaveCount(0, { timeout: 20_000 });
    await variableRow.dblclick({ timeout: 30_000 });
    const editDialog = page.getByTestId('variables-dialog');
    await expect(editDialog).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('variables-name-input')).toHaveValue('width');
    await page.getByTestId('variables-value-input').fill('20');
    await page.getByTestId('variables-value-input').press('Tab');
    await expect(page.getByTestId('variables-dialog-title')).toHaveText('#width = 20 mm');
    await page.getByTestId('variables-confirm').click();
    await expect(editDialog).toHaveCount(0, { timeout: 30_000 });
    // 变量表已由提交后的刷新落位（提交路径 await 了变量刷新）。
    await expect(variableRow).toContainText('#width = 20 mm', { timeout: 30_000 });

    // 5) 原生 UI Undo（一次点击）→ 变量表/草图/几何一起回退（S3d 多事务分组：
    //    updateVariables 与其 post-commit rebuildAll 是同一原生 undo 操作）。
    //    **提交后立即撤销**：不先做长几何轮询，避免默认 20s 自动保存 push 清空
    //    原生 undo 栈（本 spec 以 VITE_EDITOR_AUTOSAVE=0 运行，见文件头）。
    //    原生 Redo 恢复。工具栏 Undo/Redo 走 BriefcaseTxns 原生通道（不是
    //    FeatureOp.undo；后者的契约由 sketch-expressions.spec.ts 覆盖）。
    const undoButton = page.getByTestId('part-studio-ribbon-undo');
    await expect(undoButton).toBeEnabled({ timeout: 30_000 });
    await undoButton.click();
    await expect.poll(volumeOf, { timeout: 60_000, intervals: [800, 1500, 3000] })
      .toBeLessThan(401);
    expect(await volumeOf()).toBeGreaterThan(399);
    await expect(variableRow).toContainText('#width = 10 mm', { timeout: 30_000 });
    const redoButton = page.getByTestId('part-studio-ribbon-redo');
    await expect(redoButton).toBeEnabled({ timeout: 30_000 });
    await redoButton.click();
    await expect.poll(volumeOf, { timeout: 60_000, intervals: [800, 1500, 3000] })
      .toBeGreaterThan(799);
    expect(await volumeOf()).toBeLessThan(801);
    await expect(variableRow).toContainText('#width = 20 mm', { timeout: 30_000 });

    // 6) 无效表达式 → ✓ 禁用（面板保持；取消不改模型）。
    await page.getByTestId('part-studio-ribbon-variables').click();
    const invalidDialog = page.getByTestId('variables-dialog');
    await expect(invalidDialog).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('variables-name-input').fill('bad');
    await page.getByTestId('variables-value-input').fill('#nope');
    await page.getByTestId('variables-value-input').press('Tab');
    await expect(page.getByTestId('variables-confirm')).toBeDisabled();
    await expect(page.getByTestId('variables-error')).toBeVisible();
    await page.getByTestId('variables-cancel').click();
    await expect(invalidDialog).toHaveCount(0, { timeout: 10_000 });

    // 7) 内联创建：重新打开草图 → 高度尺寸输入未知 `#bar` + Enter → 创建面板
    //    （name=bar、值=尺寸当前值 8 mm）→ ✓ → 字段有效 → ✓ 提交。
    await page.getByTestId(`tree-row-${sketchId}`).dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    const heightAt = await centerOf(HEIGHT_CONSTRAINT_ID);
    await page.mouse.dblclick(heightAt.x, heightAt.y);
    const inlineInput = page.getByTestId('sketch-dimension-input');
    await expect(inlineInput).toBeVisible({ timeout: 10_000 });
    await inlineInput.fill('#bar');
    await inlineInput.press('Enter');
    const inlineDialog = page.getByTestId('variables-dialog');
    await expect(inlineDialog).toBeVisible({ timeout: 20_000 });
    await expect(inlineDialog).toHaveAttribute('data-variant', 'inline-create');
    await expect(page.getByTestId('variables-dialog-title')).toHaveText('创建变量');
    await expect(page.getByTestId('variables-name-input')).toHaveValue('bar');
    await expect(page.getByTestId('variables-value-input')).toHaveValue('8');
    await expect(page.getByTestId('variables-type-length')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('variables-confirm').click();
    await expect(inlineDialog).toHaveCount(0, { timeout: 30_000 });
    // 变量表刷新后 `#bar` 转为有效态；✓ 提交表达式尺寸。
    await expect(page.getByTestId('sketch-dimension-confirm')).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId('sketch-dimension-confirm').click();
    await expect(inlineInput).toHaveCount(0, { timeout: 30_000 });
    const barRow = page.getByTestId('part-studio-variable-list').getByText('#bar = 8 mm');
    await expect(barRow).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('part-studio-sketch-dialog').getByRole('button', { name: '确认' }).click();
    await expect(page.getByTestId('part-studio-sketch-dialog')).toHaveCount(0, { timeout: 20_000 });
    await expect.poll(volumeOf, { timeout: 60_000, intervals: [800, 1500, 3000] })
      .toBeGreaterThan(799);
    expect(await volumeOf()).toBeLessThan(801);

    // 8) push + 冷重开：变量表（宽度/高度表达式）与树行/几何保持。
    await pushExampleChanges(page, 'variables UI acceptance');
    await page.reload();
    ctx = await openWithRetry();
    await expect(page.getByTestId('part-studio-variable-list')).toContainText('#width = 20 mm', {
      timeout: 60_000,
    });
    await expect(page.getByTestId('part-studio-variable-list')).toContainText('#bar = 8 mm');
    const reopened = await getVariablesRpc(ctx, token);
    expect(reopened).toEqual([
      expect.objectContaining({ id: 'v1', name: 'width', expression: '20', type: 'length' }),
      expect.objectContaining({ name: 'bar', expression: '8', type: 'length' }),
    ]);
    const reopenedSketch = await getSketchRpc(ctx, sketchId, token);
    expect(constraintOf(reopenedSketch, WIDTH_CONSTRAINT_ID)?.expression).toBe('#width');
    expect(constraintOf(reopenedSketch, HEIGHT_CONSTRAINT_ID)?.expression).toBe('#bar');
    await expect.poll(volumeOf, { timeout: 60_000, intervals: [800, 1500, 3000] })
      .toBeGreaterThan(799);
    expect(await volumeOf()).toBeLessThan(801);
  });
});
