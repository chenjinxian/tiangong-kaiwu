/**
 * v1.35 / ADR-0009 切片 1a 真栈验收：草图→草图投影（Use/Project 同等待遇）。
 *
 * 链路：源草图 20×20（XY@z=0）→ 目标草图（XY@z=10）投影 4 条线（实体标记）→
 * 拉伸 5 mm = 2000 mm³；源草图宽 20→30 → 目标草图投影与拉伸联动 3000 mm³；
 * push + 重开后仍为 3000（投影是读时派生，不是陈旧快照）。
 */
import { expect, test } from '@playwright/test';
import type {
  FeatureOp, SketchConstraintDto, SketchEntityDto, SketchPlaneDto, SketchProjectionRequest,
} from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getMassPropertiesRpc,
  getSketchRpc,
} from './helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './examples/imodel.js';

function rectangleSketch(width: number, height: number): {
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
} {
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

const PLANE = (z: number): SketchPlaneDto => ({
  origin: { x: 0, y: 0, z },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
});

test.describe('草图→草图投影（ADR-0009 切片 1a）', () => {
  test('投影矩形拉伸 2000 → 改源宽 3000 → push/重开后仍 3000', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Sketch Projection', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    const ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'sketch-projection');

    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      expect(result.featureId, `${label} 无 featureId`).toBeTruthy();
      return result.featureId!;
    };

    const source = rectangleSketch(20, 20);
    const sourceId = await apply(
      { kind: 'insertSketch', entities: source.entities, constraints: source.constraints, plane: PLANE(0) },
      '源草图',
    );
    const projections: SketchProjectionRequest[] = [11, 12, 13, 14].map((sourceEntityId, index) => ({
      sourceSketchId: sourceId, sourceEntityId, entityId: 101 + index * 10,
    }));
    const targetId = await apply(
      { kind: 'insertSketch', entities: [], constraints: [], plane: PLANE(10), projections },
      '投影草图',
    );

    const target = await getSketchRpc(ctx, targetId, token);
    if (!target) throw new Error('投影草图读面为空');
    expect(target.entities.length).toBe(12);
    expect(target.entities.every((entity) => entity.projected !== undefined)).toBe(true);
    expect(target.solve.dof).toBe(0);
    expect(target.regions?.[0]?.area).toBeCloseTo(400, 4);

    await apply(
      {
        kind: 'insertFeature', featureType: 'extrude',
        params: { profile: [], distance: 5, sketchId: targetId, regions: [0] },
      },
      '投影拉伸',
    );
    const volume = async (): Promise<number> =>
      (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(await volume()).toBeCloseTo(2000, 3);

    const updated = await applyFeatureOpRpc(
      ctx, { kind: 'updateSketchConstraint', sketchId: sourceId, constraintId: 29, value: 30 }, lease, token,
    );
    assertFeatureOpOk(updated, '改源宽 30');
    console.log(`[sketch-projection] volume after source width 30 = ${(await volume()).toFixed(3)}`);
    expect(await volume()).toBeCloseTo(3000, 3);

    const updatedTarget = await getSketchRpc(ctx, targetId, token);
    if (!updatedTarget) throw new Error('投影草图改源后读面为空');
    expect(updatedTarget.regions?.[0]?.area).toBeCloseTo(600, 4);

    await pushExampleChanges(page, 'sketch projection acceptance');
    await page.reload();
    await openWithRetry();
    expect(await volume()).toBeCloseTo(3000, 3);
    const reopenedTarget = await getSketchRpc(ctx, targetId, token);
    if (!reopenedTarget) throw new Error('重开后投影草图读面为空');
    expect(reopenedTarget.entities.filter((entity) => entity.projected !== undefined).length).toBe(12);
    expect(reopenedTarget.regions?.[0]?.area).toBeCloseTo(600, 4);
  });
});
