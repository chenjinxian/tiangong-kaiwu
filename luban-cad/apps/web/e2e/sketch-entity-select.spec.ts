/**
 * ADR-0018 S1b 真栈验收：草图编辑态实体/控制点拾取（Onshape 对拍）。
 *
 * 覆盖：进入草图编辑 → 点击曲线本体 → 单一选择权威出现 sketchEntity 条目
 * （part=curve）；Ctrl 点击切换；点击空白清空；退出草图后条目被清除。
 * 依赖 dev server 的 VITE_E2E_HOOKS（window.__lubanE2EApp）读取 store。
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

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

/** 一条穿过原点、水平方向的世界线（编辑态相机正视 XY 后应过画布中心）。 */
const LINE: SketchEntityDto[] = [
  { kind: 'line', id: 11, p1: { x: -10, y: 0 }, p2: { x: 10, y: 0 } },
];

interface SketchSelectionEntry {
  kind: string;
  id: string;
  sketchId?: string;
  entityId?: number;
  sketchPart?: string;
}

async function readSelection(page: import('@playwright/test').Page): Promise<SketchSelectionEntry[]> {
  return page.evaluate(() => {
    const store = (window as unknown as {
      __lubanE2EApp?: { usePartStudioStore?: { getState: () => { canvas: { selection: SketchSelectionEntry[] } } } };
    }).__lubanE2EApp?.usePartStudioStore;
    return store?.getState().canvas.selection ?? [];
  });
}

test.describe('草图实体选择（ADR-0018 S1b）', () => {
  test('点击曲线选中 / Ctrl 切换 / 空白清空 / 退出草图清除', async ({ page, request }) => {
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

    const lease = await borrowWriteLease(ctx, token, 'sketch-entity-select');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: LINE, constraints: [], plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openWithRetry();
    const sketchRow = page.getByTestId(`tree-row-${sketchId}`);
    await expect(sketchRow).toBeVisible({ timeout: 60_000 });
    await sketchRow.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('sketch-entity-picker')).toBeAttached({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    // 世界原点投影：线 (-10,0)-(10,0) 经过原点，点原点即命中曲线本体
    //（端点距原点约 10px > 6px 控制点阈值）。
    const originView = await page.evaluate(() => {
      const vp = (window as unknown as {
        __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { worldToView: (p: { x: number; y: number; z: number }) => { x: number; y: number } } | undefined } } } };
      }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
      if (!vp) return null;
      const v = vp.worldToView({ x: 0, y: 0, z: 0 });
      return { x: v.x, y: v.y };
    });
    expect(originView).not.toBeNull();
    const center = { x: box!.x + originView!.x, y: box!.y + originView!.y };
    await page.mouse.click(center.x, center.y);
    await expect.poll(async () => (await readSelection(page)).length, { timeout: 10_000 }).toBe(1);
    const selected = await readSelection(page);
    expect(selected[0]).toMatchObject({
      kind: 'sketchEntity',
      sketchId,
      entityId: 11,
      sketchPart: 'curve',
    });
    await expect(page.getByTestId('sketch-entity-picker')).toHaveAttribute('data-selected', /11.*curve/);

    // Ctrl 点击同一实体 → 切换为空。
    await page.keyboard.down('Control');
    await page.mouse.click(center.x, center.y);
    await page.keyboard.up('Control');
    await expect.poll(async () => (await readSelection(page)).length, { timeout: 10_000 }).toBe(0);

    // 再次选中后点空白（画布左上角）→ 清空。
    await page.mouse.click(center.x, center.y);
    await expect.poll(async () => (await readSelection(page)).length, { timeout: 10_000 }).toBe(1);
    await page.mouse.click(box!.x + 20, box!.y + 20);
    await expect.poll(async () => (await readSelection(page)).length, { timeout: 10_000 }).toBe(0);

    // 退出草图（对话框 ✗）→ 草图条目不得残留。
    await page.mouse.click(center.x, center.y);
    await expect.poll(async () => (await readSelection(page)).length, { timeout: 10_000 }).toBe(1);
    await page.getByTestId('part-studio-sketch-dialog').getByRole('button', { name: '取消' }).click();
    await expect(page.getByRole('toolbar', { name: '特征工具' })).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await readSelection(page)).filter((entry) => entry.kind === 'sketchEntity').length, {
      timeout: 10_000,
    }).toBe(0);
  });
});
