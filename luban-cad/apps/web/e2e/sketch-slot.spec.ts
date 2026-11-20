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
