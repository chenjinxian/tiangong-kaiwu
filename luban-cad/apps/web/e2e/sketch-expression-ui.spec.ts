/**
 * ADR-0020 S2 真栈验收（UI 级）：草图尺寸表达式输入 + `显示表达式` 标签投影 +
 * `#` 补全/无效态 + angle 紧凑对话框。
 *
 * 依赖（未发布，运行前必须在本机就绪）：
 * - shared 1.72 工作树（含 `VariableDto.type/description` 与求值器）；
 * - 新后端 modeling-server（schema 01.00.01 + getVariables + 表达式求值），以
 *   源码模式启动 MS：`scripts/start-ms-host.ps1 -Source <luban-backend>\modeling-server`。
 *   产物模式（dist-backend）仍是旧后端，会因未知 op/查询而失败。
 *
 * 链路：RPC 建变量 width=10 → 10×10 方形草图 + 拉伸 5（500 mm³）→ 打开草图，
 * 双击宽度尺寸 → 输入 `#width*2` → ✓（表达式 wholesale updateSketch）→ 几何
 * 20×10、体积 1000 mm³；标签 data-text 显示表达式原文；`显示表达式` 关闭 →
 * data-text 回到求值数；`#nope` → ✓ 禁用/红下划线/对话框保持，取消后原值不变；
 * angle 尺寸对话框为 159px 紧凑变体（无展开器/参数状态切换键）。
 *
 * 说明：标签文本由 canvas 绘制，e2e 断言 `sketch-dimension-label` 观测标记上的
 * `data-text` 镜像（不声称 live 标签形态已采集；ADR-0020 §2.6 D1 为可逆推断）。
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
  openSeedImodelEditor,
  releaseWriteLease,
} from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { activate, clickBlank, dataPoint, projectWorld, setStandardView } from './tutorial2-helpers.js';

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

const WIDTH_CONSTRAINT_ID = 29;
const HEIGHT_CONSTRAINT_ID = 30;

/** 矩形草图（与 sketch-expressions/SketchFlow 同形：8 点 + 4 线 + 10 约束）。 */
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
    // 线长尺寸（不是点对 distance）：尺寸工具点击已标注线时按同一实体命中
    // 既有约束（W21），评审 P1 的既有表达式弹层路径才能真栈走到。
    { kind: 'length', id: WIDTH_CONSTRAINT_ID, refs: [11], value: width },
    { kind: 'length', id: HEIGHT_CONSTRAINT_ID, refs: [12], value: height },
  ];
  return { entities, constraints };
}

/** 角度草图：水平线 + 竖直线（非平行 → 可落 angle 约束）。 */
const ANGLE_ENTITIES: SketchEntityDto[] = [
  { kind: 'line', id: 1, p1: { x: -12, y: 0 }, p2: { x: 0, y: 0 } },
  { kind: 'line', id: 2, p1: { x: 0, y: 0 }, p2: { x: 0, y: 12 } },
];

function pointX(sketch: SketchDto | undefined, pointId: number): number | undefined {
  const entity = sketch?.entities.find((candidate) => candidate.id === pointId);
  return entity?.kind === 'point' ? entity.x : undefined;
}

function constraintOf(sketch: SketchDto | undefined, constraintId: number): SketchConstraintDto | undefined {
  return sketch?.constraints.find((candidate) => candidate.id === constraintId);
}

interface Pt { x: number; y: number }

test.describe('ADR-0020 S2 草图尺寸表达式 UI（真栈）', () => {
  test('变量驱动表达式尺寸 → 几何/体积 → 显示表达式 → 无效态 → angle 紧凑', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 420_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const openWithRetry = async () => {
      try {
        return await openSeedImodelEditor(page, seed);
      } catch {
        await page.reload();
        return openSeedImodelEditor(page, seed);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'sketch-expression-ui');
    const volumeOf = async (): Promise<number> => {
      const bodies = await getMassPropertiesRpc(ctx, token);
      return bodies.reduce((max, body) => Math.max(max, body.volume), 0);
    };
    let sketchId: string;
    let angleSketchId: string;
    try {
      // 1) 变量 width=10（后端权威求值；S3a 读面带 type 缺省 length）。
      let result = await applyFeatureOpRpc(ctx, {
        kind: 'updateVariables',
        variables: [{ id: 'v1', name: 'width', expression: '10' }],
      } as FeatureOp, lease, token);
      assertFeatureOpOk(result, '建变量表 width=10');

      // 2) 10×10 方形草图（纯数字尺寸，S2 UI 再输入表达式）+ 拉伸 5 → 500 mm³。
      result = await applyFeatureOpRpc(ctx, {
        kind: 'insertSketch',
        ...rectangleSketch(10, 10),
        plane: XY_PLANE,
      }, lease, token);
      assertFeatureOpOk(result, '方形草图');
      sketchId = result.featureId!;

      result = await applyFeatureOpRpc(ctx, {
        kind: 'insertFeature',
        featureType: 'extrude',
        params: { profile: [], distance: 5, sketchId },
      }, lease, token);
      assertFeatureOpOk(result, '拉伸 5');
      await expect.poll(volumeOf, { timeout: 60_000, intervals: [800, 1500, 3000] })
        .toBeGreaterThan(499);
      expect(await volumeOf()).toBeLessThan(501);

      // 3) 角度草图（angle 尺寸对话框紧凑变体用；无特征依赖）。
      result = await applyFeatureOpRpc(ctx, {
        kind: 'insertSketch',
        entities: ANGLE_ENTITIES,
        constraints: [{ kind: 'angle', id: 1, refs: [1, 2], value: Math.PI / 2 }],
        plane: XY_PLANE,
      }, lease, token);
      assertFeatureOpOk(result, '角度草图');
      angleSketchId = result.featureId!;
    } finally {
      await releaseWriteLease(ctx, lease, token);
    }

    // 4) 打开方形草图（词库/树桥就绪后双击树行）。
    await page.reload();
    ctx = await openWithRetry();
    const sketchRow = page.getByTestId(`tree-row-${sketchId}`);
    await expect(sketchRow).toBeVisible({ timeout: 60_000 });
    await sketchRow.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const centerOf = async (constraintId: number): Promise<Pt> => {
      const marker = page.locator(`[data-testid="sketch-dimension-label"][data-constraint-id="${constraintId}"]`);
      await expect(marker).toBeAttached({ timeout: 60_000 });
      const center = await marker.getAttribute('data-center');
      expect(center).not.toBeNull();
      const parts = center!.split(',').map(Number);
      return { x: box!.x + (parts[0] ?? 0), y: box!.y + (parts[1] ?? 0) };
    };

    // 5) 双击宽度尺寸 → `#width*2` → ✓ 提交（表达式 wholesale updateSketch）。
    const widthAt = await centerOf(WIDTH_CONSTRAINT_ID);
    await page.mouse.dblclick(widthAt.x, widthAt.y);
    const input = page.getByTestId('sketch-dimension-input');
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill('#width*2');
    const confirm = page.getByTestId('sketch-dimension-confirm');
    // 变量表读取完成后 `#width*2` 立即有效（live：✓ 可用；enter 不是唯一提交姿势）。
    await expect(confirm).toBeEnabled({ timeout: 20_000 });
    await confirm.click();
    await expect(input).toHaveCount(0, { timeout: 30_000 });

    await expect.poll(async () => {
      const current = await getSketchRpc(ctx, sketchId, token);
      const width = constraintOf(current, WIDTH_CONSTRAINT_ID);
      return width?.expression === '#width*2' && Math.abs((width.value ?? 0) - 20) < 0.001
        ? Math.abs((pointX(current, 2) ?? 0) - 20)
        : 999;
    }, { timeout: 40_000, intervals: [800, 1500, 3000] }).toBeLessThan(0.01);
    // 几何 20×10 → 拉伸体积 20×10×5 = 1000 mm³（表达式驱动特征重建）。
    await expect.poll(volumeOf, { timeout: 60_000, intervals: [800, 1500, 3000] })
      .toBeGreaterThan(999);
    expect(await volumeOf()).toBeLessThan(1001);

    // 6) 标签投影：默认「显示表达式」勾选 → data-text 为表达式原文。
    const widthMarker = page.locator(
      `[data-testid="sketch-dimension-label"][data-constraint-id="${WIDTH_CONSTRAINT_ID}"]`,
    );
    await expect(widthMarker).toHaveAttribute('data-text', '#width*2', { timeout: 30_000 });
    const showExpressions = page.getByRole('checkbox', { name: '显示表达式' });
    await expect(showExpressions).toBeChecked();
    await showExpressions.uncheck();
    await expect(widthMarker).toHaveAttribute('data-text', '20', { timeout: 10_000 });
    await showExpressions.check();
    await expect(widthMarker).toHaveAttribute('data-text', '#width*2', { timeout: 10_000 });

    // 7) 无效表达式 `#nope`：✓ 禁用、红下划线、对话框保持；取消后原值不变。
    const heightAt = await centerOf(HEIGHT_CONSTRAINT_ID);
    await page.mouse.dblclick(heightAt.x, heightAt.y);
    const invalidInput = page.getByTestId('sketch-dimension-input');
    await expect(invalidInput).toBeVisible({ timeout: 10_000 });
    await invalidInput.fill('#nope');
    await expect(invalidInput).toHaveAttribute('data-error', 'true', { timeout: 10_000 });
    const invalidConfirm = page.getByTestId('sketch-dimension-confirm');
    await expect(invalidConfirm).toBeDisabled();
    // Enter 不得偷换为提交（保持对话框打开、零模型变更）。
    await invalidInput.press('Enter');
    await expect(invalidInput).toBeVisible();
    await page.getByTestId('sketch-dimension-cancel').click();
    await expect(invalidInput).toHaveCount(0, { timeout: 10_000 });
    const afterCancel = await getSketchRpc(ctx, sketchId, token);
    const height = constraintOf(afterCancel, HEIGHT_CONSTRAINT_ID);
    expect(height?.expression).toBeUndefined();
    expect(height?.value).toBeCloseTo(10, 6);

    // 7b) 评审 P1 真栈路径：尺寸工具点已带表达式的线 → 既有尺寸弹层预填
    //     `#width*2`；不改直接确认仍走 wholesale updateSketch（expression 不被
    //     数值通道清除）。俯视紧取景保证线中点投影落在曲线命中半径内。
    await setStandardView(page, 0, {
      low: { x: -10, y: -10, z: 0 },
      high: { x: 30, y: 20, z: 10 },
    });
    const hub = { x: box!.x, y: box!.y };
    const [widthLineMid] = await projectWorld(page, hub, [{ x: 10, y: 0, z: 0 }]);
    expect(widthLineMid).toBeDefined();
    await activate(page, '尺寸');
    const existingPopup = page.getByTestId('sketch-value-popup');
    const existingInput = page.getByTestId('sketch-value-input');
    await dataPoint(page, widthLineMid!.x, widthLineMid!.y);
    await clickBlank(page, hub);
    await expect(existingPopup).toBeVisible({ timeout: 20_000 });
    await expect(existingInput).toHaveValue('#width*2');
    await page.getByTestId('sketch-value-confirm').click();
    await expect(existingPopup).toHaveCount(0, { timeout: 20_000 });
    await expect.poll(async () => {
      const current = await getSketchRpc(ctx, sketchId, token);
      const width = constraintOf(current, WIDTH_CONSTRAINT_ID);
      return width?.expression === '#width*2' && Math.abs((width.value ?? 0) - 20) < 0.001
        ? 0
        : 999;
    }, { timeout: 40_000, intervals: [800, 1500, 3000] }).toBe(0);
    await expect.poll(volumeOf, { timeout: 60_000, intervals: [800, 1500, 3000] })
      .toBeGreaterThan(999);
    // W19：确认后尺寸工具保持安装；Esc 退出工具再完成草图。
    await page.keyboard.press('Escape');

    // 8) 完成方形草图，打开角度草图 → angle 尺寸对话框 159px 紧凑变体。
    await page.getByTestId('part-studio-sketch-dialog').getByRole('button', { name: '确认' }).click();
    await expect(page.getByTestId('part-studio-sketch-dialog')).toHaveCount(0, { timeout: 20_000 });

    const angleRow = page.getByTestId(`tree-row-${angleSketchId}`);
    await expect(angleRow).toBeVisible({ timeout: 60_000 });
    await angleRow.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    // 评审 P3：角度草图线段延伸到取景框外，先正视+紧取景再双击标签
    //（与 sketch-dimension-edit 同一做法）。
    await setStandardView(page, 0, {
      low: { x: -30, y: -20, z: 0 },
      high: { x: 30, y: 30, z: 10 },
    });
    // 相机变化 → 标注布局异步重算：等两帧后再读 data-center（避免陈旧位置）。
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    const angleAt = await centerOf(1);
    await page.mouse.dblclick(angleAt.x, angleAt.y);
    const angleDialog = page.getByTestId('sketch-dimension-dialog');
    await expect(angleDialog).toBeVisible({ timeout: 10_000 });
    await expect(angleDialog).toHaveClass(/part-studio-dimension-editor-dialog--compact/);
    const angleBox = await angleDialog.boundingBox();
    expect(angleBox).not.toBeNull();
    expect(Math.abs(angleBox!.width - 159)).toBeLessThanOrEqual(1);
    // 无展开器/参数状态切换键（live §2.6.4）。
    await expect(page.getByTestId('sketch-dimension-expander')).toHaveCount(0);
    await expect(page.getByTestId('sketch-dimension-state-toggle')).toHaveCount(0);
    await expect(page.getByTestId('sketch-dimension-unit')).toHaveText('deg');
    await page.getByTestId('sketch-dimension-cancel').click();
    await expect(angleDialog).toHaveCount(0, { timeout: 10_000 });
  });
});
