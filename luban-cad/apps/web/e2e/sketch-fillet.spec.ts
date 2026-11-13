/**
 * 草图圆角真栈验收（Onshape Sketch Fillet 首切片 2026-11-12）。
 *
 * Live 证据：Onshape 点击两条线共享的角点后立即生成相切圆弧 + 可编辑 R 尺寸。
 * 覆盖：进入草图 → ribbon「圆角」→ 点击 L 形两线角点 → getSketch 解算后：
 * 两线端点回缩到切点、新圆弧半径 = 默认 5 mm、圆心在角平分线上、radius 约束
 * 生成；工具保持激活，Esc 结束后草图仍编辑中。
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

const ENTITIES: SketchEntityDto[] = [
  { kind: 'line', id: 11, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
  { kind: 'line', id: 12, p1: { x: 0, y: 0 }, p2: { x: 0, y: 10 } },
];
const CONSTRAINTS: SketchConstraintDto[] = [
  { kind: 'coincident', id: 101, refs: [{ entity: 11, part: 'start' }, { entity: 12, part: 'start' }] },
  { kind: 'horizontal', id: 102, refs: [11] },
  { kind: 'vertical', id: 103, refs: [12] },
];

interface Point { x: number; y: number }

function linePoints(sketch: SketchDto | undefined, id: number): { a: Point; b: Point } | null {
  const entity = sketch?.entities.find((candidate) => candidate.id === id);
  if (!entity || entity.kind !== 'line' || typeof entity.p1 === 'number' || typeof entity.p2 === 'number')
    return null;
  return { a: entity.p1, b: entity.p2 };
}

test.describe('草图圆角（Onshape 对拍）', () => {
  test('点击两线角点 → 立即生成 R5 圆弧、端点回缩、R 尺寸约束落库', async ({ page, request }) => {
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

    const lease = await borrowWriteLease(ctx, token, 'sketch-fillet');
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
    await page.getByRole('button', { name: '正视草图平面' }).click();
    await page.waitForTimeout(300);
    await page.getByTestId('viewcube-menu-trigger').click();
    await page.getByTestId('viewcube-menu-zoom-fit').click();
    await page.waitForTimeout(600);
    // 相机钉死以草图几何 + 边距取景：避免 fit 后角点贴边/落在画布外（DPR 2）。
    await page.evaluate(() => {
      const vp = (window as unknown as {
        __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { zoomToVolume?: (v: unknown) => void } | undefined } } } };
      }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
      vp?.zoomToVolume?.({ low: { x: -5, y: -5, z: -2 }, high: { x: 15, y: 15, z: 2 } });
    });
    await page.waitForTimeout(300);

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const project = async (local: Point): Promise<Point> => {
      const view = await page.evaluate((worldPoint) => {
        const vp = (window as unknown as {
          __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { worldToView: (p: { x: number; y: number; z: number }) => { x: number; y: number } } } | undefined } } };
        }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
        if (!vp) return null;
        const v = vp.worldToView(worldPoint);
        return { x: v.x, y: v.y };
      }, { x: local.x, y: local.y, z: 0 });
      expect(view).not.toBeNull();
      return { x: box!.x + view!.x, y: box!.y + view!.y };
    };

    // 草图 ribbon「圆角」（Onshape 点击角点立即生成）。
    await page.getByRole('button', { name: '草图圆角', exact: true }).click();
    const corner = await project({ x: 0, y: 0 });
    await page.mouse.click(corner.x, corner.y);

    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      const arc = sketch?.entities.find((entity) => entity.kind === 'arc');
      const line11 = linePoints(sketch, 11);
      const line12 = linePoints(sketch, 12);
      if (!arc || arc.kind !== 'arc' || !line11 || !line12)
        return false;
      const center = arc.center as Point;
      const radius = arc.radius ?? 0;
      const radiusConstraint = sketch?.constraints.find((constraint) =>
        constraint.kind === 'radius' && constraint.refs.length === 1 && constraint.refs[0] === arc.id);
      return Math.abs(radius - 5) < 0.2
        && Math.abs(center.x - 5) < 0.2 && Math.abs(center.y - 5) < 0.2
        && Math.hypot(line11.a.x - 5, line11.a.y) < 0.2
        && Math.hypot(line12.a.x, line12.a.y - 5) < 0.2
        && radiusConstraint !== undefined
        && Math.abs((radiusConstraint.value ?? 0) - 5) < 1e-6;
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBe(true);

    // 另一端保持；工具仍激活（Onshape 连续倒角）。
    const sketch = await getSketchRpc(ctx, sketchId, token);
    expect(linePoints(sketch, 11)?.b).toEqual({ x: 10, y: 0 });
    expect(linePoints(sketch, 12)?.b).toEqual({ x: 0, y: 10 });

    // Onshape 同款：R 尺寸立即出现在画布且可双击改值。R5 → R8 后圆弧/切点重解算。
    const radiusLabel = page.locator('[data-testid="sketch-dimension-label"][data-constraint-id="109"]');
    await expect(radiusLabel).toBeAttached({ timeout: 30_000 });
    const labelCenter = await radiusLabel.getAttribute('data-center');
    expect(labelCenter).not.toBeNull();
    const [labelX, labelY] = labelCenter!.split(',').map(Number);
    await page.mouse.dblclick(box!.x + (labelX ?? 0), box!.y + (labelY ?? 0));
    const input = page.getByTestId('sketch-dimension-input');
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill('8');
    await input.press('Enter');
    await expect.poll(async () => {
      const current = await getSketchRpc(ctx, sketchId, token);
      const arc = current?.entities.find((entity) => entity.kind === 'arc');
      const value = arc && arc.kind === 'arc' ? arc.radius : undefined;
      return value === undefined ? 999 : Math.abs(value - 8);
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBeLessThan(0.2);
    await expect(input).toHaveCount(0);

    // Esc 退出圆角工具，草图仍保持编辑态。
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
  });

  test('两曲线选择：不相连 L 形两线在延长交点生成 R5 圆角', async ({ page, request }) => {
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

    const lease = await borrowWriteLease(ctx, token, 'sketch-fillet-lines');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [
        { kind: 'line', id: 11, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
        { kind: 'line', id: 12, p1: { x: 0, y: 1 }, p2: { x: 0, y: 11 } },
      ],
      constraints: [],
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
    await page.getByRole('button', { name: '正视草图平面' }).click();
    await page.waitForTimeout(300);
    await page.getByTestId('viewcube-menu-trigger').click();
    await page.getByTestId('viewcube-menu-zoom-fit').click();
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const vp = (window as unknown as {
        __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { zoomToVolume?: (v: unknown) => void } | undefined } } } };
      }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
      vp?.zoomToVolume?.({ low: { x: -5, y: -5, z: -2 }, high: { x: 15, y: 15, z: 2 } });
    });
    await page.waitForTimeout(300);

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const project = async (local: Point): Promise<Point> => {
      const view = await page.evaluate((worldPoint) => {
        const vp = (window as unknown as {
          __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { worldToView: (p: { x: number; y: number; z: number }) => { x: number; y: number } } } | undefined } } };
        }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
        if (!vp) return null;
        const v = vp.worldToView(worldPoint);
        return { x: v.x, y: v.y };
      }, { x: local.x, y: local.y, z: 0 });
      expect(view).not.toBeNull();
      return { x: box!.x + view!.x, y: box!.y + view!.y };
    };

    // 两线不相连：依次点两条直线（无共享角点），在延长交点 (0,0) 倒角。
    await page.getByRole('button', { name: '草图圆角', exact: true }).click();
    const firstLine = await project({ x: 5, y: 0 });
    await page.mouse.click(firstLine.x, firstLine.y);
    const secondLine = await project({ x: 0, y: 6 });
    await page.mouse.click(secondLine.x, secondLine.y);

    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      const arc = sketch?.entities.find((entity) => entity.kind === 'arc');
      const line11 = linePoints(sketch, 11);
      const line12 = linePoints(sketch, 12);
      if (!arc || arc.kind !== 'arc' || !line11 || !line12)
        return false;
      const center = arc.center as Point;
      const radius = arc.radius ?? 0;
      return Math.abs(radius - 5) < 0.2
        && Math.abs(center.x - 5) < 0.2 && Math.abs(center.y - 5) < 0.2
        && Math.hypot(line11.a.x - 5, line11.a.y) < 0.2
        && Math.hypot(line12.a.x, line12.a.y - 5) < 0.2;
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBe(true);

    const sketch = await getSketchRpc(ctx, sketchId, token);
    expect(linePoints(sketch, 11)?.b).toEqual({ x: 10, y: 0 });
    expect(linePoints(sketch, 12)?.b).toEqual({ x: 0, y: 11 });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
  });

  test('显式 point 端点角点：两线分离为内联点、孤儿点清理', async ({ page, request }) => {
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

    const lease = await borrowWriteLease(ctx, token, 'sketch-fillet-explicit');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [
        { kind: 'point', id: 1, x: 0, y: 0 },
        { kind: 'line', id: 11, p1: 1, p2: { x: 10, y: 0 } },
        { kind: 'line', id: 12, p1: 1, p2: { x: 0, y: 10 } },
      ],
      constraints: [],
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
    await page.getByRole('button', { name: '正视草图平面' }).click();
    await page.waitForTimeout(300);
    await page.getByTestId('viewcube-menu-trigger').click();
    await page.getByTestId('viewcube-menu-zoom-fit').click();
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const vp = (window as unknown as {
        __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { zoomToVolume?: (v: unknown) => void } | undefined } } } };
      }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
      vp?.zoomToVolume?.({ low: { x: -5, y: -5, z: -2 }, high: { x: 15, y: 15, z: 2 } });
    });
    await page.waitForTimeout(300);

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const project = async (local: Point): Promise<Point> => {
      const view = await page.evaluate((worldPoint) => {
        const vp = (window as unknown as {
          __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { worldToView: (p: { x: number; y: number; z: number }) => { x: number; y: number } } } | undefined } } };
        }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
        if (!vp) return null;
        const v = vp.worldToView(worldPoint);
        return { x: v.x, y: v.y };
      }, { x: local.x, y: local.y, z: 0 });
      expect(view).not.toBeNull();
      return { x: box!.x + view!.x, y: box!.y + view!.y };
    };

    await page.getByRole('button', { name: '草图圆角', exact: true }).click();
    const corner = await project({ x: 0, y: 0 });
    await page.mouse.click(corner.x, corner.y);

    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      const arc = sketch?.entities.find((entity) => entity.kind === 'arc');
      const line11 = sketch?.entities.find((entity) => entity.id === 11);
      const line12 = sketch?.entities.find((entity) => entity.id === 12);
      const orphanPoint = sketch?.entities.some((entity) => entity.id === 1 && entity.kind === 'point');
      if (!arc || arc.kind !== 'arc' || !line11 || line11.kind !== 'line' || !line12 || line12.kind !== 'line')
        return false;
      if (typeof line11.p1 === 'number' || typeof line12.p1 === 'number')
        return false;
      const center = arc.center as Point;
      return Math.abs((arc.radius ?? 0) - 5) < 0.2
        && Math.abs(center.x - 5) < 0.2 && Math.abs(center.y - 5) < 0.2
        && Math.hypot(line11.p1.x - 5, line11.p1.y) < 0.2
        && Math.hypot(line12.p1.x, line12.p1.y - 5) < 0.2
        && orphanPoint === false;
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBe(true);

    const sketch = await getSketchRpc(ctx, sketchId, token);
    expect(linePoints(sketch, 11)?.b).toEqual({ x: 10, y: 0 });
    expect(linePoints(sketch, 12)?.b).toEqual({ x: 0, y: 10 });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
  });

  test('直线-圆弧角点：弧-弧相切约束经求解器重算，R5 圆角落在线段/弧上', async ({ page, request }) => {
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

    const lease = await borrowWriteLease(ctx, token, 'sketch-fillet-line-arc');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [
        { kind: 'line', id: 11, p1: { x: 0, y: 0 }, p2: { x: 40, y: 0 } },
        { kind: 'arc', id: 12, center: { x: 15, y: 0 }, radius: 15, startAngle: Math.PI, sweepAngle: (2 * Math.PI) / 3 },
      ],
      constraints: [],
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
    await page.getByRole('button', { name: '正视草图平面' }).click();
    await page.waitForTimeout(300);
    await page.getByTestId('viewcube-menu-trigger').click();
    await page.getByTestId('viewcube-menu-zoom-fit').click();
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const vp = (window as unknown as {
        __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { zoomToVolume?: (v: unknown) => void } | undefined } } } };
      }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
      vp?.zoomToVolume?.({ low: { x: -5, y: -20, z: -2 }, high: { x: 45, y: 20, z: 2 } });
    });
    await page.waitForTimeout(300);

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const project = async (local: Point): Promise<Point> => {
      const view = await page.evaluate((worldPoint) => {
        const vp = (window as unknown as {
          __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { worldToView: (p: { x: number; y: number; z: number }) => { x: number; y: number } } } | undefined } } };
        }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
        if (!vp) return null;
        const v = vp.worldToView(worldPoint);
        return { x: v.x, y: v.y };
      }, { x: local.x, y: local.y, z: 0 });
      expect(view).not.toBeNull();
      return { x: box!.x + view!.x, y: box!.y + view!.y };
    };

    await page.getByRole('button', { name: '草图圆角', exact: true }).click();
    const corner = await project({ x: 0, y: 0 });
    await page.mouse.click(corner.x, corner.y);

    const expectedLineX = 15 - 5 * Math.sqrt(3);
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      const filletArc = sketch?.entities.find((entity) => entity.kind === 'arc' && entity.id !== 12);
      const sourceArc = sketch?.entities.find((entity) => entity.id === 12);
      const line11 = linePoints(sketch, 11);
      if (!filletArc || filletArc.kind !== 'arc' || !sourceArc || sourceArc.kind !== 'arc' || !line11)
        return false;
      return Math.abs((filletArc.radius ?? 0) - 5) < 0.2
        && Math.hypot(line11.a.x - expectedLineX, line11.a.y) < 0.2
        && Math.abs((sourceArc.sweepAngle ?? 0) - Math.PI / 2) < 0.2
        && sketch!.solve.status !== 'failed'
        && sketch!.solve.status !== 'conflicting'
        && sketch!.constraints.filter((constraint) => constraint.kind === 'tangent').length === 2
        && sketch!.constraints.some((constraint) =>
          constraint.kind === 'radius' && Math.abs((constraint.value ?? 0) - 5) < 1e-6);
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBe(true);

    const sketch = await getSketchRpc(ctx, sketchId, token);
    expect(linePoints(sketch, 11)?.b).toEqual({ x: 40, y: 0 });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
  });
});
