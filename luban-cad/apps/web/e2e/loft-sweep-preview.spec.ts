/**
 * loft/sweep 插入预览真栈验收（2026-11-08）。
 *
 * RPC 建 4 张草图（loft 两平行截面 + sweep 圆轮廓/直线路径）→ ribbon「放样」
 * 选两截面 → 后端影子求值几何出现（data-dynamic=1）→ 提交；ribbon「扫掠」选
 * 轮廓/路径 → 预览 → 提交。树含 loft/sweep 且 status=0，push+重开一致。
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

function circleSketch(radius: number): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
  return {
    entities: [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'circle', id: 21, center: 1, radius },
    ],
    constraints: [{ kind: 'radius', id: 31, refs: [21], value: radius }],
  };
}

function lineSketch(length: number): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
  return {
    entities: [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 0, y: length },
      { kind: 'line', id: 11, p1: 1, p2: 2 },
    ],
    constraints: [
      { kind: 'vertical', id: 41, refs: [11] },
      { kind: 'distance', id: 42, refs: [1, 2], value: length },
    ],
  };
}

const XY_PLANE = (z: number): SketchPlaneDto => ({
  origin: { x: 0, y: 0, z },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
});
/** YZ 平面（normal +X、xDir +Y）：局部 (u,v) → 世界 (0,u,v)。 */
const YZ_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 1, y: 0, z: 0 },
  xDir: { x: 0, y: 1, z: 0 },
};

test.describe('loft/sweep 插入预览（2026-11-08）', () => {
  test('两截面放样 + 圆沿线扫掠：预览 data-dynamic=1、树/体积、push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Loft Sweep Preview', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'loft-sweep-preview');
    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };
    const a = rectangleSketch(10, 10);
    const sketchA = await apply(
      { kind: 'insertSketch', entities: a.entities, constraints: a.constraints, plane: XY_PLANE(0) },
      'loft 截面 A',
    );
    const b = rectangleSketch(20, 20);
    const sketchB = await apply(
      { kind: 'insertSketch', entities: b.entities, constraints: b.constraints, plane: XY_PLANE(10) },
      'loft 截面 B',
    );
    const profile = circleSketch(2);
    await apply(
      { kind: 'insertSketch', entities: profile.entities, constraints: profile.constraints, plane: XY_PLANE(0) },
      'sweep 轮廓',
    );
    const path = lineSketch(10);
    await apply(
      { kind: 'insertSketch', entities: path.entities, constraints: path.constraints, plane: YZ_PLANE },
      'sweep 路径',
    );
    await releaseWriteLease(ctx, lease, token);

    // 刷新 UI 树/草图选项（RPC 建链后）。
    await page.reload();
    ctx = await openWithRetry();
    const featureList = page.getByTestId('part-studio-feature-list');

    // ── loft：两截面 → 预览 → 提交 ─────────────────────────────────────────
    await page.getByRole('button', { name: '放样', exact: true }).click({ timeout: 30_000 });
    const loftDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(loftDialog).toBeVisible({ timeout: 30_000 });
    await loftDialog.getByRole('combobox', { name: '截面草图 1' }).selectOption(sketchA);
    await loftDialog.getByRole('combobox', { name: '截面草图 2' }).selectOption(sketchB);
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    await expect(loftDialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 15_000 });
    await loftDialog.getByRole('button', { name: '确认' }).click({ timeout: 30_000 });
    await expect(loftDialog).toBeHidden({ timeout: 180_000 });
    await expect(featureList.getByRole('button', { name: /放样/ })).toBeVisible({ timeout: 90_000 });

    // ── sweep：轮廓 + 路径 → 预览 → 提交 ───────────────────────────────────
    await page.getByRole('button', { name: '扫掠', exact: true }).click({ timeout: 30_000 });
    const sweepDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(sweepDialog).toBeVisible({ timeout: 30_000 });
    await sweepDialog.getByRole('combobox', { name: '轮廓草图' }).selectOption({ label: '草图 3' });
    await sweepDialog.getByRole('combobox', { name: '路径草图' }).selectOption({ label: '草图 4' });
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    await expect(sweepDialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 15_000 });
    await sweepDialog.getByRole('button', { name: '确认' }).click({ timeout: 30_000 });
    await expect(sweepDialog).toBeHidden({ timeout: 180_000 });
    await expect(featureList.getByRole('button', { name: /扫掠/ })).toBeVisible({ timeout: 90_000 });

    // ── 树/体积/持久化 ─────────────────────────────────────────────────────
    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual([
      'sketch', 'sketch', 'sketch', 'sketch', 'loft', 'sweep',
    ]);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const mass = await getMassPropertiesRpc(ctx, token);
    expect(mass.length).toBe(1);
    const volume = mass.reduce((sum, item) => sum + item.volume, 0);
    console.log(`[loft-sweep] volume=${volume.toFixed(3)} mm³`);
    expect(volume).toBeGreaterThan(2000); // 10×10→20×20 棱台 2333.33 mm³ + 内含圆柱并集

    await pushExampleChanges(page, 'loft/sweep preview acceptance');
    await page.reload();
    ctx = await openWithRetry();
    const reopened = await getFeatureTreeRpc(ctx, token);
    expect(reopened.map((row) => row.featureType)).toEqual([
      'sketch', 'sketch', 'sketch', 'sketch', 'loft', 'sweep',
    ]);
    expect(reopened.every((row) => row.status === 0)).toBe(true);
    const reopenedVolume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(reopenedVolume).toBeCloseTo(volume, 0);
  });
});
