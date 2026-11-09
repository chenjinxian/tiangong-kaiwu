/**
 * 草图点工具（Sketch.Point）真栈首切片，2026-11-09。
 *
 * 证据：Onshape 草图工具栏「点」——点击放置点，工具保持存活可连续放点。
 * 本 spec 走真实 ribbon/画布：进入草图 → 激活「点」→ 放置两个点 →
 * RPC 读回 point 实体（坐标落草图局部系）→ 完成草图 → reload 重开仍在。
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
type PointEntity = Extract<SketchEntityDto, { kind: 'point' }>;

async function latestSketch(ctx: Ctx, token: string): Promise<SketchDto> {
  const tree = await getFeatureTreeRpc(ctx, token);
  const id = tree.filter((row) => row.featureType === 'sketch').at(-1)?.id;
  expect(id, '树内应有 sketch 行').toBeTruthy();
  const sketch = await getSketchRpc(ctx, id!, token);
  expect(sketch).toBeDefined();
  return sketch!;
}

const pointsOf = (sketch: SketchDto): PointEntity[] =>
  sketch.entities.filter((e): e is PointEntity => e.kind === 'point');

test.describe('草图点工具（Sketch.Point）', () => {
  test('真实 ribbon：连续放两点 → point 实体 / 完成草图 / reload 重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 120_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const ctx = await openSeedImodelEditor(page, seed);

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

    // 先画一条线，验证点工具的自动推断：线内部 → point-on-line；线端点 → coincident。
    await activate(page, '线');
    await clickWorld(page, hub, P(0, 0));
    await clickWorld(page, hub, P(20, 0));
    await page.waitForTimeout(1_200);

    await activate(page, '点');
    await clickWorld(page, hub, P(10, 0));
    await page.waitForTimeout(1_200);
    await clickWorld(page, hub, P(20, 0));
    await page.waitForTimeout(1_500);

    const after = await latestSketch(ctx, token);
    const points = pointsOf(after);
    expect(points).toHaveLength(2);
    expect(points.some((p) => Math.abs((p.x ?? NaN) - 10) < 0.8 && Math.abs((p.y ?? NaN) - 0) < 0.8)).toBe(true);
    expect(points.some((p) => Math.abs((p.x ?? NaN) - 20) < 0.8 && Math.abs((p.y ?? NaN) - 0) < 0.8)).toBe(true);
    expect(after.constraints.filter((c) => c.kind === 'coincident')).toHaveLength(2);

    await finishSketch(page);
    expect((await getFeatureTreeRpc(ctx, token)).some((row) => row.featureType === 'sketch')).toBe(true);

    await page.reload();
    const reopened = await openSeedImodelEditor(page, seed);
    const persisted = await latestSketch(reopened, token);
    expect(pointsOf(persisted)).toHaveLength(2);
    expect(persisted.constraints.filter((c) => c.kind === 'coincident')).toHaveLength(2);
  });
});
