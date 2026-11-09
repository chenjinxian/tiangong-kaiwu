/**
 * v1.51 / ADR-0005 Phase 4 真栈 UI 验收：extrude 拔模。
 *
 * 10×10 草图、盲孔深度 10：
 *  - 拔模 10°（正向/外扩）→ 远端边长 10+2δ（δ=10·tan10°），体积=棱台公式
 *    ≈1394.109 mm³；
 *  - 双击拉伸行改角度 5° → 体积 ≈1185.18 mm³，params.draftAngleDeg=5；
 *  - push + 重开一致。
 * live 证据：ui-evidence/draft-dialog-20261108（勾选拔模出现角度 3 deg + 反向）。
 */
import { expect, test } from '@playwright/test';
import type { SketchConstraintDto, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
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

function frustumVolume(angleDeg: number): number {
  const delta = 10 * Math.tan((angleDeg * Math.PI) / 180);
  const top = 10 + 2 * delta;
  return (10 / 3) * (100 + top * top + 10 * top);
}

test.describe('Extrude 拔模 UI（ADR-0005 Phase 4）', () => {
  test('10° 拔模 → 棱台 1394.109；编辑改 5° → 1185.18；push/重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Extrude Draft UI', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'extrude-draft-ui');

    const sketch = rectangleSketch(10, 10);
    const result = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: sketch.entities, constraints: sketch.constraints, plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(result, '盒体草图');
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openWithRetry();
    await page.getByRole('button', { name: '拉伸', exact: true }).click({ timeout: 30_000 });
    const dialog = page.getByTestId('part-studio-feature-dialog');
    await expect(dialog.getByText('草图 1 的面')).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('checkbox', { name: '拔模' }).check();
    const angle = dialog.getByRole('textbox', { name: '拔模角度' });
    await expect(angle).toHaveValue('3');
    await angle.fill('10');
    await expect(dialog.getByRole('checkbox', { name: '反向' })).not.toBeChecked();
    // 拔模锥台预览（v1.51）：客户端偏置环叠层出现。
    await expect(page.getByTestId('part-studio-feature-preview')).toBeVisible({ timeout: 30_000 });
    const confirm = dialog.getByRole('button', { name: '确认' });
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    await confirm.click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    const mass = async () => (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    const expected10 = frustumVolume(10);
    await expect.poll(mass, { timeout: 60_000 }).toBeCloseTo(expected10, 1);
    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[1]?.params).toMatchObject({ draftAngleDeg: 10 });
    expect((tree[1]?.params as Record<string, unknown>).draftPullDirection).toBeUndefined();

    // 编辑态：双击拉伸行 → 角度回显 10，改 5 → updateParams 生效。
    const featureList = page.getByTestId('part-studio-feature-list');
    await featureList.getByRole('button', { name: '拉伸 1' }).dblclick({ timeout: 30_000 });
    const editDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(editDialog).toBeVisible({ timeout: 30_000 });
    await expect(editDialog.getByRole('checkbox', { name: '拔模' })).toBeChecked();
    await expect(editDialog.getByRole('textbox', { name: '拔模角度' })).toHaveValue('10');
    await editDialog.getByRole('textbox', { name: '拔模角度' }).fill('5');
    await editDialog.getByRole('button', { name: '确认' }).click({ timeout: 30_000 });
    await expect(editDialog).toBeHidden({ timeout: 180_000 });
    const expected5 = frustumVolume(5);
    await expect.poll(mass, { timeout: 60_000 }).toBeCloseTo(expected5, 1);
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree[1]?.params).toMatchObject({ draftAngleDeg: 5 });

    await pushExampleChanges(page, 'extrude draft UI acceptance');
    await page.reload();
    ctx = await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[1]?.params).toMatchObject({ draftAngleDeg: 5 });
    expect(await mass()).toBeCloseTo(expected5, 1);
  });
});
