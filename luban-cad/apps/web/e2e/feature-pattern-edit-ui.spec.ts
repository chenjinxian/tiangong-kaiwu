/**
 * ADR-0007 切片 8 真栈 UI 验收：featurePattern 树行双击编辑。
 *
 * 40×40×10 盒（16000）+ 顶面 4×4×5 凸台（80）→ featurePattern linear
 * count=3 spacing=6 沿 X（16240）→ 树行「特征阵列 1」双击 → 编辑对话框
 * 实例数 3→4（源/轴只读保留）→ updateParams → 16000 + 4×80 = **16320 mm³**
 * → push + 重开一致。
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
  releaseWriteLease,
} from './helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './examples/imodel.js';

function rectangleSketch(width: number, height: number, x0 = 0, y0 = 0): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
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

test.describe('featurePattern 编辑 UI（ADR-0007 切片 8）', () => {
  test('树行双击 → 实例数 3→4 → 16320 mm³ push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Feature Pattern Edit UI', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    const ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'feature-pattern-edit-ui');

    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

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
        kind: 'insertFeature',
        featureType: 'featurePattern',
        params: {
          sourceFeatureId: bossFeatureId,
          kind: 'linear',
          count: 3,
          spacing: 6,
          axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
        },
      },
      '特征阵列',
    );

    const mass = async () => {
      const items = await getMassPropertiesRpc(ctx, token);
      return items.reduce((sum, item) => sum + item.volume, 0);
    };
    expect(await mass()).toBeCloseTo(16240, 0);
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'extrude', 'featurePattern']);
    expect(tree.every((row) => row.status === 0)).toBe(true);

    // e2e RPC 建链持有写租约；释放给 UI 会话，否则 previewOp 2s 租约获取失败
    // （FeatureDialog 预览静默不出）——提交时 UI 自行获取完整租约。
    await releaseWriteLease(ctx, lease, token);

    // 双击树行进入编辑（i18n 标签「特征阵列 1」）。
    const featureList = page.getByTestId('part-studio-feature-list');
    await featureList.getByRole('button', { name: /特征阵列/ }).dblclick();
    const dialog = page.getByTestId('part-studio-feature-pattern-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    // 改参几何预览（2026-11-08）：后端影子求值 → TileRpc 动态图形；打开即带
    // 当前参数预览（data-dynamic=1 由 FeaturePreviewOverlay 状态驱动）。
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    await expect(dialog.getByTestId('part-studio-feature-pattern-source')).toHaveText(bossFeatureId);
    await expect(dialog.getByTestId('part-studio-feature-pattern-count')).toHaveValue('3');
    await expect(dialog.getByTestId('part-studio-feature-pattern-spacing')).toHaveValue('6');
    await expect(dialog.getByTestId('part-studio-feature-pattern-axis')).toContainText('只读');
    await expect(dialog.getByTestId('part-studio-feature-pattern-locked-hint')).toContainText('不可更改');
    await dialog.getByTestId('part-studio-feature-pattern-count').fill('4');
    const confirm = dialog.getByTestId('part-studio-feature-pattern-confirm');
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    await confirm.click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    await expect.poll(mass, { timeout: 90_000 }).toBeCloseTo(16320, 0);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'extrude', 'featurePattern']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[4]?.params).toMatchObject({ sourceFeatureId: bossFeatureId, count: 4, spacing: 6 });

    await pushExampleChanges(page, 'featurePattern edit UI acceptance');
    await page.reload();
    await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'extrude', 'featurePattern']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(await mass()).toBeCloseTo(16320, 0);

    // ── 居中编辑（2026-11-08）：重开对话框勾选「居中」，每侧 N=3 → count=5 ──
    // 5 个互不重叠凸台 → 16000 + 5×80 = 16400 mm³；params count=5 centered:true。
    await page.getByTestId('part-studio-feature-list').getByRole('button', { name: /特征阵列/ }).dblclick();
    const centeredDialog = page.getByTestId('part-studio-feature-pattern-dialog');
    await expect(centeredDialog).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    await centeredDialog.getByRole('checkbox', { name: '居中' }).check();
    // 勾选后输入语义切为每侧 N（当前值 4 原样保留，需改为 3）；与 body pattern 对话框同口径。
    const centeredCount = centeredDialog.getByRole('textbox', { name: '每侧实例数（含原件）' });
    await centeredCount.fill('3');
    await centeredDialog.getByTestId('part-studio-feature-pattern-confirm').click({ timeout: 30_000 });
    await expect(centeredDialog).toBeHidden({ timeout: 180_000 });
    await expect.poll(mass, { timeout: 90_000, intervals: [2000, 5000, 10_000] }).toBeCloseTo(16400, 0);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'extrude', 'featurePattern']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[4]?.params).toMatchObject({ sourceFeatureId: bossFeatureId, count: 5, spacing: 6, centered: true });

    await pushExampleChanges(page, 'featurePattern centered edit acceptance');
    await page.reload();
    await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree[4]?.params).toMatchObject({ count: 5, centered: true });
    expect(await mass()).toBeCloseTo(16400, 0);
  });

  test('第二方向编辑：3×2 网格 2→3 / 间距 8→5 → 16720 mm³ push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Feature Pattern Edit UI Second Direction', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    const ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'feature-pattern-edit-ui-second');

    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

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
    const secondAxis = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } };
    await apply(
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
      '特征阵列（第二方向）',
    );

    const mass = async () => {
      const items = await getMassPropertiesRpc(ctx, token);
      return items.reduce((sum, item) => sum + item.volume, 0);
    };
    // 3×2 = 6 凸台：16000 + 6×80 = 16480 mm³。
    expect(await mass()).toBeCloseTo(16480, 0);
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.every((row) => row.status === 0)).toBe(true);

    // 释放 e2e 写租约给 UI 会话（同前一条用例）。
    await releaseWriteLease(ctx, lease, token);

    const featureList = page.getByTestId('part-studio-feature-list');
    await featureList.getByRole('button', { name: /特征阵列/ }).dblclick();
    const dialog = page.getByTestId('part-studio-feature-pattern-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    const secondEnabled = dialog.getByRole('checkbox', { name: '第二个方向' });
    await expect(secondEnabled).toBeChecked();
    await expect(dialog.getByTestId('part-studio-feature-pattern-second-count')).toHaveValue('2');
    await expect(dialog.getByTestId('part-studio-feature-pattern-second-spacing')).toHaveValue('8');
    await expect(dialog.getByTestId('part-studio-feature-pattern-second-axis')).toContainText('第二方向轴');

    await dialog.getByTestId('part-studio-feature-pattern-second-count').fill('3');
    await dialog.getByTestId('part-studio-feature-pattern-second-spacing').fill('5');
    const confirm = dialog.getByTestId('part-studio-feature-pattern-confirm');
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    await confirm.click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    // 3×3 = 9 凸台：16000 + 9×80 = 16720 mm³。
    await expect.poll(mass, { timeout: 90_000, intervals: [2000, 5000, 10_000] }).toBeCloseTo(16720, 0);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'extrude', 'featurePattern']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[4]?.params).toMatchObject({
      sourceFeatureId: bossFeatureId,
      count: 3,
      spacing: 6,
      secondDirection: { count: 3, spacing: 5, axis: secondAxis },
    });

    await pushExampleChanges(page, 'featurePattern second direction edit acceptance');
    await page.reload();
    await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'extrude', 'featurePattern']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[4]?.params).toMatchObject({ secondDirection: { count: 3, spacing: 5 } });
    expect(await mass()).toBeCloseTo(16720, 0);
  });

  test('多源阵列编辑：3→2 → 16320 mm³，sourceFeatureIds 保形 push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Feature Pattern Edit UI Multi Source', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    const ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'feature-pattern-edit-ui-multi');

    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

    const baseSketch = rectangleSketch(40, 40, -20, -20);
    const baseSketchId = await apply(
      { kind: 'insertSketch', entities: baseSketch.entities, constraints: baseSketch.constraints, plane: XY_PLANE },
      '盒体草图',
    );
    await apply(
      { kind: 'insertFeature', featureType: 'extrude', params: { profile: [], distance: 10, sketchId: baseSketchId, regions: [0], operation: 'new' } },
      '盒体拉伸',
    );
    // 两个独立凸台（y=2 与 y=−12），同一次多源阵列。
    const bossA = rectangleSketch(4, 4, 2, 2);
    const bossASketchId = await apply(
      { kind: 'insertSketch', entities: bossA.entities, constraints: bossA.constraints, plane: TOP_PLANE },
      '凸台 A 草图',
    );
    const bossAId = await apply(
      { kind: 'insertFeature', featureType: 'extrude', params: { profile: [], distance: 5, sketchId: bossASketchId, regions: [0], operation: 'add' } },
      '凸台 A 拉伸',
    );
    const bossB = rectangleSketch(4, 4, 2, -12);
    const bossBSketchId = await apply(
      { kind: 'insertSketch', entities: bossB.entities, constraints: bossB.constraints, plane: TOP_PLANE },
      '凸台 B 草图',
    );
    const bossBId = await apply(
      { kind: 'insertFeature', featureType: 'extrude', params: { profile: [], distance: 5, sketchId: bossBSketchId, regions: [0], operation: 'add' } },
      '凸台 B 拉伸',
    );
    await apply(
      {
        kind: 'insertFeature',
        featureType: 'featurePattern',
        params: {
          sourceFeatureIds: [bossAId, bossBId],
          kind: 'linear',
          count: 3,
          spacing: 6,
          axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
        },
      },
      '多源特征阵列',
    );

    const mass = async () => {
      const items = await getMassPropertiesRpc(ctx, token);
      return items.reduce((sum, item) => sum + item.volume, 0);
    };
    // 2 源 + 2×(3−1) 副本 = 6 凸台：16000 + 6×80 = 16480 mm³。
    expect(await mass()).toBeCloseTo(16480, 0);
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType))
      .toEqual(['sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude', 'featurePattern']);
    expect(tree.every((row) => row.status === 0)).toBe(true);

    await releaseWriteLease(ctx, lease, token);

    const featureList = page.getByTestId('part-studio-feature-list');
    await featureList.getByRole('button', { name: /特征阵列/ }).dblclick();
    const dialog = page.getByTestId('part-studio-feature-pattern-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    const source = dialog.getByTestId('part-studio-feature-pattern-source');
    await expect(source).toHaveAttribute('data-multi', 'true');
    await expect(dialog.getByTestId('part-studio-feature-pattern-source-0')).toHaveText(bossAId);
    await expect(dialog.getByTestId('part-studio-feature-pattern-source-1')).toHaveText(bossBId);
    await expect(dialog.getByTestId('part-studio-feature-pattern-multi-source-hint')).toContainText('结构引用');
    await expect(dialog.getByTestId('part-studio-feature-pattern-count')).toHaveValue('3');
    await dialog.getByTestId('part-studio-feature-pattern-count').fill('2');
    const confirm = dialog.getByTestId('part-studio-feature-pattern-confirm');
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    await confirm.click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    // 2 源 + 2×(2−1) 副本 = 4 凸台：16000 + 4×80 = 16320 mm³。
    await expect.poll(mass, { timeout: 90_000, intervals: [2000, 5000, 10_000] }).toBeCloseTo(16320, 0);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[6]?.params).toMatchObject({
      sourceFeatureIds: [bossAId, bossBId],
      count: 2,
      spacing: 6,
    });
    expect(tree[6]?.params).not.toHaveProperty('sourceFeatureId');

    await pushExampleChanges(page, 'featurePattern multi-source edit acceptance');
    await page.reload();
    await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType))
      .toEqual(['sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude', 'featurePattern']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[6]?.params).toMatchObject({ sourceFeatureIds: [bossAId, bossBId], count: 2 });
    expect(await mass()).toBeCloseTo(16320, 0);
  });
});
