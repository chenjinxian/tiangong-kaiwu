/**
 * 草图倒角真栈验收（Onshape 圆角 ▾ → 倒角首切片 2026-11-13，AIRR
 * `docs/superpowers/specs/2026-11-13-sketch-chamfer-airr.md`）。
 *
 * live 证据：点击两线共享角点后立即生成倒角直线 + 可编辑距离尺寸。
 * 覆盖：进入草图 →「圆角 ▾ → 倒角」→ 点击 L 形两线角点 → 两线回缩、
 * 连接直线、角点实体、coincident×2 + distance×2（value=5）→ undo 回两线。
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

interface Pt { x: number; y: number }

function inlineLine(sketch: SketchDto | undefined, id: number): { a: Pt; b: Pt } | null {
  const entity = sketch?.entities.find((candidate) => candidate.id === id);
  if (!entity || entity.kind !== 'line' || typeof entity.p1 === 'number' || typeof entity.p2 === 'number')
    return null;
  return { a: entity.p1, b: entity.p2 };
}

test.describe('草图倒角（Onshape 对拍）', () => {
  test('点击两线角点 → 倒角直线 + 距离尺寸 → undo 回两线', async ({ page, request }) => {
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

    const lease = await borrowWriteLease(ctx, token, 'sketch-chamfer');
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
    await page.getByRole('button', { name: '缩放到合适大小' }).click();
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

    // live：圆角 ▾ → 倒角（第二项）。
    await page.getByRole('button', { name: '圆角 ▾' }).click();
    await page.getByRole('menuitem', { name: '倒角', exact: true }).click();
    const corner = await project({ x: 0, y: 0 });
    await page.mouse.click(corner.x, corner.y);

    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      const lines = (sketch?.entities ?? []).filter((entity) => entity.kind === 'line');
      return lines.length;
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBe(3);
    const committed = await getSketchRpc(ctx, sketchId, token);
    const line11 = inlineLine(committed, 11);
    const line12 = inlineLine(committed, 12);
    expect(line11?.a).toMatchObject({ x: 5, y: 0 });
    expect(line12?.a).toMatchObject({ x: 0, y: 5 });
    const lines = (committed?.entities ?? []).filter((entity) => entity.kind === 'line');
    const chamfer = lines.find((entity) => entity.id !== 11 && entity.id !== 12);
    expect(chamfer).toBeDefined();
    const chamferLine = chamfer as { p1: Pt; p2: Pt };
    const ends = [chamferLine.p1, chamferLine.p2].sort((a, b) => a.x - b.x);
    expect(ends[0]!.x).toBeCloseTo(0, 6);
    expect(ends[0]!.y).toBeCloseTo(5, 6);
    expect(ends[1]!.x).toBeCloseTo(5, 6);
    expect(ends[1]!.y).toBeCloseTo(0, 6);
    // 角点实体 + 两条 distance 尺寸（value=5）+ 端点 coincident。
    const points = (committed?.entities ?? []).filter((entity) => entity.kind === 'point') as Array<{ x: number; y: number }>;
    expect(points).toHaveLength(1);
    expect(points[0]!.x).toBeCloseTo(0, 6);
    expect(points[0]!.y).toBeCloseTo(0, 6);
    const distances = (committed?.constraints ?? []).filter((constraint) => constraint.kind === 'distance');
    expect(distances).toHaveLength(2);
    for (const distance of distances)
      expect(distance.value).toBeCloseTo(5, 6);
    const coincidents = (committed?.constraints ?? []).filter((constraint) => constraint.kind === 'coincident');
    // 旧 101 已移除；新增两条（倒角线两端）。
    expect(coincidents.some((constraint) => constraint.id === 101)).toBe(false);
    expect(coincidents).toHaveLength(2);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      return (sketch?.entities ?? []).filter((entity) => entity.kind === 'line').length;
    }, { timeout: 30_000, intervals: [500, 1000, 2000] }).toBe(2);
    const restored = await getSketchRpc(ctx, sketchId, token);
    expect((restored?.entities ?? []).filter((entity) => entity.kind === 'point')).toHaveLength(0);
    expect((restored?.constraints ?? []).some((constraint) => constraint.id === 101)).toBe(true);
  });
});
