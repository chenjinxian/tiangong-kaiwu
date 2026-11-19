/**
 * ADR-0022 S2 首切片真栈验收：草图槽「Sketch.Slot」（2026-11-19 live 探针）。
 *
 * 真实 ribbon/画布：Front 平面画一条 100 mm 水平线 → 偏移 ▾ →「槽」→ 点线 →
 * Enter 提交。断言（live 语义）：
 * - 槽 = 两条平行边界 + 两端半圆帽（Ø20 → r10），原中线保留；
 * - 一个 diameter 约束（Ø20）+ equal 两帽 + 4 tangent + 2 parallel；
 * - Ø 改 30（updateSketchConstraint）→ 边界 ±15 / r15（宽度参数化），undo/redo 可逆；
 * - finish + reload 重开后几何/约束保持。
 */
import { expect, test } from '@playwright/test';
import type { SketchDto, SketchEntityDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  borrowWriteLease,
  getApiToken,
  getFeatureTreeRpc,
  getSketchRpc,
  openSeedImodelEditor,
} from './helpers.js';
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

type LineEntity = Extract<SketchEntityDto, { kind: 'line' }>;
type ArcEntity = Extract<SketchEntityDto, { kind: 'arc' }>;

async function latestSketch(ctx: Awaited<ReturnType<typeof openSeedImodelEditor>>, token: string): Promise<SketchDto> {
  const tree = await getFeatureTreeRpc(ctx, token);
  const id = tree.filter((row) => row.featureType === 'sketch').at(-1)?.id;
  expect(id, '树内应有 sketch 行').toBeTruthy();
  const sketch = await getSketchRpc(ctx, id!, token);
  expect(sketch).toBeDefined();
  return sketch!;
}

const pointOf = (ref: LineEntity['p1']): { x: number; y: number } => {
  if (typeof ref !== 'object') throw new Error('期望内联端点');
  return ref;
};

/** 平行线垂距（局部 2D）。 */
function perpendicularDistance(seed: LineEntity, other: LineEntity): number {
  const a = pointOf(seed.p1);
  const b = pointOf(seed.p2);
  const p = pointOf(other.p1);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  return Math.abs(dx * (p.y - a.y) - dy * (p.x - a.x)) / len;
}

function assertSlotGeometry(sketch: SketchDto, halfWidth: number): void {
  const lines = sketch.entities.filter((e): e is LineEntity => e.kind === 'line');
  const arcs = sketch.entities.filter((e): e is ArcEntity => e.kind === 'arc');
  expect(lines, '原中线 + 两条边界线').toHaveLength(3);
  expect(arcs, '两端半圆帽').toHaveLength(2);
  for (const arc of arcs)
    expect(arc.radius, '帽半径 = Ø/2').toBeCloseTo(halfWidth, 3);
  // 中线 = 长度 100 且经过 y≈0 的那条（Front 草图局部 v=0）。
  const seed = lines.find((line) => Math.abs(pointOf(line.p1).y) < 1e-6 && Math.abs(pointOf(line.p2).y) < 1e-6);
  expect(seed, '应保留原中线').toBeTruthy();
  for (const line of lines.filter((l) => l.id !== seed!.id))
    expect(perpendicularDistance(seed!, line), '边界线到中线垂距 = Ø/2').toBeCloseTo(halfWidth, 3);

  const diameter = sketch.constraints.find((c) => c.kind === 'diameter');
  expect(diameter, '应有 Ø 驱动尺寸').toBeDefined();
  expect(diameter!.value).toBeCloseTo(halfWidth * 2, 3);
  expect(sketch.constraints.filter((c) => c.kind === 'equal')).toHaveLength(1);
  expect(sketch.constraints.filter((c) => c.kind === 'tangent')).toHaveLength(4);
  expect(sketch.constraints.filter((c) => c.kind === 'parallel')).toHaveLength(2);
}

test.describe('草图槽工具（Sketch.Slot，ADR-0022 S2 首切片）', () => {
  test('选直线 → 槽预览 → Enter 提交 → Ø20 参数化 → undo/redo → reload', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 240_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openSeedImodelEditor(page, seed);
    const lease = await borrowWriteLease(ctx, token, 'sketch-slot');

    await page.getByRole('button', { name: '草图', exact: true }).click();
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
    await chooseSketchPlaneInViewport(page, 'front');
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const hub = { x: box.x, y: box.y };
    await setStandardView(page, 4, { low: { x: -100, y: -100, z: -100 }, high: { x: 100, y: 100, z: 100 } });
    await disableSnap(page);

    // 单条 100 mm 水平线（Front 草图局部 y=0）。
    await activate(page, '线');
    await clickWorld(page, hub, P(-50, 0));
    await clickWorld(page, hub, P(50, 0));
    await page.waitForTimeout(800);
    const before = await latestSketch(ctx, token);
    expect(before.entities.filter((e) => e.kind === 'line')).toHaveLength(1);

    // 偏移 ▾ → 槽 → 点线 → Enter 提交。
    await page.getByRole('button', { name: '偏移 ▾' }).click({ timeout: 10_000 });
    await page.getByRole('menuitem', { name: '槽', exact: true }).click();
    await clickWorld(page, hub, P(0, 0));
    await page.waitForTimeout(700);
    await page.keyboard.press('Enter');

    await expect.poll(async () => (await latestSketch(ctx, token)).entities.filter((e) => e.kind === 'arc').length, {
      timeout: 20_000,
    }).toBe(2);
    const created = await latestSketch(ctx, token);
    assertSlotGeometry(created, 10);

    // Ø 20 → 30：后端 updateSketchConstraint 重解算，边界/帽半径参数化。
    const sketchId = (await getFeatureTreeRpc(ctx, token)).filter((row) => row.featureType === 'sketch').at(-1)!.id;
    const diameter = created.constraints.find((c) => c.kind === 'diameter')!;
    const widen = await applyFeatureOpRpc(ctx, {
      kind: 'updateSketchConstraint', sketchId, constraintId: diameter.id, value: 30,
    }, lease, token);
    expect(widen.ok, widen.ok ? '' : widen.error).toBe(true);
    await expect.poll(async () => (await latestSketch(ctx, token)).entities
      .filter((e): e is ArcEntity => e.kind === 'arc')[0]?.radius, { timeout: 15_000 }).toBeCloseTo(15, 3);
    assertSlotGeometry(await latestSketch(ctx, token), 15);

    // 原生 UI undo/redo：宽度回 20（r10）→ 再回 30（r15）。
    // reminder：FeatureOp undo 只支持参数修改/变量表；草图约束值走原生事务 Undo。
    await page.getByRole('button', { name: '撤消', exact: true }).click();
    await expect.poll(async () => (await latestSketch(ctx, token)).entities
      .filter((e): e is ArcEntity => e.kind === 'arc')[0]?.radius, { timeout: 15_000 }).toBeCloseTo(10, 3);
    assertSlotGeometry(await latestSketch(ctx, token), 10);
    await page.getByRole('button', { name: '重做', exact: true }).click();
    await expect.poll(async () => (await latestSketch(ctx, token)).entities
      .filter((e): e is ArcEntity => e.kind === 'arc')[0]?.radius, { timeout: 15_000 }).toBeCloseTo(15, 3);

    await finishSketch(page);
    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    const persisted = await latestSketch(ctx, token);
    assertSlotGeometry(persisted, 15);
  });
});
