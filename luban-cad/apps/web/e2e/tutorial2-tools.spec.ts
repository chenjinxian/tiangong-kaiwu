/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tutorial 2 逐工具 UI 级回归（tutorial2.spec.ts 的隔离补充）：
 * 绘制（矩形/线/三点圆弧/样条）、约束（重合/中点/相切/水平/竖直）、
 * 标注（长度/距离/半径）、偏移各自走真实 ribbon 工具 + canvas 鼠标流，
 * 每步只读回 RPC 断言实体/约束增量与类型。特征对话框由 tutorial2.spec.ts 覆盖。
 *
 * 与主 spec 共用 tutorial2-helpers.ts；每个用例独立重置 B 种子，
 * 避免前序约束/求解结果污染计数。
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { SketchDto, SketchEntityDto } from '@luban-cad/shared';
import {
  getApiToken,
  getFeatureTreeRpc,
  getSketchRpc,
  openSeedImodelEditor,
} from './helpers';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed';
import {
  P,
  activate,
  addConstraint,
  addDimension,
  addOffset,
  chooseSketchPlaneInViewport,
  clickWorld,
  disableSnap,
  finishSketch,
  setStandardView,
  worldOf,
  type Local2,
  type Vec3,
} from './tutorial2-helpers';

type Ctx = Awaited<ReturnType<typeof openSeedImodelEditor>>;
type LineEntity = Extract<SketchEntityDto, { kind: 'line' }>;
type ArcEntity = Extract<SketchEntityDto, { kind: 'arc' }>;
type CircleEntity = Extract<SketchEntityDto, { kind: 'circle' }>;

const lines = (sk: SketchDto): LineEntity[] =>
  sk.entities.filter((e): e is LineEntity => e.kind === 'line');
const arcs = (sk: SketchDto): ArcEntity[] =>
  sk.entities.filter((e): e is ArcEntity => e.kind === 'arc');

const inlineP1 = (line: LineEntity): Local2 => {
  if (typeof line.p1 !== 'object' || typeof line.p2 !== 'object')
    throw new Error('线端点应为内联对象');
  return line.p1;
};
const inlineP2 = (line: LineEntity): Local2 => {
  if (typeof line.p1 !== 'object' || typeof line.p2 !== 'object')
    throw new Error('线端点应为内联对象');
  return line.p2;
};
const midOf = (line: LineEntity): Vec3 => {
  const a = inlineP1(line);
  const b = inlineP2(line);
  return worldOf({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
};
/** 线段上 t 处（避开中点/端点/origin 重叠的拾取热区）。 */
const pointOnLine = (line: LineEntity, t: number): Vec3 => {
  const a = inlineP1(line);
  const b = inlineP2(line);
  return worldOf({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
};
const centerOf = (sk: SketchDto): Vec3 => {
  const p = sk.entities.find((e): e is Extract<SketchEntityDto, { kind: 'point' }> => e.kind === 'point');
  if (!p) throw new Error('缺可见点（矩形中心）');
  return worldOf({ x: p.x ?? 0, y: p.y ?? 0 });
};
const lineNear = (sk: SketchDto, local: Local2, tol = 3): LineEntity => {
  const found = lines(sk).find((l) => {
    const a = inlineP1(l);
    const b = inlineP2(l);
    return Math.hypot((a.x + b.x) / 2 - local.x, (a.y + b.y) / 2 - local.y) < tol;
  });
  if (!found) throw new Error(`找不到中点 (${local.x},${local.y}) 附近的线`);
  return found;
};
/** 标注改变长度后线中点会移动：按水平线所在的 y 定位（矩形边在 0/20，互不混淆）。 */
const horizontalLineAt = (sk: SketchDto, y: number, tol = 3): LineEntity => {
  const found = lines(sk).find((l) => {
    const a = inlineP1(l);
    const b = inlineP2(l);
    return Math.abs(a.y - y) < tol && Math.abs(b.y - y) < tol;
  });
  if (!found) throw new Error(`找不到 y=${y} 附近的水平线`);
  return found;
};
const circles = (sk: SketchDto): CircleEntity[] =>
  sk.entities.filter((e): e is CircleEntity => e.kind === 'circle');
/** 圆心为内联对象（绘制工具产物）时，取圆上 angle 处的世界点。 */
const pointOnCircle = (circle: CircleEntity, angle: number): Vec3 => {
  const c = circle.center;
  if (typeof c !== 'object') throw new Error('圆心应为内联对象');
  const r = circle.radius ?? 0;
  return worldOf({ x: c.x + r * Math.cos(angle), y: c.y + r * Math.sin(angle) });
};
const pointOnArc = (arc: ArcEntity): Vec3 => {
  const c = arc.center;
  if (typeof c !== 'object') throw new Error('弧心应为内联对象');
  const s = arc.startAngle ?? 0;
  const sw = arc.sweepAngle ?? 0;
  const r = arc.radius ?? 0;
  const mid = s + sw / 2;
  return worldOf({ x: c.x + r * Math.cos(mid), y: c.y + r * Math.sin(mid) });
};

async function boot(page: Page, request: APIRequestContext): Promise<{ ctx: Ctx; token: string; hub: { x: number; y: number } }> {
  const token = await getApiToken();
  const seed = await resetBModelSeed(request, token);
  const ctx = await openSeedImodelEditor(page, seed);

  await page.getByRole('button', { name: '草图', exact: true }).click();
  const dialog = page.getByTestId('part-studio-sketch-dialog');
  await expect(dialog).toBeVisible();
  await chooseSketchPlaneInViewport(page, 'front');
  await dialog.getByRole('button', { name: '确认' }).click();
  // Onshape：创建后同一草图对话框保持打开（编辑态），草图工具条变身。
  await expect(
    page.getByRole('toolbar', { name: '草图工具' }).or(dialog.getByTestId('part-studio-sketch-dialog-error')),
  ).toBeVisible({ timeout: 60_000 });
  if ((await dialog.getByTestId('part-studio-sketch-dialog-error').count()) > 0)
    throw new Error(`insertSketch 拒收: ${await dialog.getByTestId('part-studio-sketch-dialog-error').textContent()}`);

  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas boundingBox 不可得');
  const hub = { x: box.x, y: box.y };
  // 与严格复刻 spec 同一取景：草图整体位于左侧草图对话框覆盖区之右。
  // 2026-11-02 Onshape 壳层后画布宽高变化：放大取景，确保 T2 草图的点击点
  // 全部留在画布内（旧取景下 P(75,45) 会落到 30px 底部页签条上）。
  await setStandardView(page, 4, {
    low: { x: -170, y: -120, z: -100 }, high: { x: 160, y: 120, z: 120 },
  });
  await disableSnap(page);
  return { ctx, token, hub };
}

async function readLatest(ctx: Ctx, token: string): Promise<SketchDto> {
  const tree = await getFeatureTreeRpc(ctx, token);
  const sketches = tree.filter((row) => row.featureType === 'sketch');
  const id = sketches[sketches.length - 1]?.id;
  expect(id, '树内应有 sketch 行').toBeTruthy();
  const sk = await getSketchRpc(ctx, id!, token);
  expect(sk).toBeDefined();
  return sk!;
}

async function expectCounts(
  ctx: Ctx,
  token: string,
  entities: number,
  constraints: number,
  label: string,
): Promise<SketchDto> {
  const sk = await readLatest(ctx, token);
  expect(sk.entities.length, `${label} 实体数`).toBe(entities);
  expect(sk.constraints.length, `${label} 约束数`).toBe(constraints);
  console.log(`[t2-tools] ${label}: entities=${sk.entities.length} constraints=${sk.constraints.length} status=${sk.solve.status}`);
  return sk;
}

test.describe('Tutorial 2 草图工具逐项回归', () => {
  test('绘制：矩形/线/三点圆弧/样条生成正确实体与自动约束', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS);
    const { ctx, token, hub } = await boot(page, request);

    await activate(page, '拐角矩形');
    await clickWorld(page, hub, P(-30, 12));
    await clickWorld(page, hub, P(25, -8));
    await page.waitForTimeout(1_500);
    await expectCounts(ctx, token, 5, 10, '矩形');

    // 远离既有端点的自由线：只增实体，不触发 auto-weld。
    await activate(page, '线');
    await clickWorld(page, hub, P(-40, 25));
    await clickWorld(page, hub, P(-15, 35));
    await page.waitForTimeout(1_500);
    await expectCounts(ctx, token, 6, 10, '自由线');

    // 三点圆弧：起点/终点/弧上点。
    await activate(page, '3 点圆弧');
    await clickWorld(page, hub, P(40, 20));
    await clickWorld(page, hub, P(70, 20));
    await clickWorld(page, hub, P(55, 35));
    await page.waitForTimeout(1_500);
    await expectCounts(ctx, token, 7, 10, '三点圆弧');

    // 样条：起点 → 终点 → 起点柄 → 终点柄；两条 fit↔endpoint coincident 为自动关系。
    const beforeSpline = await readLatest(ctx, token);
    const coincidentBefore = beforeSpline.constraints.filter((c) => c.kind === 'coincident').length;
    await activate(page, '样条');
    await clickWorld(page, hub, P(85, 10));
    await clickWorld(page, hub, P(115, 15));
    await clickWorld(page, hub, P(90, 30));
    await clickWorld(page, hub, P(110, 35));
    await page.waitForTimeout(2_000);
    const sk = await expectCounts(ctx, token, 8, 12, '样条');

    expect(lines(sk)).toHaveLength(5);
    expect(arcs(sk)).toHaveLength(1);
    const splines = sk.entities.filter((e): e is Extract<SketchEntityDto, { kind: 'spline' }> => e.kind === 'spline');
    expect(splines).toHaveLength(1);
    expect(splines[0]!.fitPoints).toHaveLength(2);
    expect(splines[0]!.controlPoints).toHaveLength(4);
    expect(sk.entities.filter((e) => e.kind === 'point')).toHaveLength(1);
    // 矩形自带 4 条角 coincident；样条只新增自己的 2 条。
    expect(sk.constraints.filter((c) => c.kind === 'coincident')).toHaveLength(coincidentBefore + 2);
  });

  test('圆：直径尺寸 + 线端点共圆相切（v1.23 ADR-0004 UI 链）', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS);
    const { ctx, token, hub } = await boot(page, request);

    // 中心点圆：圆心 + 圆周点；先画半径 25，再用直径尺寸改为 40（半径 20）。
    await activate(page, '中心点圆');
    await clickWorld(page, hub, P(40, 30));
    await clickWorld(page, hub, P(65, 30));
    await page.waitForTimeout(1_500);
    let sk = await readLatest(ctx, token);
    expect(circles(sk)).toHaveLength(1);
    expect(circles(sk)[0]!.radius).toBeCloseTo(25, 1);

    const circlePick = pointOnCircle(circles(sk)[0]!, Math.PI / 6);
    await addDimension(page, hub, '直径', [circlePick], 40);
    sk = await readLatest(ctx, token);
    const circle = circles(sk)[0]!;
    expect(circle.radius).toBeCloseTo(20, 1);
    expect(sk.constraints.some((c) => c.kind === 'diameter' && c.value === 40)).toBe(true);

    // 线的起点落在圆周上；随后用「点+整圆」重合把端点钉在圆上。
    const center = circle.center as { x: number; y: number };
    const tangentPoint = worldOf({ x: center.x + circle.radius!, y: center.y });
    await activate(page, '线');
    await clickWorld(page, hub, tangentPoint);
    await clickWorld(page, hub, worldOf({ x: center.x + circle.radius! + 30, y: center.y + 30 }));
    await page.waitForTimeout(1_200);
    sk = await readLatest(ctx, token);
    const line = lines(sk).find((l) => Math.hypot(inlineP1(l).x - (center.x + circle.radius!), inlineP1(l).y - center.y) < 2);
    expect(line, '应找到从圆周出发的线').toBeTruthy();

    await addConstraint(page, hub, '重合', [tangentPoint, pointOnCircle(circle, Math.PI / 2)]);
    await addConstraint(page, hub, '相切', [midOf(line!), pointOnCircle(circle, Math.PI)]);
    sk = await readLatest(ctx, token);
    expect(sk.solve.status).not.toBe('failed');
    expect(sk.solve.status).not.toBe('conflicting');
    const kinds = sk.constraints.map((c) => c.kind);
    expect(kinds.filter((k) => k === 'coincident').length).toBeGreaterThanOrEqual(1);
    const tangent = sk.constraints.find((c) => c.kind === 'tangent');
    expect(tangent, '相切约束应落库').toBeTruthy();
    const tangentIds = tangent!.refs.map((r) => (typeof r === 'number' ? r : (r as { entity: number }).entity));
    expect(tangentIds).toContain(circle.id);
    expect(tangentIds).toContain(line!.id);
    console.log(`[t2-tools] 圆直径+共圆相切: entities=${sk.entities.length} constraints=${sk.constraints.length} dof=${sk.solve.dof} status=${sk.solve.status}`);
  });

  test('约束：重合/中点/相切/水平/竖直各自落一行且不改实体类型', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS);
    const { ctx, token, hub } = await boot(page, request);

    // 矩形整体避开 origin（y=10..30），否则底边会与原点拾取热区重叠。
    await activate(page, '拐角矩形');
    await clickWorld(page, hub, P(-10, 30));
    await clickWorld(page, hub, P(30, 10));
    await page.waitForTimeout(1_500);
    let sk = await expectCounts(ctx, token, 5, 10, '矩形');

    await activate(page, '线');
    await clickWorld(page, hub, P(45, 30));
    await clickWorld(page, hub, P(75, 45));
    await page.waitForTimeout(1_200);
    sk = await expectCounts(ctx, token, 6, 10, '线 A');

    await activate(page, '线');
    await clickWorld(page, hub, P(45, 0));
    await clickWorld(page, hub, P(60, 15));
    await page.waitForTimeout(1_200);
    sk = await expectCounts(ctx, token, 7, 10, '线 B');

    // 弧起点落在线上 → auto-weld（与 Onshape 推断吸附同构）。
    await activate(page, '3 点圆弧');
    await clickWorld(page, hub, P(75, 45));
    await clickWorld(page, hub, P(90, 35));
    await clickWorld(page, hub, P(88, 42));
    await page.waitForTimeout(1_500);
    sk = await expectCounts(ctx, token, 8, 11, '弧（auto-weld）');

    const histBefore = sk.constraints.reduce<Record<string, number>>((acc, c) => {
      acc[c.kind] = (acc[c.kind] ?? 0) + 1;
      return acc;
    }, {});

    const lineA = lineNear(sk, { x: 60, y: 37.5 });
    const lineB = lineNear(sk, { x: 52.5, y: 7.5 });
    const lineAId = lineA.id;
    const lineBId = lineB.id;
    const arc = arcs(sk)[0]!;

    // [1] 重合：矩形中心 ↔ origin。
    await addConstraint(page, hub, '重合', [centerOf(sk), P(0, 0)]);
    sk = await expectCounts(ctx, token, 8, 12, 'origin 重合');

    // [2] 中点：中心 ↔ 线 B。
    await addConstraint(page, hub, '中点', [centerOf(sk), midOf(lineB)]);
    sk = await expectCounts(ctx, token, 8, 13, '中点');

    // [3] 相切：弧 ↔ 线 A（弧起点已与线 A 终点重合）。
    await addConstraint(page, hub, '相切', [pointOnArc(arc), midOf(lineA)]);
    sk = await expectCounts(ctx, token, 8, 14, '相切');

    // [4] 水平：线 A（求解后按 id 回找当前位置）。
    const lineAAfter = lines(sk).find((l) => l.id === lineAId)!;
    await addConstraint(page, hub, '水平', [midOf(lineAAfter)]);
    sk = await expectCounts(ctx, token, 8, 15, '水平');

    // [5] 竖直：线 B（中点约束已把它中点移到 origin；用 1/4 处避让点拾取热区）。
    const lineBAfter = lines(sk).find((l) => l.id === lineBId)!;
    await addConstraint(page, hub, '竖直', [pointOnLine(lineBAfter, 0.25)]);
    sk = await expectCounts(ctx, token, 8, 16, '竖直');

    const histogram = sk.constraints.reduce<Record<string, number>>((acc, c) => {
      acc[c.kind] = (acc[c.kind] ?? 0) + 1;
      return acc;
    }, {});
    for (const kind of ['coincident', 'midpoint', 'tangent', 'horizontal', 'vertical'] as const)
      expect(histogram[kind] ?? 0, `${kind} 增量`).toBe((histBefore[kind] ?? 0) + 1);
    expect(sk.solve.status).not.toBe('conflicting');
  });

  test('标注：长度/半径/距离各自落一行并保留数值', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS);
    const { ctx, token, hub } = await boot(page, request);

    await activate(page, '拐角矩形');
    await clickWorld(page, hub, P(-20, 20));
    await clickWorld(page, hub, P(20, 0));
    await page.waitForTimeout(1_500);
    let sk = await expectCounts(ctx, token, 5, 10, '矩形');

    await activate(page, '线');
    await clickWorld(page, hub, P(30, 10));
    await clickWorld(page, hub, P(60, 10));
    await page.waitForTimeout(1_200);
    sk = await expectCounts(ctx, token, 6, 10, '基准线');

    await activate(page, '3 点圆弧');
    await clickWorld(page, hub, P(60, 10));
    await clickWorld(page, hub, P(75, 0));
    await clickWorld(page, hub, P(72, 7));
    await page.waitForTimeout(1_500);
    sk = await expectCounts(ctx, token, 7, 11, '弧（auto-weld）');

    let line = horizontalLineAt(sk, 10);
    const lineId = line.id;
    await addDimension(page, hub, '长度', [midOf(line)], 45);
    sk = await expectCounts(ctx, token, 7, 12, '长度 45');

    const arc = arcs(sk)[0]!;
    await addDimension(page, hub, '半径', [pointOnArc(arc)], 12.5);
    sk = await expectCounts(ctx, token, 7, 13, '半径 12.5');

    // 标注求解可能移动/旋转线：按 id 回找，不用设计坐标。
    line = lines(sk).find((l) => l.id === lineId)!;
    await addDimension(page, hub, '距离', [centerOf(sk), midOf(line)], 25);
    sk = await expectCounts(ctx, token, 7, 14, '距离 25');

    const dims = sk.constraints.filter((c) => c.kind === 'length' || c.kind === 'distance' || c.kind === 'radius');
    expect(dims).toHaveLength(3);
    expect(dims.find((c) => c.kind === 'length')?.value).toBe(45);
    expect(dims.find((c) => c.kind === 'radius')?.value).toBe(12.5);
    expect(dims.find((c) => c.kind === 'distance')?.value).toBe(25);
    expect(sk.solve.status).not.toBe('conflicting');
  });

  test('双击树二次编辑：草图对话框重开 + 拉伸距离 updateParams 落库', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS);
    const { ctx, hub } = await boot(page, request);
    await activate(page, '拐角矩形');
    await clickWorld(page, hub, P(-30, 12));
    await clickWorld(page, hub, P(25, -8));
    await page.waitForTimeout(1_500);
    await finishSketch(page);

    const featureList = page.getByTestId('part-studio-feature-list');
    await page.getByRole('button', { name: '拉伸', exact: true }).click();
    const createDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(createDialog.getByText('草图 1 的面')).toBeVisible({ timeout: 20_000 });
    await createDialog.getByRole('button', { name: '确认' }).click();
    await expect(featureList.getByRole('button', { name: '拉伸 1' })).toBeVisible({ timeout: 60_000 });

    // 完整 BRep 拓扑叠加：首个实体生成后，装饰件应读到全部拓扑边与顶点
    //（读面走 SolidModeling 命令，提交后自动刷新；不依赖拾取工具）。
    await expect.poll(async () => page.evaluate(() => {
      const deco = (window as any).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.decorators
        ?.find((entry: { id?: string }) => entry.id === 'luban.brep-topology');
      return deco?._topology?.edges?.length ?? 0;
    }), { timeout: 30_000 }).toBeGreaterThan(0);
    await expect.poll(async () => page.evaluate(() => {
      const deco = (window as any).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.decorators
        ?.find((entry: { id?: string }) => entry.id === 'luban.brep-topology');
      return deco?._topology?.vertices?.length ?? 0;
    }), { timeout: 30_000 }).toBeGreaterThan(0);

    // 双击拉伸行 → 同一 FeatureDialog 以编辑态打开，距离回显落库值。
    await featureList.getByRole('button', { name: '拉伸 1' }).dblclick();
    const editDialog = page.getByTestId('part-studio-feature-dialog');
    await expect(editDialog).toBeVisible({ timeout: 15_000 });
    const distance = editDialog.getByRole('textbox', { name: '距离' });
    await expect(distance).toHaveValue('10');
    await expect(editDialog.getByText('草图 1 的面')).toBeVisible({ timeout: 20_000 });
    await distance.fill('20');
    await editDialog.getByRole('button', { name: '确认' }).click();
    await expect(editDialog).toBeHidden({ timeout: 60_000 });
    const tree = await getFeatureTreeRpc(ctx, await getApiToken());
    const extrude = tree.find((entry) => entry.featureType === 'extrude');
    expect((extrude?.params as { distance?: number } | undefined)?.distance).toBe(20);

    // 双击草图行 → 草图对话框重新打开（Onshape 无实体/约束/尺寸常驻面板）。
    await featureList.getByRole('button', { name: '草图 1' }).dblclick();
    const sketchDialog = page.getByTestId('part-studio-sketch-dialog');
    await expect(sketchDialog).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('sketch-panel')).toHaveCount(0);
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible();
    await sketchDialog.getByRole('button', { name: '确认' }).click();
    await expect(sketchDialog).toBeHidden({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '特征工具' })).toBeVisible();
  });

  test('偏移：单线链生成平行线 + offset 关系并由面板精确距离提交', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS);
    const { ctx, token, hub } = await boot(page, request);

    await activate(page, '线');
    await clickWorld(page, hub, P(-30, 20));
    await clickWorld(page, hub, P(30, 20));
    await page.waitForTimeout(1_200);
    let sk = await expectCounts(ctx, token, 1, 0, '源线');

    const source = lineNear(sk, { x: 0, y: 20 });
    await addOffset(page, hub, midOf(source), P(0, 35), 8);
    // 单成员链按 v1 契约展开为 parallel + distance（不产 offset 两对行）。
    sk = await expectCounts(ctx, token, 2, 2, '偏移 8');

    expect(lines(sk)).toHaveLength(2);
    expect(sk.constraints.filter((c) => c.kind === 'parallel')).toHaveLength(1);
    const offsetDistance = sk.constraints.find((c) => c.kind === 'distance');
    expect(offsetDistance?.value).toBe(8);
    expect(sk.constraints.filter((c) => c.kind === 'offset')).toHaveLength(0);
    // 鼠标拾取有亚像素量化：源线实际 y≈19.75；断言相对平行距精确 = 8，绝对位置留量化容差。
    const ys = lines(sk).map((l) => inlineP1(l).y).sort((a, b) => a - b);
    expect(ys[1]! - ys[0]!).toBeCloseTo(8, 1);
    expect(Math.abs(ys[0]! - 20)).toBeLessThan(0.6);
    expect(sk.solve.status).not.toBe('conflicting');
  });
});
