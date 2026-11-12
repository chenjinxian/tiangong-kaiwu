/**
 * 草图修剪真栈验收（Onshape「修剪」首切片 2026-11-12）。
 *
 * 覆盖：ribbon「修剪」→ 点击被两条直线截断的目标线中点 → 移除交点间段落
 * （两侧保留，原 id + 新 id，交叉线不动）；点击无交点孤立线 → 整体删除。
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

/** 目标横线 + 两条截断竖线 + 一条孤立线（无交点）。 */
const ENTITIES: SketchEntityDto[] = [
  { kind: 'line', id: 11, p1: { x: -10, y: 0 }, p2: { x: 10, y: 0 } },
  { kind: 'line', id: 12, p1: { x: -3, y: -5 }, p2: { x: -3, y: 5 } },
  { kind: 'line', id: 13, p1: { x: 3, y: -5 }, p2: { x: 3, y: 5 } },
  { kind: 'line', id: 15, p1: { x: -2, y: 8 }, p2: { x: 2, y: 8 } },
];

interface Pt { x: number; y: number }

function horizontalSegments(sketch: SketchDto | undefined): Array<{ id: number; a: Pt; b: Pt }> {
  const out: Array<{ id: number; a: Pt; b: Pt }> = [];
  for (const entity of sketch?.entities ?? []) {
    if (entity.kind !== 'line')
      continue;
    const resolve = (ref: Pt | number): Pt | null => {
      if (typeof ref === 'number') {
        const point = sketch!.entities.find((candidate) => candidate.id === ref) as
          | { kind?: string; x?: number; y?: number }
          | undefined;
        return point && point.kind === 'point' ? { x: point.x ?? 0, y: point.y ?? 0 } : null;
      }
      return ref;
    };
    const a = resolve(entity.p1);
    const b = resolve(entity.p2);
    if (a && b && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.y) < 1e-6)
      out.push({ id: entity.id, a, b });
  }
  return out;
}

test.describe('草图修剪（Onshape 对拍）', () => {
  test('交点间段落移除；无交点实体整删', async ({ page, request }) => {
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

    const lease = await borrowWriteLease(ctx, token, 'sketch-trim');
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
        if (!vp) return null;
        const v = vp.worldToView(worldPoint);
        return { x: v.x, y: v.y };
      }, { x: local.x, y: local.y, z: 0 });
      expect(view).not.toBeNull();
      return { x: box!.x + view!.x, y: box!.y + view!.y };
    };

    // ---- 1. ribbon 修剪 + 点击中点 → 中间段移除 ----
    await page.getByRole('button', { name: '修剪', exact: true }).click();
    const middle = await project({ x: 0, y: 0 });
    await page.mouse.click(middle.x, middle.y);
    await expect.poll(async () => horizontalSegments(await getSketchRpc(ctx, sketchId, token)).length, {
      timeout: 40_000,
      intervals: [600, 1000, 2000, 3000],
    }).toBe(2);
    const segments = horizontalSegments(await getSketchRpc(ctx, sketchId, token));
    const xs = segments.map((segment) => [Math.min(segment.a.x, segment.b.x), Math.max(segment.a.x, segment.b.x)]);
    xs.sort((a, b) => a[0]! - b[0]!);
    expect(xs[0]![0]).toBeCloseTo(-10, 6);
    expect(xs[0]![1]).toBeCloseTo(-3, 6);
    expect(xs[1]![0]).toBeCloseTo(3, 6);
    expect(xs[1]![1]).toBeCloseTo(10, 6);
    expect(segments[0]!.id).toBe(11);
    // 两条截断竖线保持原样。
    const after = await getSketchRpc(ctx, sketchId, token);
    expect(after?.entities.filter((entity) => entity.id === 12 || entity.id === 13)).toHaveLength(2);

    // ---- 2. 点击无交点孤立线 → 整体删除 ----
    const isolated = await project({ x: 0, y: 8 });
    await page.mouse.click(isolated.x, isolated.y);
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      return (sketch?.entities ?? []).some((entity) => entity.id === 15);
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBe(false);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
  });
});

test.describe('草图修剪 — 三次贝塞尔样条（Onshape Trim 支持 Bezier）', () => {
  test('两条截断线之间的样条中段移除 → 两段保留（de Casteljau 精确分裂）', async ({ page, request }) => {
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

    // 共线控制点 [-10, -3.333, 3.333, 10] → x(t)=-10+20t；两条竖线切于 ±3。
    const entities: SketchEntityDto[] = [
      {
        kind: 'spline', id: 31,
        controlPoints: [{ x: -10, y: 0 }, { x: -10 / 3, y: 0 }, { x: 10 / 3, y: 0 }, { x: 10, y: 0 }],
      },
      { kind: 'line', id: 32, p1: { x: -3, y: -5 }, p2: { x: -3, y: 5 } },
      { kind: 'line', id: 33, p1: { x: 3, y: -5 }, p2: { x: 3, y: 5 } },
    ];
    const lease = await borrowWriteLease(ctx, token, 'sketch-trim-spline');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities, constraints: [], plane: XY_PLANE,
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
    const middle = await page.evaluate((worldPoint) => {
      const vp = (window as unknown as {
        __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { selectedView: { worldToView: (p: { x: number; y: number; z: number }) => { x: number; y: number } } } | undefined } } };
      }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
      if (!vp) return null;
      const v = vp.worldToView(worldPoint);
      return { x: v.x, y: v.y };
    }, { x: 0, y: 0, z: 0 });
    expect(middle).not.toBeNull();

    await page.getByRole('button', { name: '修剪', exact: true }).click();
    await page.mouse.click(box!.x + middle!.x, box!.y + middle!.y);

    const pieces = async (): Promise<Array<{ id: number; firstX: number; lastX: number }>> => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      return (sketch?.entities ?? [])
        .filter((entity) => entity.kind === 'spline')
        .map((entity) => {
          const controls = entity.kind === 'spline' ? entity.controlPoints : [];
          return { id: entity.id, firstX: controls[0]?.x ?? Number.NaN, lastX: controls.at(-1)?.x ?? Number.NaN };
        })
        .sort((a, b) => a.firstX - b.firstX);
    };
    await expect.poll(async () => (await pieces()).length, {
      timeout: 40_000,
      intervals: [600, 1000, 2000, 3000],
    }).toBe(2);
    const trimmed = await pieces();
    expect(trimmed[0]!.firstX).toBeCloseTo(-10, 4);
    expect(trimmed[0]!.lastX).toBeCloseTo(-3, 4);
    expect(trimmed[1]!.firstX).toBeCloseTo(3, 4);
    expect(trimmed[1]!.lastX).toBeCloseTo(10, 4);
    // 切割线不动。
    const after = await getSketchRpc(ctx, sketchId, token);
    expect(after?.entities.filter((entity) => entity.id === 32 || entity.id === 33)).toHaveLength(2);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
  });
});
