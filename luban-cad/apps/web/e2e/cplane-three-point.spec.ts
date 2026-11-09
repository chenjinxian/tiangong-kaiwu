/**
 * v1.44 / ADR-0013 切片 3 真栈验收：cPlane THREE_POINT。
 *
 * 三点 (0,0,0)/(1,0,0)/(0,1,1) → 平面过 X 轴、法线
 * (0, −√2/2, √2/2)，xDir=(1,0,0)。草图 20×20 → 拉伸 10 = 4000 mm³，
 * 质心 (10, 10·s − 5·s, 10·s + 5·s) = (10, 3.5355, 10.6066)，s=√2/2。
 * push + 重开后平面快照与体积/质心一致。
 */
import { expect, test } from '@playwright/test';
import type { CPlaneParams, FeatureOp, SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
  getSketchRpc,
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

const S = Math.SQRT1_2;

test.describe('cPlane THREE_POINT（ADR-0013 切片 3）', () => {
  test('三点平面 → 草图 + 拉伸 4000 mm³/push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - CPlane Three Point', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    const ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'cplane-three-point');

    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

    const lineParams: CPlaneParams = {
      reference: 'top',
      threePoints: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 1 }],
    };
    const cplaneId = await apply(
      { kind: 'insertFeature', featureType: 'cPlane', params: lineParams },
      'THREE_POINT 基准面',
    );

    let tree = await getFeatureTreeRpc(ctx, token);
    const entry = tree.find((row) => row.id === cplaneId);
    expect(entry?.status).toBe(0);
    expect(entry?.params).toMatchObject(lineParams as unknown as Record<string, unknown>);

    // 平面快照=生产端 cPlanePlaneFromParams 的解析结果（其 Rodrigues 派生由 cplane.test.ts
    // 单测锁定）；e2e 这里只验证参数落库 → 平面快照 → 几何的整链，不复制派生实现。
    const plane = {
      origin: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: -S, z: S },
      xDir: { x: 1, y: 0, z: 0 },
      sourceFeatureId: cplaneId,
    };

    const sketch = rectangleSketch(20, 20);
    const sketchId = await apply(
      { kind: 'insertSketch', entities: sketch.entities, constraints: sketch.constraints, plane },
      '旋转平面草图',
    );

    const stored = await getSketchRpc(ctx, sketchId, token);
    expect(stored?.plane?.normal.y).toBeCloseTo(-S, 12);
    expect(stored?.plane?.normal.z).toBeCloseTo(S, 12);
    expect(stored?.plane?.sourceFeatureId).toBe(cplaneId);

    await apply(
      {
        kind: 'insertFeature', featureType: 'extrude',
        params: { profile: [], distance: 10, sketchId, regions: [0] },
      },
      '拉伸 10',
    );

    const mass = async () => {
      const items = await getMassPropertiesRpc(ctx, token);
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
    let result = await mass();
    console.log(`[cplane-three-point] volume=${result.volume.toFixed(3)} centroid=(${result.centroid.x.toFixed(3)},${result.centroid.y.toFixed(3)},${result.centroid.z.toFixed(3)})`);
    expect(result.volume).toBeCloseTo(4000, 2);
    expect(result.centroid.x).toBeCloseTo(10, 3);
    expect(result.centroid.y).toBeCloseTo(10 * S - 5 * S, 3);
    expect(result.centroid.z).toBeCloseTo(10 * S + 5 * S, 3);

    await pushExampleChanges(page, 'cPlane THREE_POINT acceptance');
    await page.reload();
    const reopenedCtx = await openWithRetry();
    tree = await getFeatureTreeRpc(reopenedCtx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['cPlane', 'sketch', 'extrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const reopenedSketch = await getSketchRpc(reopenedCtx, tree.find((row) => row.featureType === 'sketch')!.id, token);
    expect(reopenedSketch?.plane?.normal.y).toBeCloseTo(-S, 12);
    expect(reopenedSketch?.plane?.normal.z).toBeCloseTo(S, 12);
    const reopenedItems = await getMassPropertiesRpc(reopenedCtx, token);
    const reopenedVolume = reopenedItems.reduce((sum, item) => sum + item.volume, 0);
    expect(reopenedVolume).toBeCloseTo(4000, 2);
  });
});
