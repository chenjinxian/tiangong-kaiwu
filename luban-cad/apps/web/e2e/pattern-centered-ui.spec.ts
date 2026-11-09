/**
 * ADR-0007 切片 6 真栈 UI 验收：body（PART）级 pattern 的「居中」复选框。
 *
 * 盒 4×4×5（80 mm³，草图原点起）→ ribbon「线性阵列」→ FeatureDialog 勾选
 * 「居中」→ 每侧实例数 N=3（总实例数 2N−1=5）+ 间距 6 → insertFeature/pattern
 * {kind:'linear', count:5, spacing:6, axis:'X', centered:true} →
 * 5 个互不重叠盒 **400 mm³**、质心 x=2（seed 自身居中，±6/±12）→ push + 重开一致。
 */
import { expect, test } from '@playwright/test';
import type { FeatureOp, SketchConstraintDto, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
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

function rectangleSketch(width: number, height: number): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
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

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

test.describe('Body pattern 居中 UI（ADR-0007 切片 6）', () => {
  test('线性阵列勾选居中 N=3 spacing=6 → count=5 → 400 mm³ 质心 x=2/push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Pattern Centered UI', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'pattern-centered-ui');

    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

    const sketch = rectangleSketch(4, 4);
    const sketchId = await apply(
      { kind: 'insertSketch', entities: sketch.entities, constraints: sketch.constraints, plane: XY_PLANE },
      '盒体草图',
    );
    await apply(
      {
        kind: 'insertFeature', featureType: 'extrude',
        params: { profile: [], distance: 5, sketchId, regions: [0] },
      },
      '盒体拉伸',
    );

    await page.getByRole('button', { name: '线性阵列', exact: true }).click({ timeout: 30_000 });
    const countLabel = '实例数量（含原件）';
    await expect(page.getByRole('textbox', { name: countLabel })).toHaveValue('3', { timeout: 30_000 });
    await page.getByRole('checkbox', { name: '居中' }).check();
    // 居中后输入语义切换为每侧 N（含 seed），并出现 2N−1 提示。
    await expect(page.getByRole('textbox', { name: '每侧实例数（含原件）' })).toHaveValue('3');
    await expect(page.getByTestId('part-studio-feature-dialog-pattern-centered-hint')).toContainText('2N−1');
    await page.getByRole('textbox', { name: '间距' }).fill('6');
    const confirm = page.getByRole('button', { name: '确认' });
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    // 后端影子求值几何 → TileRpc 动态预览（2026-11-08 接入 pattern）。
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    await confirm.click({ timeout: 30_000 });

    const mass = async (context: typeof ctx) => {
      const items = await getMassPropertiesRpc(context, token);
      const volume = items.reduce((sum, item) => sum + item.volume, 0);
      const centroid = items.reduce(
        (sum, item) => ({
          x: sum.x + item.centroid.x * item.volume,
          y: sum.y + item.centroid.y * item.volume,
          z: sum.z + item.centroid.z * item.volume,
        }),
        { x: 0, y: 0, z: 0 },
      );
      return {
        volume,
        centroid: { x: centroid.x / volume, y: centroid.y / volume, z: centroid.z / volume },
      };
    };
    let result = await mass(ctx);
    console.log(`[pattern-centered-ui] volume=${result.volume.toFixed(3)} centroid=(${result.centroid.x.toFixed(3)},${result.centroid.y.toFixed(3)},${result.centroid.z.toFixed(3)})`);
    expect(result.volume).toBeCloseTo(400, 2);
    expect(result.centroid.x).toBeCloseTo(2, 3);
    expect(result.centroid.y).toBeCloseTo(2, 3);
    expect(result.centroid.z).toBeCloseTo(2.5, 3);

    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'pattern']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[2]?.params).toMatchObject({
      kind: 'linear',
      count: 5,
      spacing: 6,
      axis: 'X',
      centered: true,
    });

    await pushExampleChanges(page, 'body pattern centered UI acceptance');
    await page.reload();
    ctx = await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'pattern']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    result = await mass(ctx);
    expect(result.volume).toBeCloseTo(400, 2);
    expect(result.centroid.x).toBeCloseTo(2, 3);

    // ── 编辑态预览（2026-11-08）：双击「阵列」行 → updateParams 影子求值预览 ──
    // e2e RPC 链持有写租约，先释放给 UI 会话，否则 previewOp 租约获取失败。
    await releaseWriteLease(ctx, lease, token);
    await page.getByTestId('part-studio-feature-list').getByRole('button', { name: /阵列/ }).dblclick();
    const editDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(editDialog).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    await editDialog.getByRole('button', { name: '取消' }).click();
    await expect(editDialog).toBeHidden({ timeout: 30_000 });
    result = await mass(ctx);
    expect(result.volume).toBeCloseTo(400, 2);
  });
});
