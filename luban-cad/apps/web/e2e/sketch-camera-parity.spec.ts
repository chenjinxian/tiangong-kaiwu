/**
 * ADR-0018 S1f 真栈验收：草图相机语义（Onshape 对拍）。
 *
 * 覆盖：双击树行编辑既有草图 → 相机旋转保持不变（live：不强制转正/不取景）；
 * 点击草图对话框「正视草图平面」→ 视图 Z 轴与草图平面法向一致。
 */
import { expect, test } from '@playwright/test';
import type { SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  openSeedImodelEditor,
  releaseWriteLease,
} from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';

/** 前视基准面：法向 +Y，xDir +X。 */
const FRONT: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  xDir: { x: 1, y: 0, z: 0 },
};

const LINE: SketchEntityDto[] = [
  { kind: 'line', id: 11, p1: { x: -10, y: -5 }, p2: { x: 10, y: 5 } },
];

interface Vec3 { x: number; y: number; z: number }

async function readViewNormal(page: import('@playwright/test').Page): Promise<Vec3 | null> {
  return page.evaluate(() => {
    const view = (window as unknown as {
      __lubanE2E?: {
        coreFrontend: {
          IModelApp: {
            viewManager: {
              selectedView: { view: { getRotation: () => { rowZ: () => { x: number; y: number; z: number } } } } | undefined;
            };
          };
        };
      };
    }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView?.view;
    if (!view)
      return null;
    const z = view.getRotation().rowZ();
    return { x: z.x, y: z.y, z: z.z };
  });
}

test.describe('草图相机语义（ADR-0018 S1f）', () => {
  test('编辑既有草图保持相机；正视命令对齐平面法向', async ({ page, request }) => {
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

    const lease = await borrowWriteLease(ctx, token, 'sketch-camera-parity');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: LINE, constraints: [], plane: FRONT,
    }, lease, token);
    assertFeatureOpOk(created, '草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openWithRetry();
    const sketchRow = page.getByTestId(`tree-row-${sketchId}`);
    await expect(sketchRow).toBeVisible({ timeout: 60_000 });
    await expect.poll(async () => (await readViewNormal(page)) !== null, { timeout: 60_000 }).toBe(true);
    const before = await readViewNormal(page);
    expect(before).not.toBeNull();

    await sketchRow.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('sketch-entity-picker')).toBeAttached({ timeout: 60_000 });
    // 草图数据就位后仍不得抢相机（live：保持进入前 iso）。
    await page.waitForTimeout(1500);
    const afterEnter = await readViewNormal(page);
    expect(afterEnter).not.toBeNull();
    expect(afterEnter!.x).toBeCloseTo(before!.x, 6);
    expect(afterEnter!.y).toBeCloseTo(before!.y, 6);
    expect(afterEnter!.z).toBeCloseTo(before!.z, 6);

    // 显式「正视草图平面」→ 视图 Z 轴 = 平面法向（+Y）。
    await page.getByRole('button', { name: '正视草图平面' }).click();
    await expect.poll(async () => {
      const normal = await readViewNormal(page);
      return normal ? Math.hypot(normal.x - FRONT.normal.x, normal.y - FRONT.normal.y, normal.z - FRONT.normal.z) : 999;
    }, { timeout: 10_000, intervals: [200, 500, 1000] }).toBeLessThan(1e-6);

    // 草图保持编辑态。
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible();
  });
});
