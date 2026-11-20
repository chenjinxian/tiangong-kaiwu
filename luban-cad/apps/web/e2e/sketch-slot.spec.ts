/**
 * ADR-0022 S2 首切片真栈验收：草图槽「Sketch.Slot」（2026-11-19 live 探针）。
 *
 * 真实 ribbon/画布：Front 平面画一条 100 mm 水平线 → 偏移 ▾ →「槽」→ 点线 →
 * Enter 提交。断言（live 语义）：
 * - 槽 = 两条平行边界 + 两端半圆帽（Ø20 → r10），原中线保留；
 * - 一个 diameter 约束（Ø20）+ equal 两帽 + 4 tangent + 2 parallel；
 * - Ø 改 30（updateSketchConstraint）→ 边界 ±15 / r15（宽度参数化），undo/redo 可逆；
 * - finish + reload 重开后几何/约束保持。
 *
 * ADR-0023 S2e（2026-11-20）：整圆槽（两条同心整圆 + 单一 slotWidth
 * concentric，live 为线性宽度）与闭合矩形环槽（外侧圆角弧/内侧斜接、无端帽、
 * 单一 slotWidth ring Ø）。两者均通过**视口尺寸标签双击改宽度**验证
 * 「一个尺寸同时驱动两侧」，含 finish+reload。
 */
import { expect, test } from '@playwright/test';
import type { SketchDto, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getFeatureTreeRpc,
  getSketchRpc,
  openSeedImodelEditor,
  releaseWriteLease,
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

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

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

/**
 * 圆弧槽验收（live 2026-11-20 `arc-slot.dxf`）：源弧 R50 + 同心偏移弧 R±Ø/2
 * + 两半圆帽（r=Ø/2，圆心=源弧端点）；原中线保留；新增约束 6 coincident +
 * 2 concentric + 4 tangent + 1 diameter + 1 equal。
 */
function assertArcSlotGeometry(sketch: SketchDto, width: number, initialConstraintIds: ReadonlySet<number>): void {
  const arcs = sketch.entities.filter((e): e is ArcEntity => e.kind === 'arc');
  expect(arcs).toHaveLength(5);
  const half = width / 2;
  const withRadius = (r: number): ArcEntity[] => arcs.filter((a) => Math.abs((a.radius ?? NaN) - r) < 1e-3);
  expect(withRadius(50), '源弧保留').toHaveLength(1);
  expect(withRadius(50 + half), '外侧偏移弧').toHaveLength(1);
  expect(withRadius(50 - half), '内侧偏移弧').toHaveLength(1);
  expect(withRadius(half), '两半圆帽').toHaveLength(2);
  for (const arc of [...withRadius(50 + half), ...withRadius(50 - half)]) {
    expect(dist2d(resolvePointRef(arc.center, sketch.entities), { x: 0, y: 0 }), '偏移弧同心').toBeLessThan(0.2);
  }
  const capCenters = withRadius(half).map((arc) => resolvePointRef(arc.center, sketch.entities));
  expect(capCenters.some((center) => dist2d(center, { x: 50, y: 0 }) < 0.2), '起点帽心=源弧起点').toBe(true);
  expect(capCenters.some((center) => dist2d(center, { x: 0, y: 50 }) < 0.2), '终点帽心=源弧终点').toBe(true);
  const added = sketch.constraints.filter((c) => !initialConstraintIds.has(c.id));
  expect(added.filter((c) => c.kind === 'coincident')).toHaveLength(6);
  expect(added.filter((c) => c.kind === 'concentric')).toHaveLength(2);
  expect(added.filter((c) => c.kind === 'tangent')).toHaveLength(4);
  expect(added.filter((c) => c.kind === 'diameter')).toHaveLength(1);
  expect(added.filter((c) => c.kind === 'equal')).toHaveLength(1);
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

  test('圆弧中线 → 槽（单击拾取）→ Ø20 → Ø30 → reload', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openSeedImodelEditor(page, seed);
    const lease = await borrowWriteLease(ctx, token, 'sketch-slot-arc');

    // 四分之一圆弧 R50（起点 (50,0) 由固定点钉住；XY 平面 = Top 视图）。
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [
        { kind: 'point', id: 1, x: 0, y: 0 },
        { kind: 'arc', id: 2, center: 1, radius: 50, startAngle: 0, sweepAngle: Math.PI / 2 },
        { kind: 'point', id: 3, x: 50, y: 0 },
      ],
      constraints: [
        { kind: 'fixed', id: 100, refs: [1] },
        { kind: 'radius', id: 101, refs: [2], value: 50 },
        { kind: 'fixed', id: 102, refs: [3] },
        { kind: 'coincident', id: 103, refs: [3, { entity: 2, part: 'start' }] },
      ],
      plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '圆弧草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    const row = page.getByTestId(`tree-row-${sketchId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const hub = { x: box.x, y: box.y };
    await setStandardView(page, 0, { low: { x: -20, y: -20, z: -20 }, high: { x: 80, y: 80, z: 20 } });
    await disableSnap(page);

    const readSketch = async (): Promise<SketchDto> => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      expect(sketch).toBeDefined();
      return sketch!;
    };

    // 单击弧中点（45°）→ 槽预览 → Enter 提交。
    await page.getByRole('button', { name: '偏移 ▾' }).click({ timeout: 10_000 });
    await page.getByRole('menuitem', { name: '槽', exact: true }).click();
    await clickWorld(page, hub, { x: 35.35533905932738, y: 35.35533905932738, z: 0 });
    await page.waitForTimeout(700);
    await page.keyboard.press('Enter');

    await expect.poll(async () => (await readSketch()).entities
      .filter((e) => e.kind === 'arc').length, { timeout: 30_000, intervals: [1000, 2000, 5000] }).toBe(5);
    const initialConstraintIds = new Set([100, 101, 102, 103]);
    assertArcSlotGeometry(await readSketch(), 20, initialConstraintIds);

    // Ø 20 → 30：偏移弧 r35/r65、帽 r15。
    const before = await readSketch();
    const diameter = before.constraints.find((c) => c.kind === 'diameter')!;
    const widenLease = await borrowWriteLease(ctx, token, 'sketch-slot-arc-widen');
    const widen = await applyFeatureOpRpc(ctx, {
      kind: 'updateSketchConstraint', sketchId, constraintId: diameter.id, value: 30,
    }, widenLease, token);
    expect(widen.ok, widen.ok ? '' : widen.error).toBe(true);
    await releaseWriteLease(ctx, widenLease, token);
    await expect.poll(async () => (await readSketch()).entities
      .filter((e): e is ArcEntity => e.kind === 'arc')
      .some((arc) => Math.abs((arc.radius ?? 0) - 15) < 1e-3), {
      timeout: 20_000, intervals: [1000, 2000, 5000],
    }).toBe(true);
    assertArcSlotGeometry(await readSketch(), 30, initialConstraintIds);

    await finishSketch(page);
    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    assertArcSlotGeometry(await readSketch(), 30, initialConstraintIds);
  });
});

// ---------------------------------------------------------------------------
// ADR-0023 S2e（2026-11-20）：整圆槽（concentric）+ 闭合环槽（ring）——
// 单一 slotWidth 宽度同时驱动两侧；视口尺寸标签双击改值走 updateSketchConstraint。
// ---------------------------------------------------------------------------

type CircleEntity = Extract<SketchEntityDto, { kind: 'circle' }>;

const byIdOf = (sketch: SketchDto, id: number): SketchEntityDto & { kind: 'line' } => {
  const entity = sketch.entities.find((e) => e.id === id);
  if (!entity || entity.kind !== 'line') throw new Error(`line ${id} 丢失`);
  return entity;
};

const midOfLine = (line: LineEntity, entities: SketchEntityDto[]): { x: number; y: number } => {
  const a = resolvePointRef(line.p1, entities);
  const b = resolvePointRef(line.p2, entities);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
};

/** 点相对源线方向的有符号垂距（只用于判内外两侧，符号约定与库无关）。 */
function signedPerpendicular(line: LineEntity, point: { x: number; y: number }, entities: SketchEntityDto[]): number {
  const a = resolvePointRef(line.p1, entities);
  const b = resolvePointRef(line.p2, entities);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return (dx * (point.y - a.y) - dy * (point.x - a.x)) / Math.hypot(dx, dy);
}

/**
 * 整圆槽验收（ADR-0023 concentric）：源整圆 R 保留 + 内/外同心整圆 R±w/2；
 * 无弧；单一 slotWidth（refs=[源圆,内圆,外圆]），值=线性宽度。
 */
function assertCircleSlotGeometry(
  sketch: SketchDto,
  sourceRadius: number,
  width: number,
  sourceCircleId: number,
): void {
  const circles = sketch.entities.filter((e): e is CircleEntity => e.kind === 'circle');
  expect(circles).toHaveLength(3);
  const radii = circles.map((c) => c.radius ?? NaN).sort((a, b) => a - b);
  expect(radii[0]).toBeCloseTo(sourceRadius - width / 2, 3);
  expect(radii[1]).toBeCloseTo(sourceRadius, 3);
  expect(radii[2]).toBeCloseTo(sourceRadius + width / 2, 3);
  for (const circle of circles) {
    const center = resolvePointRef(circle.center, sketch.entities);
    expect(dist2d(center, { x: 0, y: 0 }), '同心').toBeLessThan(0.2);
  }
  expect(sketch.entities.filter((e) => e.kind === 'arc'), '整圆槽无端帽').toHaveLength(0);
  const slot = sketch.constraints.find((c) => c.kind === 'slotWidth');
  expect(slot, '应有 slotWidth 驱动尺寸').toBeDefined();
  expect(slot!.slotMode).toBe('concentric');
  expect(slot!.value).toBeCloseTo(width, 3);
  expect(slot!.refs).toHaveLength(3);
  expect(slot!.refs[0]).toBe(sourceCircleId);
}

/**
 * 闭合环槽验收（ADR-0023 ring）：n 条中线 + n 条外边界 + n 条内边界 + n 个
 * r=w/2 角弧（弧心=中线顶点）；无端帽；单一 slotWidth（refs=[N 中线,N 外,N 内]），
 * 每条边界到对应中线的垂距 = w/2 且外/内两侧符号相反；原中线保留。
 */
function assertRingSlotGeometry(
  sketch: SketchDto,
  centerlineIds: readonly number[],
  width: number,
): void {
  const n = centerlineIds.length;
  expect(n).toBeGreaterThanOrEqual(3);
  const half = width / 2;
  const lines = sketch.entities.filter((e): e is LineEntity => e.kind === 'line');
  const arcs = sketch.entities.filter((e): e is ArcEntity => e.kind === 'arc');
  expect(lines, '原中线 + 两侧边界').toHaveLength(n + 2 * n);
  expect(arcs, '每个角一条圆角弧').toHaveLength(n);
  for (const arc of arcs)
    expect(arc.radius, '角弧半径 = w/2').toBeCloseTo(half, 3);
  // 角弧圆心 = 中线顶点。
  const centerlines = centerlineIds.map((id) => byIdOf(sketch, id));
  const vertices = centerlines.map((line) => resolvePointRef(line.p1, sketch.entities));
  for (const arc of arcs) {
    const center = resolvePointRef(arc.center, sketch.entities);
    expect(vertices.filter((vertex) => dist2d(vertex, center) < 0.2), '弧心=中线顶点').toHaveLength(1);
  }

  const slot = sketch.constraints.find((c) => c.kind === 'slotWidth');
  expect(slot, '应有 slotWidth 驱动尺寸').toBeDefined();
  expect(slot!.slotMode).toBe('ring');
  expect(slot!.value).toBeCloseTo(width, 3);
  const refs = slot!.refs.map((ref) => (typeof ref === 'number' ? ref : -1));
  expect(refs).toHaveLength(3 * n);
  expect(new Set(refs.slice(0, n))).toEqual(new Set(centerlineIds));
  for (let j = 0; j < n; j++) {
    const source = byIdOf(sketch, refs[j]!);
    const outer = byIdOf(sketch, refs[n + j]!);
    const inner = byIdOf(sketch, refs[2 * n + j]!);
    const outerDistance = signedPerpendicular(source, midOfLine(outer, sketch.entities), sketch.entities);
    const innerDistance = signedPerpendicular(source, midOfLine(inner, sketch.entities), sketch.entities);
    expect(Math.abs(outerDistance), '外边界到中线垂距 = w/2').toBeCloseTo(half, 3);
    expect(Math.abs(innerDistance), '内边界到中线垂距 = w/2').toBeCloseTo(half, 3);
    expect(Math.sign(outerDistance), '内外两侧相反').toBe(-Math.sign(innerDistance));
  }
}

/** 读标注标签并返回其 canvas 相对中心（W10 既有手法：data-center）。 */
async function dimensionLabelCenter(
  page: import('@playwright/test').Page,
  box: { x: number; y: number },
  constraintId: number,
): Promise<{ x: number; y: number }> {
  const marker = page.locator(`[data-testid="sketch-dimension-label"][data-constraint-id="${constraintId}"]`);
  await expect(marker).toBeAttached({ timeout: 30_000 });
  await expect.poll(async () => {
    const parts = ((await marker.getAttribute('data-center')) ?? '').split(',').map(Number);
    return parts.length === 2 && parts.every((value) => Number.isFinite(value));
  }, { timeout: 20_000, intervals: [100, 200, 400] }).toBe(true);
  const parts = ((await marker.getAttribute('data-center')) ?? '').split(',').map(Number);
  return { x: box.x + (parts[0] ?? 0), y: box.y + (parts[1] ?? 0) };
}

test.describe('草图槽工具：整圆/闭合环（ADR-0023 slotWidth）', () => {
  test('整圆中线 → 槽 → 线性宽度 20 → 尺寸标签双击改 30（两侧同步）→ undo/redo → reload', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openSeedImodelEditor(page, seed);
    const lease = await borrowWriteLease(ctx, token, 'sketch-slot-circle');

    // 整圆 R30（固定圆心 + 半径约束；XY 平面 = Top 视图）。
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [
        { kind: 'point', id: 1, x: 0, y: 0 },
        { kind: 'circle', id: 2, center: 1, radius: 30 },
      ],
      constraints: [
        { kind: 'fixed', id: 100, refs: [1] },
        { kind: 'radius', id: 101, refs: [2], value: 30 },
      ],
      plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '整圆草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    const row = page.getByTestId(`tree-row-${sketchId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const hub = { x: box.x, y: box.y };
    await setStandardView(page, 0, { low: { x: -45, y: -45, z: -20 }, high: { x: 45, y: 45, z: 20 } });
    await disableSnap(page);

    const readSketch = async (): Promise<SketchDto> => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      expect(sketch).toBeDefined();
      return sketch!;
    };

    // 偏移 ▾ → 槽 → 点圆（R30 上 (30,0)）→ Enter 提交。
    await page.getByRole('button', { name: '偏移 ▾' }).click({ timeout: 10_000 });
    await page.getByRole('menuitem', { name: '槽', exact: true }).click();
    await clickWorld(page, hub, { x: 30, y: 0, z: 0 });
    await page.waitForTimeout(700);
    await page.keyboard.press('Enter');

    await expect.poll(async () => (await readSketch()).entities
      .filter((e) => e.kind === 'circle').length, { timeout: 30_000, intervals: [1000, 2000, 5000] }).toBe(3);
    const afterInsert = await readSketch();
    assertCircleSlotGeometry(afterInsert, 30, 20, 2);
    const slot = afterInsert.constraints.find((c) => c.kind === 'slotWidth')!;
    const label = page.locator(`[data-testid="sketch-dimension-label"][data-constraint-id="${slot.id}"]`);
    await expect(label).toHaveAttribute('data-text', '20', { timeout: 30_000 });

    // 视口尺寸标签双击 → 线性宽度 20 改 30 → 内/外圆同步 15/45。
    const labelAt = await dimensionLabelCenter(page, box, slot.id);
    await page.mouse.dblclick(labelAt.x, labelAt.y);
    const input = page.getByTestId('sketch-dimension-input');
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill('30');
    await page.getByTestId('sketch-dimension-confirm').click();
    await expect.poll(async () => {
      const circles = (await readSketch()).entities.filter((e): e is CircleEntity => e.kind === 'circle');
      const inner = circles.map((c) => c.radius ?? NaN).sort((a, b) => a - b)[0] ?? NaN;
      return Math.abs(inner - 15);
    }, { timeout: 30_000, intervals: [1000, 2000, 5000] }).toBeLessThan(0.01);
    assertCircleSlotGeometry(await readSketch(), 30, 30, 2);

    // 原生 undo/redo：宽度回 20（20/40）→ 再回 30（15/45）。
    const innerRadius = async (): Promise<number> =>
      (await readSketch()).entities
        .filter((e): e is CircleEntity => e.kind === 'circle')
        .map((c) => c.radius ?? NaN)
        .sort((a, b) => a - b)[0] ?? NaN;
    await page.getByRole('button', { name: '撤消', exact: true }).click();
    await expect.poll(innerRadius, { timeout: 20_000, intervals: [1000, 2000, 5000] }).toBeCloseTo(20, 3);
    assertCircleSlotGeometry(await readSketch(), 30, 20, 2);
    await page.getByRole('button', { name: '重做', exact: true }).click();
    await expect.poll(innerRadius, { timeout: 20_000, intervals: [1000, 2000, 5000] }).toBeCloseTo(15, 3);

    await finishSketch(page);
    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    assertCircleSlotGeometry(await readSketch(), 30, 30, 2);
  });

  test('整圆槽宽度表达式 `5*2`（S2r）→ 宽度 10（25/35）→ 标签 ƒ 10 → 显示表达式开关 → reload', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openSeedImodelEditor(page, seed);
    const lease = await borrowWriteLease(ctx, token, 'sketch-slot-expr');

    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [
        { kind: 'point', id: 1, x: 0, y: 0 },
        { kind: 'circle', id: 2, center: 1, radius: 30 },
      ],
      constraints: [
        { kind: 'fixed', id: 100, refs: [1] },
        { kind: 'radius', id: 101, refs: [2], value: 30 },
      ],
      plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '整圆草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    const row = page.getByTestId(`tree-row-${sketchId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const hub = { x: box.x, y: box.y };
    await setStandardView(page, 0, { low: { x: -45, y: -45, z: -20 }, high: { x: 45, y: 45, z: 20 } });
    await disableSnap(page);

    const readSketch = async (): Promise<SketchDto> => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      expect(sketch).toBeDefined();
      return sketch!;
    };

    await page.getByRole('button', { name: '偏移 ▾' }).click({ timeout: 10_000 });
    await page.getByRole('menuitem', { name: '槽', exact: true }).click();
    await clickWorld(page, hub, { x: 30, y: 0, z: 0 });
    await page.waitForTimeout(700);
    await page.keyboard.press('Enter');

    await expect.poll(async () => (await readSketch()).entities
      .filter((e) => e.kind === 'circle').length, { timeout: 30_000, intervals: [1000, 2000, 5000] }).toBe(3);
    const afterInsert = await readSketch();
    assertCircleSlotGeometry(afterInsert, 30, 20, 2);
    const slot = afterInsert.constraints.find((c) => c.kind === 'slotWidth')!;
    const label = page.locator(`[data-testid="sketch-dimension-label"][data-constraint-id="${slot.id}"]`);
    await expect(label).toHaveAttribute('data-text', '20', { timeout: 30_000 });

    // 标签双击 → 表达式 `5*2` → 后端物化宽度 10（内/外 25/35），标签 `ƒ 10`。
    const labelAt = await dimensionLabelCenter(page, box, slot.id);
    await page.mouse.dblclick(labelAt.x, labelAt.y);
    const input = page.getByTestId('sketch-dimension-input');
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill('5*2');
    await page.getByTestId('sketch-dimension-confirm').click();
    await expect.poll(async () => {
      const value = (await readSketch()).constraints.find((c) => c.kind === 'slotWidth')?.value ?? NaN;
      return Math.abs(value - 10);
    }, { timeout: 30_000, intervals: [1000, 2000, 5000] }).toBeLessThan(0.01);
    const applied = await readSketch();
    assertCircleSlotGeometry(applied, 30, 10, 2);
    const appliedSlot = applied.constraints.find((c) => c.kind === 'slotWidth')!;
    expect(appliedSlot.expression).toBe('5*2');
    // live 2026-11-20 S2o state-183：勾选「显示表达式」→ `ƒ` + 求值；关闭 → 仅数值。
    await expect(label).toHaveAttribute('data-text', 'ƒ 10', { timeout: 30_000 });
    const showExpressions = page.getByRole('checkbox', { name: '显示表达式' });
    await expect(showExpressions).toBeChecked();
    await showExpressions.uncheck();
    await expect(label).toHaveAttribute('data-text', '10', { timeout: 10_000 });
    await showExpressions.check();
    await expect(label).toHaveAttribute('data-text', 'ƒ 10', { timeout: 10_000 });

    // reload 持久：表达式与几何（25/30/35）保持。
    await finishSketch(page);
    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    assertCircleSlotGeometry(await readSketch(), 30, 10, 2);
    expect((await readSketch()).constraints.find((c) => c.kind === 'slotWidth')?.expression).toBe('5*2');
  });

  test('闭合矩形中线 → 槽（预选框选）→ slotWidth·ring Ø20 → 标签双击改 30（内外同步）→ reload', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openSeedImodelEditor(page, seed);
    const lease = await borrowWriteLease(ctx, token, 'sketch-slot-ring');

    // 40×30 闭合矩形（CCW）：4 点 + 4 线；四角固定（RPC 精确，避免鼠标取点误差）。
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [
        { kind: 'point', id: 1, x: 0, y: 0 },
        { kind: 'point', id: 2, x: 40, y: 0 },
        { kind: 'point', id: 3, x: 40, y: 30 },
        { kind: 'point', id: 4, x: 0, y: 30 },
        { kind: 'line', id: 5, p1: 1, p2: 2 },
        { kind: 'line', id: 6, p1: 2, p2: 3 },
        { kind: 'line', id: 7, p1: 3, p2: 4 },
        { kind: 'line', id: 8, p1: 4, p2: 1 },
      ],
      constraints: [
        { kind: 'fixed', id: 100, refs: [1] },
        { kind: 'fixed', id: 101, refs: [2] },
        { kind: 'fixed', id: 102, refs: [3] },
        { kind: 'fixed', id: 103, refs: [4] },
      ],
      plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '闭合矩形草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    const row = page.getByTestId(`tree-row-${sketchId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const hub = { x: box.x, y: box.y };
    await setStandardView(page, 0, { low: { x: -25, y: -25, z: -20 }, high: { x: 65, y: 55, z: 20 } });
    await disableSnap(page);

    const readSketch = async (): Promise<SketchDto> => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      expect(sketch).toBeDefined();
      return sketch!;
    };
    const before = await readSketch();
    const centerlineIds = before.entities.filter((e) => e.kind === 'line').map((e) => e.id);
    expect(centerlineIds).toHaveLength(4);
    const beforeConstraintIds = new Set(before.constraints.map((c) => c.id));

    // 框选 4 段（预选驱动链槽，闭合环 → ring 模式）。
    // 注意：XY 平面（Top）用显式世界点；`P()` 是 Front 口径（world z = −local y），
    // 在 Top 视图下会把框压成零高。
    const projected = await projectWorld(page, hub, [
      { x: -15, y: -15, z: 0 },
      { x: 55, y: 45, z: 0 },
    ]);
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
    const picker = page.getByTestId('sketch-entity-picker');
    // 窗口框选会同时选中 4 条线与 4 个角点（point 实体在 picker 中同样标 part=curve）；
    // 槽工具剔除点实体、只消费曲线（S2e 修复）。断言 4 条中线仍在选择集中。
    const selectedEntries = async (): Promise<Array<[number, string]>> =>
      JSON.parse((await picker.getAttribute('data-selected')) ?? '[]') as Array<[number, string]>;
    const selectedLineIds = async (): Promise<number[]> =>
      (await selectedEntries()).map(([id]) => id).filter((id) => centerlineIds.includes(id));
    await expect.poll(async () => (await selectedLineIds()).length, { timeout: 10_000 }).toBe(4);
    expect((await selectedEntries()).length, '框选曲线+角点').toBe(8);

    await page.getByRole('button', { name: '偏移 ▾' }).click({ timeout: 10_000 });
    await page.getByRole('menuitem', { name: '槽', exact: true }).click();
    await page.waitForTimeout(700);
    expect((await selectedLineIds()).length, '启动工具不得清掉草图预选').toBe(4);
    await page.keyboard.press('Enter');

    await expect.poll(async () => (await readSketch()).entities
      .filter((e) => e.kind === 'arc').length, { timeout: 30_000, intervals: [1000, 2000, 5000] }).toBe(4);
    const afterInsert = await readSketch();
    assertRingSlotGeometry(afterInsert, centerlineIds, 20);
    const added = afterInsert.constraints.filter((c) => !beforeConstraintIds.has(c.id));
    expect(added.filter((c) => c.kind === 'slotWidth')).toHaveLength(1);
    expect(added.filter((c) => c.kind === 'diameter')).toHaveLength(0);
    expect(added.filter((c) => c.kind === 'coincident')).toHaveLength(20);
    expect(added.filter((c) => c.kind === 'parallel')).toHaveLength(8);
    expect(added.filter((c) => c.kind === 'tangent')).toHaveLength(8);

    // 环槽宽度按 live 显示为 Ø（单一尺寸驱动内外两侧）。
    const slot = afterInsert.constraints.find((c) => c.kind === 'slotWidth')!;
    const label = page.locator(`[data-testid="sketch-dimension-label"][data-constraint-id="${slot.id}"]`);
    await expect(label).toHaveAttribute('data-text', '⌀20', { timeout: 30_000 });

    // 标签双击 → 30：外/内两侧同步外移 5 mm。
    const labelAt = await dimensionLabelCenter(page, box, slot.id);
    await page.mouse.dblclick(labelAt.x, labelAt.y);
    const input = page.getByTestId('sketch-dimension-input');
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill('30');
    await page.getByTestId('sketch-dimension-confirm').click();
    await expect.poll(async () => {
      const sketch = await readSketch();
      const arc = sketch.entities.filter((e): e is ArcEntity => e.kind === 'arc')[0];
      return Math.abs((arc?.radius ?? NaN) - 15);
    }, { timeout: 30_000, intervals: [1000, 2000, 5000] }).toBeLessThan(0.01);
    assertRingSlotGeometry(await readSketch(), centerlineIds, 30);

    await finishSketch(page);
    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    assertRingSlotGeometry(await readSketch(), centerlineIds, 30);
  });
});

// ---------------------------------------------------------------------------
// S2i（2026-11-20 live `slot-variants-20261120/state-54..57`）：多条互不相连
// 直线 → 每条线一个槽 + 单个 Ø（全部帽共享同一宽度）。
// ---------------------------------------------------------------------------

/**
 * 多独立线槽验收：n 条中线 + 2n 边界 + 2n 帽弧；每个边界到其所属中线垂距 =
 * halfWidth；单 diameter + (2n-1) 个 equal（全部帽连到同一锚）。
 */
function assertMultiSlotGeometry(
  sketch: SketchDto,
  centerlineIds: readonly number[],
  halfWidth: number,
  initialConstraintIds: ReadonlySet<number>,
): void {
  const n = centerlineIds.length;
  const lines = sketch.entities.filter((e): e is LineEntity => e.kind === 'line');
  const arcs = sketch.entities.filter((e): e is ArcEntity => e.kind === 'arc');
  expect(lines).toHaveLength(n + 2 * n);
  expect(arcs).toHaveLength(2 * n);
  for (const arc of arcs)
    expect(arc.radius, '帽半径 = Ø/2').toBeCloseTo(halfWidth, 3);
  const centerlines = centerlineIds.map((id) => byIdOf(sketch, id));
  const endpoints = centerlines.flatMap((line) => [
    resolvePointRef(line.p1, sketch.entities),
    resolvePointRef(line.p2, sketch.entities),
  ]);
  const centers = arcs.map((arc) => resolvePointRef(arc.center, sketch.entities));
  for (const endpoint of endpoints) {
    expect(centers.filter((center) => dist2d(center, endpoint) < 0.2), '帽心=线端点').toHaveLength(1);
  }
  // 每个边界线与某条中线的垂距 = halfWidth，且投影落在线段范围内。
  const segments = centerlines.map((line) => [
    resolvePointRef(line.p1, sketch.entities),
    resolvePointRef(line.p2, sketch.entities),
  ] as const);
  const centerlineSet = new Set(centerlineIds);
  for (const line of lines.filter((entry) => !centerlineSet.has(entry.id))) {
    const mid = midOfLine(line, sketch.entities);
    const hits = segments.filter(([a, b]) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) return false;
      const distance = Math.abs(dx * (mid.y - a.y) - dy * (mid.x - a.x)) / len;
      const t = ((mid.x - a.x) * dx + (mid.y - a.y) * dy) / (len * len);
      return Math.abs(distance - halfWidth) < 0.1 && t > -0.05 && t < 1.05;
    });
    expect(hits, '边界线到对应中线垂距 = Ø/2').toHaveLength(1);
  }
  const added = sketch.constraints.filter((c) => !initialConstraintIds.has(c.id));
  expect(added.filter((c) => c.kind === 'diameter')).toHaveLength(1);
  expect(added.filter((c) => c.kind === 'equal')).toHaveLength(2 * n - 1);
  const diameter = added.find((c) => c.kind === 'diameter')!;
  expect(diameter.value).toBeCloseTo(halfWidth * 2, 3);
}

test.describe('草图槽工具：多独立线共享单 Ø（ADR-0022 §2.8）', () => {
  test('两条互不相连线 → 槽（预选）→ 单 Ø20 → 改 30 两槽同步 → finish+reload', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openSeedImodelEditor(page, seed);
    const lease = await borrowWriteLease(ctx, token, 'sketch-slot-multi');

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
    const activeToolId = async (): Promise<string | undefined> => page.evaluate(() => {
      const im = (window as any).__lubanE2E?.coreFrontend?.IModelApp;
      const admin = im?._toolAdmin ?? im?.toolAdmin;
      return admin?.primitiveTool?.toolId as string | undefined;
    });

    // 两条互不相连的水平线（上/下各一条；Esc 结束连续绘制后再画第二条）。
    await activate(page, '线');
    await clickWorld(page, hub, P(-50, 50));
    await clickWorld(page, hub, P(50, 50));
    await page.waitForTimeout(800);
    await page.keyboard.press('Escape');
    await expect.poll(activeToolId, { timeout: 15_000, intervals: [200, 400, 800] }).not.toBe('Sketch.Line');
    await activate(page, '线');
    await clickWorld(page, hub, P(-50, -50));
    await clickWorld(page, hub, P(50, -50));
    await page.waitForTimeout(800);
    await page.keyboard.press('Escape');
    await expect.poll(activeToolId, { timeout: 15_000, intervals: [200, 400, 800] }).not.toBe('Sketch.Line');

    const before = await readSketch();
    const centerlineIds = before.entities.filter((e) => e.kind === 'line').map((e) => e.id);
    expect(centerlineIds).toHaveLength(2);
    const beforeConstraintIds = new Set(before.constraints.map((c) => c.id));

    // 框选两条线（两条互不相连；窗口选择）。
    const projected = await projectWorld(page, hub, [P(-70, -70), P(70, 70)]);
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
    const picker = page.getByTestId('sketch-entity-picker');
    const selectedIds = async (): Promise<number[]> =>
      JSON.parse((await picker.getAttribute('data-selected')) ?? '[]') as number[];
    await expect.poll(async () => (await selectedIds()).length, { timeout: 10_000 }).toBe(2);

    await page.getByRole('button', { name: '偏移 ▾' }).click({ timeout: 10_000 });
    await page.getByRole('menuitem', { name: '槽', exact: true }).click();
    await page.waitForTimeout(700);
    expect((await selectedIds()).length, '启动工具不得清掉草图预选').toBe(2);
    await page.keyboard.press('Enter');

    await expect.poll(async () => (await readSketch()).entities
      .filter((e) => e.kind === 'arc').length, { timeout: 30_000, intervals: [1000, 2000, 5000] }).toBe(4);
    const created = await readSketch();
    assertMultiSlotGeometry(created, centerlineIds, 10, beforeConstraintIds);

    // 单个 Ø 20 → 30：两个槽的帽/边界同步（equal 传递）。
    const diameter = created.constraints.find((c) => c.kind === 'diameter')!;
    const widen = await applyFeatureOpRpc(ctx, {
      kind: 'updateSketchConstraint', sketchId: sketchId!, constraintId: diameter.id, value: 30,
    }, lease, token);
    expect(widen.ok, widen.ok ? '' : widen.error).toBe(true);
    await expect.poll(async () => (await readSketch()).entities
      .filter((e): e is ArcEntity => e.kind === 'arc')
      .map((arc) => arc.radius ?? NaN)
      .every((radius) => Math.abs(radius - 15) < 1e-3), {
      timeout: 20_000, intervals: [1000, 2000, 5000],
    }).toBe(true);
    assertMultiSlotGeometry(await readSketch(), centerlineIds, 15, beforeConstraintIds);

    await finishSketch(page);
    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    assertMultiSlotGeometry(await readSketch(), centerlineIds, 15, beforeConstraintIds);
  });
});

// ---------------------------------------------------------------------------
// S2j（2026-11-20 live `concave-slot.dxf`）：凹多边形闭合环槽——逐角判定外侧
// （凸角右弧/左斜接，凹角左弧/右斜接），单个 slotWidth·ring Ø 驱动两侧。
// ---------------------------------------------------------------------------

test.describe('草图槽工具：凹多边形闭合环（ADR-0022 §2.9）', () => {
  test('凹 L 形闭合链 → 槽（预选）→ slotWidth·ring Ø20 → 改 30 两侧同步 → finish+reload', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openSeedImodelEditor(page, seed);
    const lease = await borrowWriteLease(ctx, token, 'sketch-slot-concave');

    // L 形闭合折线（100×80 外框，切掉左上 60×40；P4=(60,40) 为凹角），CCW。
    const pts: Array<[number, number]> = [[0, 0], [100, 0], [100, 80], [60, 80], [60, 40], [0, 40]];
    const entities: SketchEntityDto[] = pts.map(([x, y], index) => ({ kind: 'point', id: index + 1, x, y }));
    const lines: SketchEntityDto[] = pts.map((_, i) => ({ kind: 'line', id: 7 + i, p1: i + 1, p2: ((i + 1) % 6) + 1 }));
    const constraints: SketchDto['constraints'] = pts.map((_, i) => ({ kind: 'fixed', id: 100 + i, refs: [i + 1] }));
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [...entities, ...lines],
      constraints: [...constraints],
      plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '凹 L 形草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    const row = page.getByTestId(`tree-row-${sketchId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const hub = { x: box.x, y: box.y };
    await setStandardView(page, 0, { low: { x: -30, y: -30, z: -20 }, high: { x: 130, y: 110, z: 20 } });
    await disableSnap(page);

    const readSketch = async (): Promise<SketchDto> => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      expect(sketch).toBeDefined();
      return sketch!;
    };
    const before = await readSketch();
    const centerlineIds = before.entities.filter((e) => e.kind === 'line').map((e) => e.id);
    expect(centerlineIds).toHaveLength(6);
    const beforeConstraintIds = new Set(before.constraints.map((c) => c.id));

    // 框选 6 段（XY/Top 平面：显式世界点，P() 是 Front 口径）。
    const projected = await projectWorld(page, hub, [
      { x: -15, y: -15, z: 0 },
      { x: 115, y: 95, z: 0 },
    ]);
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
    const picker = page.getByTestId('sketch-entity-picker');
    const selectedLineIds = async (): Promise<number[]> =>
      (JSON.parse((await picker.getAttribute('data-selected')) ?? '[]') as Array<[number, string]>)
        .map(([id]) => id)
        .filter((id) => centerlineIds.includes(id));
    await expect.poll(async () => (await selectedLineIds()).length, { timeout: 10_000 }).toBe(6);

    await page.getByRole('button', { name: '偏移 ▾' }).click({ timeout: 10_000 });
    await page.getByRole('menuitem', { name: '槽', exact: true }).click();
    await page.waitForTimeout(700);
    expect((await selectedLineIds()).length, '启动工具不得清掉草图预选').toBe(6);
    await page.keyboard.press('Enter');

    await expect.poll(async () => (await readSketch()).entities
      .filter((e) => e.kind === 'arc').length, { timeout: 30_000, intervals: [1000, 2000, 5000] }).toBe(6);
    const afterInsert = await readSketch();
    assertRingSlotGeometry(afterInsert, centerlineIds, 20);
    const slot = afterInsert.constraints.find((c) => c.kind === 'slotWidth')!;
    expect(slot).toBeDefined();
    const added = afterInsert.constraints.filter((c) => !beforeConstraintIds.has(c.id));
    expect(added.filter((c) => c.kind === 'slotWidth')).toHaveLength(1);

    // 单一 Ø 20 → 30：凹/凸两环同步（重新取写租约——草图打开期间应用持有租约）。
    const widenLease = await borrowWriteLease(ctx, token, 'sketch-slot-concave-widen');
    const widen = await applyFeatureOpRpc(ctx, {
      kind: 'updateSketchConstraint', sketchId, constraintId: slot.id, value: 30,
    }, widenLease, token);
    expect(widen.ok, widen.ok ? '' : widen.error).toBe(true);
    await releaseWriteLease(ctx, widenLease, token);
    await expect.poll(async () => (await readSketch()).entities
      .filter((e): e is ArcEntity => e.kind === 'arc')
      .map((arc) => arc.radius ?? NaN)
      .every((radius) => Math.abs(radius - 15) < 1e-3), {
      timeout: 30_000, intervals: [1000, 2000, 5000],
    }).toBe(true);
    assertRingSlotGeometry(await readSketch(), centerlineIds, 30);

    await finishSketch(page);
    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    assertRingSlotGeometry(await readSketch(), centerlineIds, 30);
  });
});

// ---------------------------------------------------------------------------
// S2h（2026-11-20 live `mixed-slot.dxf`）：线+弧混合开放链槽——每段两侧偏移、
// 接缝外侧 r=w/2 转角弧/内侧交点、两端半圆帽、单 Ø 驱动。
// ---------------------------------------------------------------------------

/**
 * 混合链槽验收（基准：线 (0,0)→(100,0) + 弧 c=(50,0) r50 0°→90°）：
 * - 3 线（源+2 边界）、6 弧（源+2 同 R±half 偏移+2 帽+1 转角）；
 * - 帽/转角弧 r=half、弧心=链顶点 (0,0)/(100,0)/(50,50)；
 * - 偏移弧与源弧同心、半径 R±half；线边界到源线垂距 half；
 * - 单 diameter=w、equal 数 = 3-1 = 2。
 */
function assertMixedSlotGeometry(
  sketch: SketchDto,
  width: number,
  sourceLineId: number,
  sourceArcId: number,
  initialConstraintIds: ReadonlySet<number>,
): void {
  const half = width / 2;
  const lines = sketch.entities.filter((e): e is LineEntity => e.kind === 'line');
  const arcs = sketch.entities.filter((e): e is ArcEntity => e.kind === 'arc');
  expect(lines, '源线 + 两条边界').toHaveLength(3);
  expect(arcs, '源弧 + 2 偏移弧 + 2 帽 + 1 转角弧').toHaveLength(6);
  const sourceLine = byIdOf(sketch, sourceLineId);
  const sourceArc = arcs.find((a) => a.id === sourceArcId);
  expect(sourceArc, '源弧保留').toBeDefined();
  expect(sourceArc!.radius).toBeCloseTo(50, 3);
  const sourceCenter = resolvePointRef(sourceArc!.center, sketch.entities);
  expect(dist2d(sourceCenter, { x: 50, y: 0 })).toBeLessThan(0.2);
  // 偏移弧：同心 R±half。
  const offsets = arcs.filter((a) => a.id !== sourceArcId
    && (Math.abs((a.radius ?? NaN) - (50 + half)) < 1e-3 || Math.abs((a.radius ?? NaN) - (50 - half)) < 1e-3));
  expect(offsets, 'R±half 偏移弧').toHaveLength(2);
  for (const offset of offsets)
    expect(dist2d(resolvePointRef(offset.center, sketch.entities), { x: 50, y: 0 })).toBeLessThan(0.2);
  // 帽/转角弧：r=half，弧心 = 链顶点。
  const cornerLike = arcs.filter((a) => Math.abs((a.radius ?? NaN) - half) < 1e-3);
  expect(cornerLike, '两帽 + 一转角').toHaveLength(3);
  const vertices = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 50 }];
  for (const vertex of vertices) {
    const hits = cornerLike
      .map((a) => resolvePointRef(a.center, sketch.entities))
      .filter((center) => dist2d(center, vertex) < 0.2);
    expect(hits, '帽/转角弧心=链顶点').toHaveLength(1);
  }
  // 线边界平行源线、垂距 half（RPC 源线可能是点引用，统一 resolve）。
  const sourceA = resolvePointRef(sourceLine.p1, sketch.entities);
  const sourceB = resolvePointRef(sourceLine.p2, sketch.entities);
  for (const line of lines.filter((l) => l.id !== sourceLineId)) {
    const p = resolvePointRef(line.p1, sketch.entities);
    const dx = sourceB.x - sourceA.x;
    const dy = sourceB.y - sourceA.y;
    const distance = Math.abs(dx * (p.y - sourceA.y) - dy * (p.x - sourceA.x)) / Math.hypot(dx, dy);
    expect(distance, '线边界垂距 = Ø/2').toBeCloseTo(half, 3);
  }
  const added = sketch.constraints.filter((c) => !initialConstraintIds.has(c.id));
  const diameters = added.filter((c) => c.kind === 'diameter');
  expect(diameters).toHaveLength(1);
  expect(diameters[0]!.value).toBeCloseTo(width, 3);
  expect(added.filter((c) => c.kind === 'equal')).toHaveLength(2);
}

test.describe('草图槽工具：线+弧混合链（ADR-0022 §2.10）', () => {
  test('线+弧相连链 → 槽（预选）→ 单 Ø20 → 改 30 → finish+reload', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openSeedImodelEditor(page, seed);
    const lease = await borrowWriteLease(ctx, token, 'sketch-slot-mixed');

    // 线 (0,0)→(100,0) + 弧 c=(50,0) r50 0°→90°（在 (100,0) 相接，转 +90°）。
    const entities: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 100, y: 0 },
      { kind: 'line', id: 3, p1: 1, p2: 2 },
      { kind: 'point', id: 4, x: 50, y: 0 },
      { kind: 'arc', id: 5, center: 4, radius: 50, startAngle: 0, sweepAngle: Math.PI / 2 },
    ];
    const constraints: SketchDto['constraints'] = [
      { kind: 'fixed', id: 100, refs: [1] },
      { kind: 'fixed', id: 101, refs: [4] },
      { kind: 'radius', id: 102, refs: [5], value: 50 },
      { kind: 'coincident', id: 103, refs: [2, { entity: 5, part: 'start' }] },
    ];
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities, constraints, plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '线+弧混合草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    const row = page.getByTestId(`tree-row-${sketchId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const hub = { x: box.x, y: box.y };
    await setStandardView(page, 0, { low: { x: -30, y: -30, z: -20 }, high: { x: 170, y: 90, z: 20 } });
    await disableSnap(page);

    const readSketch = async (): Promise<SketchDto> => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      expect(sketch).toBeDefined();
      return sketch!;
    };
    const before = await readSketch();
    const beforeConstraintIds = new Set(before.constraints.map((c) => c.id));

    // 框选线+弧（XY/Top：显式世界点；点实体会被选中但工具剔除）。
    const projected = await projectWorld(page, hub, [
      { x: -20, y: -20, z: 0 },
      { x: 120, y: 70, z: 0 },
    ]);
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
    const picker = page.getByTestId('sketch-entity-picker');
    const selectedSourceIds = async (): Promise<number[]> =>
      (JSON.parse((await picker.getAttribute('data-selected')) ?? '[]') as Array<[number, string]>)
        .map(([id]) => id)
        .filter((id) => id === 3 || id === 5);
    await expect.poll(async () => (await selectedSourceIds()).length, { timeout: 10_000 }).toBe(2);

    await page.getByRole('button', { name: '偏移 ▾' }).click({ timeout: 10_000 });
    await page.getByRole('menuitem', { name: '槽', exact: true }).click();
    await page.waitForTimeout(700);
    expect((await selectedSourceIds()).length, '启动工具不得清掉草图预选').toBe(2);
    await page.keyboard.press('Enter');

    await expect.poll(async () => (await readSketch()).entities
      .filter((e) => e.kind === 'arc').length, { timeout: 30_000, intervals: [1000, 2000, 5000] }).toBe(6);
    const createdSketch = await readSketch();
    assertMixedSlotGeometry(createdSketch, 20, 3, 5, beforeConstraintIds);

    // 单 Ø 20 → 30（重新取写租约）。
    const diameter = createdSketch.constraints.find((c) => c.kind === 'diameter')!;
    const widenLease = await borrowWriteLease(ctx, token, 'sketch-slot-mixed-widen');
    const widen = await applyFeatureOpRpc(ctx, {
      kind: 'updateSketchConstraint', sketchId, constraintId: diameter.id, value: 30,
    }, widenLease, token);
    expect(widen.ok, widen.ok ? '' : widen.error).toBe(true);
    await releaseWriteLease(ctx, widenLease, token);
    await expect.poll(async () => (await readSketch()).entities
      .filter((e): e is ArcEntity => e.kind === 'arc')
      .filter((arc) => Math.abs((arc.radius ?? NaN) - 15) < 1e-3).length, {
      timeout: 30_000, intervals: [1000, 2000, 5000],
    }).toBe(3);
    assertMixedSlotGeometry(await readSketch(), 30, 3, 5, beforeConstraintIds);

    await finishSketch(page);
    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    assertMixedSlotGeometry(await readSketch(), 30, 3, 5, beforeConstraintIds);
  });
});

// ---------------------------------------------------------------------------
// S2m 单毂分支链槽（live 2026-11-20 `branch-slot.dxf`：stadium 并集轮廓）
// ---------------------------------------------------------------------------

/**
 * 分支链槽验收（基准 Y：毂 (0,0)，尖端 (−40,20)/(40,20)/(0,−40)，Ø20）：
 * - 源 3 线保留；新增 6 条偏移边界线 + 3 个尖端半圆帽（r=half，圆心=尖端）；
 * - 无转角弧（毂部三对偏移线直接斜接）；单 diameter + 2 equal；
 * - 6 parallel + 6 tangent + 12 coincident。
 */
function assertBranchSlotGeometry(
  sketch: SketchDto,
  width: number,
  sourceIds: readonly number[],
  initialConstraintIds: ReadonlySet<number>,
): void {
  const half = width / 2;
  const lines = sketch.entities.filter((e): e is LineEntity => e.kind === 'line');
  const arcs = sketch.entities.filter((e): e is ArcEntity => e.kind === 'arc');
  expect(lines, '源 3 线 + 6 边界').toHaveLength(9);
  expect(arcs, '三尖端半圆帽（无转角弧）').toHaveLength(3);
  for (const arc of arcs)
    expect(arc.radius, '帽半径 = Ø/2').toBeCloseTo(half, 3);
  const tips = [{ x: -40, y: 20 }, { x: 40, y: 20 }, { x: 0, y: -40 }];
  const centers = arcs.map((arc) => resolvePointRef(arc.center, sketch.entities));
  for (const tip of tips)
    expect(centers.filter((center) => dist2d(center, tip) < 0.2), '帽心=源线尖端').toHaveLength(1);
  // 每条边界线到唯一一条源臂的垂距 = half（斜接/帽端点由约束驱动）。
  const arms = sourceIds.map((id) => byIdOf(sketch, id));
  const segments = arms.map((line) => [
    resolvePointRef(line.p1, sketch.entities),
    resolvePointRef(line.p2, sketch.entities),
  ] as const);
  const sourceSet = new Set(sourceIds);
  for (const line of lines.filter((l) => !sourceSet.has(l.id))) {
    const a = resolvePointRef(line.p1, sketch.entities);
    const b = resolvePointRef(line.p2, sketch.entities);
    const ldx = b.x - a.x;
    const ldy = b.y - a.y;
    const lineLen = Math.hypot(ldx, ldy);
    if (lineLen < 1e-9) throw new Error('边界线退化');
    const hits = segments.filter(([s, e]) => {
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) return false;
      // 对称 Y 中一条边界线可能同时与两条臂等距；必须还与其臂平行。
      const parallel = Math.abs((dx * ldy - dy * ldx) / (len * lineLen)) < 1e-6;
      const distance = Math.abs(dx * (a.y - s.y) - dy * (a.x - s.x)) / len;
      return Math.abs(distance - half) < 0.1 && parallel;
    });
    expect(hits, '边界线平行其臂且垂距 = Ø/2').toHaveLength(1);
  }
  const added = sketch.constraints.filter((c) => !initialConstraintIds.has(c.id));
  const diameters = added.filter((c) => c.kind === 'diameter');
  expect(diameters, '单 Ø').toHaveLength(1);
  expect(diameters[0]!.value).toBeCloseTo(width, 3);
  expect(added.filter((c) => c.kind === 'equal')).toHaveLength(2);
  expect(added.filter((c) => c.kind === 'parallel')).toHaveLength(6);
  expect(added.filter((c) => c.kind === 'tangent')).toHaveLength(6);
  expect(added.filter((c) => c.kind === 'coincident')).toHaveLength(12);
  expect(added.filter((c) => c.kind === 'slotWidth')).toHaveLength(0);
}

test.describe('草图槽工具：单毂分支链（ADR-0022 §2.11）', () => {
  test('Y 分支三线共点 → 槽（预选）→ 单 Ø20 → 改 30 → finish+reload', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openSeedImodelEditor(page, seed);
    const lease = await borrowWriteLease(ctx, token, 'sketch-slot-branch');

    // 毂 (0,0)；臂 A(−40,20)/B(40,20)/C(0,−40)；三线共点（RPC 精确）。
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [
        { kind: 'point', id: 1, x: 0, y: 0 },
        { kind: 'point', id: 2, x: -40, y: 20 },
        { kind: 'point', id: 3, x: 40, y: 20 },
        { kind: 'point', id: 4, x: 0, y: -40 },
        { kind: 'line', id: 5, p1: 1, p2: 2 },
        { kind: 'line', id: 6, p1: 1, p2: 3 },
        { kind: 'line', id: 7, p1: 1, p2: 4 },
      ],
      constraints: [
        { kind: 'fixed', id: 100, refs: [1] },
        { kind: 'fixed', id: 101, refs: [2] },
        { kind: 'fixed', id: 102, refs: [3] },
        { kind: 'fixed', id: 103, refs: [4] },
      ],
      plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, 'Y 分支草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    const row = page.getByTestId(`tree-row-${sketchId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const hub = { x: box.x, y: box.y };
    await setStandardView(page, 0, { low: { x: -60, y: -60, z: -20 }, high: { x: 60, y: 40, z: 20 } });
    await disableSnap(page);

    const readSketch = async (): Promise<SketchDto> => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      expect(sketch).toBeDefined();
      return sketch!;
    };
    const before = await readSketch();
    const sourceIds = before.entities.filter((e) => e.kind === 'line').map((e) => e.id);
    expect(sourceIds).toHaveLength(3);
    const beforeConstraintIds = new Set(before.constraints.map((c) => c.id));

    // 框选三条臂（点实体一并选中，工具剔除）。
    const projected = await projectWorld(page, hub, [
      { x: -55, y: -55, z: 0 },
      { x: 55, y: 35, z: 0 },
    ]);
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
    const picker = page.getByTestId('sketch-entity-picker');
    const selectedSourceIds = async (): Promise<number[]> =>
      (JSON.parse((await picker.getAttribute('data-selected')) ?? '[]') as Array<[number, string]>)
        .map(([id]) => id)
        .filter((id) => sourceIds.includes(id));
    await expect.poll(async () => (await selectedSourceIds()).length, { timeout: 10_000 }).toBe(3);

    await page.getByRole('button', { name: '偏移 ▾' }).click({ timeout: 10_000 });
    await page.getByRole('menuitem', { name: '槽', exact: true }).click();
    await page.waitForTimeout(700);
    expect((await selectedSourceIds()).length, '启动工具不得清掉草图预选').toBe(3);
    await page.keyboard.press('Enter');

    await expect.poll(async () => (await readSketch()).entities
      .filter((e) => e.kind === 'arc').length, { timeout: 30_000, intervals: [1000, 2000, 5000] }).toBe(3);
    const afterInsert = await readSketch();
    assertBranchSlotGeometry(afterInsert, 20, sourceIds, beforeConstraintIds);

    // 单 Ø 20 → 30（重新取写租约）。
    const diameter = afterInsert.constraints.find((c) => c.kind === 'diameter')!;
    const widenLease = await borrowWriteLease(ctx, token, 'sketch-slot-branch-widen');
    const widen = await applyFeatureOpRpc(ctx, {
      kind: 'updateSketchConstraint', sketchId, constraintId: diameter.id, value: 30,
    }, widenLease, token);
    expect(widen.ok, widen.ok ? '' : widen.error).toBe(true);
    await releaseWriteLease(ctx, widenLease, token);
    await expect.poll(async () => (await readSketch()).entities
      .filter((e): e is ArcEntity => e.kind === 'arc')
      .filter((arc) => Math.abs((arc.radius ?? NaN) - 15) < 1e-3).length, {
      timeout: 30_000, intervals: [1000, 2000, 5000],
    }).toBe(3);
    assertBranchSlotGeometry(await readSketch(), 30, sourceIds, beforeConstraintIds);

    await finishSketch(page);
    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    assertBranchSlotGeometry(await readSketch(), 30, sourceIds, beforeConstraintIds);
  });
});

// ---------------------------------------------------------------------------
// S2n 闭合 line+arc 混合环槽（live 2026-11-20 `closed-mix3-slot.dxf`）
// ---------------------------------------------------------------------------

/**
 * 闭合混合环槽验收（基准：半圆源弧 r40 + 直径源线，Ø20）：
 * - 源弧/源线保留；新增 2 偏移弧（r40±half，同心）+ 2 平行线（y=±half）+ 2 外角弧（r=half）；
 * - 内圈线两端由内弧交点裁剪（|x| = sqrt((40−half)²−half²)）；无端帽；
 * - 单 slotWidth（ring，refs 6：2 源 + 2 侧 + 2 侧）+ 2 concentric + 2 parallel。
 */
function assertClosedMixedRingGeometry(
  sketch: SketchDto,
  width: number,
  initialConstraintIds: ReadonlySet<number>,
): void {
  const half = width / 2;
  const lines = sketch.entities.filter((e): e is LineEntity => e.kind === 'line');
  const arcs = sketch.entities.filter((e): e is ArcEntity => e.kind === 'arc');
  expect(lines, '源线 + 2 边界').toHaveLength(3);
  expect(arcs, '源弧 + 2 偏移弧 + 2 角弧').toHaveLength(5);
  const sourceArc = arcs.find((a) => Math.abs((a.radius ?? NaN) - 40) < 1e-3);
  expect(sourceArc, '源弧保留').toBeDefined();
  expect(dist2d(resolvePointRef(sourceArc!.center, sketch.entities), { x: 0, y: 0 })).toBeLessThan(0.2);
  const outer = arcs.find((a) => Math.abs((a.radius ?? NaN) - (40 + half)) < 1e-3);
  const inner = arcs.find((a) => Math.abs((a.radius ?? NaN) - (40 - half)) < 1e-3);
  expect(outer, '外偏移弧 r(40+half)').toBeDefined();
  expect(inner, '内偏移弧 r(40−half)').toBeDefined();
  for (const arc of [outer!, inner!])
    expect(dist2d(resolvePointRef(arc.center, sketch.entities), { x: 0, y: 0 }), '偏移弧同心').toBeLessThan(0.2);
  const corners = arcs.filter((a) => Math.abs((a.radius ?? NaN) - half) < 1e-3);
  expect(corners, '两外角弧 r=half（无端帽）').toHaveLength(2);
  const cornersCenters = corners.map((a) => resolvePointRef(a.center, sketch.entities));
  expect(cornersCenters.some((c) => dist2d(c, { x: 40, y: 0 }) < 0.2)).toBe(true);
  expect(cornersCenters.some((c) => dist2d(c, { x: -40, y: 0 }) < 0.2)).toBe(true);
  // 线：源 y=0；外 y=−half（整段）；内 y=+half（两端按内弧交点裁剪）。
  const coords = lines.map((l) => [
    resolvePointRef(l.p1, sketch.entities),
    resolvePointRef(l.p2, sketch.entities),
  ] as const);
  const atY = (y: number) => coords.filter(([a, b]) => Math.abs(a.y - y) < 0.2 && Math.abs(b.y - y) < 0.2);
  expect(atY(0), '源线').toHaveLength(1);
  expect(atY(-half), '外边界线').toHaveLength(1);
  expect(atY(half), '内边界线').toHaveLength(1);
  const innerLine = coords.find(([a, b]) => Math.abs(a.y - half) < 0.2 && Math.abs(b.y - half) < 0.2)!;
  const expectedX = Math.sqrt((40 - half) ** 2 - half ** 2);
  expect(Math.min(innerLine[0].x, innerLine[1].x)).toBeCloseTo(-expectedX, 1);
  expect(Math.max(innerLine[0].x, innerLine[1].x)).toBeCloseTo(expectedX, 1);
  // 单一 slotWidth（ring）驱动两侧；弧边界 v1.84。
  const added = sketch.constraints.filter((c) => !initialConstraintIds.has(c.id));
  const slots = added.filter((c) => c.kind === 'slotWidth');
  expect(slots).toHaveLength(1);
  expect(slots[0]!.slotMode).toBe('ring');
  expect(slots[0]!.value).toBeCloseTo(width, 3);
  expect(slots[0]!.refs).toHaveLength(6);
  expect(added.filter((c) => c.kind === 'diameter')).toHaveLength(0);
  expect(added.filter((c) => c.kind === 'concentric')).toHaveLength(2);
  expect(added.filter((c) => c.kind === 'parallel')).toHaveLength(2);
  expect(added.filter((c) => c.kind === 'tangent')).toHaveLength(4);
  expect(added.filter((c) => c.kind === 'coincident')).toHaveLength(10);
}

test.describe('草图槽工具：闭合 line+arc 混合环（ADR-0022 §2.12 / v1.84）', () => {
  test('半圆弧+直径线闭环 → 槽（预选）→ Ø20 → 标签双击改 30（弧/线两侧同步）→ reload', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openSeedImodelEditor(page, seed);
    const lease = await borrowWriteLease(ctx, token, 'sketch-slot-closed-mixed');

    // 上半圆源弧 r40（A(40,0)→B(−40,0) CCW）+ 直径源线 B→A；闭环 CCW。
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [
        { kind: 'point', id: 1, x: 0, y: 0 },
        { kind: 'point', id: 2, x: 40, y: 0 },
        { kind: 'point', id: 3, x: -40, y: 0 },
        { kind: 'arc', id: 5, center: 1, radius: 40, startAngle: 0, sweepAngle: Math.PI },
        { kind: 'line', id: 6, p1: 3, p2: 2 },
      ],
      constraints: [
        { kind: 'fixed', id: 100, refs: [1] },
        { kind: 'fixed', id: 101, refs: [2] },
        { kind: 'fixed', id: 102, refs: [3] },
        { kind: 'radius', id: 103, refs: [5], value: 40 },
        { kind: 'coincident', id: 104, refs: [2, { entity: 5, part: 'start' }] },
        { kind: 'coincident', id: 105, refs: [3, { entity: 5, part: 'end' }] },
      ],
      plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '闭合 line+arc 草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    const row = page.getByTestId(`tree-row-${sketchId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const hub = { x: box.x, y: box.y };
    await setStandardView(page, 0, { low: { x: -50, y: -20, z: -20 }, high: { x: 50, y: 50, z: 20 } });
    await disableSnap(page);

    const readSketch = async (): Promise<SketchDto> => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      expect(sketch).toBeDefined();
      return sketch!;
    };
    const before = await readSketch();
    const beforeConstraintIds = new Set(before.constraints.map((c) => c.id));
    expect(before.entities.filter((e) => e.kind === 'arc')).toHaveLength(1);
    expect(before.entities.filter((e) => e.kind === 'line')).toHaveLength(1);

    // 窗口框选整个闭环（顶点/圆心点会被选中，工具剔除）。
    const projected = await projectWorld(page, hub, [
      { x: -50, y: -20, z: 0 },
      { x: 50, y: 50, z: 0 },
    ]);
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
    const picker = page.getByTestId('sketch-entity-picker');
    const selectedIds = async (): Promise<number[]> =>
      (JSON.parse((await picker.getAttribute('data-selected')) ?? '[]') as Array<[number, string]>)
        .map(([id]) => id)
        .filter((id) => id === 5 || id === 6);
    await expect.poll(async () => (await selectedIds()).length, { timeout: 10_000 }).toBe(2);

    await page.getByRole('button', { name: '偏移 ▾' }).click({ timeout: 10_000 });
    await page.getByRole('menuitem', { name: '槽', exact: true }).click();
    await page.waitForTimeout(700);
    expect((await selectedIds()).length, '启动工具不得清掉草图预选').toBe(2);
    await page.keyboard.press('Enter');

    await expect.poll(async () => (await readSketch()).entities
      .filter((e) => e.kind === 'arc').length, { timeout: 30_000, intervals: [1000, 2000, 5000] }).toBe(5);
    const afterInsert = await readSketch();
    assertClosedMixedRingGeometry(afterInsert, 20, beforeConstraintIds);

    // 环槽宽度按 live 显示为 Ø（单一尺寸驱动弧/线两侧）。
    const slot = afterInsert.constraints.find((c) => c.kind === 'slotWidth')!;
    const label = page.locator(`[data-testid="sketch-dimension-label"][data-constraint-id="${slot.id}"]`);
    await expect(label).toHaveAttribute('data-text', '⌀20', { timeout: 30_000 });

    // 标签双击 → 30：弧 R±15、线 ±15、角弧 r15。
    const labelAt = await dimensionLabelCenter(page, box, slot.id);
    await page.mouse.dblclick(labelAt.x, labelAt.y);
    const input = page.getByTestId('sketch-dimension-input');
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill('30');
    await page.getByTestId('sketch-dimension-confirm').click();
    await expect.poll(async () => {
      const sketch = await readSketch();
      return sketch.entities.filter((e): e is ArcEntity => e.kind === 'arc')
        .some((arc) => Math.abs((arc.radius ?? NaN) - 25) < 0.01);
    }, { timeout: 30_000, intervals: [1000, 2000, 5000] }).toBe(true);
    assertClosedMixedRingGeometry(await readSketch(), 30, beforeConstraintIds);

    await finishSketch(page);
    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    assertClosedMixedRingGeometry(await readSketch(), 30, beforeConstraintIds);
  });
});

// ---------------------------------------------------------------------------
// S2p 线树槽（live 2026-11-20 S2o 宽缺口分支）：毂弧 = 180° − 最小臂锥角
// ---------------------------------------------------------------------------

/** 宽缺口分支槽验收（live case A：毂 P，三臂锥 59.05°/30.00°/−3.69° → 毂弧 117.255°）。 */
function assertWideGapTreeSlotGeometry(
  sketch: SketchDto,
  width: number,
  initialConstraintIds: ReadonlySet<number>,
): void {
  const half = width / 2;
  const lines = sketch.entities.filter((e): e is LineEntity => e.kind === 'line');
  const arcs = sketch.entities.filter((e): e is ArcEntity => e.kind === 'arc');
  expect(lines, '源 3 线 + 6 边界').toHaveLength(9);
  expect(arcs, '3 尖端帽 + 1 绕毂弧').toHaveLength(4);
  for (const arc of arcs)
    expect(arc.radius, '所有弧半径 = Ø/2').toBeCloseTo(half, 3);
  const P = { x: -46.221, y: -43.610 };
  const tips = [{ x: -13.889, y: 10.316 }, { x: 6.667, y: -13.075 }, { x: 19.699, y: -47.861 }];
  const arcsAtTip = arcs.filter((arc) => {
    const center = resolvePointRef(arc.center, sketch.entities);
    return tips.some((tip) => dist2d(center, tip) < 0.2);
  });
  expect(arcsAtTip, '3 尖端帽圆心=臂尖端').toHaveLength(3);
  const hubArc = arcs.find((arc) => {
    const center = resolvePointRef(arc.center, sketch.entities);
    return dist2d(center, P) < 0.2;
  });
  expect(hubArc, '绕毂弧圆心=毂').toBeDefined();
  // live 毂弧几何：起点 149.055°、扫 117.255°（与宽度无关）。
  const startDeg = ((((hubArc!.startAngle ?? NaN) * 180) / Math.PI) + 360) % 360;
  const sweepDeg = ((((hubArc!.sweepAngle ?? NaN) * 180) / Math.PI) + 360) % 360;
  expect(startDeg).toBeCloseTo(149.055, 2);
  expect(sweepDeg).toBeCloseTo(117.255, 2);
  const added = sketch.constraints.filter((c) => !initialConstraintIds.has(c.id));
  const diameters = added.filter((c) => c.kind === 'diameter');
  expect(diameters, '单 Ø').toHaveLength(1);
  expect(diameters[0]!.value).toBeCloseTo(width, 3);
  expect(added.filter((c) => c.kind === 'equal')).toHaveLength(3);
  expect(added.filter((c) => c.kind === 'parallel')).toHaveLength(6);
  expect(added.filter((c) => c.kind === 'tangent')).toHaveLength(8);
  expect(added.filter((c) => c.kind === 'slotWidth')).toHaveLength(0);
}

test.describe('草图槽工具：宽缺口分支线树（ADR-0022 §2.11 扩展 / S2p）', () => {
  test('宽缺口 Y 分支 → 槽（预选）→ 毂弧 117.255° → Ø20→30 全弧 r15 → finish+reload', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openSeedImodelEditor(page, seed);
    const lease = await borrowWriteLease(ctx, token, 'sketch-slot-tree');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [
        { kind: 'point', id: 1, x: -46.221, y: -43.61 },
        { kind: 'point', id: 2, x: -13.889, y: 10.316 },
        { kind: 'point', id: 3, x: 6.667, y: -13.075 },
        { kind: 'point', id: 4, x: 19.699, y: -47.861 },
        { kind: 'line', id: 5, p1: 1, p2: 2 },
        { kind: 'line', id: 6, p1: 1, p2: 3 },
        { kind: 'line', id: 7, p1: 1, p2: 4 },
      ],
      constraints: [
        { kind: 'fixed', id: 100, refs: [1] },
        { kind: 'fixed', id: 101, refs: [2] },
        { kind: 'fixed', id: 102, refs: [3] },
        { kind: 'fixed', id: 103, refs: [4] },
      ],
      plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '宽缺口分支草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    const row = page.getByTestId(`tree-row-${sketchId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const hub = { x: box.x, y: box.y };
    await setStandardView(page, 0, { low: { x: -80, y: -85, z: -20 }, high: { x: 40, y: 40, z: 20 } });
    await disableSnap(page);

    const readSketch = async (): Promise<SketchDto> => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      expect(sketch).toBeDefined();
      return sketch!;
    };
    const before = await readSketch();
    const sourceIds = before.entities.filter((e) => e.kind === 'line').map((e) => e.id);
    expect(sourceIds).toHaveLength(3);
    const beforeConstraintIds = new Set(before.constraints.map((c) => c.id));

    const projected = await projectWorld(page, hub, [
      { x: -75, y: -80, z: 0 },
      { x: 35, y: 35, z: 0 },
    ]);
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
    const picker = page.getByTestId('sketch-entity-picker');
    const selectedSourceIds = async (): Promise<number[]> =>
      (JSON.parse((await picker.getAttribute('data-selected')) ?? '[]') as Array<[number, string]>)
        .map(([id]) => id)
        .filter((id) => sourceIds.includes(id));
    await expect.poll(async () => (await selectedSourceIds()).length, { timeout: 10_000 }).toBe(3);

    await page.getByRole('button', { name: '偏移 ▾' }).click({ timeout: 10_000 });
    await page.getByRole('menuitem', { name: '槽', exact: true }).click();
    await page.waitForTimeout(700);
    expect((await selectedSourceIds()).length, '启动工具不得清掉草图预选').toBe(3);
    await page.keyboard.press('Enter');

    await expect.poll(async () => (await readSketch()).entities
      .filter((e) => e.kind === 'arc').length, { timeout: 30_000, intervals: [1000, 2000, 5000] }).toBe(4);
    const afterInsert = await readSketch();
    assertWideGapTreeSlotGeometry(afterInsert, 20, beforeConstraintIds);

    const diameter = afterInsert.constraints.find((c) => c.kind === 'diameter')!;
    const widenLease = await borrowWriteLease(ctx, token, 'sketch-slot-tree-widen');
    const widen = await applyFeatureOpRpc(ctx, {
      kind: 'updateSketchConstraint', sketchId, constraintId: diameter.id, value: 30,
    }, widenLease, token);
    expect(widen.ok, widen.ok ? '' : widen.error).toBe(true);
    await releaseWriteLease(ctx, widenLease, token);
    await expect.poll(async () => (await readSketch()).entities
      .filter((e): e is ArcEntity => e.kind === 'arc')
      .filter((arc) => Math.abs((arc.radius ?? NaN) - 15) < 1e-3).length, {
      timeout: 30_000, intervals: [1000, 2000, 5000],
    }).toBe(4);
    assertWideGapTreeSlotGeometry(await readSketch(), 30, beforeConstraintIds);

    await finishSketch(page);
    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    assertWideGapTreeSlotGeometry(await readSketch(), 30, beforeConstraintIds);
  });
});

// ---------------------------------------------------------------------------
// S2q 多连通分量联动等宽槽（live 2026-11-20 S2o C：弧 + 不相连直线）
// ---------------------------------------------------------------------------

function assertComponentsSlotGeometry(sketch: SketchDto, width: number, initialConstraintIds: ReadonlySet<number>): void {
  const half = width / 2;
  const lines = sketch.entities.filter((e): e is LineEntity => e.kind === 'line');
  const arcs = sketch.entities.filter((e): e is ArcEntity => e.kind === 'arc');
  expect(lines, '源线保留 + 线体育场两边界').toHaveLength(3);
  expect(arcs, '源弧保留 + 弧槽偏移 2 + 弧帽 2 + 线帽 2').toHaveLength(7);
  // 源弧（id=2，R30 中线）不参与断言；其余新增弧：4 个帽 = w/2、弧槽两偏移
  // = R±w/2（同心等宽；跨分量 equal 驱动线槽帽同步）。
  const addedRadii = arcs.filter((a) => a.id !== 2)
    .map((a) => Math.round((a.radius ?? NaN) * 1000) / 1000)
    .sort((a, b) => a - b);
  const expectedRadii = [half, half, half, half, 30 - half, 30 + half]
    .map((r) => Math.round(r * 1000) / 1000)
    .sort((a, b) => a - b);
  expect(addedRadii, '两侧分量同宽（跨分量 equal）').toEqual(expectedRadii);
  const added = sketch.constraints.filter((c) => !initialConstraintIds.has(c.id));
  expect(added.filter((c) => c.kind === 'diameter'), '单 Ø').toHaveLength(1);
  expect(added.filter((c) => c.kind === 'equal')).toHaveLength(3);
  expect(added.filter((c) => c.kind === 'concentric')).toHaveLength(2);
  expect(added.filter((c) => c.kind === 'parallel')).toHaveLength(2);
  expect(added.filter((c) => c.kind === 'tangent')).toHaveLength(8);
}

test.describe('草图槽工具：多连通分量共享单 Ø（ADR-0022 §2.8 扩展 / S2q）', () => {
  test('弧 + 不相连直线 → 两槽（预选）→ 单 Ø20 同步 → Ø30 全部 r15 → finish+reload', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openSeedImodelEditor(page, seed);
    const lease = await borrowWriteLease(ctx, token, 'sketch-slot-components');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [
        { kind: 'point', id: 1, x: 0, y: 0 },
        { kind: 'arc', id: 2, center: 1, radius: 30, startAngle: 0, sweepAngle: Math.PI },
        { kind: 'point', id: 3, x: 100, y: 0 },
        { kind: 'point', id: 4, x: 160, y: 0 },
        { kind: 'line', id: 5, p1: 3, p2: 4 },
      ],
      constraints: [
        { kind: 'fixed', id: 100, refs: [1] },
        { kind: 'radius', id: 101, refs: [2], value: 30 },
      ],
      plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '弧+线草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    const row = page.getByTestId(`tree-row-${sketchId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const hub = { x: box.x, y: box.y };
    await setStandardView(page, 0, { low: { x: -40, y: -40, z: -20 }, high: { x: 170, y: 50, z: 20 } });
    await disableSnap(page);

    const readSketch = async (): Promise<SketchDto> => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      expect(sketch).toBeDefined();
      return sketch!;
    };
    const before = await readSketch();
    const beforeConstraintIds = new Set(before.constraints.map((c) => c.id));

    const projected = await projectWorld(page, hub, [
      { x: -35, y: -35, z: 0 },
      { x: 165, y: 40, z: 0 },
    ]);
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
    const picker = page.getByTestId('sketch-entity-picker');
    const selectedSourceIds = async (): Promise<number[]> =>
      (JSON.parse((await picker.getAttribute('data-selected')) ?? '[]') as Array<[number, string]>)
        .map(([id]) => id)
        .filter((id) => id === 2 || id === 5);
    await expect.poll(async () => (await selectedSourceIds()).length, { timeout: 10_000 }).toBe(2);

    await page.getByRole('button', { name: '偏移 ▾' }).click({ timeout: 10_000 });
    await page.getByRole('menuitem', { name: '槽', exact: true }).click();
    await page.waitForTimeout(700);

    expect((await selectedSourceIds()).length, '启动工具不得清掉草图预选').toBe(2);
    await page.keyboard.press('Enter');

    await expect.poll(async () => (await readSketch()).entities
      .filter((e) => e.kind === 'arc').length, { timeout: 30_000, intervals: [1000, 2000, 5000] }).toBe(7);
    const afterInsert = await readSketch();
    assertComponentsSlotGeometry(afterInsert, 20, beforeConstraintIds);

    const diameter = afterInsert.constraints.find((c) => c.kind === 'diameter')!;
    const widenLease = await borrowWriteLease(ctx, token, 'sketch-slot-components-widen');
    const widen = await applyFeatureOpRpc(ctx, {
      kind: 'updateSketchConstraint', sketchId, constraintId: diameter.id, value: 30,
    }, widenLease, token);
    expect(widen.ok, widen.ok ? '' : widen.error).toBe(true);
    await releaseWriteLease(ctx, widenLease, token);
    await expect.poll(async () => (await readSketch()).constraints
      .find((c) => c.kind === 'diameter')?.value ?? NaN, {
      timeout: 30_000, intervals: [1000, 2000, 5000],
    }).toBeCloseTo(30, 3);
    assertComponentsSlotGeometry(await readSketch(), 30, beforeConstraintIds);

    await finishSketch(page);
    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    assertComponentsSlotGeometry(await readSketch(), 30, beforeConstraintIds);
  });
});

// ---------------------------------------------------------------------------
// S2r 变量驱动槽宽（ADR-0020 S2r / ADR-0023）：变量表 UI 编辑 → 草图重解 → ƒ 标签
// ---------------------------------------------------------------------------

test.describe('草图槽工具：slotWidth 变量驱动（ADR-0020 S2r / ADR-0023）', () => {
  test('变量 w=10 → 槽宽 #w*2（ƒ 20）→ 变量表改 15 → 宽 30（15/45）→ reopen+reload', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 360_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openSeedImodelEditor(page, seed);

    // 变量 w=10（RPC 种子；编辑走变量表 UI）。
    const varLease = await borrowWriteLease(ctx, token, 'sketch-slot-var-seed');
    const seeded = await applyFeatureOpRpc(ctx, {
      kind: 'updateVariables',
      variables: [{ id: 'v-w', name: 'w', expression: '10', type: 'length' }],
    }, varLease, token);
    assertFeatureOpOk(seeded, '变量 w=10');
    await releaseWriteLease(ctx, varLease, token);

    // 整圆 R30（固定圆心 + 半径约束）。
    const sketchLease = await borrowWriteLease(ctx, token, 'sketch-slot-var-sketch');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [
        { kind: 'point', id: 1, x: 0, y: 0 },
        { kind: 'circle', id: 2, center: 1, radius: 30 },
      ],
      constraints: [
        { kind: 'fixed', id: 100, refs: [1] },
        { kind: 'radius', id: 101, refs: [2], value: 30 },
      ],
      plane: XY_PLANE,
    }, sketchLease, token);
    assertFeatureOpOk(created, '整圆草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, sketchLease, token);

    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    const variableRow = page.getByTestId('tree-variable-v-w');
    await expect(variableRow).toContainText('#w = 10 mm', { timeout: 60_000 });
    const row = page.getByTestId(`tree-row-${sketchId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const hub = { x: box.x, y: box.y };
    await setStandardView(page, 0, { low: { x: -45, y: -45, z: -20 }, high: { x: 45, y: 45, z: 20 } });
    await disableSnap(page);

    const readSketch = async (): Promise<SketchDto> => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      expect(sketch).toBeDefined();
      return sketch!;
    };

    // 偏移 ▾ → 槽 → 点圆 → Enter 提交。
    await page.getByRole('button', { name: '偏移 ▾' }).click({ timeout: 10_000 });
    await page.getByRole('menuitem', { name: '槽', exact: true }).click();
    await clickWorld(page, hub, { x: 30, y: 0, z: 0 });
    await page.waitForTimeout(700);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await readSketch()).entities
      .filter((e) => e.kind === 'circle').length, { timeout: 30_000, intervals: [1000, 2000, 5000] }).toBe(3);
    const afterInsert = await readSketch();
    assertCircleSlotGeometry(afterInsert, 30, 20, 2);
    const slot = afterInsert.constraints.find((c) => c.kind === 'slotWidth')!;
    const label = page.locator(`[data-testid="sketch-dimension-label"][data-constraint-id="${slot.id}"]`);
    await expect(label).toHaveAttribute('data-text', '20', { timeout: 30_000 });

    // 标签双击 → 表达式 `#w*2` → 宽度 20（值不变）、expression 落库、标签 `ƒ 20`。
    const labelAt = await dimensionLabelCenter(page, box, slot.id);
    await page.mouse.dblclick(labelAt.x, labelAt.y);
    const input = page.getByTestId('sketch-dimension-input');
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill('#w*2');
    await page.getByTestId('sketch-dimension-confirm').click();
    await expect.poll(async () => (await readSketch()).constraints
      .find((c) => c.kind === 'slotWidth')?.expression ?? '', {
      timeout: 30_000, intervals: [1000, 2000, 5000],
    }).toBe('#w*2');
    assertCircleSlotGeometry(await readSketch(), 30, 20, 2);
    await expect(label).toHaveAttribute('data-text', 'ƒ 20', { timeout: 30_000 });

    // 完成草图 → 变量表 UI 编辑 w=15 → 草图重解（宽度 30，半径 15/45）。
    await finishSketch(page);
    await expect(page.getByTestId(`tree-row-${sketchId}`)).toBeVisible({ timeout: 30_000 });
    await variableRow.dblclick({ timeout: 30_000 });
    const editDialog = page.getByTestId('variables-dialog');
    await expect(editDialog).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('variables-name-input')).toHaveValue('w');
    await page.getByTestId('variables-value-input').fill('15');
    await page.getByTestId('variables-value-input').press('Tab');
    await expect(page.getByTestId('variables-dialog-title')).toHaveText('#w = 15 mm');
    await page.getByTestId('variables-confirm').click();
    await expect(editDialog).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(async () => (await readSketch()).constraints
      .find((c) => c.kind === 'slotWidth')?.value ?? NaN, {
      timeout: 60_000, intervals: [1000, 2000, 5000],
    }).toBeCloseTo(30, 3);
    assertCircleSlotGeometry(await readSketch(), 30, 30, 2);
    await expect(variableRow).toContainText('#w = 15 mm', { timeout: 30_000 });

    // 重开草图 → 标签 `ƒ 30`；finish+reload 持久。
    await page.getByTestId(`tree-row-${sketchId}`).dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    const relabel = page.locator(`[data-testid="sketch-dimension-label"][data-constraint-id="${slot.id}"]`);
    await expect(relabel).toHaveAttribute('data-text', 'ƒ 30', { timeout: 30_000 });
    await finishSketch(page);
    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    assertCircleSlotGeometry(await readSketch(), 30, 30, 2);
    expect((await readSketch()).constraints.find((c) => c.kind === 'slotWidth')?.expression).toBe('#w*2');
  });
});

// ---------------------------------------------------------------------------
// S2u 含圆弧的混合线树（live 2026-11-20 `s2u-arcbranch-*`：1 弧 + 2 线单毂树）
// ---------------------------------------------------------------------------

function assertArcBranchSlotGeometry(sketch: SketchDto, half: number, initialConstraintIds: ReadonlySet<number>): void {
  const lines = sketch.entities.filter((e): e is LineEntity => e.kind === 'line');
  const arcs = sketch.entities.filter((e): e is ArcEntity => e.kind === 'arc');
  expect(lines, '源 2 线 + 4 条边界线').toHaveLength(6);
  expect(arcs, '源弧 + 2 同心弧边界 + 3 帽 + 1 绕毂弧').toHaveLength(7);
  // 源弧 R = 106.7851148959772（固定）；边界弧 = R±half；帽/毂弧 = half。
  const boundary = arcs.filter((a) => {
    const r = a.radius ?? NaN;
    return Math.abs(r - (106.7851148959772 - half)) < 1e-3
      || Math.abs(r - (106.7851148959772 + half)) < 1e-3;
  });
  expect(boundary, '两条同心弧边界').toHaveLength(2);
  const small = arcs.filter((a) => Math.abs((a.radius ?? NaN) - half) < 1e-3);
  expect(small, '3 尖端帽 + 1 绕毂弧').toHaveLength(4);
  const added = sketch.constraints.filter((c) => !initialConstraintIds.has(c.id));
  expect(added.filter((c) => c.kind === 'diameter'), '单 Ø').toHaveLength(1);
  expect(added.filter((c) => c.kind === 'diameter')[0]!.value).toBeCloseTo(half * 2, 3);
  expect(added.filter((c) => c.kind === 'equal')).toHaveLength(3);
  expect(added.filter((c) => c.kind === 'parallel')).toHaveLength(4);
  expect(added.filter((c) => c.kind === 'concentric')).toHaveLength(2);
  expect(added.filter((c) => c.kind === 'tangent')).toHaveLength(8);
  expect(added.filter((c) => c.kind === 'coincident')).toHaveLength(14);
}

test.describe('草图槽工具：含圆弧的混合线树（ADR-0022 §2.15 / S2u）', () => {
  test('1 弧 + 2 线单毂树 → 槽（预选）→ 4 线边界/2 同心弧/3 帽/毂弧 → Ø30 → reload', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 360_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openSeedImodelEditor(page, seed);
    const lease = await borrowWriteLease(ctx, token, 'sketch-slot-curve-tree');
    const DEG = Math.PI / 180;
    const R = 106.7851148959772;
    const A0 = 88.439547691644 * DEG;
    const A1 = 128.2323637942156 * DEG;
    const P = { x: -127.3526847362518, y: -57.66168236732483 };
    const A = { x: -165.9830063581467, y: -104.0180772542953 };
    const B = { x: -88.7223482131958, y: -104.0180772542953 };
    const C = { x: -61.26848234283024, y: -141.5421864035569 };
    const T = { x: C.x + R * Math.cos(A0), y: C.y + R * Math.sin(A0) };
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [
        { kind: 'point', id: 1, ...P },
        { kind: 'point', id: 2, ...A },
        { kind: 'point', id: 3, ...B },
        { kind: 'point', id: 4, ...C },
        { kind: 'point', id: 5, ...T },
        { kind: 'line', id: 6, p1: 1, p2: 2 },
        { kind: 'line', id: 7, p1: 1, p2: 3 },
        { kind: 'arc', id: 8, center: 4, radius: R, startAngle: A0, sweepAngle: A1 - A0 },
      ],
      constraints: [
        { kind: 'fixed', id: 100, refs: [1] },
        { kind: 'fixed', id: 101, refs: [2] },
        { kind: 'fixed', id: 102, refs: [3] },
        { kind: 'fixed', id: 103, refs: [4] },
        { kind: 'fixed', id: 104, refs: [5] },
        { kind: 'radius', id: 105, refs: [8], value: R },
        { kind: 'coincident', id: 106, refs: [{ entity: 8, part: 'start' }, 5] },
        { kind: 'coincident', id: 107, refs: [{ entity: 8, part: 'end' }, 1] },
      ],
      plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '弧+两线分支草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    const row = page.getByTestId(`tree-row-${sketchId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const hub = { x: box.x, y: box.y };
    await setStandardView(page, 0, { low: { x: -190, y: -155, z: -20 }, high: { x: -40, y: -15, z: 20 } });
    await disableSnap(page);

    const readSketch = async (): Promise<SketchDto> => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      expect(sketch).toBeDefined();
      return sketch!;
    };
    const before = await readSketch();
    const beforeConstraintIds = new Set(before.constraints.map((c) => c.id));

    const projected = await projectWorld(page, hub, [
      { x: -185, y: -150, z: 0 },
      { x: -45, y: -20, z: 0 },
    ]);
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
    const picker = page.getByTestId('sketch-entity-picker');
    const selectedSourceIds = async (): Promise<number[]> =>
      (JSON.parse((await picker.getAttribute('data-selected')) ?? '[]') as Array<[number, string]>)
        .map(([id]) => id)
        .filter((id) => id === 6 || id === 7 || id === 8);
    await expect.poll(async () => (await selectedSourceIds()).length, { timeout: 10_000 }).toBe(3);

    await page.getByRole('button', { name: '偏移 ▾' }).click({ timeout: 10_000 });
    await page.getByRole('menuitem', { name: '槽', exact: true }).click();
    await page.waitForTimeout(700);
    expect((await selectedSourceIds()).length, '启动工具不得清掉草图预选').toBe(3);
    await page.keyboard.press('Enter');

    await expect.poll(async () => (await readSketch()).entities
      .filter((e) => e.kind === 'arc').length, { timeout: 30_000, intervals: [1000, 2000, 5000] }).toBe(7);
    const afterInsert = await readSketch();
    assertArcBranchSlotGeometry(afterInsert, 10, beforeConstraintIds);

    const diameter = afterInsert.constraints.find((c) => c.kind === 'diameter')!;
    const widenLease = await borrowWriteLease(ctx, token, 'sketch-slot-curve-tree-widen');
    const widen = await applyFeatureOpRpc(ctx, {
      kind: 'updateSketchConstraint', sketchId, constraintId: diameter.id, value: 30,
    }, widenLease, token);
    expect(widen.ok, widen.ok ? '' : widen.error).toBe(true);
    await releaseWriteLease(ctx, widenLease, token);
    await expect.poll(async () => (await readSketch()).constraints
      .find((c) => c.kind === 'diameter')?.value ?? NaN, {
      timeout: 30_000, intervals: [1000, 2000, 5000],
    }).toBeCloseTo(30, 3);
    assertArcBranchSlotGeometry(await readSketch(), 15, beforeConstraintIds);

    await finishSketch(page);
    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    assertArcBranchSlotGeometry(await readSketch(), 15, beforeConstraintIds);
  });
});

// ---------------------------------------------------------------------------
// S2u2 多弧臂混合线树（live 2026-11-20 `s2u2-multiarc-*`：2 弧 + 1 线共毂）
// ---------------------------------------------------------------------------

test.describe('草图槽工具：多弧臂混合线树（ADR-0022 §2.15 扩展 / S2u2）', () => {
  test('2 弧 + 1 线单毂树 → 槽（预选）→ 4 同心弧/3 帽/弧-弧毂弧 → Ø30 → reload', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 360_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openSeedImodelEditor(page, seed);
    const lease = await borrowWriteLease(ctx, token, 'sketch-slot-multi-arc');
    const DEG = Math.PI / 180;
    const P = { x: -88.722, y: -57.662 };
    const L = { x: -19.188, y: -104.018 };
    const C1 = { x: -320.504, y: 38.914 };
    const C2 = { x: -38.479, y: -86.389 };
    const R1 = Math.hypot(P.x - C1.x, P.y - C1.y);
    const R2 = Math.hypot(P.x - C2.x, P.y - C2.y);
    const A1 = Math.atan2(P.y - C1.y, P.x - C1.x) / DEG; // arc1 end angle
    const A2 = Math.atan2(P.y - C2.y, P.x - C2.x) / DEG; // arc2 end angle
    const S1 = 14.25;
    const S2 = 79.888;
    const T1 = {
      x: C1.x + R1 * Math.cos((A1 - S1) * DEG),
      y: C1.y + R1 * Math.sin((A1 - S1) * DEG),
    };
    const T2 = {
      x: C2.x + R2 * Math.cos((A2 - S2) * DEG),
      y: C2.y + R2 * Math.sin((A2 - S2) * DEG),
    };
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [
        { kind: 'point', id: 1, ...P },
        { kind: 'point', id: 2, ...L },
        { kind: 'point', id: 3, ...C1 },
        { kind: 'point', id: 4, ...C2 },
        { kind: 'point', id: 5, ...T1 },
        { kind: 'point', id: 6, ...T2 },
        { kind: 'line', id: 7, p1: 1, p2: 2 },
        { kind: 'arc', id: 8, center: 3, radius: R1, startAngle: (A1 - S1) * DEG, sweepAngle: S1 * DEG },
        { kind: 'arc', id: 9, center: 4, radius: R2, startAngle: (A2 - S2) * DEG, sweepAngle: S2 * DEG },
      ],
      constraints: [
        { kind: 'fixed', id: 100, refs: [1] },
        { kind: 'fixed', id: 101, refs: [2] },
        { kind: 'fixed', id: 102, refs: [3] },
        { kind: 'fixed', id: 103, refs: [4] },
        { kind: 'fixed', id: 104, refs: [5] },
        { kind: 'fixed', id: 105, refs: [6] },
        { kind: 'radius', id: 106, refs: [8], value: R1 },
        { kind: 'radius', id: 107, refs: [9], value: R2 },
        { kind: 'coincident', id: 108, refs: [{ entity: 8, part: 'start' }, 5] },
        { kind: 'coincident', id: 109, refs: [{ entity: 8, part: 'end' }, 1] },
        { kind: 'coincident', id: 110, refs: [{ entity: 9, part: 'start' }, 6] },
        { kind: 'coincident', id: 111, refs: [{ entity: 9, part: 'end' }, 1] },
      ],
      plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '两弧一线分支草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    const row = page.getByTestId(`tree-row-${sketchId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const hub = { x: box.x, y: box.y };
    await setStandardView(page, 0, { low: { x: -340, y: -130, z: -20 }, high: { x: 10, y: 70, z: 20 } });
    await disableSnap(page);

    const readSketch = async (): Promise<SketchDto> => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      expect(sketch).toBeDefined();
      return sketch!;
    };
    const before = await readSketch();
    const beforeConstraintIds = new Set(before.constraints.map((c) => c.id));

    const projected = await projectWorld(page, hub, [
      { x: -335, y: -125, z: 0 },
      { x: 5, y: 65, z: 0 },
    ]);
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
    const picker = page.getByTestId('sketch-entity-picker');
    const selectedSourceIds = async (): Promise<number[]> =>
      (JSON.parse((await picker.getAttribute('data-selected')) ?? '[]') as Array<[number, string]>)
        .map(([id]) => id)
        .filter((id) => id === 7 || id === 8 || id === 9);
    await expect.poll(async () => (await selectedSourceIds()).length, { timeout: 10_000 }).toBe(3);

    const assertGeometry = (sketch: SketchDto, half: number): void => {
      const lines = sketch.entities.filter((e): e is LineEntity => e.kind === 'line');
      const arcs = sketch.entities.filter((e): e is ArcEntity => e.kind === 'arc');
      expect(lines, '源线 + 2 条边界线').toHaveLength(3);
      expect(arcs, '源 2 弧 + 4 同心弧 + 3 帽 + 1 毂弧').toHaveLength(10);
      const boundary = arcs.filter((a) => {
        const r = a.radius ?? NaN;
        return [R1 + half, R1 - half, R2 + half, R2 - half].some((x) => Math.abs(r - x) < 1e-2);
      });
      expect(boundary, '4 条同心弧边界').toHaveLength(4);
      expect(arcs.filter((a) => Math.abs((a.radius ?? NaN) - half) < 1e-3), '3 帽 + 1 毂弧').toHaveLength(4);
      const added = sketch.constraints.filter((c) => !beforeConstraintIds.has(c.id));
      expect(added.filter((c) => c.kind === 'diameter'), '单 Ø').toHaveLength(1);
      expect(added.filter((c) => c.kind === 'diameter')[0]!.value).toBeCloseTo(half * 2, 3);
      expect(added.filter((c) => c.kind === 'equal')).toHaveLength(3);
      expect(added.filter((c) => c.kind === 'parallel')).toHaveLength(2);
      expect(added.filter((c) => c.kind === 'concentric')).toHaveLength(4);
      expect(added.filter((c) => c.kind === 'tangent')).toHaveLength(8);
      expect(added.filter((c) => c.kind === 'coincident')).toHaveLength(14);
    };

    await page.getByRole('button', { name: '偏移 ▾' }).click({ timeout: 10_000 });
    await page.getByRole('menuitem', { name: '槽', exact: true }).click();
    await page.waitForTimeout(700);
    expect((await selectedSourceIds()).length, '启动工具不得清掉草图预选').toBe(3);
    await page.keyboard.press('Enter');

    await expect.poll(async () => (await readSketch()).entities
      .filter((e) => e.kind === 'arc').length, { timeout: 30_000, intervals: [1000, 2000, 5000] }).toBe(10);
    const afterInsert = await readSketch();
    assertGeometry(afterInsert, 10);

    const diameter = afterInsert.constraints.find((c) => c.kind === 'diameter')!;
    const widenLease = await borrowWriteLease(ctx, token, 'sketch-slot-multi-arc-widen');
    const widen = await applyFeatureOpRpc(ctx, {
      kind: 'updateSketchConstraint', sketchId, constraintId: diameter.id, value: 30,
    }, widenLease, token);
    expect(widen.ok, widen.ok ? '' : widen.error).toBe(true);
    await releaseWriteLease(ctx, widenLease, token);
    await expect.poll(async () => (await readSketch()).constraints
      .find((c) => c.kind === 'diameter')?.value ?? NaN, {
      timeout: 30_000, intervals: [1000, 2000, 5000],
    }).toBeCloseTo(30, 3);
    assertGeometry(await readSketch(), 15);

    await finishSketch(page);
    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    assertGeometry(await readSketch(), 15);
  });
});

// ---------------------------------------------------------------------------
// S2u3 纯弧臂混合线树（live 2026-11-20 `s2u3-allarc-*`：3 弧共毂、无直线）
// ---------------------------------------------------------------------------

test.describe('草图槽工具：纯弧臂线树（ADR-0022 §2.15 扩展 / S2u3）', () => {
  test('3 弧共毂（无直线）→ 槽（预选）→ 6 同心弧/3 帽/毂弧 → Ø30 → reload', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 360_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    let ctx = await openSeedImodelEditor(page, seed);
    const lease = await borrowWriteLease(ctx, token, 'sketch-slot-all-arc');
    const DEG = Math.PI / 180;
    const P = { x: -88.722, y: -57.662 };
    const centers = [
      { c: { x: -130.571, y: -195.765 }, sweep: 33.664 },
      { c: { x: -320.504, y: 38.914 }, sweep: 14.25 },
      { c: { x: -42.044, y: -81.806 }, sweep: 88.43 },
    ];
    const specs = centers.map((s) => {
      const R = Math.hypot(P.x - s.c.x, P.y - s.c.y);
      const a1 = Math.atan2(P.y - s.c.y, P.x - s.c.x) / DEG;
      const a0 = a1 - s.sweep;
      const T = { x: s.c.x + R * Math.cos(a0 * DEG), y: s.c.y + R * Math.sin(a0 * DEG) };
      return { ...s, R, a0, a1, T };
    });
    const entities: SketchEntityDto[] = [
      { kind: 'point', id: 1, ...P },
      ...specs.flatMap((s, i): SketchEntityDto[] => [
        { kind: 'point', id: 10 + i, ...s.c },
        { kind: 'point', id: 20 + i, ...s.T },
      ]),
      ...specs.map((s, i): SketchEntityDto => ({
        kind: 'arc', id: 30 + i, center: 10 + i, radius: s.R,
        startAngle: s.a0 * DEG, sweepAngle: s.sweep * DEG,
      })),
    ];
    const constraints: SketchDto['constraints'] = [
      { kind: 'fixed', id: 100, refs: [1] },
      ...specs.flatMap((_, i): SketchDto['constraints'] => ([
        { kind: 'fixed', id: 101 + i, refs: [10 + i] },
        { kind: 'fixed', id: 111 + i, refs: [20 + i] },
        { kind: 'radius', id: 121 + i, refs: [30 + i], value: specs[i]!.R },
        { kind: 'coincident', id: 131 + i, refs: [{ entity: 30 + i, part: 'start' }, 20 + i] },
        { kind: 'coincident', id: 141 + i, refs: [{ entity: 30 + i, part: 'end' }, 1] },
      ])),
    ];
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities, constraints, plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '三弧分支草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    const row = page.getByTestId(`tree-row-${sketchId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const hub = { x: box.x, y: box.y };
    await setStandardView(page, 0, { low: { x: -340, y: -210, z: -20 }, high: { x: 10, y: 70, z: 20 } });
    await disableSnap(page);

    const readSketch = async (): Promise<SketchDto> => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      expect(sketch).toBeDefined();
      return sketch!;
    };
    const before = await readSketch();
    const beforeConstraintIds = new Set(before.constraints.map((c) => c.id));

    const projected = await projectWorld(page, hub, [
      { x: -335, y: -205, z: 0 },
      { x: 5, y: 65, z: 0 },
    ]);
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
    const picker = page.getByTestId('sketch-entity-picker');
    const selectedSourceIds = async (): Promise<number[]> =>
      (JSON.parse((await picker.getAttribute('data-selected')) ?? '[]') as Array<[number, string]>)
        .map(([id]) => id)
        .filter((id) => id >= 30 && id <= 32);
    await expect.poll(async () => (await selectedSourceIds()).length, { timeout: 10_000 }).toBe(3);

    const assertGeometry = (sketch: SketchDto, half: number): void => {
      const lines = sketch.entities.filter((e) => e.kind === 'line');
      const arcs = sketch.entities.filter((e): e is ArcEntity => e.kind === 'arc');
      expect(lines, '无直线').toHaveLength(0);
      expect(arcs, '源 3 弧 + 6 同心弧 + 3 帽 + 1 毂弧').toHaveLength(13);
      const boundary = arcs.filter((a) => {
        const r = a.radius ?? NaN;
        return specs.some((s) => Math.abs(r - (s.R + half)) < 1e-2 || Math.abs(r - (s.R - half)) < 1e-2);
      });
      expect(boundary, '6 条同心弧边界').toHaveLength(6);
      expect(arcs.filter((a) => Math.abs((a.radius ?? NaN) - half) < 1e-3), '3 帽 + 1 毂弧').toHaveLength(4);
      const added = sketch.constraints.filter((c) => !beforeConstraintIds.has(c.id));
      expect(added.filter((c) => c.kind === 'diameter'), '单 Ø').toHaveLength(1);
      expect(added.filter((c) => c.kind === 'diameter')[0]!.value).toBeCloseTo(half * 2, 3);
      expect(added.filter((c) => c.kind === 'equal')).toHaveLength(3);
      expect(added.filter((c) => c.kind === 'parallel')).toHaveLength(0);
      expect(added.filter((c) => c.kind === 'concentric')).toHaveLength(6);
      expect(added.filter((c) => c.kind === 'tangent')).toHaveLength(8);
      expect(added.filter((c) => c.kind === 'coincident')).toHaveLength(14);
    };

    await page.getByRole('button', { name: '偏移 ▾' }).click({ timeout: 10_000 });
    await page.getByRole('menuitem', { name: '槽', exact: true }).click();
    await page.waitForTimeout(700);
    expect((await selectedSourceIds()).length, '启动工具不得清掉草图预选').toBe(3);
    await page.keyboard.press('Enter');

    await expect.poll(async () => (await readSketch()).entities
      .filter((e) => e.kind === 'arc').length, { timeout: 30_000, intervals: [1000, 2000, 5000] }).toBe(13);
    const afterInsert = await readSketch();
    assertGeometry(afterInsert, 10);

    const diameter = afterInsert.constraints.find((c) => c.kind === 'diameter')!;
    const widenLease = await borrowWriteLease(ctx, token, 'sketch-slot-all-arc-widen');
    const widen = await applyFeatureOpRpc(ctx, {
      kind: 'updateSketchConstraint', sketchId, constraintId: diameter.id, value: 30,
    }, widenLease, token);
    expect(widen.ok, widen.ok ? '' : widen.error).toBe(true);
    await releaseWriteLease(ctx, widenLease, token);
    await expect.poll(async () => (await readSketch()).constraints
      .find((c) => c.kind === 'diameter')?.value ?? NaN, {
      timeout: 30_000, intervals: [1000, 2000, 5000],
    }).toBeCloseTo(30, 3);
    assertGeometry(await readSketch(), 15);

    await finishSketch(page);
    await page.reload();
    ctx = await openSeedImodelEditor(page, seed);
    assertGeometry(await readSketch(), 15);
  });
});
