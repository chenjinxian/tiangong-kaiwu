/**
 * ADR-0018 S1d 真栈验收：草图编辑态 Delete 删除选中实体（Onshape 对拍）。
 *
 * 覆盖：点击曲线 → Delete → 一次 updateSketch 落下（实体消失、引用它的约束级联
 * 移除、其它实体保留、草图保持编辑态）；撤销窗口内 Ctrl+Z 等价按钮 → 实体与约束
 * 一起恢复。
 */
import { expect, test } from '@playwright/test';
import type { SketchConstraintDto, SketchDto, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getSketchRpc,
  openSeedImodelEditor,
  releaseWriteLease, reloadWithFlush } from './helpers';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

const LINE_ID = 11;
const CIRCLE_ID = 21;
const HORIZONTAL_ID = 1;
const RADIUS_ID = 2;

const ENTITIES: SketchEntityDto[] = [
  { kind: 'line', id: LINE_ID, p1: { x: -10, y: 0 }, p2: { x: 10, y: 0 } },
  { kind: 'circle', id: CIRCLE_ID, center: { x: 0, y: 15 }, radius: 4 },
];
const CONSTRAINTS: SketchConstraintDto[] = [
  { kind: 'horizontal', id: HORIZONTAL_ID, refs: [LINE_ID] },
  { kind: 'radius', id: RADIUS_ID, refs: [CIRCLE_ID], value: 4 },
];

const entityIds = (sketch: SketchDto | undefined): number[] =>
  (sketch?.entities ?? []).map((entity) => entity.id).sort((a, b) => a - b);
const constraintIds = (sketch: SketchDto | undefined): number[] =>
  (sketch?.constraints ?? []).map((constraint) => constraint.id).sort((a, b) => a - b);

test.describe('草图实体删除（ADR-0018 S1d）', () => {
  test('Delete 删除曲线并级联约束；撤销恢复', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const openWithRetry = async () => {
      try {
        return await openSeedImodelEditor(page, seed);
      } catch {
        await reloadWithFlush(page);
        return openSeedImodelEditor(page, seed);
      }
    };
    let ctx = await openWithRetry();

    const lease = await borrowWriteLease(ctx, token, 'sketch-entity-delete');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: ENTITIES, constraints: CONSTRAINTS, plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await reloadWithFlush(page);
    ctx = await openWithRetry();
    const sketchRow = page.getByTestId(`tree-row-${sketchId}`);
    await expect(sketchRow).toBeVisible({ timeout: 60_000 });
    await sketchRow.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('sketch-entity-picker')).toBeAttached({ timeout: 60_000 });

    const initial = await getSketchRpc(ctx, sketchId, token);
    expect(entityIds(initial)).toEqual([LINE_ID, CIRCLE_ID]);
    expect(constraintIds(initial)).toEqual([HORIZONTAL_ID, RADIUS_ID]);

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
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
    await expect(page.getByTestId('sketch-entity-picker')).toHaveAttribute('data-selected', /11.*curve/);

    // ---- 1) Delete → 实体与附着约束一起消失（撤销窗口内先撤回来验证真删改） ----
    const undo = page.getByTestId('part-studio-ribbon-undo');
    await page.keyboard.press('Delete');
    // 真实删除门（先于撤销门）：一次 updateSketch 后线 + horizontal 约束移除、
    // 圆与 radius 保留。该门与撤销门独立，避免撤销缺口掩盖删除本身的行为。
    await expect.poll(async () => entityIds(await getSketchRpc(ctx, sketchId, token)), {
      timeout: 40_000,
      intervals: [800, 1200, 2000, 3000],
    }).toEqual([CIRCLE_ID]);
    expect(constraintIds(await getSketchRpc(ctx, sketchId, token))).toEqual([RADIUS_ID]);
    // KNOWN-RED（2026-11-23，C2 复跑实证）：上方删除门先红 —— Delete 没有执行。
    // 双击树行进入草图后，树行 button 保持 document.activeElement；随后画布单击
    // 拾取实体不会移焦（iTwin 对 pointerdown preventDefault），`page.keyboard.press('Delete')`
    // 的事件 target 落在 `[data-testid="part-studio-tree"]` 内，SketchEntityPicker
    // 按 P1-2 树/侧栏守卫（internal/tree-event-guard.ts）主动让位，不调
    // deleteSelectedSketchEntities → 无 updateSketch、无事务、实体仍为 [11,21]。
    // 对照诊断：仅在上方拾取后临时 blur 焦点，本用例全部通过（删除落库 + 原生
    // undo 恢复）——撤销通道本身正常，根因是画布拾取未移焦。这不是断言降级：
    // 真实删除门与撤销门都保留。修复方向=画布拾取时移焦（或守卫按选择来源而非
    // event.target 判定）；修复后本门与撤销门一起转绿。
    await expect(undo).toBeEnabled({ timeout: 10_000 });
    await undo.click();
    await expect.poll(async () => constraintIds(await getSketchRpc(ctx, sketchId, token)), {
      timeout: 40_000,
      intervals: [800, 1200, 2000, 3000],
    }).toEqual([HORIZONTAL_ID, RADIUS_ID]);
    const restored = await getSketchRpc(ctx, sketchId, token);
    expect(entityIds(restored)).toEqual([LINE_ID, CIRCLE_ID]);

    // ---- 2) 再次 Delete → 持久删除（线 + horizontal 约束移除，圆与半径保留） ----
    await page.mouse.click(center.x, center.y);
    await expect(page.getByTestId('sketch-entity-picker')).toHaveAttribute('data-selected', /11.*curve/);
    await page.keyboard.press('Delete');
    await expect.poll(async () => entityIds(await getSketchRpc(ctx, sketchId, token)), {
      timeout: 40_000,
      intervals: [800, 1200, 2000, 3000],
    }).toEqual([CIRCLE_ID]);
    expect(constraintIds(await getSketchRpc(ctx, sketchId, token))).toEqual([RADIUS_ID]);
    // Onshape：删除后草图保持编辑态（不退出草图）。
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible();
    // 已删实体的选择条目被清除。
    await expect(page.getByTestId('sketch-entity-picker')).toHaveAttribute('data-selected', '[]');
  });
});
