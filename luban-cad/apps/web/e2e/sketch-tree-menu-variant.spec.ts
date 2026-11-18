/**
 * W45 S15（Onshape live 2026-11-19 probe w47）：草图打开态树菜单变体真栈验收。
 *
 * live 证据（私有 probe w47）：
 * - 草图编辑打开时，右键**当前草图行**不弹菜单（menu dump 为空）；
 * - 右键**其它草图行** = 7 项短菜单（重命名/隐藏其他草图/隐藏所有草图/剖视图…/
 *   抑制/动态抑制添加表达式…/添加评论），无编辑/复制/粘贴/删除等全菜单项；
 * - 关闭草图后恢复全菜单；W46 S16 起按 live w47-04 的 21 项顺序对齐（本 spec
 *   逐项断言文案与启用/禁用态）。
 *
 * 本 spec（RPC 建两草图 + 真实树菜单）：
 *   1) RPC 建草图 A（矩形）与 B（空）；
 *   2) 双击 A 进入草图编辑；
 *   3) 右键 A：无菜单；右键 B：7 项短菜单，未实现项诚实禁用、无复制/粘贴/删除；
 *   4) 完成草图 → 右键 A：全菜单恢复（复制草图在列、短菜单项缺席）。
 */
import { expect, test } from '@playwright/test';
import type { SketchConstraintDto, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  openSeedImodelEditor,
  releaseWriteLease,
} from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { finishSketch } from './tutorial2-helpers.js';

const FRONT: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  xDir: { x: 1, y: 0, z: 0 },
};

function rectangleSketch(width: number, height: number): {
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
} {
  return {
    entities: [
      { kind: 'line', id: 11, p1: { x: 0, y: 0 }, p2: { x: width, y: 0 } },
      { kind: 'line', id: 12, p1: { x: width, y: 0 }, p2: { x: width, y: height } },
      { kind: 'line', id: 13, p1: { x: width, y: height }, p2: { x: 0, y: height } },
      { kind: 'line', id: 14, p1: { x: 0, y: height }, p2: { x: 0, y: 0 } },
    ],
    constraints: [
      { kind: 'coincident', id: 21, refs: [{ entity: 11, part: 'end' }, { entity: 12, part: 'start' }] },
      { kind: 'horizontal', id: 25, refs: [11] },
      { kind: 'vertical', id: 27, refs: [12] },
    ],
  };
}

test.describe('W45 S15：草图打开态树菜单变体', () => {
  test('打开草图的当前行无菜单；其它行 7 项短菜单；关闭后恢复全菜单', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openSeedImodelEditor(page, seed);

    const rectangle = rectangleSketch(40, 20);
    const lease = await borrowWriteLease(ctx, token, 's15-tree-menu-variant');
    const createdA = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: rectangle.entities,
      constraints: rectangle.constraints,
      plane: FRONT,
    }, lease, token);
    assertFeatureOpOk(createdA, '草图 A');
    const sketchAId = createdA.featureId!;
    const createdB = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [],
      constraints: [],
      plane: FRONT,
    }, lease, token);
    assertFeatureOpOk(createdB, '空草图 B');
    const sketchBId = createdB.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    const rowA = page.getByTestId(`tree-row-${sketchAId}`);
    const rowB = page.getByTestId(`tree-row-${sketchBId}`);
    await expect(rowA).toBeVisible({ timeout: 60_000 });
    await expect(rowB).toBeVisible({ timeout: 60_000 });

    // 先树复制 A（矩形）填充会话剪贴板：live 全菜单「粘贴到草图中」有剪贴板时
    // 启用；本产品空剪贴板诚实禁用（S13 口径）。
    await rowA.click({ button: 'right' });
    const copyMenu = page.getByRole('menu', { name: '特征菜单' });
    await expect(copyMenu).toBeVisible();
    await copyMenu.getByTestId('tree-menu-copy-sketch').click();
    await expect(copyMenu).toHaveCount(0);

    // ── 2) 双击 A 进入草图编辑 ─────────────────────────────────────────
    await rowA.dblclick();
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    // ── 3a) 右键当前草图行：不弹菜单（live w47-02）──────────────────────
    await rowA.click({ button: 'right' });
    await expect(page.getByRole('menu', { name: '特征菜单' })).toHaveCount(0);

    // ── 3b) 右键其它草图行：7 项短菜单，无复制/粘贴/删除 ────────────────
    await rowB.click({ button: 'right' });
    const shortMenu = page.getByRole('menu', { name: '特征菜单' });
    await expect(shortMenu).toBeVisible();
    const shortItems = shortMenu.getByRole('menuitem');
    await expect(shortItems).toHaveCount(7);
    const shortTexts = await shortItems.allTextContents();
    expect(shortTexts.map((text) => text.trim())).toEqual([
      '重命名',
      '隐藏其他草图',
      '隐藏所有草图',
      '剖视图…',
      '抑制',
      '动态抑制添加表达式…›',
      '添加评论',
    ]);
    // 已实现项可用；未实现项诚实禁用。
    await expect(shortItems.nth(0)).toBeEnabled();
    await expect(shortItems.nth(1)).toBeDisabled();
    await expect(shortItems.nth(2)).toBeDisabled();
    await expect(shortItems.nth(3)).toBeDisabled();
    await expect(shortItems.nth(4)).toBeEnabled();
    await expect(shortItems.nth(5)).toBeDisabled();
    await expect(shortItems.nth(6)).toBeDisabled();
    await expect(shortMenu.getByTestId('tree-menu-copy-sketch')).toHaveCount(0);
    await expect(shortMenu.getByTestId('tree-menu-paste-sketch')).toHaveCount(0);
    await expect(shortMenu.getByRole('menuitem', { name: '删除' })).toHaveCount(0);

    // ── 4) 完成草图 → 全菜单恢复（W46 S16：live w47-04 21 项）─────────────
    // 不先按 Escape（本产品 Escape=退出草图）；直接点草图对话框「确认」。
    await finishSketch(page);
    await expect(page.getByTestId('part-studio-sketch-dialog')).toHaveCount(0);
    await rowA.click({ button: 'right' });
    const fullMenu = page.getByRole('menu', { name: '特征菜单' });
    await expect(fullMenu).toBeVisible();
    const fullItems = fullMenu.getByRole('menuitem');
    await expect(fullItems).toHaveCount(21);
    expect((await fullItems.allTextContents()).map((text) => text.trim())).toEqual([
      '重命名',
      '编辑…',
      '复制草图',
      '粘贴到草图中',
      '显示尺寸',
      '将选定内容添加到文件夹…',
      '隐藏',
      '隐藏其他草图',
      '隐藏所有草图',
      '创建 草图 1 的工程图…',
      '导出为 DXF/DWG…',
      '剖视图…',
      '抑制',
      '动态抑制添加表达式…›',
      '添加评论',
      '放大选定对象',
      '视图垂直于',
      '显示依赖项…',
      '滚动到此处',
      '编辑草图外观…',
      '删除',
    ]);
    // 已实现项可用；未实现子系统项诚实禁用。
    await expect(fullItems.nth(0)).toBeEnabled();
    await expect(fullItems.nth(1)).toBeEnabled();
    await expect(fullItems.nth(2)).toBeEnabled();
    await expect(fullItems.nth(3)).toBeEnabled();
    await expect(fullItems.nth(4)).toBeDisabled();
    await expect(fullItems.nth(5)).toBeDisabled();
    await expect(fullItems.nth(6)).toBeDisabled();
    await expect(fullItems.nth(7)).toBeDisabled();
    await expect(fullItems.nth(8)).toBeDisabled();
    await expect(fullItems.nth(9)).toBeDisabled();
    await expect(fullItems.nth(10)).toBeDisabled();
    await expect(fullItems.nth(11)).toBeDisabled();
    await expect(fullItems.nth(12)).toBeEnabled();
    await expect(fullItems.nth(13)).toBeDisabled();
    await expect(fullItems.nth(14)).toBeDisabled();
    await expect(fullItems.nth(15)).toBeEnabled();
    await expect(fullItems.nth(16)).toBeEnabled();
    await expect(fullItems.nth(17)).toBeDisabled();
    await expect(fullItems.nth(18)).toBeDisabled();
    await expect(fullItems.nth(19)).toBeDisabled();
    await expect(fullItems.nth(20)).toBeEnabled();
    await expect(fullMenu.getByRole('menuitem', { name: '清除选择' })).toHaveCount(0);
    await expect(fullMenu.getByRole('menuitem', { name: '编辑草图…' })).toHaveCount(0);
    // 视图垂直于：菜单收合、真实相机动作不抛异常（草图 A 在 Front 平面）。
    await fullItems.nth(16).click();
    await expect(fullMenu).toHaveCount(0);
  });
});
