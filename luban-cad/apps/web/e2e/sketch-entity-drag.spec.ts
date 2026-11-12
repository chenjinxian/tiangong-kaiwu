/**
 * ADR-0018 S1c 真栈验收：草图编辑态直接操纵（Onshape 对拍）。
 *
 * 覆盖：
 * 1) 拖曲线本体 → 预览显示层 → 释放一次 updateSketch 提交（getSketch 坐标变更）；
 * 2) 拖控制点（线端点）→ 只动该端点；
 * 3) 拖拽中 Escape → 取消预览不提交、不退出草图；
 * 4) 撤销 → getSketch 坐标回退（onAfterUndoRedo 刷新读面）。
 *
 * 依赖 dev server 的 VITE_E2E_HOOKS（window.__lubanE2E 投影世界点）。
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

const LINE_ID = 11;
const LINE: SketchEntityDto[] = [
  { kind: 'line', id: LINE_ID, p1: { x: -10, y: 0 }, p2: { x: 10, y: 0 } },
];

interface Pt { x: number; y: number }

/** 从 getSketch 读面解析线两端（p1/p2 可能是内联点或点实体引用）。 */
function lineEndpoints(sketch: SketchDto | undefined): [Pt, Pt] | null {
  const line = sketch?.entities.find((entity) => entity.kind === 'line' && entity.id === LINE_ID) as
    | { p1?: Pt | number; p2?: Pt | number }
    | undefined;
  if (!line || line.p1 === undefined || line.p2 === undefined)
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
  return p1 && p2 ? [p1, p2] : null;
}

/** 页面内投影：世界（草图局部 u,v → 世界）到 iTwin view 坐标的线性基。 */
async function readProjection(page: import('@playwright/test').Page): Promise<
  { o: Pt; ux: number; uy: number; vx: number; vy: number } | null
> {
  return page.evaluate(() => {
    const vp = (window as unknown as {
      __lubanE2E?: {
        coreFrontend: {
          IModelApp: {
            viewManager: {
              selectedView: {
                worldToView: (p: { x: number; y: number; z?: number }) => { x: number; y: number };
              } | undefined;
            };
          };
        };
      };
    }).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
    if (!vp)
      return null;
    const o = vp.worldToView({ x: 0, y: 0, z: 0 });
    const u = vp.worldToView({ x: 1, y: 0, z: 0 });
    const v = vp.worldToView({ x: 0, y: 1, z: 0 });
    return { o: { x: o.x, y: o.y }, ux: u.x - o.x, uy: u.y - o.y, vx: v.x - o.x, vy: v.y - o.y };
  });
}

/** 屏幕像素位移 → 草图局部 (u,v)（与 picker 内解算同式）。 */
function screenDeltaToLocal(
  basis: { ux: number; uy: number; vx: number; vy: number },
  dx: number,
  dy: number,
): { du: number; dv: number } | null {
  const det = basis.ux * basis.vy - basis.uy * basis.vx;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9)
    return null;
  return {
    du: (dx * basis.vy - dy * basis.vx) / det,
    dv: (basis.ux * dy - basis.uy * dx) / det,
  };
}

test.describe('草图实体直接操纵（ADR-0018 S1c）', () => {
  test('曲线/控制点拖拽提交、Escape 取消、撤销回退', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 420_000);
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

    const lease = await borrowWriteLease(ctx, token, 'sketch-entity-drag');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: LINE, constraints: [], plane: XY_PLANE,
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
    await expect(page.getByTestId('sketch-entity-picker')).toBeAttached({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const basis = await readProjection(page);
    expect(basis).not.toBeNull();
    const toScreen = (p: Pt): Pt => ({
      x: box!.x + basis!.o.x + p.x * basis!.ux + p.y * basis!.vx,
      y: box!.y + basis!.o.y + p.x * basis!.uy + p.y * basis!.vy,
    });

    const initial = lineEndpoints(await getSketchRpc(ctx, sketchId, token));
    expect(initial).not.toBeNull();
    expect(initial![0].x).toBeCloseTo(-10, 6);
    expect(initial![1].x).toBeCloseTo(10, 6);

    const undo = page.getByTestId('part-studio-ribbon-undo');
    /** 释放后立即撤销（自动保存 2.5s 防抖会开新 changeset 会话，撤销窗口在推送前）。 */
    const undoImmediately = async (): Promise<void> => {
      await expect(undo).toBeEnabled({ timeout: 5_000 });
      await undo.click();
    };
    /** 轮询 getSketch，直到两端点与期望值的距离和 < 阈值。 */
    const expectEndpoints = async (p1: Pt, p2: Pt, tolerance = 1): Promise<void> => {
      await expect.poll(async () => {
        const ends = lineEndpoints(await getSketchRpc(ctx, sketchId, token));
        if (!ends)
          return 999;
        return Math.hypot(ends[0].x - p1.x, ends[0].y - p1.y)
          + Math.hypot(ends[1].x - p2.x, ends[1].y - p2.y);
      }, { timeout: 40_000, intervals: [800, 1200, 2000, 3000] }).toBeLessThan(tolerance);
    };

    // ---- 1) 拖曲线本体（原点处）→ 两端一起平移 → 撤销回退 ----
    const bodyFrom = toScreen({ x: 0, y: 0 });
    const bodyDx = 60;
    const bodyDy = 40;
    const bodyDelta = screenDeltaToLocal(basis!, bodyDx, bodyDy);
    expect(bodyDelta).not.toBeNull();
    await page.mouse.move(bodyFrom.x, bodyFrom.y);
    await page.mouse.down();
    await page.mouse.move(bodyFrom.x + bodyDx, bodyFrom.y + bodyDy, { steps: 8 });
    // 预览期间后端坐标不动（拖拽期零 RPC，事实源不变）。
    const midDrag = lineEndpoints(await getSketchRpc(ctx, sketchId, token));
    expect(midDrag![0].x).toBeCloseTo(-10, 3);
    await page.mouse.up();

    const movedP1 = { x: -10 + bodyDelta!.du, y: bodyDelta!.dv };
    const movedP2 = { x: 10 + bodyDelta!.du, y: bodyDelta!.dv };
    await expectEndpoints(movedP1, movedP2);
    await undoImmediately();
    await expectEndpoints({ x: -10, y: 0 }, { x: 10, y: 0 }, 0.5);

    // ---- 2) 拖控制点（线终点）→ 只动 p2（起端保持）→ 撤销回退 ----
    const handleDx = -50;
    const handleDy = 30;
    const handleDelta = screenDeltaToLocal(basis!, handleDx, handleDy);
    expect(handleDelta).not.toBeNull();
    const handleFrom = toScreen({ x: 10, y: 0 });
    await page.mouse.move(handleFrom.x, handleFrom.y);
    await page.mouse.down();
    await page.mouse.move(handleFrom.x + handleDx, handleFrom.y + handleDy, { steps: 8 });
    await page.mouse.up();
    await expectEndpoints(
      { x: -10, y: 0 },
      { x: 10 + handleDelta!.du, y: handleDelta!.dv },
    );
    await undoImmediately();
    await expectEndpoints({ x: -10, y: 0 }, { x: 10, y: 0 }, 0.5);

    // ---- 3) 拖拽中 Escape → 取消预览、不提交、不退出草图 ----
    const cancelFrom = toScreen({ x: 10, y: 0 });
    await page.mouse.move(cancelFrom.x, cancelFrom.y);
    await page.mouse.down();
    await page.mouse.move(cancelFrom.x + 70, cancelFrom.y - 45, { steps: 6 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
    await page.waitForTimeout(1500);
    await expectEndpoints({ x: -10, y: 0 }, { x: 10, y: 0 }, 0.5);
  });
});
