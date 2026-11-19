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
  projectWorld,
  setStandardView,
} from './tutorial2-helpers.js';

type LineEntity = Extract<SketchEntityDto, { kind: 'line' }>;
type ArcEntity = Extract<SketchEntityDto, { kind: 'arc' }>;

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

/** 解析线/弧/圆心的 point 引用（数字 point id 或内联坐标）。 */
function resolvePointRef(ref: number | { x: number; y: number }, entities: SketchEntityDto[]): { x: number; y: number } {
  if (typeof ref === 'object') return ref;
  const point = entities.find((e) => e.id === ref);
  if (!point || point.kind !== 'point' || point.x === undefined || point.y === undefined)
    throw new Error(`point ${ref} 未解算`);
  return { x: point.x, y: point.y };
}

const dist2d = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/**
 * 链槽验收（与 live `chain-slot.dxf` 同构）：中线 3 段 + 6 条边界 + 4 弧
 * （2 半圆帽 + 2 外侧圆角弧），弧心=链顶点；所有弧半径=halfWidth；
 * 原中线全部保留；边界线到对应中线段的垂距=halfWidth。
 */
function assertChainSlotGeometry(sketch: SketchDto, centerlineIds: readonly number[], halfWidth: number): void {
  const lines = sketch.entities.filter((e): e is LineEntity => e.kind === 'line');
  const arcs = sketch.entities.filter((e): e is ArcEntity => e.kind === 'arc');
  const byId = new Map(sketch.entities.map((e) => [e.id, e]));
  const centerlines = centerlineIds.map((id) => {
    const line = byId.get(id);
    if (!line || line.kind !== 'line') throw new Error(`中线 ${id} 丢失`);
    return line;
  });
  expect(lines).toHaveLength(3 + 6);
  expect(arcs).toHaveLength(4);

  const P0 = resolvePointRef(centerlines[0]!.p1, sketch.entities);
  const P1 = resolvePointRef(centerlines[0]!.p2, sketch.entities);
  const P2 = resolvePointRef(centerlines[1]!.p2, sketch.entities);
  const P3 = resolvePointRef(centerlines[2]!.p2, sketch.entities);
  // 连续绘制焊接：相邻段共享端点。
  expect(dist2d(P1, resolvePointRef(centerlines[1]!.p1, sketch.entities))).toBeLessThan(0.1);
  expect(dist2d(P2, resolvePointRef(centerlines[2]!.p1, sketch.entities))).toBeLessThan(0.1);

  for (const arc of arcs)
    expect(arc.radius, '所有弧半径 = Ø/2').toBeCloseTo(halfWidth, 3);
  const centers = arcs.map((arc) => resolvePointRef(arc.center, sketch.entities));
  for (const expected of [P0, P1, P2, P3]) {
    expect(centers.filter((center) => dist2d(center, expected) < 0.2), '弧心=链顶点').toHaveLength(1);
  }

  const centerlineSet = new Set(centerlineIds);
  const boundary = lines.filter((line) => !centerlineSet.has(line.id));
  expect(boundary).toHaveLength(6);
  const segments = centerlines.map((line) => [
    resolvePointRef(line.p1, sketch.entities),
    resolvePointRef(line.p2, sketch.entities),
  ] as const);
  for (const line of boundary) {
    const a = resolvePointRef(line.p1, sketch.entities);
    const b = resolvePointRef(line.p2, sketch.entities);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const hits = segments.filter(([s, e]) => {
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) return false;
      const distance = Math.abs(dx * (mid.y - s.y) - dy * (mid.x - s.x)) / len;
      const t = ((mid.x - s.x) * dx + (mid.y - s.y) * dy) / (len * len);
      return Math.abs(distance - halfWidth) < 0.1 && t > -0.05 && t < 1.05;
    });
    expect(hits, '边界线到对应中线段的垂距 = Ø/2').toHaveLength(1);
  }
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

    // MS 限流纪律（100 req/15min）：草图 id 只取一次，后续轮询直读 getSketch，
    // 并用大间隔轮询（默认高频轮询会触发 429）。
    let sketchId: string | undefined;
    const readSketch = async (): Promise<SketchDto> => {
      if (!sketchId) {
        const tree = await getFeatureTreeRpc(ctx, token);
        sketchId = tree.filter((row) => row.featureType === 'sketch').at(-1)?.id;
        expect(sketchId, '树内应有 sketch 行').toBeTruthy();
      }
      const sketch = await getSketchRpc(ctx, sketchId!, token);
      expect(sketch).toBeDefined();
      return sketch!;
    };

    // 单条 100 mm 水平线（Front 草图局部 y=0）。
    await activate(page, '线');
    await clickWorld(page, hub, P(-50, 0));
    await clickWorld(page, hub, P(50, 0));
    await page.waitForTimeout(800);
    const before = await readSketch();
    expect(before.entities.filter((e) => e.kind === 'line')).toHaveLength(1);

    // 偏移 ▾ → 槽 → 点线 → Enter 提交。
    await page.getByRole('button', { name: '偏移 ▾' }).click({ timeout: 10_000 });
    await page.getByRole('menuitem', { name: '槽', exact: true }).click();
    await clickWorld(page, hub, P(0, 0));
    await page.waitForTimeout(700);
    await page.keyboard.press('Enter');

    await expect.poll(async () => (await readSketch()).entities.filter((e) => e.kind === 'arc').length, {
      timeout: 20_000, intervals: [500, 1000, 2000],
    }).toBe(2);
    const created = await readSketch();
    assertSlotGeometry(created, 10);

    // Ø 20 → 30：后端 updateSketchConstraint 重解算，边界/帽半径参数化。
    const diameter = created.constraints.find((c) => c.kind === 'diameter')!;
    const widen = await applyFeatureOpRpc(ctx, {
      kind: 'updateSketchConstraint', sketchId: sketchId!, constraintId: diameter.id, value: 30,
    }, lease, token);
    expect(widen.ok, widen.ok ? '' : widen.error).toBe(true);
    await expect.poll(async () => (await readSketch()).entities
      .filter((e): e is ArcEntity => e.kind === 'arc')[0]?.radius, {
      timeout: 20_000, intervals: [1000, 2000, 5000],
    }).toBeCloseTo(15, 3);
    assertSlotGeometry(await readSketch(), 15);

    // 原生 UI undo/redo：宽度回 20（r10）→ 再回 30（r15）。
    // reminder：FeatureOp undo 只支持参数修改/变量表；草图约束值走原生事务 Undo。
    await page.getByRole('button', { name: '撤消', exact: true }).click();
    await expect.poll(async () => (await readSketch()).entities
      .filter((e): e is ArcEntity => e.kind === 'arc')[0]?.radius, {
      timeout: 20_000, intervals: [1000, 2000, 5000],
    }).toBeCloseTo(10, 3);
    assertSlotGeometry(await readSketch(), 10);
    await page.getByRole('button', { name: '重做', exact: true }).click();
    await expect.poll(async () => (await readSketch()).entities
      .filter((e): e is ArcEntity => e.kind === 'arc')[0]?.radius, {
      timeout: 20_000, intervals: [1000, 2000, 5000],
    }).toBeCloseTo(15, 3);

    await finishSketch(page);
    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    const persisted = await readSketch();
    assertSlotGeometry(persisted, 15);
  });

  test('框选相连 3 段 → 槽（预选链）→ Enter 一键提交 → Ø 参数化 → reload', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openSeedImodelEditor(page, seed);
    const lease = await borrowWriteLease(ctx, token, 'sketch-slot-chain');

    await page.getByRole('button', { name: '草图', exact: true }).click();
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
    await chooseSketchPlaneInViewport(page, 'front');
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const hub = { x: box.x, y: box.y };
    await setStandardView(page, 4, { low: { x: -100, y: -100, z: -100 }, high: { x: 300, y: 100, z: 100 } });
    await disableSnap(page);

    // MS 限流纪律（100 req/15min）：草图 id 只取一次，后续轮询直读 getSketch。
    let chainSketchId: string | undefined;
    const readSketch = async (): Promise<SketchDto> => {
      if (!chainSketchId) {
        const tree = await getFeatureTreeRpc(ctx, token);
        chainSketchId = tree.filter((row) => row.featureType === 'sketch').at(-1)?.id;
        expect(chainSketchId, '树内应有 sketch 行').toBeTruthy();
      }
      const sketch = await getSketchRpc(ctx, chainSketchId!, token);
      expect(sketch).toBeDefined();
      return sketch!;
    };

    // 连续 3 段链（两个拐点，左转+右转；与 live chain-slot.dxf 同构）。
    await activate(page, '线');
    await clickWorld(page, hub, P(0, 0));
    await clickWorld(page, hub, P(100, 0));
    await clickWorld(page, hub, P(100, 100));
    await clickWorld(page, hub, P(200, 100));
    await expect.poll(async () => (await readSketch()).entities
      .filter((e) => e.kind === 'line').length, { timeout: 20_000, intervals: [500, 1000, 2000] }).toBe(3);
    // Esc 结束连续绘制（回到选择工具；草图保持打开）。
    await page.keyboard.press('Escape');
    await expect.poll(async () => page.evaluate(() => {
      const im = (window as any).__lubanE2E?.coreFrontend?.IModelApp;
      const admin = im?._toolAdmin ?? im?.toolAdmin;
      return admin?.primitiveTool?.toolId as string | undefined;
    }), { timeout: 15_000, intervals: [200, 400, 800] }).not.toBe('Sketch.Line');
    const before = await readSketch();
    const centerlineIds = before.entities.filter((e) => e.kind === 'line').map((e) => e.id);
    expect(centerlineIds).toHaveLength(3);
    const beforeConstraintIds = new Set(before.constraints.map((c) => c.id));

    // 框选全部 3 段（左→右窗口选择；live 2026-11-19 同法），再打开偏移 ▾ → 槽。
    const projected = await projectWorld(page, hub, [P(-20, -20), P(220, 120)]);
    const from = projected[0];
    const to = projected[1];
    if (!from || !to) throw new Error('框选角点投影失败');
    await page.mouse.move(from.x, from.y);
    await page.waitForTimeout(120);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 8 });
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    // 预选门：框选必须真正选中 3 段，否则后续 Enter 只是空拾取态 no-op。
    const picker = page.getByTestId('sketch-entity-picker');
    const selectedIds = async (): Promise<number[]> =>
      JSON.parse((await picker.getAttribute('data-selected')) ?? '[]') as number[];
    await expect.poll(async () => (await selectedIds()).length, { timeout: 10_000 }).toBe(3);

    await page.getByRole('button', { name: '偏移 ▾' }).click({ timeout: 10_000 });
    await page.getByRole('menuitem', { name: '槽', exact: true }).click();
    // 预选驱动：工具激活即进入预览态；不点击画布，Enter 直接提交。
    await page.waitForTimeout(700);
    expect((await selectedIds()).length, '启动工具不得清掉草图预选').toBe(3);
    expect(await page.evaluate(() => {
      const im = (window as any).__lubanE2E?.coreFrontend?.IModelApp;
      const admin = im?._toolAdmin ?? im?.toolAdmin;
      return admin?.activeTool?.toolId as string | undefined;
    }), '槽工具应已激活').toBe('Sketch.Slot');
    await page.keyboard.press('Enter');

    await expect.poll(async () => (await readSketch()).entities
      .filter((e) => e.kind === 'arc').length, { timeout: 30_000, intervals: [1000, 2000, 5000] }).toBe(4);
    const created = await readSketch();
    assertChainSlotGeometry(created, centerlineIds, 10);
    const added = created.constraints.filter((c) => !beforeConstraintIds.has(c.id));
    expect(added.filter((c) => c.kind === 'diameter')).toHaveLength(1);
    expect(added.filter((c) => c.kind === 'equal')).toHaveLength(3);
    expect(added.filter((c) => c.kind === 'tangent')).toHaveLength(8);
    expect(added.filter((c) => c.kind === 'parallel')).toHaveLength(6);
    expect(added.filter((c) => c.kind === 'coincident')).toHaveLength(16);

    // Ø 20 → 30：整条链参数化（全部弧 r15、边界外移 5 mm）。
    const diameter = created.constraints.find((c) => c.kind === 'diameter')!;
    const widen = await applyFeatureOpRpc(ctx, {
      kind: 'updateSketchConstraint', sketchId: chainSketchId!, constraintId: diameter.id, value: 30,
    }, lease, token);
    expect(widen.ok, widen.ok ? '' : widen.error).toBe(true);
    await expect.poll(async () => (await readSketch()).entities
      .filter((e): e is ArcEntity => e.kind === 'arc')[0]?.radius, { timeout: 20_000, intervals: [1000, 2000, 5000] })
      .toBeCloseTo(15, 3);
    assertChainSlotGeometry(await readSketch(), centerlineIds, 15);

    await finishSketch(page);
    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    const persisted = await readSketch();
    assertChainSlotGeometry(persisted, centerlineIds, 15);
  });
});
