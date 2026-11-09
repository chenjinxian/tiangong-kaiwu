/**
 * 正多边形工具（sketchInscribedPolygon / sketchCircumscribedPolygon）真栈首切片，
 * 2026-11-09。
 *
 * 证据：Onshape Help「Inscribed Polygon / Circumscribed Polygon」——圆心 → 构造圆
 * 半径点 → 键盘输入边数（3–50）→ Enter 完成；默认 6 边。本 spec 用 5 边：
 * 内切（构造圆在图形内）与外切（图形在构造圆内）各一条用例，断言实体/约束计数与
 * 构造圆半径；完成草图 → reload 重开仍在。
 */
import { expect, test } from '@playwright/test';
import type { SketchDto, SketchEntityDto } from '@luban-cad/shared';
import { getApiToken, getFeatureTreeRpc, getSketchRpc, openSeedImodelEditor } from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import {
  P,
  activate,
  chooseSketchPlaneInViewport,
  clickWorld,
  disableSnap,
  finishSketch,
  setStandardView,
} from './tutorial2-helpers.js';

type Ctx = Awaited<ReturnType<typeof openSeedImodelEditor>>;
type LineEntity = Extract<SketchEntityDto, { kind: 'line' }>;

async function latestSketch(ctx: Ctx, token: string): Promise<SketchDto> {
  const tree = await getFeatureTreeRpc(ctx, token);
  const id = tree.filter((row) => row.featureType === 'sketch').at(-1)?.id;
  expect(id, '树内应有 sketch 行').toBeTruthy();
  const sketch = await getSketchRpc(ctx, id!, token);
  expect(sketch).toBeDefined();
  return sketch!;
}

async function enterSketchAndDrawPolygon(page: Parameters<typeof activate>[0], toolLabel: string) {
  await page.getByRole('button', { name: '草图', exact: true }).click();
  const dialog = page.getByTestId('part-studio-sketch-dialog');
  await expect(dialog).toBeVisible();
  await chooseSketchPlaneInViewport(page, 'front');
  await dialog.getByRole('button', { name: '确认' }).click();
  await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas boundingBox 不可得');
  const hub = { x: box.x, y: box.y };
  await setStandardView(page, 4, {
    low: { x: -100, y: -100, z: -100 }, high: { x: 100, y: 100, z: 100 },
  });
  await disableSnap(page);

  await activate(page, toolLabel);
  await clickWorld(page, hub, P(0, 0));
  await clickWorld(page, hub, P(10, 0));
  await page.keyboard.press('5');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1_500);
}

test.describe('正多边形工具（5 边）', () => {
  test('内切多边形：构造圆+5 线+约束，完成草图/reload', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 120_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const ctx = await openSeedImodelEditor(page, seed);

    await enterSketchAndDrawPolygon(page, '内切多边形');

    const after = await latestSketch(ctx, token);
    const lines = after.entities.filter((e): e is LineEntity => e.kind === 'line');
    expect(lines).toHaveLength(5);
    const circle = after.entities.find((e) => e.kind === 'circle');
    expect(circle?.kind).toBe('circle');
    if (circle?.kind === 'circle') {
      expect(circle.construction).toBe(true);
      expect(Math.abs((circle.radius ?? 0) - 10)).toBeLessThan(0.5);
    }
    expect(after.constraints.filter((c) => c.kind === 'coincident')).toHaveLength(5);
    expect(after.constraints.filter((c) => c.kind === 'equal')).toHaveLength(4);
    expect(after.constraints.filter((c) => c.kind === 'angle')).toHaveLength(5);
    expect(after.solve.status).not.toBe('conflicting');
    expect(after.solve.status).not.toBe('failed');

    await finishSketch(page);
    expect((await getFeatureTreeRpc(ctx, token)).some((row) => row.featureType === 'sketch')).toBe(true);

    await page.reload();
    const reopened = await openSeedImodelEditor(page, seed);
    const persisted = await latestSketch(reopened, token);
    expect(persisted.entities.filter((e) => e.kind === 'line')).toHaveLength(5);
  });

  test('外切多边形：图形在构造圆内，完成草图/reload', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 120_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const ctx = await openSeedImodelEditor(page, seed);

    await enterSketchAndDrawPolygon(page, '外切多边形');
    const after = await latestSketch(ctx, token);
    const lines = after.entities.filter((e): e is LineEntity => e.kind === 'line');
    expect(lines).toHaveLength(5);
    const endpoints = lines.flatMap((line) => [line.p1, line.p2])
      .filter((p): p is { x: number; y: number } => typeof p === 'object');
    expect(endpoints.length).toBeGreaterThanOrEqual(10);
    // 外切（多边形在圆内）：全部顶点应落在半径 10 附近（±0.6 鼠标映射容差）。
    for (const p of endpoints) expect(Math.abs(Math.hypot(p.x, p.y) - 10)).toBeLessThan(0.6);
    const circle = after.entities.find((e) => e.kind === 'circle');
    if (circle?.kind === 'circle') expect(Math.abs((circle.radius ?? 0) - 10)).toBeLessThan(0.5);
    expect(after.solve.status).not.toBe('conflicting');
    expect(after.solve.status).not.toBe('failed');

    await finishSketch(page);
    await page.reload();
    const reopened = await openSeedImodelEditor(page, seed);
    const persisted = await latestSketch(reopened, token);
    expect(persisted.entities.filter((e) => e.kind === 'line')).toHaveLength(5);
  });
});
