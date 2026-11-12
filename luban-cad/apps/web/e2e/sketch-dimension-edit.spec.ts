/**
 * ADR-0018 S1e 真栈验收：草图尺寸数值双击改值（Onshape 对拍）。
 *
 * 覆盖：进入草图编辑 → 双击半径数值 → 输入新值 Enter → getSketch 解算后半径更新；
 * 双击线长数值 → 新长度生效（几何全链重解算）；输入框关闭、草图保持编辑态。
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
  releaseWriteLease,
} from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

const LINE_ID = 11;
const CIRCLE_ID = 21;
const HORIZONTAL_ID = 1;
const LENGTH_ID = 2;
const RADIUS_ID = 3;

const ENTITIES: SketchEntityDto[] = [
  { kind: 'line', id: LINE_ID, p1: { x: -10, y: -12 }, p2: { x: 10, y: -12 } },
  { kind: 'circle', id: CIRCLE_ID, center: { x: 0, y: 10 }, radius: 4 },
];
const CONSTRAINTS: SketchConstraintDto[] = [
  { kind: 'horizontal', id: HORIZONTAL_ID, refs: [LINE_ID] },
  { kind: 'length', id: LENGTH_ID, refs: [LINE_ID], value: 20 },
  { kind: 'radius', id: RADIUS_ID, refs: [CIRCLE_ID], value: 4 },
];

interface Pt { x: number; y: number }

function circleRadius(sketch: SketchDto | undefined): number | null {
  const circle = sketch?.entities.find((entity) => entity.kind === 'circle' && entity.id === CIRCLE_ID);
  return circle && circle.kind === 'circle' && typeof circle.radius === 'number' ? circle.radius : null;
}

function lineLength(sketch: SketchDto | undefined): number | null {
  const line = sketch?.entities.find((entity) => entity.kind === 'line' && entity.id === LINE_ID);
  if (!line || line.kind !== 'line')
    return null;
  const resolve = (ref: Pt | number): Pt | null => {
    if (typeof ref === 'number') {
      const point = sketch!.entities.find((entity) => entity.id === ref) as
        | { kind?: string; x?: number; y?: number }
        | undefined;
      return point && point.kind === 'point' ? { x: point.x ?? 0, y: point.y ?? 0 } : null;
    }
    return ref;
  };
  const p1 = resolve(line.p1);
  const p2 = resolve(line.p2);
  return p1 && p2 ? Math.hypot(p2.x - p1.x, p2.y - p1.y) : null;
}

test.describe('草图尺寸双击改值（ADR-0018 S1e）', () => {
  test('半径与长度内联改值 → 解算后几何更新', async ({ page, request }) => {
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

    const lease = await borrowWriteLease(ctx, token, 'sketch-dimension-edit');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: ENTITIES, constraints: CONSTRAINTS, plane: XY_PLANE,
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

    const initial = await getSketchRpc(ctx, sketchId, token);
    expect(circleRadius(initial)).toBeCloseTo(4, 6);
    expect(lineLength(initial)).toBeCloseTo(20, 6);

    // 标注标签（与绘制同源布局）暴露命中中心；双精度点击用真实鼠标。
    const labels = page.getByTestId('sketch-dimension-label');
    await expect(labels).toHaveCount(2, { timeout: 60_000 });
    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const centerOf = async (constraintId: number): Promise<Pt> => {
      const marker = page.locator(`[data-testid="sketch-dimension-label"][data-constraint-id="${constraintId}"]`);
      await expect(marker).toBeAttached();
      const center = await marker.getAttribute('data-center');
      expect(center).not.toBeNull();
      const parts = center!.split(',').map(Number);
      return { x: box!.x + (parts[0] ?? 0), y: box!.y + (parts[1] ?? 0) };
    };

    // ---- 1) 半径 4 → 6 ----
    const radiusAt = await centerOf(RADIUS_ID);
    await page.mouse.dblclick(radiusAt.x, radiusAt.y);
    const input = page.getByTestId('sketch-dimension-input');
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill('6');
    await input.press('Enter');
    await expect.poll(async () => {
      const value = circleRadius(await getSketchRpc(ctx, sketchId, token));
      return value === null ? 999 : Math.abs(value - 6);
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBeLessThan(0.001);
    await expect(input).toHaveCount(0);

    // ---- 2) 长度 20 → 30（水平约束保持，几何整体重解算） ----
    const lengthAt = await centerOf(LENGTH_ID);
    await page.mouse.dblclick(lengthAt.x, lengthAt.y);
    const input2 = page.getByTestId('sketch-dimension-input');
    await expect(input2).toBeVisible({ timeout: 10_000 });
    await input2.fill('30');
    await input2.press('Enter');
    await expect.poll(async () => {
      const value = lineLength(await getSketchRpc(ctx, sketchId, token));
      return value === null ? 999 : Math.abs(value - 30);
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBeLessThan(0.01);
    await expect(input2).toHaveCount(0);

    // 草图保持编辑态；半径与其它约束未被改值路径破坏。
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible();
    const finalSketch = await getSketchRpc(ctx, sketchId, token);
    expect(circleRadius(finalSketch)).toBeCloseTo(6, 3);
    expect(lineLength(finalSketch)).toBeCloseTo(30, 2);
    expect(finalSketch?.constraints.map((constraint) => constraint.kind).sort())
      .toEqual(['horizontal', 'length', 'radius']);

    // ---- 3) 单击尺寸数值 → 选中（唯一选择权威 sketchConstraint）；Delete 移除约束 ----
    const radiusLabel = page.locator(
      `[data-testid="sketch-dimension-label"][data-constraint-id="${RADIUS_ID}"]`,
    );
    const radiusAt2 = await centerOf(RADIUS_ID);
    await page.mouse.click(radiusAt2.x, radiusAt2.y);
    await expect(radiusLabel).toHaveAttribute('data-selected', 'true', { timeout: 10_000 });
    const selection = await page.evaluate(() => {
      const store = (window as unknown as {
        __lubanE2EApp?: { usePartStudioStore?: { getState: () => { canvas: { selection: { kind: string; constraintId?: number }[] } } } };
      }).__lubanE2EApp?.usePartStudioStore;
      return store?.getState().canvas.selection ?? [];
    });
    expect(selection.some((entry) => entry.kind === 'sketchConstraint' && entry.constraintId === RADIUS_ID)).toBe(true);
    await page.keyboard.press('Delete');
    await expect.poll(async () => {
      const sketchNow = await getSketchRpc(ctx, sketchId, token);
      return (sketchNow?.constraints ?? []).some((constraint) => constraint.id === RADIUS_ID);
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBe(false);
    // 实体与其它约束保留（删除只动选中的约束）。
    const afterConstraintDelete = await getSketchRpc(ctx, sketchId, token);
    expect(circleRadius(afterConstraintDelete)).toBeCloseTo(6, 3);
    expect(lineLength(afterConstraintDelete)).toBeCloseTo(30, 2);
    expect(afterConstraintDelete?.constraints.map((constraint) => constraint.kind).sort())
      .toEqual(['horizontal', 'length']);
    await expect(page.getByTestId('sketch-dimension-label')).toHaveCount(1);
  });

  test('直径尺寸双击改值（后端 v1.69 同期白名单）', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 240_000);
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

    const lease = await borrowWriteLease(ctx, token, 'sketch-dimension-diameter');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [
        { kind: 'point', id: 1, x: 0, y: 0 },
        { kind: 'circle', id: 2, center: 1, radius: 5 },
      ],
      constraints: [{ kind: 'diameter', id: 4, refs: [2], value: 10 }],
      plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '直径草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openWithRetry();
    const sketchRow = page.getByTestId(`tree-row-${sketchId}`);
    await expect(sketchRow).toBeVisible({ timeout: 60_000 });
    await sketchRow.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });
    const marker = page.locator('[data-testid="sketch-dimension-label"][data-constraint-id="4"]');
    await expect(marker).toBeAttached({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const center = await marker.getAttribute('data-center');
    expect(center).not.toBeNull();
    const parts = center!.split(',').map(Number);
    const x = box!.x + (parts[0] ?? 0);
    const y = box!.y + (parts[1] ?? 0);

    await page.mouse.dblclick(x, y);
    const input = page.getByTestId('sketch-dimension-input');
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill('30');
    await input.press('Enter');
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      const circle = sketch?.entities.find((entity) => entity.kind === 'circle');
      return circle && circle.kind === 'circle' && typeof circle.radius === 'number'
        ? Math.abs(circle.radius - 15)
        : 999;
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBeLessThan(0.001);
    const sketch = await getSketchRpc(ctx, sketchId, token);
    expect(sketch?.constraints.find((constraint) => constraint.id === 4)?.value).toBe(30);
  });
});
