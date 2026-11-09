/**
 * W1.5b 真栈 UI 验收：零件段逐 body 体积（质量属性读面）。
 *
 * 两个独立盒体：20×20×10 = 4000 mm³、10×10×5 = 500 mm³（NEW 拉伸，互不相交）
 * → 零件段 2 行，各自显示体积文案（`tree-row-volume-<bodyKey>`）→
 * push + 重开后仍然显示（bodies 读面 → 质量属性读面重新拉取）。
 */
import { expect, test } from '@playwright/test';
import type { FeatureOp, SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getBodiesRpc,
  getMassPropertiesRpc,
  releaseWriteLease,
} from './helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './examples/imodel.js';

function rectangleSketch(width: number, height: number, x0 = 0, y0 = 0): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
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

test.describe('零件段逐 body 体积（W1.5b）', () => {
  test('两体 4000/500 mm³ → 行内体积文案 → push+重开仍在', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Per Body Volume UI', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'per-body-volume-ui');
    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

    const a = rectangleSketch(20, 20);
    const sketchA = await apply(
      { kind: 'insertSketch', entities: a.entities, constraints: a.constraints, plane: XY_PLANE },
      'A 草图',
    );
    await apply(
      { kind: 'insertFeature', featureType: 'extrude', params: { profile: [], distance: 10, sketchId: sketchA, regions: [0], operation: 'new' } },
      'A 拉伸',
    );
    const b = rectangleSketch(10, 10, 50, 0);
    const sketchB = await apply(
      { kind: 'insertSketch', entities: b.entities, constraints: b.constraints, plane: XY_PLANE },
      'B 草图',
    );
    await apply(
      { kind: 'insertFeature', featureType: 'extrude', params: { profile: [], distance: 5, sketchId: sketchB, regions: [0], operation: 'new' } },
      'B 拉伸',
    );

    const mass = await getMassPropertiesRpc(ctx, token);
    const volumes = mass.map((item) => item.volume).sort((x, y) => x - y);
    console.log(`[per-body-volume] bodies=${mass.length} volumes=${volumes.map((v) => v.toFixed(3)).join(',')}`);
    expect(mass.length).toBe(2);
    expect(volumes[0]).toBeCloseTo(500, 2);
    expect(volumes[1]).toBeCloseTo(4000, 2);
    const bodies = await getBodiesRpc(ctx, token);
    expect(bodies.filter((body) => body.active !== false && body.authored !== false).length).toBe(2);

    // e2e RPC 持租约；UI 质量属性是只读 RPC，无需释放。等待零件段体积就绪。
    const assertVolumes = async () => {
      const partsSection = page.getByTestId('part-studio-part-list');
      await expect(partsSection).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('part-studio-part-count')).toHaveText('(2)');
      const volumeTexts = page.locator('[data-testid^="tree-row-volume-"]');
      await expect(volumeTexts).toHaveCount(2, { timeout: 30_000 });
      const texts = await volumeTexts.allTextContents();
      const sorted = texts.map((text) => text.replace(/[^\d.,]/g, '')).sort((x, y) => Number(x.replace(/,/g, '')) - Number(y.replace(/,/g, '')));
      expect(sorted[0]).toBe('500');
      expect(sorted[1]).toBe('4,000');
    };
    await assertVolumes();

    await releaseWriteLease(ctx, lease, token);
    await pushExampleChanges(page, 'per-body volume UI acceptance');
    await page.reload();
    ctx = await openWithRetry();
    await assertVolumes();
  });
});
