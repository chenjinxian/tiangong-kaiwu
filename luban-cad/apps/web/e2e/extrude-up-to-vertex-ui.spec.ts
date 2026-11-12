/**
 * ADR-0017 Stage G1 真栈验收：extrude「成形到顶点」UI 切片。
 *
 * 后端/契约 v1.60 已支持（extrude-up-to-vertex.spec.ts 覆盖），本切片补 UI：
 * 板 20×20×5 → 顶点草图（z=3 点 (5,5)）→ 切除草图 10×10（最近草图=拉伸轮廓）
 * → UI：移除 + 成形到顶点 + 目标顶点 → 去材 300 → **1700 mm³**；树 params
 * 携带 endVertexRef；push + 冷重开一致。
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
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { openSeedImodelEditor } from './helpers.js';
import { pushExampleChanges } from './examples/imodel.js';

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
const VERTEX_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 3 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};
const EXPECTED_VOLUME_MM3 = 2000 - 10 * 10 * 3;

test.describe('Extrude 成形到顶点 UI（Stage G1）', () => {
  test('移除 + 目标顶点 → 1700 mm³/push+冷重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
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
    const lease = await borrowWriteLease(ctx, token, 'extrude-up-to-vertex-ui');
    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

    // ── 板 → 顶点草图 → 切除草图（最近草图=切除草图，UI 自动选中）──────────
    const plate = rectangleSketch(20, 20);
    const plateSketchId = await apply(
      { kind: 'insertSketch', entities: plate.entities, constraints: plate.constraints, plane: XY_PLANE },
      '板草图',
    );
    await apply(
      {
        kind: 'insertFeature', featureType: 'extrude',
        params: { profile: [], distance: 5, sketchId: plateSketchId, regions: [0] },
      },
      '板拉伸',
    );
    const vertexSketchId = await apply(
      {
        kind: 'insertSketch',
        entities: [{ kind: 'point', id: 1, x: 5, y: 5 }],
        constraints: [],
        plane: VERTEX_PLANE,
      },
      '顶点草图',
    );
    const cut = rectangleSketch(10, 10);
    await apply(
      { kind: 'insertSketch', entities: cut.entities, constraints: cut.constraints, plane: XY_PLANE },
      '切除草图',
    );
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openWithRetry();

    // ── UI 拉伸：移除 + 成形到顶点 + 目标顶点 ─────────────────────────────
    await page.getByRole('button', { name: '拉伸', exact: true }).click();
    const dialog = page.getByTestId('part-studio-feature-dialog');
    await expect(dialog.getByText('草图 3 的面')).toBeVisible({ timeout: 60_000 });
    await dialog.getByRole('tab', { name: '移除' }).click();
    await dialog.getByRole('combobox', { name: '终止条件' }).selectOption('upToVertex');
    const vertexSelect = dialog.getByRole('combobox', { name: '目标顶点' });
    await expect(vertexSelect).toBeVisible({ timeout: 60_000 });
    const confirm = dialog.getByRole('button', { name: '确认' });
    await expect(confirm).toBeDisabled();
    await vertexSelect.selectOption(`${vertexSketchId}|1|start`);
    await expect(confirm).toBeEnabled({ timeout: 30_000 });
    await confirm.click();
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'sketch', 'extrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[4]!.params).toMatchObject({
      endBound: 'upToVertex',
      endVertexRef: { sketchId: vertexSketchId, entityId: 1, part: 'start' },
      operation: 'remove',
    });
    let volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    console.log(`[extrude-up-to-vertex-ui] volume=${volume.toFixed(3)} expected=${EXPECTED_VOLUME_MM3}`);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3)).toBeLessThan(0.5);

    await pushExampleChanges(page, 'extrude upToVertex UI acceptance');
    await page.reload();
    ctx = await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);
  });
});
