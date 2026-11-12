/**
 * S2 真栈验收：特征树交互对拍（Onshape live 2026-11-12）。
 *
 * 覆盖：过滤态计数「匹配/总数」；零件行右键菜单分组（属性…/编辑外观…/隐藏/
 * 放大选定对象；特征变异项禁用）；属性只读对话框；放大选定对象改变相机；
 * 特征行右键「清除选定内容」清空树选择。
 */
import { expect, test } from '@playwright/test';
import type { FeatureOp, SketchConstraintDto, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
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

async function readEye(page: import('@playwright/test').Page): Promise<{ x: number; y: number; z: number } | null> {
  return page.evaluate(() => {
    const view = (window as unknown as {
      __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { view: { getEyePoint: () => { x: number; y: number; z: number } } } | undefined } } } };
    }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView?.view;
    if (!view)
      return null;
    const eye = view.getEyePoint();
    return { x: eye.x, y: eye.y, z: eye.z };
  });
}

async function readTreeSelection(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => {
    const store = (window as unknown as {
      __lubanE2EApp?: { usePartStudioStore?: { getState: () => { tree: { selectedNodeIds: string[] } } } };
    }).__lubanE2EApp?.usePartStudioStore;
    return store?.getState().tree.selectedNodeIds ?? [];
  });
}

test.describe('特征树交互对拍（S2）', () => {
  test('过滤计数 / 零件菜单 / 属性 / 放大 / 清除选择', async ({ page, request }) => {
    test.setTimeout(300_000);
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

    const lease = await borrowWriteLease(ctx, token, 'tree-interactions');
    const sketch = rectangleSketch(20, 20);
    const sketchResult = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: sketch.entities, constraints: sketch.constraints, plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(sketchResult, '草图');
    const extrudeOp: FeatureOp = {
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: sketchResult.featureId!, regions: [0], operation: 'new' },
    };
    const extrudeResult = await applyFeatureOpRpc(ctx, extrudeOp, lease, token);
    assertFeatureOpOk(extrudeResult, '拉伸');
    const extrudeId = extrudeResult.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openWithRetry();
    const tree = page.getByTestId('part-studio-tree');
    const featureList = page.getByTestId('part-studio-feature-list');
    await expect(page.getByTestId(`tree-row-${extrudeId}`)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('part-studio-feature-count')).toHaveText('(6)', { timeout: 30_000 });

    // ---- 1. 过滤态计数 = 匹配/总数（Onshape live：特征 (1/12)） ----
    const filterInput = tree.getByRole('textbox', { name: '按名称或类型筛选' });
    await filterInput.fill('拉伸');
    await expect(page.getByTestId('part-studio-feature-count')).toHaveText('(1/6)', { timeout: 10_000 });
    await expect(page.getByTestId(`tree-row-${extrudeId}`)).toBeVisible();
    await expect(featureList.getByText('草图 1')).toHaveCount(0);
    await filterInput.fill('');
    await expect(page.getByTestId('part-studio-feature-count')).toHaveText('(6)', { timeout: 10_000 });

    // ---- 2. 零件行右键菜单（Onshape 分组；已支持项启用、未支持项禁用） ----
    const partRow = page.getByTestId('part-studio-part-list').locator('[data-testid^="tree-row-"]').first();
    await expect(partRow).toBeVisible({ timeout: 30_000 });
    await partRow.click({ button: 'right' });
    const menu = page.getByRole('menu', { name: '特征菜单' });
    await expect(menu).toBeVisible();
    for (const name of ['属性…', '编辑外观…', '隐藏实体', '隐藏其他零件', '隐藏所有零件', '放大选定对象']) {
      await expect(menu.getByRole('menuitem', { name })).toBeEnabled();
    }
    // v1.70：零件重命名已接（renameBody RPC）；删除零件仍无后端 FeatureOp。
    await expect(menu.getByRole('menuitem', { name: '重命名' })).toBeEnabled();
    await expect(menu.getByRole('menuitem', { name: '删除…' })).toBeDisabled();

    // ---- 3. 属性… → 只读对话框（体积来自质量属性读面） ----
    await menu.getByTestId('tree-menu-properties').click();
    const properties = page.getByTestId('part-properties-dialog');
    await expect(properties).toBeVisible();
    await expect(properties.getByText('属性 — ')).toBeVisible();
    await expect(page.getByTestId('part-properties-volume')).toHaveText('4,000 mm³', { timeout: 30_000 });
    await properties.getByRole('button', { name: '关闭' }).click();
    await expect(properties).toHaveCount(0);

    // ---- 4. 放大选定对象 → 相机移动（标准 zoomToElements） ----
    const eyeBefore = await readEye(page);
    expect(eyeBefore).not.toBeNull();
    await partRow.click({ button: 'right' });
    await menu.getByTestId('tree-menu-zoom').click();
    await expect.poll(async () => {
      const eye = await readEye(page);
      if (!eye)
        return 0;
      return Math.hypot(eye.x - eyeBefore!.x, eye.y - eyeBefore!.y, eye.z - eyeBefore!.z);
    }, { timeout: 15_000, intervals: [300, 600, 1200] }).toBeGreaterThan(0.5);

    // ---- 5. 编辑外观… → 右停靠外观面板 ----
    await partRow.click({ button: 'right' });
    await menu.getByTestId('tree-menu-edit-appearance').click();
    await expect(page.getByTestId('part-studio-appearances')).toBeVisible({ timeout: 10_000 });

    // ---- 6. 特征行右键「清除选定内容」→ 树选择清空 ----
    await page.getByTestId(`tree-row-${extrudeId}`).click();
    await expect.poll(async () => (await readTreeSelection(page)).length, { timeout: 10_000 }).toBe(1);
    await page.getByTestId(`tree-row-${extrudeId}`).click({ button: 'right' });
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: '清除选定内容' }).click();
    await expect.poll(async () => (await readTreeSelection(page)).length, { timeout: 10_000 }).toBe(0);
  });
});
