/**
 * W45 S14（ADR-0020 S6/S9/S12 残项收口）：FEATURE 阵列（featurePattern）表达式
 * **真栈**验收——此前 S6/S9/S12 的 FEATURE 通道仅单测覆盖。
 *
 * 链路（RPC 建链 + UI 编辑对话框）：
 *   1) 40×40×10 盒（16000）+ 顶面 4×4×5 凸台（80）；
 *   2) 变量 sp=6（length）、sp2=8（length）、ang=360（angle）；
 *   3) featurePattern linear count=3 spacing=6（X）+ secondDirection count=2
 *      spacing=8（Y）→ 6 凸台 = 16480 mm³；
 *   4) UI 双击树行 → 间距填 `#sp`、第二方向间距填 `#sp2` → 确认；
 *      树 params `{spacing:6, spacingExpression:'#sp', secondDirection:{spacing:8,
 *      spacingExpression:'#sp2'}}`（物化快照 + 原文）；
 *   5) 再开对话框 → 切环形 → 角度填 `#ang` → 确认；树 params
 *      `{kind:'circular', angle:360, angleExpression:'#ang'}`（第二方向清除）；
 *   6) push + 冷重开 → 环形角度表达式/数值保持，体积一致。
 *
 * 前置：shared 1.80 工作树 + 新私有后端（源码模式 MS）+ Vite 以
 * `VITE_EDITOR_AUTOSAVE=0 VITE_B_MODEL_ENABLED=true VITE_E2E_HOOKS=true` 启动；
 * 发布产物（shared 1.70）不兼容。
 */
import { expect, test } from '@playwright/test';
import type { FeatureOp, SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
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

const XY_PLANE = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};
const TOP_PLANE = {
  origin: { x: 0, y: 0, z: 10 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

test.describe('W45 S14：FEATURE 阵列表达式真栈（间距/第二方向/环形角度）', () => {
  test('间距 `#sp` + 第二方向 `#sp2` + 环形角度 `#ang` → 树物化快照 → push+冷重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Feature Pattern Expression Fields', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await reloadWithFlush(page);
        return openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'feature-pattern-expression-fields');

    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

    // ── 1) 盒体 + 凸台 + 变量 ──────────────────────────────────────────
    const baseSketch = rectangleSketch(40, 40, -20, -20);
    const baseSketchId = await apply(
      { kind: 'insertSketch', entities: baseSketch.entities, constraints: baseSketch.constraints, plane: XY_PLANE },
      '盒体草图',
    );
    await apply(
      { kind: 'insertFeature', featureType: 'extrude', params: { profile: [], distance: 10, sketchId: baseSketchId, regions: [0], operation: 'new' } },
      '盒体拉伸',
    );
    const bossSketch = rectangleSketch(4, 4, 2, 2);
    const bossSketchId = await apply(
      { kind: 'insertSketch', entities: bossSketch.entities, constraints: bossSketch.constraints, plane: TOP_PLANE },
      '凸台草图',
    );
    const bossFeatureId = await apply(
      { kind: 'insertFeature', featureType: 'extrude', params: { profile: [], distance: 5, sketchId: bossSketchId, regions: [0], operation: 'add' } },
      '凸台拉伸',
    );
    await apply(
      {
        kind: 'updateVariables',
        variables: [
          // 变量值与落库数值故意不同（9≠6、12≠8、90≠360）：证明物化取求值，
          // 不是把数值草稿转成表达式原文。
          { id: 'v1', name: 'sp', expression: '9', type: 'length' },
          { id: 'v2', name: 'sp2', expression: '12', type: 'length' },
          { id: 'v3', name: 'ang', expression: '90', type: 'angle' },
        ],
      } as FeatureOp,
      '变量 sp/sp2/ang',
    );

    // ── 2) featurePattern linear 3×2 ────────────────────────────────────
    const secondAxis = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } };
    const patternFeatureId = await apply(
      {
        kind: 'insertFeature',
        featureType: 'featurePattern',
        params: {
          sourceFeatureId: bossFeatureId,
          kind: 'linear',
          count: 3,
          spacing: 6,
          axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
          secondDirection: { count: 2, spacing: 8, axis: secondAxis },
        },
      },
      '特征阵列（3×2）',
    );

    const mass = async () => {
      const items = await getMassPropertiesRpc(ctx, token);
      return items.reduce((sum, item) => sum + item.volume, 0);
    };
    expect(await mass()).toBeCloseTo(16480, 0);
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'extrude', 'featurePattern']);
    expect(tree.every((row) => row.status === 0)).toBe(true);

    // 释放 e2e 写租约给 UI 会话（previewOp 需要 UI 自取租约）。
    await releaseWriteLease(ctx, lease, token);
    await reloadWithFlush(page);
    ctx = await openWithRetry();
    // 变量表就绪门：未就绪时表达式字段失焦会停留在原文（求值不可用）。
    await expect(page.getByTestId('tree-variable-v1')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('tree-variable-v3')).toBeVisible({ timeout: 60_000 });

    // ── 3) UI 间距 `#sp` + 第二方向间距 `#sp2` ─────────────────────────
    await page.getByTestId(`tree-row-${patternFeatureId}`).dblclick();

    let dialog = page.getByTestId('part-studio-feature-pattern-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    const spacing = dialog.getByTestId('part-studio-feature-pattern-spacing');
    await expect(spacing).toHaveValue('6');
    await spacing.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('#sp');
    await page.keyboard.press('Tab');
    await expect(spacing).toHaveValue('9');
    // 第二方向默认展开（W10c），间距字段可见。
    const secondSpacing = dialog.getByTestId('part-studio-feature-pattern-second-spacing');
    await expect(secondSpacing).toHaveValue('8');
    await secondSpacing.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('#sp2');
    await page.keyboard.press('Tab');
    await expect(secondSpacing).toHaveValue('12');
    const confirm = dialog.getByTestId('part-studio-feature-pattern-confirm');
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    await confirm.click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree[4]?.params).toMatchObject({
      kind: 'linear',
      count: 3,
      spacing: 9,
      spacingExpression: '#sp',
      secondDirection: { count: 2, spacing: 12, spacingExpression: '#sp2' },
    });
    expect(await mass()).toBeCloseTo(16480, 0);

    // ── 4) 切环形 + 角度 `#ang`（90° ≠ 落库 360，证明取求值）────────────
    await page.getByTestId(`tree-row-${patternFeatureId}`).dblclick();
    dialog = page.getByTestId('part-studio-feature-pattern-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog.locator('#part-studio-feature-pattern-kind').selectOption('circular');
    const angle = dialog.getByTestId('part-studio-feature-pattern-angle');
    await expect(angle).toHaveValue('360', { timeout: 15_000 });
    await angle.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('#ang');
    await page.keyboard.press('Tab');
    await expect(angle).toHaveValue('90');
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    await confirm.click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree[4]?.params).toMatchObject({
      kind: 'circular',
      count: 3,
      angle: 90,
      angleExpression: '#ang',
    });
    // 环形载荷不得携带任何 linear 键（角/间距/第二方向）。
    expect(tree[4]?.params).not.toHaveProperty('spacing');
    expect(tree[4]?.params).not.toHaveProperty('spacingExpression');
    expect(tree[4]?.params).not.toHaveProperty('secondDirection');
    expect(tree.every((row) => row.status === 0)).toBe(true);
    // P2：环形结果不得等同 linear 3×2（防「参数写成环形但几何仍是线性」假绿）；
    // 轮询到重建落地（部分角 0/45/90° 与基体重叠，体积必然偏离 16480）。
    await expect.poll(async () => Math.abs((await mass()) - 16480), {
      timeout: 90_000, intervals: [2000, 5000, 10_000],
    }).toBeGreaterThan(1);
    const circularVolume = await mass();
    expect(circularVolume).toBeGreaterThan(16000);
    expect(circularVolume).toBeLessThan(16480);

    // ── 5) push + 冷重开 ───────────────────────────────────────────────
    await pushExampleChanges(page, 'featurePattern expression fields acceptance');
    await reloadWithFlush(page);
    ctx = await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'extrude', 'featurePattern']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[4]?.params).toMatchObject({
      kind: 'circular',
      count: 3,
      angle: 90,
      angleExpression: '#ang',
    });
    expect(await mass()).toBeCloseTo(circularVolume, 0);
  });
});
