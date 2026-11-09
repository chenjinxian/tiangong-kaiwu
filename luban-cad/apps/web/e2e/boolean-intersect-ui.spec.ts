/**
 * booleanBodies intersect **UI** 真栈验收（T12 后端解锁后的 UI 对齐）。
 *
 * body1：2×2×1 盒；body2：1×1×2 盒（newBody）；交集 = 1 mm³。
 * 真实 UI：ribbon「布尔运算」→ 目标实体/工具选择 → 相交页签 → 确认；
 * keepTools=false 消费 body2；树/体积/push+重开一致。
 * 与 `boolean-intersect.spec.ts`（RPC 直提）互补，覆盖 UI 载荷与页签启用。
 */
import { expect, test } from '@playwright/test';
import type { BodyInfo, FeatureOp, SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getBodiesRpc,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
} from './helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './examples/imodel.js';

function rectangleSketch(
  width: number,
  height: number,
  x0 = 0,
  y0 = 0,
): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
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

test.describe('booleanBodies intersect UI（T12）', () => {
  test('UI 相交：两重叠盒 → 1 mm³/消费工具/push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Boolean Intersect UI', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'boolean-intersect-ui');

    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      expect(result.featureId, `${label} 无 featureId`).toBeTruthy();
      return result.featureId!;
    };

    const sketchA = rectangleSketch(2, 2, 0, 0);
    const sketchAId = await apply(
      { kind: 'insertSketch', entities: sketchA.entities, constraints: sketchA.constraints, plane: XY_PLANE },
      'sketch A',
    );
    const extrudeA = await apply(
      { kind: 'insertFeature', featureType: 'extrude', params: { profile: [], distance: 1, sketchId: sketchAId, regions: [0] } },
      'extrude body1',
    );
    const sketchB = rectangleSketch(1, 1, 1, 1);
    const sketchBId = await apply(
      { kind: 'insertSketch', entities: sketchB.entities, constraints: sketchB.constraints, plane: XY_PLANE },
      'sketch B',
    );
    const extrudeB = await apply(
      {
        kind: 'insertFeature', featureType: 'extrude',
        params: { profile: [], distance: 2, sketchId: sketchBId, regions: [0], newBody: true },
      },
      'extrude body2',
    );

    const bodies = (await getBodiesRpc(ctx, token)) as BodyInfo[];
    const body1 = bodies.find((body) => body.sourceFeatureId === extrudeA);
    const body2 = bodies.find((body) => body.sourceFeatureId === extrudeB);
    expect(body1, 'body1 应由 extrudeA 驱动').toBeTruthy();
    expect(body2, 'body2 应由 extrudeB 驱动').toBeTruthy();

    // 重新打开让 UI 读面/树刷新到 RPC 建链后的状态。
    await page.reload();
    ctx = await openWithRetry();

    await page.getByRole('button', { name: '布尔运算', exact: true }).click({ timeout: 30_000 });
    const dialog = page.getByTestId('part-studio-feature-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    // 选择目标 body1（下拉缺省通常是首个 active body，显式选防顺序假设）。
    const target = dialog.getByRole('combobox', { name: '目标实体' });
    await target.selectOption({ label: body1!.name }, { timeout: 30_000 });
    // 工具 body2 复选框。
    await dialog.getByRole('checkbox', { name: body2!.name }).check({ timeout: 30_000 });
    await dialog.getByRole('tab', { name: '相交' }).click();
    const confirm = dialog.getByRole('button', { name: '确认' });
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    // 后端影子求值几何 → TileRpc 动态预览（2026-11-08 接入 booleanBodies）。
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 30_000 });
    await confirm.click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual([
      'sketch', 'extrude', 'sketch', 'extrude', 'booleanBodies',
    ]);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const mass = await getMassPropertiesRpc(ctx, token);
    expect(mass.length).toBe(1);
    const volume = mass.reduce((sum, item) => sum + item.volume, 0);
    console.log(`[boolean-intersect-ui] volume=${volume.toFixed(3)} expected=1`);
    expect(Math.abs(volume - 1)).toBeLessThan(0.01);
    const afterBodies = (await getBodiesRpc(ctx, token)) as BodyInfo[];
    expect(afterBodies.find((body) => body.bodyKey === body2!.bodyKey)?.active).toBe(false);

    await pushExampleChanges(page, 'booleanBodies intersect UI acceptance');
    await page.reload();
    ctx = await openWithRetry();
    const reopenedTree = await getFeatureTreeRpc(ctx, token);
    expect(reopenedTree.map((row) => row.featureType)).toEqual(tree.map((row) => row.featureType));
    const reopenedVolume = (await getMassPropertiesRpc(ctx, token))
      .reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(reopenedVolume - volume) / volume).toBeLessThan(0.005);
  });
});
