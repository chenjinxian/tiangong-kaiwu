/**
 * 草图绘制工具连续模式（2026-11-13 Onshape live）：提交后**保持激活**。
 * - 直线为连续链：下一段从上一段终点开始；Esc 退出工具。
 * - 矩形等其它绘制工具提交后保持激活、下一形状从空锚点开始。
 * - 再次点击工具栏同一工具 = 重新开始（新实例，不续链）。
 * - 工具仍激活时点草图 ✓ 完成 → 退出草图并停掉草图工具。
 *
 * 取点走光标射线∩草图平面（2026-11-13 修复）：进入草图不再自动正视平面，
 * ev.point 不在草图平面上；本 spec 的几何断言（两段垂直、矩形宽高非零）
 * 同时钉住该回归。
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
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
import {
  P,
  activate,
  clickWorld,
  finishSketch,
  tagActiveTool,
  waitNewToolInstance,
} from './tutorial2-helpers';

const FRONT: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  xDir: { x: 1, y: 0, z: 0 },
};

type Line = Extract<SketchEntityDto, { kind: 'line' }>;
const lines = (sketch: { entities: SketchEntityDto[] } | undefined): Line[] =>
  (sketch?.entities ?? []).filter((entity): entity is Line => entity.kind === 'line');
const inline = (p: Line['p1']): { x: number; y: number } => {
  if (typeof p === 'number') throw new Error('端点应为内联');
  return p;
};

async function activeTool(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const im = (window as any).__lubanE2E?.coreFrontend?.IModelApp;
    return (im?._toolAdmin ?? im?.toolAdmin)?.activeTool?.toolId;
  });
}

async function canvasHub(page: Page): Promise<{ x: number; y: number }> {
  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 90_000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas boundingBox 不可得');
  return { x: box.x, y: box.y };
}

async function enterEmptyFrontSketch(page: Page, request: Parameters<typeof resetBModelSeed>[0]) {
  const token = await getApiToken();
  const seed = await resetBModelSeed(request, token);
  let ctx = await openSeedImodelEditor(page, seed);
  const lease = await borrowWriteLease(ctx, token, 'sketch-continuous');
  const created = await applyFeatureOpRpc(ctx, {
    kind: 'insertSketch', entities: [], constraints: [], plane: FRONT,
  }, lease, token);
  assertFeatureOpOk(created, '草图');
  const sketchId = created.featureId!;
  await releaseWriteLease(ctx, lease, token);
  await page.reload();
  ctx = await openSeedImodelEditor(page, seed);
  const row = page.getByTestId(`tree-row-${sketchId}`);
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.dblclick({ timeout: 30_000 });
  await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => page.evaluate(() =>
    (window as any).__lubanE2EApp?.usePartStudioStore?.getState().sketch.isActive,
  ), { timeout: 30_000 }).toBe(true);
  return { ctx, token, sketchId, hub: await canvasHub(page) };
}

const pollLines = async (ctx: any, sketchId: string, token: string, count: number) => {
  await expect.poll(async () => lines(await getSketchRpc(ctx, sketchId, token)).length, {
    timeout: 30_000,
    intervals: [300, 600, 1200],
  }).toBe(count);
};

test.describe('草图绘制连续模式（提交后工具保持激活）', () => {
  test('直线链式连续；再次激活重新开始；Esc 退出工具', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const { ctx, token, sketchId, hub } = await enterEmptyFrontSketch(page, request);

    await activate(page, '线');
    await clickWorld(page, hub, P(0, 0));
    await clickWorld(page, hub, P(100, 0));
    await clickWorld(page, hub, P(100, 100));
    await pollLines(ctx, sketchId, token, 2);
    // 提交后工具仍在（Onshape 连续绘制）。
    expect(await activeTool(page)).toBe('Sketch.Line');
    const chain = lines(await getSketchRpc(ctx, sketchId, token));
    const first = inline(chain[0]!.p2);
    const second = inline(chain[1]!.p1);
    expect(second.x).toBeCloseTo(first.x, 6);
    expect(second.y).toBeCloseTo(first.y, 6);
    // 两段互相垂直（旧取点 bug 会把两段压到同一条直线上）。
    const end = inline(chain[1]!.p2);
    expect(Math.abs(first.x - 0)).toBeGreaterThan(80);
    expect(Math.abs(end.y - 0)).toBeGreaterThan(80);

    // 再次点击工具栏「线」= 新实例，不续上一链。
    const tag = await tagActiveTool(page);
    await activate(page, '线');
    await waitNewToolInstance(page, tag);
    await clickWorld(page, hub, P(-200, 0));
    await clickWorld(page, hub, P(-100, 0));
    await pollLines(ctx, sketchId, token, 3);
    const third = inline(lines(await getSketchRpc(ctx, sketchId, token))[2]!.p1);
    // 像素投影精度 ~1 mm（空草图取景基准面尺度），容差 3 mm。
    expect(Math.abs(third.x + 200)).toBeLessThan(3);
    expect(Math.abs(third.y)).toBeLessThan(3);

    // Esc 结束工具（回到选择工具）。
    await page.keyboard.press('Escape');
    await expect.poll(() => activeTool(page), { timeout: 15_000, intervals: [200, 400, 800] })
      .not.toBe('Sketch.Line');
    await finishSketch(page);
  });

  test('矩形连续绘制多个；工具仍激活时 ✓ 完成草图并停掉工具', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const { ctx, token, sketchId, hub } = await enterEmptyFrontSketch(page, request);

    await activate(page, '拐角矩形');
    await clickWorld(page, hub, P(0, 0));
    await clickWorld(page, hub, P(100, 100));
    await pollLines(ctx, sketchId, token, 4);
    expect(await activeTool(page)).toBe('Sketch.Rectangle');
    // 矩形二维非退化（宽高都 ~100 mm）。
    const rect = lines(await getSketchRpc(ctx, sketchId, token));
    const xs = rect.flatMap((line) => [inline(line.p1).x, inline(line.p2).x]);
    const ys = rect.flatMap((line) => [inline(line.p1).y, inline(line.p2).y]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(80);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(80);

    // 第二轮（未重新激活）→ 第二个矩形，不叠加在第一个上。
    await clickWorld(page, hub, P(150, 0));
    await clickWorld(page, hub, P(250, 100));
    await pollLines(ctx, sketchId, token, 8);

    // 工具仍激活时直接点草图 ✓：完成草图并退出草图工具。
    await activate(page, '线');
    await clickWorld(page, hub, P(-200, -200));
    await clickWorld(page, hub, P(-100, -200));
    await pollLines(ctx, sketchId, token, 9);
    expect(await activeTool(page)).toBe('Sketch.Line');
    await finishSketch(page);
    await expect.poll(() => activeTool(page), { timeout: 15_000, intervals: [200, 400, 800] })
      .not.toBe('Sketch.Line');
  });
});
