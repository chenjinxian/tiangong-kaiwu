/**
 * W41 S10（Onshape live 2026-11-18）：树草图行「复制草图」→ 另一草图内
 * 「粘贴草图图元」真栈链。
 * W44 S13（Onshape live 2026-11-19 probe w46b）：树草图行「粘贴到草图中」——
 * 剪贴板图元直接写入目标草图、**不打开草图**（live 空目标草图重开可见矩形）。
 *
 * live 证据：特征树草图行右键菜单含「复制草图」「粘贴到草图中」；草图编辑内
 * 画布空白右键菜单含「粘贴草图图元」（复制后启用），且**没有**「复制草图」。
 *
 * 用例 1（S10，草图内粘贴）：
 *   1) RPC 建种子草图 A（矩形：4 线 + 8 内联约束）；
 *   2) 树行右键 → 复制草图（会话剪贴板）；
 *   3) UI 新建草图 B（Front 平面，进入编辑态）；
 *   4) 草图 B 内空白右键 → 断言无「复制草图」+ 粘贴可用 → 粘贴；
 *   5) RPC 读 B：4 线 / 8 约束（4 coincident + 2 horizontal + 2 vertical）、
 *      包围盒 40×20、A 不变；
 *   6) 完成草图 → reload 重开 → B 持久（4 线 / 8 约束）。
 *
 * 用例 2（S13，树级粘贴）：
 *   1) RPC 建 A（矩形）与 B（空草图）；
 *   2) 树 A 复制草图 → 树 B「粘贴到草图中」；
 *   3) 断言未打开草图对话框；RPC 读 B 4 线/8 约束、包围盒 40×20、A 不变；
 *   4) reload 重开 → B 持久。
 */
import { expect, test } from '@playwright/test';
import type { SketchConstraintDto, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getFeatureTreeRpc,
  getSketchRpc,
  openSeedImodelEditor,
  releaseWriteLease,
} from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { chooseSketchPlaneInViewport, finishSketch } from './tutorial2-helpers.js';

const FRONT: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  xDir: { x: 1, y: 0, z: 0 },
};

type LineEntity = Extract<SketchEntityDto, { kind: 'line' }>;

/** 矩形 = 4 条内联端点线 + 4 coincident + 2 horizontal + 2 vertical（无游离点）。 */
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
      { kind: 'coincident', id: 22, refs: [{ entity: 12, part: 'end' }, { entity: 13, part: 'start' }] },
      { kind: 'coincident', id: 23, refs: [{ entity: 13, part: 'end' }, { entity: 14, part: 'start' }] },
      { kind: 'coincident', id: 24, refs: [{ entity: 14, part: 'end' }, { entity: 11, part: 'start' }] },
      { kind: 'horizontal', id: 25, refs: [11] },
      { kind: 'horizontal', id: 26, refs: [13] },
      { kind: 'vertical', id: 27, refs: [12] },
      { kind: 'vertical', id: 28, refs: [14] },
    ],
  };
}

const inlinePoint = (ref: LineEntity['p1']): { x: number; y: number } => {
  if (typeof ref !== 'object') throw new Error('期望内联端点');
  return ref;
};

/** 草图 B 的复制结果断言（数量 + 关键约束 + 包围盒）。 */
async function expectRectangleCopy(
  ctx: Awaited<ReturnType<typeof openSeedImodelEditor>>,
  sketchId: string,
  token: string,
): Promise<void> {
  const sketch = await getSketchRpc(ctx, sketchId, token);
  expect(sketch, `草图 ${sketchId} 应可读`).toBeDefined();
  if (!sketch) return;
  const lines = sketch.entities.filter((entity): entity is LineEntity => entity.kind === 'line');
  expect(lines).toHaveLength(4);
  // 曲线选择语义：无显式 point 被曲线引用 → 不产生 point 副本。
  expect(sketch.entities.filter((entity) => entity.kind === 'point')).toHaveLength(0);
  const kinds = sketch.constraints.map((constraint) => constraint.kind);
  expect(kinds.filter((kind) => kind === 'coincident')).toHaveLength(4);
  expect(kinds.filter((kind) => kind === 'horizontal')).toHaveLength(2);
  expect(kinds.filter((kind) => kind === 'vertical')).toHaveLength(2);
  expect(sketch.constraints).toHaveLength(8);
  // 副本约束只引用本草图内实体（4 条线 id）。
  const lineIds = new Set(lines.map((line) => line.id));
  for (const constraint of sketch.constraints) {
    for (const ref of constraint.refs) {
      const id = typeof ref === 'number' ? ref : 'entity' in ref ? ref.entity : undefined;
      expect(id, '副本约束不得引用外部实体').toBeDefined();
      expect(lineIds.has(id!)).toBe(true);
    }
  }
  const xs = lines.flatMap((line) => [inlinePoint(line.p1).x, inlinePoint(line.p2).x]);
  const ys = lines.flatMap((line) => [inlinePoint(line.p1).y, inlinePoint(line.p2).y]);
  expect(Math.abs(Math.max(...xs) - Math.min(...xs) - 40)).toBeLessThan(0.5);
  expect(Math.abs(Math.max(...ys) - Math.min(...ys) - 20)).toBeLessThan(0.5);
}

test.describe('W41 S10 / W44 S13：草图复制与粘贴（树/草图内）', () => {
  test('树右键复制草图 A → 新草图 B 粘贴 → RPC 读 B（4 线/8 约束）→ reload 持久', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openSeedImodelEditor(page, seed);

    // ── 1) 种子草图 A（前端 RPC；复制走真实树菜单）─────────────────────
    const rectangle = rectangleSketch(40, 20);
    const lease = await borrowWriteLease(ctx, token, 's10-copy-sketch');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: rectangle.entities,
      constraints: rectangle.constraints,
      plane: FRONT,
    }, lease, token);
    assertFeatureOpOk(created, '种子草图 A');
    const sketchAId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    const rowA = page.getByTestId(`tree-row-${sketchAId}`);
    await expect(rowA).toBeVisible({ timeout: 60_000 });
    // 复制契约前置：树行 params 必须携带落库 entities+constraints（宿主单源读取）。
    const treeBefore = await getFeatureTreeRpc(ctx, token);
    const paramsA = (treeBefore.find((row) => row.id === sketchAId)?.params ?? {}) as {
      entities?: unknown[];
      constraints?: unknown[];
    };
    expect(paramsA.entities).toHaveLength(4);
    expect(paramsA.constraints).toHaveLength(8);

    // ── 2) 树行右键 → 复制草图 ────────────────────────────────────────
    await rowA.click({ button: 'right' });
    const treeMenu = page.getByRole('menu', { name: '特征菜单' });
    await expect(treeMenu).toBeVisible();
    const copyItem = treeMenu.getByTestId('tree-menu-copy-sketch');
    await expect(copyItem).toBeVisible();
    await expect(copyItem).toHaveText('复制草图');
    await copyItem.click();
    await expect(treeMenu).toHaveCount(0);

    // ── 3) UI 新建草图 B（Front 平面 → 进入编辑态）────────────────────
    await page.getByRole('button', { name: '草图', exact: true }).click();
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
    await chooseSketchPlaneInViewport(page, 'front');
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    let sketchBId = '';
    await expect.poll(async () => {
      const tree = await getFeatureTreeRpc(ctx, token);
      sketchBId = tree.filter((row) => row.featureType === 'sketch').at(-1)?.id ?? '';
      return sketchBId !== '' && sketchBId !== sketchAId;
    }, { timeout: 30_000, intervals: [500, 1000, 2000] }).toBe(true);

    // ── 4) 草图 B 内空白右键 → 无「复制草图」+ 粘贴可用 → 粘贴 ────────
    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const blank = { x: box.x + box.width * 0.75, y: box.y + box.height * 0.78 };
    await page.mouse.move(blank.x - 20, blank.y - 14);
    await page.waitForTimeout(120);
    await page.mouse.click(blank.x, blank.y, { button: 'right' });
    const blankMenu = page.getByTestId('sketch-blank-menu');
    await expect(blankMenu).toBeVisible({ timeout: 20_000 });
    await expect(blankMenu.getByRole('menuitem', { name: '复制草图', exact: true })).toHaveCount(0);
    const pasteItem = blankMenu.getByTestId('sketch-blank-menu-paste');
    await expect(pasteItem).toBeEnabled();
    await pasteItem.click();

    // ── 5) RPC 读 B：数量/关键约束/包围盒 + A 不变 ────────────────────
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchBId, token);
      return sketch !== undefined
        && sketch.entities.filter((entity) => entity.kind === 'line').length === 4
        && sketch.constraints.length === 8;
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBe(true);
    await expectRectangleCopy(ctx, sketchBId, token);

    const source = await getSketchRpc(ctx, sketchAId, token);
    expect(source?.entities.filter((entity) => entity.kind === 'line')).toHaveLength(4);
    expect(source?.constraints).toHaveLength(8);

    // ── 6) 完成草图 → reload 重开 → B 持久 ───────────────────────────
    await finishSketch(page);
    await page.reload();
    const reopened = await openSeedImodelEditor(page, seed);
    await expectRectangleCopy(reopened, sketchBId, token);
  });

  test('树右键复制草图 A → 树「粘贴到草图中」写入空草图 B（不打开草图）→ RPC 4 线/8 约束 → reload 持久', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openSeedImodelEditor(page, seed);

    // ── 1) RPC 建 A（矩形）与 B（空草图，同平面）────────────────────────
    const rectangle = rectangleSketch(40, 20);
    const lease = await borrowWriteLease(ctx, token, 's13-tree-paste');
    const createdA = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: rectangle.entities,
      constraints: rectangle.constraints,
      plane: FRONT,
    }, lease, token);
    assertFeatureOpOk(createdA, '种子草图 A');
    const sketchAId = createdA.featureId!;
    const createdB = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [],
      constraints: [],
      plane: FRONT,
    }, lease, token);
    assertFeatureOpOk(createdB, '目标空草图 B');
    const sketchBId = createdB.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    await expect(page.getByTestId(`tree-row-${sketchAId}`)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId(`tree-row-${sketchBId}`)).toBeVisible({ timeout: 60_000 });

    // ── 2) 树 A 复制草图 → 树 B 粘贴到草图中（不打开草图）──────────────
    await page.getByTestId(`tree-row-${sketchAId}`).click({ button: 'right' });
    let menu = page.getByRole('menu', { name: '特征菜单' });
    await expect(menu).toBeVisible();
    await menu.getByTestId('tree-menu-copy-sketch').click();
    await expect(menu).toHaveCount(0);

    await page.getByTestId(`tree-row-${sketchBId}`).click({ button: 'right' });
    menu = page.getByRole('menu', { name: '特征菜单' });
    const pasteItem = menu.getByTestId('tree-menu-paste-sketch');
    await expect(pasteItem).toBeEnabled();
    await pasteItem.click();
    // live 语义：目标草图不被打开（无草图对话框/草图工具条）。
    await expect(page.getByTestId('part-studio-sketch-dialog')).toHaveCount(0);
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toHaveCount(0);

    // ── 3) RPC 读 B：4 线/8 约束 + 包围盒；A 不变 ──────────────────────
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchBId, token);
      return sketch !== undefined
        && sketch.entities.filter((entity) => entity.kind === 'line').length === 4
        && sketch.constraints.length === 8;
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBe(true);
    await expectRectangleCopy(ctx, sketchBId, token);

    const source = await getSketchRpc(ctx, sketchAId, token);
    expect(source?.entities.filter((entity) => entity.kind === 'line')).toHaveLength(4);
    expect(source?.constraints).toHaveLength(8);

    // 迟开守卫：树刷新完成后仍不得出现草图对话框/草图工具条（live 不打开草图）。
    await expect(page.getByTestId('part-studio-sketch-dialog')).toHaveCount(0);
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toHaveCount(0);

    // P0-10 可撤销：Ribbon Undo → B 退回空草图；Redo → 4 线/8 约束恢复。
    const undo = page.getByTestId('part-studio-ribbon-undo');
    await expect(undo).toBeEnabled({ timeout: 30_000 });
    await undo.click();
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchBId, token);
      return sketch !== undefined && sketch.entities.length === 0 && sketch.constraints.length === 0;
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBe(true);
    const redo = page.getByTestId('part-studio-ribbon-redo');
    await expect(redo).toBeEnabled({ timeout: 30_000 });
    await redo.click();
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchBId, token);
      return sketch !== undefined
        && sketch.entities.filter((entity) => entity.kind === 'line').length === 4
        && sketch.constraints.length === 8;
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBe(true);

    // ── 4) reload 重开 → B 持久 ────────────────────────────────────────
    await page.reload();
    const reopened = await openSeedImodelEditor(page, seed);
    await expectRectangleCopy(reopened, sketchBId, token);
  });
});
