/**
 * 草图分割真栈验收（Onshape「修剪 ▾ → 分割」首切片 2026-11-13，AIRR
 * `docs/superpowers/specs/2026-11-13-sketch-split-airr.md`）。
 *
 * RPC 建一条水平线 → 编辑草图 →「修剪 ▾ → 分割」→ 点击线中点 →
 * getSketch 得到 2 条线 + 1 个共享显式点（两线引用同一 point id，端点保持
 * ±10 mm）→ undo 回到 1 条线。
 */
import { expect, test } from '@playwright/test';
import type { SketchDto, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
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
  { kind: 'line', id: 11, p1: { x: -0.01, y: 0 }, p2: { x: 0.01, y: 0 } },
];

interface Pt { x: number; y: number }

interface LineShape { id: number; a: Pt; b: Pt }

function resolve(sketch: SketchDto, ref: Pt | number): Pt | null {
  if (typeof ref === 'number') {
    const point = sketch.entities.find((candidate) => candidate.id === ref) as
      | { kind?: string; x?: number; y?: number }
      | undefined;
    return point && point.kind === 'point' ? { x: point.x ?? 0, y: point.y ?? 0 } : null;
  }
  return ref;
}

function lines(sketch: SketchDto | undefined): LineShape[] {
  if (!sketch)
    return [];
  return sketch.entities
    .filter((entity) => entity.kind === 'line')
    .map((entity) => {
      if (entity.kind !== 'line')
        return undefined;
      const a = resolve(sketch, entity.p1);
      const b = resolve(sketch, entity.p2);
      return a && b ? { id: entity.id, a, b } : undefined;
    })
    .filter((line): line is LineShape => line !== undefined);
}

test.describe('草图分割（Onshape 对拍）', () => {
  test('线段中点分割 → 两线共享新点 → undo 回单线', async ({ page, request }) => {
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

    const lease = await borrowWriteLease(ctx, token, 'sketch-split');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: ENTITIES, constraints: [], plane: XY_PLANE,
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

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const project = async (local: Pt): Promise<Pt> => {
      const view = await page.evaluate((worldPoint) => {
        const vp = (window as unknown as {
          __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { worldToView: (p: { x: number; y: number; z: number }) => { x: number; y: number } } } | undefined } } };
        }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
        if (!vp)
          return null;
        const v = vp.worldToView(worldPoint);
        return { x: v.x, y: v.y };
      }, { x: local.x, y: local.y, z: 0 });
      expect(view).not.toBeNull();
      return { x: box!.x + view!.x, y: box!.y + view!.y };
    };

    // live 证据：修剪 ▾ 下拉顺序 = 修剪 / 延伸 / 分割（无快捷键）。
    await page.getByRole('button', { name: '修剪 ▾' }).click();
    await page.getByRole('menuitem', { name: '分割', exact: true }).click();
    const middle = await project({ x: 0, y: 0 });
    await page.mouse.click(middle.x, middle.y);

    await expect.poll(async () => lines(await getSketchRpc(ctx, sketchId, token)).length, {
      timeout: 40_000,
      intervals: [600, 1000, 2000, 3000],
    }).toBe(2);
    const committed = await getSketchRpc(ctx, sketchId, token);
    const segments = lines(committed);
    const points = (committed?.entities ?? []).filter((entity) => entity.kind === 'point') as Array<{ id: number; x: number; y: number }>;
    expect(points).toHaveLength(1);
    expect(points[0]!.x).toBeCloseTo(0, 6);
    expect(points[0]!.y).toBeCloseTo(0, 6);
    const splitId = points[0]!.id;
    // 第一段沿用原 id；两段共享新点。
    const first = segments.find((segment) => segment.id === 11);
    const second = segments.find((segment) => segment.id !== 11);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    const xsOf = (segment: LineShape): number[] => [segment.a.x, segment.b.x].sort((a, b) => a - b);
    expect(xsOf(first!)[0]).toBeCloseTo(-0.01, 6);
    expect(xsOf(first!)[1]).toBeCloseTo(0, 6);
    expect(xsOf(second!)[0]).toBeCloseTo(0, 6);
    expect(xsOf(second!)[1]).toBeCloseTo(0.01, 6);
    expect(splitId).toBeGreaterThan(0);
    // 两线各自引用同一 point id 作为共享端点（不是各自内联点）。
    const referenced = (committed?.entities ?? [])
      .flatMap((entity) => entity.kind === 'line' ? [entity.p1, entity.p2] : [])
      .filter((ref): ref is number => typeof ref === 'number');
    expect(referenced.filter((ref) => ref === splitId)).toHaveLength(2);

    await page.keyboard.press('Control+z');
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      return (sketch?.entities ?? []).filter((entity) => entity.kind === 'line').length;
    }, { timeout: 30_000, intervals: [500, 1000, 2000] }).toBe(1);
    const restored = await getSketchRpc(ctx, sketchId, token);
    expect((restored?.entities ?? []).filter((entity) => entity.kind === 'point')).toHaveLength(0);
  });
});

test.describe('草图分割 — 闭合曲线（圆）', () => {
  test('两点分割圆 → 两段弧（π/2 + 3π/2）→ undo 回圆', async ({ page, request }) => {
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

    const lease = await borrowWriteLease(ctx, token, 'sketch-split-circle');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [{ kind: 'circle', id: 11, center: { x: 0, y: 0 }, radius: 0.01 }],
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
    // 闭合曲线两点分割对角度敏感：先正视草图平面并放大到 R10 视野。
    await page.getByRole('button', { name: '正视草图平面' }).click();
    await page.waitForTimeout(300);
    await page.getByTestId('viewcube-menu-trigger').click();
    await page.getByTestId('viewcube-menu-zoom-fit').click();
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const vp = (window as unknown as {
        __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { zoomToVolume?: (v: unknown) => void } } } } };
      }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
      vp?.zoomToVolume?.({ low: { x: -0.02, y: -0.02, z: -0.001 }, high: { x: 0.02, y: 0.02, z: 0.001 } });
    });
    await page.waitForTimeout(300);

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const project = async (local: Pt): Promise<Pt> => {
      const view = await page.evaluate((worldPoint) => {
        const vp = (window as unknown as {
          __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { worldToView: (p: { x: number; y: number; z: number }) => { x: number; y: number } } } | undefined } } };
        }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
        if (!vp)
          return null;
        const v = vp.worldToView(worldPoint);
        return { x: v.x, y: v.y };
      }, { x: local.x, y: local.y, z: 0 });
      expect(view).not.toBeNull();
      return { x: box!.x + view!.x, y: box!.y + view!.y };
    };

    await page.getByRole('button', { name: '修剪 ▾' }).click();
    await page.getByRole('menuitem', { name: '分割', exact: true }).click();

    // live：闭合曲线第一点只挂起（提示「再选择一个点以分割闭合曲线。」）。
    const right = await project({ x: 0.01, y: 0 });
    await page.mouse.click(right.x, right.y);
    await page.waitForTimeout(800);
    const afterFirst = await getSketchRpc(ctx, sketchId, token);
    expect((afterFirst?.entities ?? []).filter((entity) => entity.kind === 'circle')).toHaveLength(1);
    expect((afterFirst?.entities ?? []).filter((entity) => entity.kind === 'arc')).toHaveLength(0);

    const top = await project({ x: 0, y: 0.01 });
    await page.mouse.click(top.x, top.y);
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      return (sketch?.entities ?? []).filter((entity) => entity.kind === 'arc').length;
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBe(2);
    const splitSketch = await getSketchRpc(ctx, sketchId, token);
    expect((splitSketch?.entities ?? []).filter((entity) => entity.kind === 'circle')).toHaveLength(0);
    const arcs = (splitSketch?.entities ?? []).filter((entity) => entity.kind === 'arc') as Array<{ id: number; radius: number; sweepAngle: number }>;
    const sweeps = arcs.map((arc) => Math.abs(arc.sweepAngle)).sort((a, b) => a - b);
    expect(sweeps[0]!).toBeCloseTo(Math.PI / 2, 4);
    expect(sweeps[1]!).toBeCloseTo(Math.PI * 3 / 2, 4);
    expect(arcs[0]!.radius).toBeCloseTo(0.01, 6);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      return (sketch?.entities ?? []).filter((entity) => entity.kind === 'circle').length;
    }, { timeout: 30_000, intervals: [500, 1000, 2000] }).toBe(1);
  });
});
