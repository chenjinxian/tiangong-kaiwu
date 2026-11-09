/**
 * featureMirror UI 真栈验收（ADR-0011 切片 4，2026-11-08）。
 *
 * Live 证据 mirror-feature-scope-20261108：镜像范围=零件镜像/特征镜像；
 * 特征镜像行=要镜像的特征/镜像平面/重新应用特征。
 * 产品首版（shared 1.47）featureMirror 载荷 {sourceFeatureId, planeLine}，
 * 源限 extrude/revolve/hole；世界平面仅 XY/YZ/XZ（面镜像暂不可表达）。
 *
 * 几何：40×40×10 板（16000）→ 顶面（z=10）Φ6 凸台拉伸 10 加入（+90π）
 * → 特征镜像源=拉伸 2（凸台，非 NEW 体）、平面 YZ x=20 → 镜像凸台并入
 * → **16000 + 2×90π ≈ 16565.486 mm³**（单 body）。
 * 真实 UI：ribbon「镜像」→ 范围「特征镜像」→ 源「拉伸 2」→ 平面 YZ → 确认；
 * 树 featureMirror/status=0、push+重开一致。
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
} from './helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './examples/imodel.js';

function rectangleSketch(
  x0: number,
  x1: number,
  height: number,
): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
  return {
    entities: [
      { kind: 'point', id: 1, x: x0, y: 0 },
      { kind: 'point', id: 2, x: x1, y: 0 },
      { kind: 'point', id: 3, x: x1, y: height },
      { kind: 'point', id: 4, x: x0, y: height },
      { kind: 'point', id: 5, x: x0, y: 0 },
      { kind: 'point', id: 6, x: x1, y: 0 },
      { kind: 'point', id: 7, x: x1, y: height },
      { kind: 'point', id: 8, x: x0, y: height },
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
      { kind: 'distance', id: 29, refs: [1, 2], value: x1 - x0 },
      { kind: 'distance', id: 30, refs: [2, 3], value: height },
    ],
  };
}

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

test.describe('Feature mirror UI（ADR-0011 切片 4）', () => {
  test('特征镜像：源拉伸 2（凸台）+ YZ 平面 → 16565.486 mm³/push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Feature Mirror UI', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return await openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'feature-mirror-ui');

    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

    const plateSketch = rectangleSketch(0, 40, 40);
    const plateSketchId = await apply(
      { kind: 'insertSketch', entities: plateSketch.entities, constraints: plateSketch.constraints, plane: XY_PLANE },
      '板草图',
    );
    await apply(
      {
        kind: 'insertFeature', featureType: 'extrude',
        params: { profile: [], distance: 10, sketchId: plateSketchId, regions: [0], operation: 'new' },
      },
      '板拉伸',
    );
    // 顶面（z=10）Φ6 凸台：第二张草图 + operation add（非 NEW 体——后端 featureMirror
    // 拒绝源特征无上游的 NEW 体）。
    const bossSketchId = await apply(
      {
        kind: 'insertSketch',
        entities: [{ kind: 'circle', id: 1, center: { x: 10, y: 20 }, radius: 3 }],
        constraints: [],
        plane: {
          origin: { x: 0, y: 0, z: 10 },
          normal: { x: 0, y: 0, z: 1 },
          xDir: { x: 1, y: 0, z: 0 },
        },
      },
      '凸台草图',
    );
    await apply(
      {
        kind: 'insertFeature', featureType: 'extrude',
        params: { profile: [], distance: 10, sketchId: bossSketchId, regions: [0], operation: 'add' },
      },
      '凸台拉伸',
    );

    await page.reload();
    ctx = await openWithRetry();
    await page.getByRole('button', { name: '镜像', exact: true }).click({ timeout: 30_000 });
    const dialog = page.getByTestId('part-studio-feature-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });

    // 缺省零件镜像；切到特征镜像 → 源特征下拉出现（live 证据「要镜像的特征」）。
    const scope = dialog.getByTestId('part-studio-feature-dialog-mirror-scope');
    await expect(scope).toHaveValue('body');
    const preview = page.getByTestId('part-studio-feature-preview');
    // 零件作用域镜像预览在场；切到特征作用域且未选源 → 预览清空（证明后续预览
    // 来自 featureMirror，而不是残留的 body mirror 预览）。
    await expect(preview).toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    await scope.selectOption('feature');
    await expect(preview).toHaveCount(0, { timeout: 30_000 });
    const source = dialog.getByTestId('part-studio-feature-dialog-mirror-source');
    await expect(source).toBeVisible({ timeout: 15_000 });
    await expect(source.locator('option')).toContainText(['拉伸 1', '拉伸 2']);
    await source.selectOption({ label: '拉伸 2' });
    await dialog.getByRole('combobox', { name: '镜像平面' }).selectOption('YZ');
    // 后端 featureMirror 影子求值预览（2026-11-08 接入）→ TileRpc 动态图形。
    await expect(preview).toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });

    const confirm = dialog.getByRole('button', { name: '确认' });
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    await confirm.click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    const EXPECTED_VOLUME_MM3 = 40 * 40 * 10 + 2 * Math.PI * 3 * 3 * 10;
    const TREE_TYPES = ['sketch', 'extrude', 'sketch', 'extrude', 'featureMirror'];
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(TREE_TYPES);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[4]?.params).toMatchObject({
      planeLine: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } },
    });
    let volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    console.log(`[feature-mirror-ui] volume=${volume.toFixed(3)} expected=${EXPECTED_VOLUME_MM3.toFixed(3)}`);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3)).toBeLessThan(0.5);

    await pushExampleChanges(page, 'feature mirror UI acceptance');
    await page.reload();
    ctx = await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(TREE_TYPES);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);
  });
});
