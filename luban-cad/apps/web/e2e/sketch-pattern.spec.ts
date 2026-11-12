/**
 * 草图线性阵列真栈验收（AIRR 2026-11-12；Onshape canvas manipulator 首切片）：
 * 选中一个圆 → 草图工具栏「线性阵列」→ 方向/间距/计数手柄 + 蓝色预览 →
 * 改间距 20 mm / 计数 3 → Enter 一次 updateSketch 提交 → 3 个圆、圆心 0/20/40 mm、
 * 内部 radius 约束逐实例复制 → undo 回到 1 个圆。
 * 另验证草图对话框「确认」在阵列未提交时先提交阵列再退出草图。
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SketchDto, SketchPlaneDto } from '@luban-cad/shared';
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

interface Point { x: number; y: number }

async function openPatternSketch(
  page: Page,
  request: Parameters<typeof resetBModelSeed>[0],
  circleCenterX = 0,
): Promise<{
  ctx: Awaited<ReturnType<typeof openSeedImodelEditor>>;
  sketchId: string;
  token: string;
  project: (x: number, y: number) => Promise<Point>;
  canvasBox: { x: number; y: number; width: number; height: number };
}> {
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

  const lease = await borrowWriteLease(ctx, token, 'sketch-pattern');
  const created = await applyFeatureOpRpc(ctx, {
    kind: 'insertSketch',
    entities: [{ kind: 'circle', id: 11, center: { x: circleCenterX, y: 0 }, radius: 0.01 }],
    constraints: [{ kind: 'radius', id: 101, refs: [11], value: 0.01 }],
    plane: XY_PLANE,
  }, lease, token);
  assertFeatureOpOk(created, '草图');
  const sketchId = created.featureId!;
  await releaseWriteLease(ctx, lease, token);

  await page.reload();
  ctx = await openWithRetry();
  const row = page.getByTestId(`tree-row-${sketchId}`);
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.dblclick({ timeout: 30_000 });
  await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: '正视草图平面' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '缩放到合适大小' }).click();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const vp = ((window as any).__lubanE2E?.coreFrontend)?.IModelApp?.viewManager?.selectedView as
      | { zoomToVolume?: (v: unknown) => void }
      | undefined;
    // 契约坐标是米：圆 R10 mm（0.01 m），视野覆盖线性/环形两种阵列。
    vp?.zoomToVolume?.({ low: { x: -0.04, y: -0.04, z: -0.001 }, high: { x: 0.06, y: 0.04, z: 0.001 } });
  });
  await page.waitForTimeout(300);

  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  const project = async (x: number, y: number): Promise<Point> => {
    const view = await page.evaluate((world) => {
      const vp = ((window as any).__lubanE2E?.coreFrontend)?.IModelApp?.viewManager?.selectedView as
        | { worldToView: (p: { x: number; y: number; z: number }) => { x: number; y: number } }
        | undefined;
      if (!vp) return null;
      const v = vp.worldToView(world);
      return { x: v.x, y: v.y };
    }, { x, y, z: 0 });
    expect(view).not.toBeNull();
    return { x: canvasBox!.x + view!.x, y: canvasBox!.y + view!.y };
  };
  return { ctx, sketchId, token, project, canvasBox: canvasBox! };
}

async function selectCircleAndStartPattern(
  page: Page,
  project: (x: number, y: number) => Promise<Point>,
  circleCenterX = 0,
): Promise<void> {
  // 选中圆周（圆心 + R10 mm 恰在圆上）。
  const onCircle = await project(circleCenterX + 0.01, 0);
  await page.mouse.click(onCircle.x, onCircle.y);
  await expect.poll(async () => page.getByTestId('sketch-entity-picker').getAttribute('data-selected'), {
    timeout: 15_000,
  }).toContain('11');
  await page.getByRole('button', { name: '线性阵列', exact: true }).click();
  await expect(page.getByTestId('sketch-pattern-prompt')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('sketch-pattern-count')).toContainText('3x');
  await expect(page.getByTestId('sketch-pattern-preview')).toBeVisible();
}

function circleCenters(sketch: SketchDto | undefined): number[] {
  return (sketch?.entities ?? [])
    .filter((entity) => entity.kind === 'circle')
    .map((entity) => entity.kind === 'circle' && typeof entity.center === 'object'
      ? (entity.center as { x: number }).x
      : Number.NaN)
    .sort((a, b) => a - b);
}

test.describe('草图线性阵列（Onshape canvas gizmo 对拍）', () => {
  test('选中圆 → 阵列 gizmo → 间距 20 / 3 实例 → Enter 提交 → undo', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const { ctx, sketchId, token, project } = await openPatternSketch(page, request);
    await selectCircleAndStartPattern(page, project);

    // 点间距手柄 → 内联输入 20 mm（默认 10）。
    await page.getByTestId('sketch-pattern-spacing').click();
    const input = page.getByTestId('sketch-pattern-input');
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill('20');
    await input.press('Enter');
    await expect(page.getByTestId('sketch-pattern-spacing')).toContainText('20');
    await expect(page.getByTestId('sketch-pattern-count')).toContainText('3x');

    // Enter 提交阵列（一次 updateSketch）。
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('sketch-pattern-prompt')).toHaveCount(0, { timeout: 30_000 });

    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      const circles = (sketch?.entities ?? []).filter((entity) => entity.kind === 'circle');
      return circles.length;
    }, { timeout: 40_000, intervals: [500, 1000, 2000] }).toBe(3);
    const committed = await getSketchRpc(ctx, sketchId, token);
    const centers = circleCenters(committed);
    expect(centers).toHaveLength(3);
    expect(centers[0]!).toBeCloseTo(0, 6);
    expect(centers[1]!).toBeCloseTo(0.02, 6);
    expect(centers[2]!).toBeCloseTo(0.04, 6);
    const radiusConstraints = (committed?.constraints ?? []).filter((constraint) => constraint.kind === 'radius');
    expect(radiusConstraints).toHaveLength(3);

    // undo 一次回到 1 个圆。
    await page.keyboard.press('Control+z');
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      return (sketch?.entities ?? []).filter((entity) => entity.kind === 'circle').length;
    }, { timeout: 30_000, intervals: [500, 1000, 2000] }).toBe(1);
  });

  test('阵列未提交时点草图「确认」→ 先提交阵列再退出草图', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const { ctx, sketchId, token, project } = await openPatternSketch(page, request);
    await selectCircleAndStartPattern(page, project);

    await page.getByTestId('part-studio-sketch-dialog').getByRole('button', { name: '确认' }).click();
    await expect(page.getByTestId('part-studio-sketch-dialog')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '特征工具' })).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      return (sketch?.entities ?? []).filter((entity) => entity.kind === 'circle').length;
    }, { timeout: 40_000, intervals: [500, 1000, 2000] }).toBe(3);
  });

  test('环形阵列：中心默认原点、count 4 → 绕原点 90° 均分 → undo', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const { ctx, sketchId, token, project } = await openPatternSketch(page, request, 0.02);
    await selectCircleAndStartPattern(page, project, 0.02);

    // 打开「线性阵列 ▾」飞菜单 → 环形阵列。
    await page.getByRole('button', { name: '线性阵列 ▾' }).click();
    await page.getByRole('menuitem', { name: '环形阵列' }).click();
    await expect(page.getByTestId('sketch-pattern-prompt')).toContainText('环形阵列', { timeout: 15_000 });
    await expect(page.getByTestId('sketch-pattern-count')).toContainText('3x');
    await expect(page.getByTestId('sketch-pattern-center')).toBeVisible();
    await expect(page.getByTestId('sketch-pattern-preview')).toBeVisible();

    await page.getByTestId('sketch-pattern-count').click();
    const input = page.getByTestId('sketch-pattern-input');
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill('4');
    await input.press('Enter');
    await expect(page.getByTestId('sketch-pattern-count')).toContainText('4x');

    await page.keyboard.press('Enter');
    await expect(page.getByTestId('sketch-pattern-prompt')).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      return (sketch?.entities ?? []).filter((entity) => entity.kind === 'circle').length;
    }, { timeout: 40_000, intervals: [500, 1000, 2000] }).toBe(4);
    const committed = await getSketchRpc(ctx, sketchId, token);
    const centers = (committed?.entities ?? [])
      .filter((entity) => entity.kind === 'circle')
      .map((entity) => entity.kind === 'circle' ? entity.center as { x: number; y: number } : undefined);
    const has = (x: number, y: number): boolean => centers.some(
      (center) => center !== undefined && Math.abs(center.x - x) < 1e-6 && Math.abs(center.y - y) < 1e-6);
    expect(has(0.02, 0)).toBe(true);
    expect(has(0, 0.02)).toBe(true);
    expect(has(-0.02, 0)).toBe(true);
    expect(has(0, -0.02)).toBe(true);

    await page.keyboard.press('Control+z');
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      return (sketch?.entities ?? []).filter((entity) => entity.kind === 'circle').length;
    }, { timeout: 30_000, intervals: [500, 1000, 2000] }).toBe(1);
  });

  test('变换平移首切片：拖动移动手柄 +20 mm → Enter 提交 → undo', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const { ctx, sketchId, token, project } = await openPatternSketch(page, request);
    await selectCircleAndStartPattern(page, project);

    // 打开「线性阵列 ▾」飞菜单 → 变换。
    await page.getByRole('button', { name: '线性阵列 ▾' }).click();
    await page.getByRole('menuitem', { name: '变换', exact: true }).click();
    await expect(page.getByTestId('sketch-pattern-prompt')).toContainText('变换', { timeout: 15_000 });
    const move = page.getByTestId('sketch-transform-move');
    await expect(move).toBeVisible();
    await expect(page.getByTestId('sketch-pattern-count')).toHaveCount(0);
    await expect(page.getByTestId('sketch-pattern-preview')).toBeVisible();

    const handleBox = await move.boundingBox();
    expect(handleBox).not.toBeNull();
    const from = { x: handleBox!.x + handleBox!.width / 2, y: handleBox!.y + handleBox!.height / 2 };
    const origin = await project(0, 0);
    const target = await project(0.02, 0);
    const to = { x: from.x + (target.x - origin.x), y: from.y + (target.y - origin.y) };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 16 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    await page.keyboard.press('Enter');
    await expect(page.getByTestId('sketch-pattern-prompt')).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      const circle = (sketch?.entities ?? []).find((entity) => entity.kind === 'circle');
      return circle?.kind === 'circle' && typeof circle.center === 'object'
        ? (circle.center as { x: number }).x
        : Number.NaN;
    }, { timeout: 40_000, intervals: [500, 1000, 2000] }).toBeCloseTo(0.02, 5);

    await page.keyboard.press('Control+z');
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      const circle = (sketch?.entities ?? []).find((entity) => entity.kind === 'circle');
      return circle?.kind === 'circle' && typeof circle.center === 'object'
        ? (circle.center as { x: number }).x
        : Number.NaN;
    }, { timeout: 30_000, intervals: [500, 1000, 2000] }).toBeCloseTo(0, 5);
  });
});
