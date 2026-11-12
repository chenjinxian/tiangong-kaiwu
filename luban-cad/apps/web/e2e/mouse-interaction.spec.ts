/**
 * Onshape 鼠标交互真栈验收（2026-11-12）：
 * - 3D：右键拖拽旋转（不弹菜单）、右键单击弹画布菜单且相机不变、
 *   Ctrl+右键拖拽平移；
 * - 草图：空白左键拖拽框选——左→右窗口（完全包含才选中）、
 *   右→左交叉（与曲线相交即选中）；拖拽中显示蓝色选择框。
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SketchPlaneDto } from '@luban-cad/shared';
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

interface CameraProbe {
  origin: { x: number; y: number; z: number };
  extents: { x: number; y: number; z: number };
}

async function readCamera(page: Page): Promise<CameraProbe> {
  return page.evaluate(() => {
    const cf = ((window as any).__lubanE2E?.coreFrontend) as any;
    const vp = cf?.IModelApp?.viewManager?.getFirstOpenView?.();
    const view = vp?.view;
    if (!view)
      throw new Error('readCamera：viewport 未就绪');
    const vec = (v: any) => ({ x: v.x, y: v.y, z: v.z });
    return { origin: vec(view.getOrigin()), extents: vec(view.getExtents()) };
  });
}

function cameraDelta(a: CameraProbe, b: CameraProbe): number {
  return ['origin', 'extents'].reduce((sum, key) => {
    const va = a[key as keyof CameraProbe];
    const vb = b[key as keyof CameraProbe];
    return sum + Math.abs(va.x - vb.x) + Math.abs(va.y - vb.y) + Math.abs(va.z - vb.z);
  }, 0);
}

async function openEditor(page: Page, request: Parameters<typeof resetBModelSeed>[0]): Promise<void> {
  const token = await getApiToken();
  const seed = await resetBModelSeed(request, token);
  try {
    await openSeedImodelEditor(page, seed);
  } catch {
    await page.reload();
    await openSeedImodelEditor(page, seed);
  }
  await expect(page.getByRole('toolbar', { name: '特征工具' })).toBeVisible({ timeout: 60_000 });
}

test.describe('Onshape 鼠标导航（3D）', () => {
  test('右键拖拽旋转且不弹菜单；右键单击弹菜单不改相机；Ctrl+右键拖拽平移', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 240_000);
    await openEditor(page, request);

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const at = (fx: number, fy: number) => ({
      x: box!.x + box!.width * fx,
      y: box!.y + box!.height * fy,
    });

    const cam0 = await readCamera(page);
    const from = at(0.28, 0.3);
    const to = at(0.62, 0.55);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(to.x, to.y, { steps: 18 });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(500);

    const cam1 = await readCamera(page);
    expect(cameraDelta(cam0, cam1), '右键拖拽应改变相机（旋转）').toBeGreaterThan(1);
    await expect(page.getByRole('menu', { name: '画布菜单' }), '右键拖拽结束不得弹菜单').toHaveCount(0);

    // 右键单击：菜单可见，相机不变。
    const clickPoint = at(0.5, 0.5);
    await page.mouse.click(clickPoint.x, clickPoint.y, { button: 'right' });
    const menu = page.getByRole('menu', { name: '画布菜单' });
    await expect(menu).toBeVisible({ timeout: 20_000 });
    const cam2 = await readCamera(page);
    expect(cameraDelta(cam1, cam2), '右键单击不得改变相机').toBeLessThan(0.01);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0, { timeout: 10_000 });

    // Ctrl+右键拖拽：平移（相机变化），同样不弹菜单。
    await page.keyboard.down('Control');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(to.x, to.y, { steps: 18 });
    await page.mouse.up({ button: 'right' });
    await page.keyboard.up('Control');
    await page.waitForTimeout(500);
    const cam3 = await readCamera(page);
    expect(cameraDelta(cam2, cam3), 'Ctrl+右键拖拽应平移视图').toBeGreaterThan(1);
    await expect(page.getByRole('menu', { name: '画布菜单' })).toHaveCount(0);
  });
});

test.describe('Onshape 草图框选', () => {
  test('左→右窗口选择、右→左交叉选择；拖拽中显示蓝色选框', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const openWithRetry = async () => {
      try {
        return await openSeedImodelEditor(page, seed);
      } catch {
        await page.reload();
        return await openSeedImodelEditor(page, seed);
      }
    };
    let ctx = await openWithRetry();

    const lease = await borrowWriteLease(ctx, token, 'mouse-box-select');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [
        { kind: 'line', id: 11, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
        { kind: 'line', id: 12, p1: { x: 0, y: 20 }, p2: { x: 10, y: 20 } },
      ],
      constraints: [
        { kind: 'horizontal', id: 101, refs: [11] },
        { kind: 'horizontal', id: 102, refs: [12] },
      ],
      plane: XY_PLANE,
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

    // 草图编辑态同样右键拖拽旋转、不弹菜单（工具挂起期间 idle 兜底）。
    const sketchCanvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const sketchBox = await sketchCanvas.boundingBox();
    expect(sketchBox).not.toBeNull();
    const camBeforeRotate = await readCamera(page);
    const rotateFrom = { x: sketchBox!.x + sketchBox!.width * 0.25, y: sketchBox!.y + sketchBox!.height * 0.25 };
    const rotateTo = { x: sketchBox!.x + sketchBox!.width * 0.6, y: sketchBox!.y + sketchBox!.height * 0.5 };
    await page.mouse.move(rotateFrom.x, rotateFrom.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(rotateTo.x, rotateTo.y, { steps: 16 });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(400);
    expect(cameraDelta(camBeforeRotate, await readCamera(page)), '草图态右键拖拽应旋转').toBeGreaterThan(1);
    await expect(page.getByRole('menu', { name: '画布菜单' })).toHaveCount(0);

    await page.getByRole('button', { name: '正视草图平面' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '缩放到合适大小' }).click();
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const vp = ((window as any).__lubanE2E?.coreFrontend)?.IModelApp?.viewManager?.selectedView as
        | { zoomToVolume?: (v: unknown) => void }
        | undefined;
      vp?.zoomToVolume?.({ low: { x: -6, y: -6, z: -2 }, high: { x: 16, y: 28, z: 2 } });
    });
    await page.waitForTimeout(400);

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const project = async (x: number, y: number) => {
      const view = await page.evaluate((world) => {
        const vp = ((window as any).__lubanE2E?.coreFrontend)?.IModelApp?.viewManager?.selectedView as
          | { worldToView: (p: { x: number; y: number; z: number }) => { x: number; y: number } }
          | undefined;
        if (!vp) return null;
        const v = vp.worldToView(world);
        return { x: v.x, y: v.y };
      }, { x, y, z: 0 });
      expect(view).not.toBeNull();
      return { x: box!.x + view!.x, y: box!.y + view!.y };
    };
    const picker = page.getByTestId('sketch-entity-picker');
    const selectedIds = async (): Promise<number[]> => {
      const raw = await picker.getAttribute('data-selected');
      return (JSON.parse(raw ?? '[]') as [number, string][]).map(([id]) => id);
    };
    const clearSelection = async (): Promise<void> => {
      const blank = { x: box!.x + 40, y: box!.y + box!.height - 40 };
      await page.mouse.click(blank.x, blank.y);
      await page.waitForTimeout(200);
      await expect.poll(selectedIds, { timeout: 10_000 }).toEqual([]);
    };

    const line12Start = await project(0, 20);
    const line12End = await project(10, 20);
    const line12Mid = { x: (line12Start.x + line12End.x) / 2, y: line12Start.y };

    // 窗口选择：完整包围线 12（起点在线外侧 > 点击容差）。
    const windowFrom = { x: line12Start.x - 30, y: line12Start.y - 30 };
    const windowTo = { x: line12End.x + 30, y: line12Start.y + 30 };
    await page.mouse.move(windowFrom.x, windowFrom.y);
    await page.mouse.down();
    await page.mouse.move(windowTo.x, windowTo.y, { steps: 14 });
    await expect(page.getByTestId('sketch-select-box'), '拖拽中应显示蓝色选框').toBeVisible();
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await selectedIds(), '窗口选择应选中线 12').toContain(12);

    await clearSelection();

    // 同一局部框：左→右（窗口）不选中（线端点在外）；右→左（交叉）选中。
    const partialA = { x: line12Mid.x - 40, y: line12Mid.y - 30 };
    const partialB = { x: line12Mid.x + 40, y: line12Mid.y + 30 };
    await page.mouse.move(partialA.x, partialA.y);
    await page.mouse.down();
    await page.mouse.move(partialB.x, partialB.y, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await selectedIds(), '左→右窗口选择不得选中仅相交的线').not.toContain(12);

    await clearSelection();
    await page.mouse.move(partialB.x, partialB.y);
    await page.mouse.down();
    await page.mouse.move(partialA.x, partialA.y, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await selectedIds(), '右→左交叉选择应选中相交的线').toContain(12);

    // 空白右键菜单（Onshape 草图空白菜单面）：确认/复制/粘贴/全部显示/分析/选择/缩放/正视。
    const blankPoint = { x: box!.x + 40, y: box!.y + box!.height - 40 };
    await page.mouse.click(blankPoint.x, blankPoint.y, { button: 'right' });
    const blankMenu = page.getByTestId('sketch-blank-menu');
    await expect(blankMenu).toBeVisible({ timeout: 20_000 });
    await expect(blankMenu.getByRole('menuitem', { name: /^确认 草图/ })).toBeVisible();
    await expect(blankMenu.getByRole('menuitem', { name: '复制草图' })).toBeDisabled();
    await expect(blankMenu.getByRole('menuitem', { name: '全部显示' })).toBeVisible();
    await blankMenu.getByTestId('sketch-blank-menu-view-normal').click();
    await expect(blankMenu).toHaveCount(0, { timeout: 10_000 });

    // 再次空白右键 → 确认草图：退出草图编辑，恢复特征工具栏。
    await page.mouse.click(blankPoint.x, blankPoint.y, { button: 'right' });
    await expect(blankMenu).toBeVisible({ timeout: 20_000 });
    await blankMenu.getByTestId('sketch-blank-menu-confirm').click();
    await expect(page.getByTestId('part-studio-sketch-dialog')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByRole('toolbar', { name: '特征工具' })).toBeVisible({ timeout: 30_000 });
  });
});
