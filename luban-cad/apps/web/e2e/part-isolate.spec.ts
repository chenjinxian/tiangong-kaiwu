/**
 * 2026-11-13 真栈验收：零件「隔离…」简化切片（会话级隐藏其它零件）。
 *
 * 两体文档 → 隔离 A → B 行 data-hidden、A 可见、横幅出现 → 退出 → 两体恢复；
 * 先隐藏 A 再隔离 B → 退出后 A 仍隐藏（恢复隔离前隐藏集）。
 */
import { expect, test } from '@playwright/test';
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getBodiesRpc,
  releaseWriteLease,
} from './helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { ensureExampleImodel, openExampleEditor } from './examples/imodel.js';

function rectangleSketch(width: number, height: number, x0 = 0): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
  const x1 = x0 + width;
  return {
    entities: [
      { kind: 'line', id: 11, p1: { x: x0, y: 0 }, p2: { x: x1, y: 0 } },
      { kind: 'line', id: 12, p1: { x: x1, y: 0 }, p2: { x: x1, y: height } },
      { kind: 'line', id: 13, p1: { x: x1, y: height }, p2: { x: x0, y: height } },
      { kind: 'line', id: 14, p1: { x: x0, y: height }, p2: { x: x0, y: 0 } },
      { kind: 'point', id: 1, x: x0, y: 0 },
      { kind: 'point', id: 2, x: x1, y: 0 },
      { kind: 'point', id: 3, x: x1, y: height },
      { kind: 'point', id: 4, x: x0, y: height },
    ],
    constraints: [
      { kind: 'horizontal', id: 21, refs: [11] },
      { kind: 'vertical', id: 22, refs: [12] },
      { kind: 'horizontal', id: 23, refs: [13] },
      { kind: 'vertical', id: 24, refs: [14] },
      { kind: 'distance', id: 25, refs: [1, 2], value: width },
      { kind: 'distance', id: 26, refs: [2, 3], value: height },
    ],
  };
}

const XY_PLANE = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

test.describe('2026-11-13 零件隔离（简化切片）', () => {
  test('隔离 A → 其它零件隐藏/横幅；退出恢复；先隐藏 A 再隔离 B → 退出后 A 仍隐藏', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Part Isolate', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return await openExampleEditor(page, ids);
      }
    };
    const ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'part-isolate');
    const apply = async (op: Parameters<typeof applyFeatureOpRpc>[1], label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };
    for (const [width, x0] of [[20, 0], [10, 50]] as const) {
      const rect = rectangleSketch(width, width, x0);
      const sketchId = await apply(
        { kind: 'insertSketch', entities: rect.entities, constraints: rect.constraints, plane: XY_PLANE },
        '草图',
      );
      await apply(
        {
          kind: 'insertFeature', featureType: 'extrude',
          params: { profile: [], distance: 10, sketchId, regions: [0], operation: 'new' },
        },
        '拉伸',
      );
    }
    const bodies = (await getBodiesRpc(ctx, token)).filter((body) => body.active !== false && body.authored !== false);
    expect(bodies.length).toBe(2);
    const [a, b] = bodies;
    await releaseWriteLease(ctx, lease, token);

    await expect(page.getByTestId('part-studio-part-count')).toHaveText('(2)', { timeout: 60_000 });
    const rowA = page.getByTestId(`tree-row-${a!.bodyKey}`);
    const rowB = page.getByTestId(`tree-row-${b!.bodyKey}`);
    await expect(rowA).toBeVisible({ timeout: 60_000 });
    await expect(rowB).toBeVisible();

    // 场景 1：隔离 A → B 隐藏、A 可见、横幅出现。
    await rowA.click({ button: 'right' });
    await page.getByTestId('tree-menu-isolate').click();
    await expect(rowB).toHaveAttribute('data-hidden', 'true', { timeout: 15_000 });
    await expect(rowA).not.toHaveAttribute('data-hidden', 'true');
    const banner = page.getByTestId('part-isolate-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('退出隔离');
    await banner.getByRole('button', { name: '退出隔离' }).click();
    await expect(banner).toHaveCount(0);
    await expect(rowA).not.toHaveAttribute('data-hidden', 'true');
    await expect(rowB).not.toHaveAttribute('data-hidden', 'true');

    // 场景 2：先隐藏 A，再隔离 B → 退出后恢复 A 的隐藏态。
    await page.getByTestId(`tree-row-visibility-${a!.bodyKey}`).click();
    await expect(rowA).toHaveAttribute('data-hidden', 'true');
    await rowB.click({ button: 'right' });
    await page.getByTestId('tree-menu-isolate').click();
    await expect(banner).toBeVisible();
    await expect(rowA).toHaveAttribute('data-hidden', 'true');
    await expect(rowB).not.toHaveAttribute('data-hidden', 'true');
    await banner.getByRole('button', { name: '退出隔离' }).click();
    await expect(banner).toHaveCount(0);
    await expect(rowA).toHaveAttribute('data-hidden', 'true');
    await expect(rowB).not.toHaveAttribute('data-hidden', 'true');
  });
});
