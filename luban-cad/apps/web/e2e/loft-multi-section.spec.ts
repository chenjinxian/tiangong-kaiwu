/**
 * shared v1.69 / backend 多截面 loft 真栈验收（2026-11-12）。
 *
 * 三个同尺寸 20×20 截面 @z=0/5/10 经一次 loft 放样 → 棱柱 4000 mm³；重复截面与
 * 非平行第三截面由后端诚实拒收。验证 BRepCore Loft 原生 N-profile 通道。
 */
import { expect, test } from '@playwright/test';
import type { FeatureOp, SketchConstraintDto, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getMassPropertiesRpc,
  getFeatureTreeRpc,
  openSeedImodelEditor,
  releaseWriteLease,
} from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';

function rectangleSketch(width: number, height: number): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
  const x1 = width;
  const y1 = height;
  return {
    entities: [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: x1, y: 0 },
      { kind: 'point', id: 3, x: x1, y: y1 },
      { kind: 'point', id: 4, x: 0, y: y1 },
      { kind: 'point', id: 5, x: 0, y: 0 },
      { kind: 'point', id: 6, x: x1, y: 0 },
      { kind: 'point', id: 7, x: x1, y: y1 },
      { kind: 'point', id: 8, x: 0, y: y1 },
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

const xyPlaneAt = (z: number): SketchPlaneDto => ({
  origin: { x: 0, y: 0, z },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
});

const FRONT: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  xDir: { x: 1, y: 0, z: 0 },
};

test.describe('多截面 loft（shared v1.69）', () => {
  test('三截面 4000 mm³；重复/非平行截面诚实拒收', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
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

    const lease = await borrowWriteLease(ctx, token, 'loft-multi-section');
    const insertSketch = async (plane: SketchPlaneDto, label: string): Promise<string> => {
      const rect = rectangleSketch(20, 20);
      const result = await applyFeatureOpRpc(ctx, {
        kind: 'insertSketch', entities: rect.entities, constraints: rect.constraints, plane,
      }, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId!;
    };
    const s0 = await insertSketch(xyPlaneAt(0), '截面 1');
    const s1 = await insertSketch(xyPlaneAt(5), '截面 2');
    const s2 = await insertSketch(xyPlaneAt(10), '截面 3');
    const sFront = await insertSketch(FRONT, '非平行截面');

    const loftOp: FeatureOp = {
      kind: 'insertFeature',
      featureType: 'loft',
      params: { sketchIds: [s0, s1, s2], bodyType: 'SOLID' },
    };
    const loft = await applyFeatureOpRpc(ctx, loftOp, lease, token);
    assertFeatureOpOk(loft, '多截面 loft');
    const loftId = loft.featureId!;

    const mass = await getMassPropertiesRpc(ctx, token);
    expect(mass.length).toBe(1);
    expect(mass[0]!.volume).toBeCloseTo(4000, 1);

    // 重复截面 → zod 拒收（不入树）。
    const treeBefore = await getFeatureTreeRpc(ctx, token);
    const duplicate = await applyFeatureOpRpc(ctx, {
      kind: 'insertFeature',
      featureType: 'loft',
      params: { sketchIds: [s0, s0, s1], bodyType: 'SOLID' },
    }, lease, token);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok)
      expect(duplicate.error).toContain('不得重复');

    // 非平行第三截面 → op 边界平行守卫拒收。
    const nonParallel = await applyFeatureOpRpc(ctx, {
      kind: 'insertFeature',
      featureType: 'loft',
      params: { sketchIds: [s0, s1, sFront], bodyType: 'SOLID' },
    }, lease, token);
    expect(nonParallel.ok).toBe(false);
    if (!nonParallel.ok)
      expect(nonParallel.error).toContain('平行');
    expect((await getFeatureTreeRpc(ctx, token)).length).toBe(treeBefore.length);

    await releaseWriteLease(ctx, lease, token);

    // 冷重开：树行 status=0、零件体积 4,000 mm³。
    await page.reload();
    ctx = await openWithRetry();
    await expect(page.getByTestId(`tree-row-${loftId}`)).toBeVisible({ timeout: 60_000 });
    const rows = await getFeatureTreeRpc(ctx, token);
    expect(rows.find((row) => row.id === loftId)?.status).toBe(0);
    await expect(page.locator('[data-testid^="tree-row-volume-"]').first())
      .toHaveText('4,000 mm³', { timeout: 60_000 });
  });
});
