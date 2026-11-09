/**
 * v1.49 / ADR-0007 切片 6 真栈验收（合成）：centered FEATURE pattern。
 *
 * 40×40×10 盒（16000）→ 顶面 4×4×5 凸台（ADD 80，中心 x=0）
 *   → featurePattern（linear count 5 spacing 6 centered，沿 X）
 *   → 实例偏移 −12/−6/0/+6/+12（seed 居中）→ 5×80 = 400
 *   → 体积 16400、质心 x=0 → push + 重开。
 * 非居中 count 5 的实例为 0/+6/+12/+18/+24（末个越界），体积/质心均不同。
 */
import { expect, test } from '@playwright/test';
import type { BodyInfo, FeatureOp, SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  borrowWriteLease,
  getApiToken,
  getBodiesRpc,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
} from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './imodel.js';

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
const TOP_PLANE = {
  origin: { x: 0, y: 0, z: 10 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

test.describe('featurePattern centered 真栈验收（v1.49）', () => {
  test('居中 5 实例 → 体积 16400、质心 x=0 → push/重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Feature Pattern Centered', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    const ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'feature-pattern-centered');

    const apply = async (op: FeatureOp): Promise<unknown> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      expect(result.ok, result.ok ? '' : result.error).toBe(true);
      return result;
    };

    const baseSketch = rectangleSketch(40, 40, -20, -20);
    const baseSketchResult = await apply({
      kind: 'insertSketch', entities: baseSketch.entities, constraints: baseSketch.constraints, plane: XY_PLANE,
    } as FeatureOp);
    const baseSketchId = (baseSketchResult as { featureId: string }).featureId;
    await apply({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: baseSketchId, regions: [0], operation: 'new' },
    });

    // 凸台中心 x=0（4×4 @ x[-2,2], y[2,6]）→ 80
    const bossSketch = rectangleSketch(4, 4, -2, 2);
    const bossSketchResult = await apply({
      kind: 'insertSketch', entities: bossSketch.entities, constraints: bossSketch.constraints, plane: TOP_PLANE,
    } as FeatureOp);
    const bossSketchId = (bossSketchResult as { featureId: string }).featureId;
    const bossExtrude = await apply({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 5, sketchId: bossSketchId, regions: [0], operation: 'add' },
    });
    const bossFeatureId = (bossExtrude as { featureId: string }).featureId;

    const bodies = (await getBodiesRpc(ctx, token)).filter(
      (body: BodyInfo) => body.active !== false && body.authored !== false,
    );
    expect(bodies).toHaveLength(1);

    await apply({
      kind: 'insertFeature',
      featureType: 'featurePattern',
      params: {
        sourceFeatureId: bossFeatureId,
        kind: 'linear',
        count: 5,
        spacing: 6,
        centered: true,
        axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
      },
    } as FeatureOp);

    const massOf = async (context: typeof ctx) => {
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
    let result = await massOf(ctx);
    console.log(`[feature-pattern-centered] volume=${result.volume.toFixed(3)} expected=16400 centroidX=${result.centroid.x.toFixed(4)}`);
    expect(Math.abs(result.volume - 16400)).toBeLessThan(164);
    expect(Math.abs(result.centroid.x)).toBeLessThan(0.02);

    await pushExampleChanges(page, 'featurePattern centered acceptance');
    await page.reload();
    const reopened = await openExampleEditor(page, { itwinId: ids.itwinId, imodelId: ids.imodelId });
    const tree = await getFeatureTreeRpc(reopened, token);
    expect(tree.map((row) => row.featureType)).toEqual([
      'sketch', 'extrude', 'sketch', 'extrude', 'featurePattern',
    ]);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[4]?.params).toMatchObject({ centered: true, count: 5, spacing: 6 });
    result = await massOf(reopened);
    expect(Math.abs(result.volume - 16400)).toBeLessThan(164);
    expect(Math.abs(result.centroid.x)).toBeLessThan(0.02);
  });
});
