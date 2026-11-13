/**
 * ADR-0017 Stage D 真栈验收：草图落在**平面模型面**（Onshape 语义）。
 *
 * 流程：RPC 造板 20×20×5 → 视口拾取顶面 → ribbon「草图」→ 草图平面对话框
 * 显示「模型面」→ ✓ 建草图（平面快照 origin z=5 / normal +Z 入 params）→
 * 完成 → RPC updateSketch 在面平面画 φ6 圆 → UI 拉伸 2 mm → 体积
 * 2000 + 9π×2 = 2056.549 mm³ → push + 冷重开一致。
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
  openSeedImodelEditor,
  releaseWriteLease,
} from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { frameStandardView, projectWorld } from './tutorial2-helpers.js';
import { pushExampleChanges } from './examples/imodel.js';

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};
const RANGE = { low: { x: 0, y: 0, z: 0 }, high: { x: 20, y: 20, z: 5 } };
const CIRCLE_RADIUS_MM = 3;
const EXPECTED_VOLUME_MM3 = 20 * 20 * 5 + Math.PI * CIRCLE_RADIUS_MM ** 2 * 2;

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

function dot(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** 世界点 → 草图平面局部 2D（用落库快照的 origin/normal/xDir）。 */
function worldToSketch(plane: SketchPlaneDto, point: { x: number; y: number; z: number }): { x: number; y: number } {
  const yDir = cross(plane.normal, plane.xDir);
  const delta = {
    x: point.x - plane.origin.x,
    y: point.y - plane.origin.y,
    z: point.z - plane.origin.z,
  };
  return { x: dot(delta, plane.xDir), y: dot(delta, yDir) };
}

test.describe('草图落在模型面（ADR-0017 Stage D）', () => {
  test('顶面拾取 → 平面=模型面 → 拉伸 → push+冷重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
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

    const applyWithLease = async (op: FeatureOp, label: string): Promise<string> => {
      const lease = await borrowWriteLease(ctx, token, `sketch-face-${label}`);
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      await releaseWriteLease(ctx, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

    // ── 1) 造板 20×20×5 ────────────────────────────────────────────────────
    const plate = rectangleSketch(20, 20);
    const plateSketchId = await applyWithLease(
      { kind: 'insertSketch', entities: plate.entities, constraints: plate.constraints, plane: XY_PLANE },
      '板草图',
    );
    await applyWithLease(
      {
        kind: 'insertFeature', featureType: 'extrude',
        params: { profile: [], distance: 5, sketchId: plateSketchId, regions: [0] },
      },
      '板拉伸',
    );

    await page.reload();
    ctx = await openWithRetry();

    // ── 2) 视口拾取顶面（选择工具在草图对话框中保持可用）────────────────────
    // 刷新后视口/选择工具异步就绪：等 data-viewport-ready 再点击，避免首两击
    // 落在工具安装前（2026-11-13 真栈实测偶发空选择）。
    await expect(page.getByTestId('part-studio-canvas'))
      .toHaveAttribute('data-viewport-ready', 'true', { timeout: 60_000 });
    await page.waitForTimeout(800);
    await frameStandardView(page, 0, RANGE, { left: 0.2, right: 0.05, top: 0.15, bottom: 0.1 });
    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('画布不可用');
    const screens = await projectWorld(page, { x: box.x, y: box.y }, [
      { x: 10, y: 10, z: 5 },
      { x: 9, y: 9, z: 5 },
      { x: 11, y: 11, z: 5 },
      { x: 7, y: 7, z: 5 },
      { x: 13, y: 13, z: 5 },
      { x: 10, y: 6, z: 5 },
    ]);
    // BRep 拓扑读面/选择工具就绪为异步（刷新后首击偶尔落空）——拾取前留稳定窗。
    await page.waitForTimeout(1_200);
    let picked = false;
    for (const screen of screens) {
      await page.mouse.click(screen.x, screen.y);
      await page.waitForTimeout(1_200);
      picked = await page.evaluate(() => {
        const selection = (window as unknown as {
          __lubanE2EApp: { usePartStudioStore: { getState(): { canvas: { selection: Array<{ kind: string; ownerBodyKey?: string; cacheId?: number }> } } } };
        }).__lubanE2EApp.usePartStudioStore.getState().canvas.selection;
        return selection.length === 1 && selection[0]?.kind === 'face' && selection[0]?.cacheId !== undefined;
      });
      if (picked) break;
    }
    if (!picked) throw new Error('顶面拾取失败：未获得唯一面选择');

    // ── 3) 草图对话框：平面字段 = 模型面 ─────────────────────────────────────
    await page.getByRole('button', { name: '草图', exact: true }).click();
    const dialog = page.getByTestId('part-studio-sketch-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('sketch-plane-chip'))
      .toContainText('模型面', { timeout: 60_000 });
    // 选面即自动创建草图（Onshape 拾取流程），无需再点 ✓。
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 120_000 });

    let tree = await getFeatureTreeRpc(ctx, token);
    const sketchRow = tree.filter((row) => row.featureType === 'sketch').at(-1);
    expect(sketchRow, '草图行应存在').toBeTruthy();
    const plane = (sketchRow!.params as { plane?: SketchPlaneDto }).plane;
    expect(plane, '草图平面快照应落 params').toBeTruthy();
    expect(plane!.normal.z).toBeCloseTo(1, 6);
    expect(plane!.origin.z).toBeCloseTo(5, 6);

    // ── 4) 完成草图 → 面平面上画 φ6 圆（局部坐标由落库快照反算）─────────────
    await page.getByTestId('part-studio-sketch-dialog').getByRole('button', { name: '确认' }).click();
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeHidden({ timeout: 60_000 });
    const center = worldToSketch(plane!, { x: 10, y: 10, z: 5 });
    await applyWithLease(
      {
        kind: 'updateSketch',
        sketchId: sketchRow!.id,
        entities: [{ kind: 'circle', id: 1, center: { x: center.x, y: center.y }, radius: CIRCLE_RADIUS_MM }],
        constraints: [],
      },
      '面平面圆',
    );

    await page.reload();
    ctx = await openWithRetry();

    // ── 5) UI 拉伸 2 mm → 2056.549 mm³ ──────────────────────────────────────
    await page.getByRole('button', { name: '拉伸', exact: true }).click();
    const featureDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(featureDialog.getByText('草图 2 的面')).toBeVisible({ timeout: 60_000 });
    await featureDialog.getByRole('textbox', { name: '深度' }).fill('2');
    await featureDialog.getByRole('button', { name: '确认' }).click();
    await expect(featureDialog).toBeHidden({ timeout: 180_000 });

    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'sketch', 'extrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    let volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    console.log(`[sketch-face-plane] volume=${volume.toFixed(3)} expected=${EXPECTED_VOLUME_MM3.toFixed(3)}`);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3)).toBeLessThan(1);

    await pushExampleChanges(page, 'sketch on model face acceptance');
    await page.reload();
    ctx = await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const persistedPlane = (tree[2]!.params as { plane?: SketchPlaneDto }).plane;
    expect(persistedPlane?.normal.z).toBeCloseTo(1, 6);
    expect(persistedPlane?.origin.z).toBeCloseTo(5, 6);
    volume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(volume - EXPECTED_VOLUME_MM3) / EXPECTED_VOLUME_MM3).toBeLessThan(0.005);
  });
});
