/**
 * Tutorial 2 v1.19 严格鼠标级复刻：真实 UI 工具逐笔建 18 实体/48 约束/9 尺寸
 * + 六特征链（拉伸×3 / 旋转 / 圆角）。
 *
 * 本文件用实际 ribbon 工具 + 画布数据点点击完成 Onshape Tutorial 2 的草图
 * （中心矩形 → 右腿 → 小弧 → 喉线 → 第二矩形 → 偏移链 → 轴线 → 精确样条），
 * 每步读回 RPC（只读）核对累计实体/约束计数；随后经特征对话框完成
 * E1(NEW,127) → E2(ADD,50.8) → E3(ADD,15.875) → R1(ADD,360°) → Fillet(R5.08)。验收口径：
 * - 字面 18 可见实体 / 48 约束 / 9 尺寸（直方图对齐 Onshape 采集）；
 * - 不直发 RPC 草图、不用 replay 模块——全部经工具鼠标流；
 * - 求解终态 dof=0、几何与 gold fixture 一致（样条为单条精确三次贝塞尔）。
 *
 * 唯一「自动关系」= Onshape 同构：矩形工具内建 auto 约束（10 行）、样条工具
 * 恒真端点行（2 行）、绘制端点落在既有端点坐标时自动落 coincident（v1.19
 * sketch-auto-weld，Onshape 推断吸附同构）。
 */
import { expect, test, type Page } from '@playwright/test';
import type { SketchDto, SketchEntityDto } from '@luban-cad/shared';
import {
  getApiToken,
  getBodiesRpc,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
  getSketchRpc,
  openSeedImodelEditor,
} from './helpers';
import { resetBModelSeed } from './seed';
import {
  P,
  activate,
  addConstraint,
  addDimension,
  addOffset,
  clickWorld,
  disableSnap,
  projectWorld,
  regionIndexByArea,
  setStandardView,
  worldOf,
  type Local2,
  type Vec3,
} from './tutorial2-helpers';

type Dialog = ReturnType<Page['getByTestId']>;

/** 拉伸对话框：选草图→（加入页签）→选面域 chips→距离→对称→确认→等树行/错误。 */
async function extrudeViaDialog(
  page: Page,
  dialog: Dialog,
  featureList: Dialog,
  sketchId: string,
  regionIndices: number[],
  distance: string,
  treeRowName: string,
  operation: 'new' | 'add',
): Promise<void> {
  await page.getByRole('button', { name: '拉伸', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox', { name: '草图' }).selectOption(sketchId);
  const chipBox = dialog.getByTestId('part-studio-feature-dialog-region-chips');
  await expect(chipBox).toBeVisible({ timeout: 20_000 });
  await dialog.getByTestId('part-studio-feature-dialog-region-clear').click();
  for (const idx of regionIndices)
    await chipBox.getByRole('button', { name: new RegExp(`面域 ${idx}`) }).click();
  if (operation === 'add') {
    await dialog.getByRole('tab', { name: '加入' }).click();
    await expect(dialog.getByTestId('part-studio-feature-dialog-merge-scope-hint')).toBeVisible({ timeout: 10_000 });
  }
  await dialog.getByLabel('距离').fill(distance);
  await dialog.getByTestId('part-studio-feature-dialog-symmetric-flat').locator('input').check();
  await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 10_000 });
  await dialog.getByRole('button', { name: '确认' }).click();
  await expect(
    featureList.getByRole('button', { name: treeRowName }).or(dialog.getByTestId('part-studio-feature-dialog-error')),
  ).toBeVisible({ timeout: 90_000 });
  if ((await dialog.getByTestId('part-studio-feature-dialog-error').count()) > 0)
    throw new Error(`${treeRowName} 被后端拒收：${await dialog.getByTestId('part-studio-feature-dialog-error').textContent()}`);
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

/** 旋转对话框：选草图→面域→轴→加入 Part 1→全方位→确认。 */
async function revolveViaDialog(
  page: Page,
  dialog: Dialog,
  featureList: Dialog,
  sketchId: string,
  regionIndex: number,
  axisLineId: number,
  treeRowName: string,
): Promise<void> {
  await page.getByRole('button', { name: '旋转', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox', { name: '草图' }).selectOption(sketchId);
  await expect(dialog.getByRole('combobox', { name: '面域' })).toBeVisible({ timeout: 20_000 });
  await dialog.getByRole('combobox', { name: '面域' }).selectOption(String(regionIndex));
  await dialog.getByRole('combobox', { name: '旋转轴' }).selectOption(String(axisLineId));
  await dialog.getByRole('tab', { name: '加入' }).click();
  await expect(dialog.getByTestId('part-studio-feature-dialog-full-revolve').locator('input')).toBeChecked();
  await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 10_000 });
  await dialog.getByRole('button', { name: '确认' }).click();
  await expect(
    featureList.getByRole('button', { name: treeRowName }).or(dialog.getByTestId('part-studio-feature-dialog-error')),
  ).toBeVisible({ timeout: 120_000 });
  if ((await dialog.getByTestId('part-studio-feature-dialog-error').count()) > 0)
    throw new Error(`${treeRowName} 被后端拒收：${await dialog.getByTestId('part-studio-feature-dialog-error').textContent()}`);
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}


test('UI 严格鼠标级：Front 草图 18 实体/48 约束/9 尺寸 + 六特征四短竖棱圆角', async ({ page, request }) => {
  test.slow();
  test.setTimeout(1_200_000);
  const bSeed = await resetBModelSeed(request, await getApiToken());
  const ctx = await openSeedImodelEditor(page, bSeed);

  // 进入草图：Front（前视）平面。
  await page.getByRole('button', { name: '草图', exact: true }).click();
  const sketchDialog = page.getByTestId('part-studio-sketch-dialog');
  await expect(sketchDialog).toBeVisible();
  await sketchDialog.getByRole('combobox', { name: '草图平面' }).selectOption({ label: '前视' });
  await sketchDialog.getByRole('button', { name: '确认' }).click();
  const exitSketch = page.getByTestId('part-studio-ribbon').getByRole('button', { name: '退出草图' });
  await expect(exitSketch.or(sketchDialog.getByTestId('part-studio-sketch-dialog-error'))).toBeVisible({ timeout: 60_000 });
  if ((await sketchDialog.getByTestId('part-studio-sketch-dialog-error').count()) > 0)
    throw new Error(`insertSketch 拒收: ${await sketchDialog.getByTestId('part-studio-sketch-dialog-error').textContent()}`);

  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas boundingBox 不可得');
  const hub = { x: box.x, y: box.y };
  // 正对 Front 草图面取景（StandardViewId.Front=4）：ev.point 才落在与草图面平行的
  // 平面上，局部 v 有变化。取景覆盖整幅 T2 草图（local x −41..111，y −67..10）。
  await page.evaluate(() => {
    const cf = (window as unknown as { __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { getFirstOpenView(): {
      setStandardRotation(id: number): void;
      view: { is3d(): boolean; turnCameraOff(): void };
      synchWithView(a: Record<string, never>): void;
      zoomToVolume(v: { low: { x: number; y: number; z: number }; high: { x: number; y: number; z: number } }): void;
    } | undefined } } } } }).__lubanE2E?.coreFrontend;
    const vp = cf?.IModelApp.viewManager.getFirstOpenView();
    if (!vp) return;
    vp.setStandardRotation(4); // StandardViewId.Front
    if (vp.view.is3d()) vp.view.turnCameraOff();
    // local y → world z = −y：草图占 world x −41..111、z −10..67。取景左侧额外留白，
    // 把全部草图推到左上覆盖层（SketchPanel，canvas 左侧 ~285px）之右——否则
    // 样条起点/起点控制柄的点击会落到面板 DOM 上（实测被吞两次）。
    vp.zoomToVolume({ low: { x: -135, y: -100, z: -20 }, high: { x: 125, y: 100, z: 90 } });
    vp.synchWithView({});
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/t2-mouse-01-sketch-mode.png' });

  const token = await getApiToken();
  const tree = await getFeatureTreeRpc(ctx, token);
  const sketchId = tree.find((row) => row.featureType === 'sketch')?.id;
  expect(sketchId, 'insertSketch 后树内应有 sketch 行').toBeTruthy();

  let sk: SketchDto;
  const read = async (): Promise<SketchDto> => {
    const got = await getSketchRpc(ctx, sketchId!, token);
    expect(got).toBeDefined();
    sk = got!;
    return sk;
  };
  const counts = async (entities: number, constraints: number, label: string): Promise<SketchDto> => {
    const got = await read();
    expect(got.entities.length, `${label} 实体数`).toBe(entities);
    expect(got.constraints.length, `${label} 约束数`).toBe(constraints);
    console.log(`[t2-mouse] ${label}: entities=${got.entities.length} constraints=${got.constraints.length} dof=${got.solve.dof} status=${got.solve.status}`);
    return got;
  };
  const lines = (snapshot: SketchDto) => snapshot.entities.filter((e): e is Extract<SketchEntityDto, { kind: 'line' }> => e.kind === 'line');
  const midOf = (line: Extract<SketchEntityDto, { kind: 'line' }>): Vec3 => {
    if (typeof line.p1 !== 'object' || typeof line.p2 !== 'object') throw new Error('线端点应为内联');
    return worldOf({ x: (line.p1.x + line.p2.x) / 2, y: (line.p1.y + line.p2.y) / 2 });
  };
  /** 世界投影所用的局部坐标（设计值）。 */

  // ── 1. 中心矩形（画在 origin 右上方，随后 origin 重合 + 两条长度尺寸驱动到终态）
  const rectButton = page.getByRole('toolbar', { name: '草图工具' }).getByRole('button', { name: '矩形', exact: true });
  await expect(rectButton).toBeVisible({ timeout: 15_000 });
  await rectButton.click();
  await expect(rectButton).toHaveAttribute('aria-pressed', 'true');
  await disableSnap(page);
  await clickWorld(page, hub, P(-20, 14));
  await clickWorld(page, hub, P(62, -5));
  await page.waitForTimeout(2_500);
  await counts(5, 10, '中心矩形');
  expect(sk!.solve.status).toBe('underconstrained');
  expect(sk!.solve.dof).toBe(2);

  const centerOf = (snapshot: SketchDto): Vec3 => {
    const p = snapshot.entities.find((e) => e.kind === 'point');
    if (!p || p.kind !== 'point') throw new Error('缺中心点');
    return worldOf({ x: p.x ?? 0, y: p.y ?? 0 });
  };
  /** 指定局部坐标附近的可见 point（第二矩形中心——首矩形中心在 origin，不能用 find-first）。 */
  const pointNear = (snapshot: SketchDto, x: number, y: number): Vec3 => {
    const p = snapshot.entities.find((e) => e.kind === 'point' && Math.hypot((e.x ?? 0) - x, (e.y ?? 0) - y) < 5);
    if (!p || p.kind !== 'point') throw new Error(`找不到点 (${x},${y})`);
    return worldOf({ x: p.x ?? 0, y: p.y ?? 0 });
  };
  const topLine = (snapshot: SketchDto) => {
    // 矩形第一条边（a→b）为局部顶边 y≈9.525；矩形工具角序 = 首点、邻角…
    const top = lines(snapshot).find((l) => typeof l.p1 === 'object' && typeof l.p2 === 'object' && Math.abs(l.p1.y - l.p2.y) < 1e-6 && l.p1.y > 0);
    if (!top) throw new Error('找不到矩形顶边');
    return top;
  };
  const rightLine = (snapshot: SketchDto) => {
    const right = lines(snapshot).find((l) => typeof l.p1 === 'object' && typeof l.p2 === 'object' && Math.abs(l.p1.x - l.p2.x) < 1e-6 && l.p1.x > 0);
    if (!right) throw new Error('找不到矩形右边');
    return right;
  };
  const leftLine = (snapshot: SketchDto) => {
    const left = lines(snapshot).find((l) => typeof l.p1 === 'object' && typeof l.p2 === 'object' && Math.abs(l.p1.x - l.p2.x) < 1e-6 && l.p1.x < 0);
    if (!left) throw new Error('找不到矩形左边');
    return left;
  };

  // 中心点 ↔ origin（Onshape [11]）。
  await addConstraint(page, hub, '重合', [centerOf(sk!), P(0, 0)]);
  await counts(5, 11, 'origin 重合');
  // 82.55 / 19.05 长度尺寸（Onshape [12][13]）。
  await addDimension(page, hub, '长度', [midOf(topLine(sk!))], 82.55);
  await addDimension(page, hub, '长度', [midOf(leftLine(sk!))], 19.05);
  let after = await counts(5, 13, '基底长宽尺寸');
  expect(after.solve.status).toBe('ok');
  expect(after.solve.dof).toBe(0);

  // ── 2. 右腿竖线 + 竖直（Onshape [14][15]；起点自动焊到底边右角）
  await activate(page, '线');
  await clickWorld(page, hub, P(41.275, -9.525));
  await clickWorld(page, hub, P(41.275, -27.0002));
  await page.waitForTimeout(1_500);
  after = await counts(6, 14, '右腿线（自动重合）');
  const rightLeg = lines(after).find((l) => {
    if (typeof l.p1 !== 'object' || typeof l.p2 !== 'object') return false;
    return Math.abs(l.p1.x - l.p2.x) < 2 && l.p1.y < 0 && l.p2.y < -20;
  });
  if (!rightLeg) throw new Error('找不到右腿线');
  await addConstraint(page, hub, '竖直', [midOf(rightLeg)]);
  after = await counts(6, 15, '右腿竖直');
  const rightLegNow = lines(after).find((l) => {
    if (typeof l.p1 !== 'object' || typeof l.p2 !== 'object') return false;
    return Math.abs(l.p1.x - l.p2.x) < 1e-6 && l.p1.y < 0 && l.p2.y < -20;
  })!;

  // ── 3. 小弧（圆心 (57.15,−27.0002) R15.875，起点自动焊到右腿末端）+ 相切（[16][17]）
  await activate(page, '圆弧');
  await clickWorld(page, hub, P(41.275, -27.0002));
  await clickWorld(page, hub, P(57.15, -42.8752));
  await clickWorld(page, hub, P(45.925, -38.225));
  await page.waitForTimeout(1_500);
  after = await counts(7, 16, '小弧（自动重合）');
  await addConstraint(page, hub, '相切', [P(45.925, -38.225), midOf(rightLegNow)]);
  after = await counts(7, 17, '小弧-右腿相切');

  // ── 4. 喉部水平线（起点自动焊到小弧末端）+ 相切 + 水平（[18][19][20]）
  await activate(page, '线');
  await clickWorld(page, hub, P(57.15, -42.8752));
  await clickWorld(page, hub, P(85.725, -42.8752));
  await page.waitForTimeout(1_500);
  after = await counts(8, 18, '喉线（自动重合）');
  const throat = lines(after).find((l) => {
    if (typeof l.p1 !== 'object' || typeof l.p2 !== 'object') return false;
    return Math.abs(l.p1.y - l.p2.y) < 2 && l.p1.y < -35;
  });
  if (!throat) throw new Error('找不到喉线');
  await addConstraint(page, hub, '相切', [midOf(throat), P(45.925, -38.225)]);
  after = await counts(8, 19, '喉线-小弧相切');
  await addConstraint(page, hub, '水平', [midOf(throat)]);
  after = await counts(8, 20, '喉线水平');
  const throatNow = lines(after).find((l) => {
    if (typeof l.p1 !== 'object' || typeof l.p2 !== 'object') return false;
    return Math.abs(l.p1.y - l.p2.y) < 1e-6 && l.p1.y < -35;
  })!;

  // ── 5. 第二矩形（中心矩形 (60.325,−66.675)↔(111.125,−38.1)；+5 实体/+10 约束）
  await activate(page, '矩形');
  await clickWorld(page, hub, P(60.325, -66.675));
  await clickWorld(page, hub, P(111.125, -38.1));
  await page.waitForTimeout(2_000);
  after = await counts(13, 30, '第二矩形');
  const center2 = pointNear(after, 85.725, -52.3875);
  const rect2Bottom = (snapshot: SketchDto) => lines(snapshot).find((l) => {
    if (typeof l.p1 !== 'object' || typeof l.p2 !== 'object') return false;
    return Math.abs(l.p1.y - l.p2.y) < 1e-6 && Math.abs(l.p1.y - (-66.675)) < 2 && l.p1.x > 50
      && Math.abs(Math.abs(l.p1.x - l.p2.x) - 50.8) < 10;
  })!;
  const rect2Right = (snapshot: SketchDto) => lines(snapshot).find((l) => {
    if (typeof l.p1 !== 'object' || typeof l.p2 !== 'object') return false;
    return Math.abs(l.p1.x - l.p2.x) < 1e-6 && l.p1.x > 100;
  })!;

  // ── 6. 第二矩形定位（[31] vertical(center, throat.end)；[32]-[37] 尺寸）
  await addConstraint(page, hub, '竖直', [center2, P(85.725, -42.8752)]);
  after = await counts(13, 31, '第二矩形竖直定位');
  await addDimension(page, hub, '半径', [P(45.925, -38.225)], 15.875);
  after = await counts(13, 32, '小弧半径');
  await addDimension(page, hub, '长度', [midOf(rect2Bottom(after))], 50.8);
  after = await counts(13, 33, '第二矩形长度');
  await addDimension(page, hub, '距离', [midOf(throatNow), midOf(topLine(after))], 52.4002);
  after = await counts(13, 34, '喉线到底边距离');
  await addDimension(page, hub, '长度', [midOf(rect2Right(after))], 28.575);
  after = await counts(13, 35, '第二矩形高度');
  // Onshape [36] 是「第二矩形下边（y=−66.675）↔ 基座顶边」76.2（不是上边 −38.1）。
  await addDimension(page, hub, '距离', [midOf(rect2Bottom(after)), midOf(topLine(after))], 76.2);
  after = await counts(13, 36, '第二矩形下边距离');
  /** 第二矩形中心（base 中心已在 origin，用远离原点的可见点识别）。 */
  const rect2Center = (snapshot: SketchDto): Vec3 => {
    const p = snapshot.entities.find((e) => e.kind === 'point' && Math.hypot(e.x ?? 0, e.y ?? 0) > 1);
    if (!p || p.kind !== 'point') throw new Error('找不到第二矩形中心');
    return worldOf({ x: p.x ?? 0, y: p.y ?? 0 });
  };
  await addDimension(page, hub, '距离', [rect2Center(after), midOf(rightLine(after))], 44.45);
  after = await counts(13, 37, '第二矩形中心到基座右边');

  // ── 7. 偏移链（右腿+小弧+喉线 → 左腿+大弧+顶切线；精确距 19.05）[38]-[42]
  await addOffset(page, hub, midOf(rightLegNow), P(22.225, -52.3875), 19.05);
  after = await counts(16, 41, '偏移链');
  const leftLeg = lines(after).find((l) => {
    if (typeof l.p1 !== 'object' || typeof l.p2 !== 'object') return false;
    return Math.abs(l.p1.x - l.p2.x) < 1e-6 && Math.abs(l.p1.x - 22.225) < 2;
  })!;
  await addDimension(page, hub, '距离', [midOf(rightLegNow), midOf(leftLeg)], 19.05);
  after = await counts(16, 42, '偏移距尺寸');

  // ── 8. 旋转轴（第二矩形两条水平边中点的竖直线）[43][44]
  await activate(page, '线');
  await clickWorld(page, hub, P(85.725, -38.1));
  await clickWorld(page, hub, P(85.725, -66.675));
  await page.waitForTimeout(1_200);
  after = await counts(17, 42, '旋转轴线');
  await addConstraint(page, hub, '中点', [P(85.725, -38.1), P(100, -38.1)]);
  after = await counts(17, 43, '轴线起点中点');
  await addConstraint(page, hub, '中点', [P(85.725, -66.675), P(100, -66.675)]);
  after = await counts(17, 44, '轴线终点中点');

  // ── 9. 精确三次贝塞尔样条（起点→终点→起点柄→终点柄；端点自动焊）[45]-[48]
  await activate(page, '样条');
  await clickWorld(page, hub, P(-41.275, -9.525));
  await clickWorld(page, hub, P(57.15, -61.9252));
  await clickWorld(page, hub, P(-39.539240300655365, -40.3054840862751));
  await clickWorld(page, hub, P(16.844818368554112, -60.51863729953766));
  await page.waitForTimeout(2_500);
  after = await counts(18, 48, '样条收官');

  // ── 10. 终态断言：直方图 / 尺寸数 / 求解 / 几何
  expect(after.solve.status, '终态求解状态').toBe('ok');
  expect(after.solve.dof, '终态自由度').toBe(0);
  const histogram = after.constraints.reduce<Record<string, number>>((acc, c) => {
    acc[c.kind] = (acc[c.kind] ?? 0) + 1;
    return acc;
  }, {});
  expect(histogram).toEqual({
    coincident: 18, midpoint: 6, length: 4, distance: 4, parallel: 4,
    horizontal: 3, perpendicular: 2, vertical: 2, tangent: 2, offset: 2, radius: 1,
  });
  const dims = after.constraints.filter((c) => c.kind === 'length' || c.kind === 'distance' || c.kind === 'radius');
  expect(dims).toHaveLength(9);
  expect(dims.map((c) => c.value).sort((a, b) => (a ?? 0) - (b ?? 0)))
    .toEqual([15.875, 19.05, 19.05, 28.575, 44.45, 50.8, 52.4002, 76.2, 82.55]);

  // 几何金标（Onshape API，local mm）：13 线（无序端点对）+ 2 弧（端点/半径）+ 2 点 + 1 样条。
  // 端点排序先按 4 位小数归一：求解器可能让竖直线的 x 相差 1e-15，直接按 raw x 排序会
  // 在相等 x 上先比较噪声 x 而不是 y，导致竖线方向翻转（Chrome 1440×900 实测）。
  const round4 = (v: number): number => Math.round(v * 1e4) / 1e4;
  const canonPair = (a: Local2, b: Local2): string => {
    const ends = [{ x: round4(a.x), y: round4(a.y) }, { x: round4(b.x), y: round4(b.y) }]
      .sort((p, q) => p.x - q.x || p.y - q.y);
    return `${ends[0]!.x.toFixed(4)},${ends[0]!.y.toFixed(4)}|${ends[1]!.x.toFixed(4)},${ends[1]!.y.toFixed(4)}`;
  };
  const canon = (line: Extract<SketchEntityDto, { kind: 'line' }>): string => {
    if (typeof line.p1 !== 'object' || typeof line.p2 !== 'object') throw new Error('线端点应为内联');
    return canonPair(line.p1, line.p2);
  };
  const goldLines: Array<[Local2, Local2]> = [
    [{ x: -41.275, y: -9.525 }, { x: 41.275, y: -9.525 }],
    [{ x: -41.275, y: 9.525 }, { x: 41.275, y: 9.525 }],
    [{ x: -41.275, y: -9.525 }, { x: -41.275, y: 9.525 }],
    [{ x: 41.275, y: -9.525 }, { x: 41.275, y: 9.525 }],
    [{ x: 41.275, y: -9.525 }, { x: 41.275, y: -27.0002 }],
    [{ x: 57.15, y: -42.8752 }, { x: 85.725, y: -42.8752 }],
    [{ x: 60.325, y: -38.1 }, { x: 111.125, y: -38.1 }],
    [{ x: 60.325, y: -66.675 }, { x: 111.125, y: -66.675 }],
    [{ x: 60.325, y: -38.1 }, { x: 60.325, y: -66.675 }],
    [{ x: 111.125, y: -38.1 }, { x: 111.125, y: -66.675 }],
    [{ x: 57.15, y: -61.9252 }, { x: 85.725, y: -61.9252 }],
    [{ x: 22.225, y: -9.525 }, { x: 22.225, y: -27.0002 }],
    [{ x: 85.725, y: -38.1 }, { x: 85.725, y: -66.675 }],
  ];
  const actualLines = lines(after).map(canon).sort();
  const expectedLines = goldLines.map(([a, b]) => canonPair(a, b)).sort();
  expect(actualLines).toEqual(expectedLines);

  const arcs = after.entities.filter((e): e is Extract<SketchEntityDto, { kind: 'arc' }> => e.kind === 'arc');
  expect(arcs).toHaveLength(2);
  const arcSig = (a: Extract<SketchEntityDto, { kind: 'arc' }>): string => {
    const c = a.center;
    if (typeof c !== 'object') throw new Error('弧心应为内联');
    const r = a.radius ?? 0;
    const s = a.startAngle ?? 0;
    const sw = a.sweepAngle ?? 0;
    const ends = [
      { x: c.x + r * Math.cos(s), y: c.y + r * Math.sin(s) },
      { x: c.x + r * Math.cos(s + sw), y: c.y + r * Math.sin(s + sw) },
    ].sort((p, q) => p.x - q.x || p.y - q.y);
    return `${c.x.toFixed(4)},${c.y.toFixed(4)}|${r.toFixed(4)}|${ends[0]!.x.toFixed(4)},${ends[0]!.y.toFixed(4)}|${ends[1]!.x.toFixed(4)},${ends[1]!.y.toFixed(4)}`;
  };
  expect(arcs.map(arcSig).sort()).toEqual([
    '57.1500,-27.0002|15.8750|41.2750,-27.0002|57.1500,-42.8752',
    '57.1500,-27.0002|34.9250|22.2250,-27.0002|57.1500,-61.9252',
  ]);

  const pts = after.entities.filter((e): e is Extract<SketchEntityDto, { kind: 'point' }> => e.kind === 'point');
  expect(pts).toHaveLength(2);
  expect(pts.map((p) => `${(p.x ?? 0).toFixed(4)},${(p.y ?? 0).toFixed(4)}`).sort())
    .toEqual(['0.0000,0.0000', '85.7250,-52.3875']);

  const spline = after.entities.find((e): e is Extract<SketchEntityDto, { kind: 'spline' }> => e.kind === 'spline');
  expect(spline, '应有 1 条样条').toBeDefined();
  expect(spline!.controlPoints).toHaveLength(4);
  const goldControls: Local2[] = [
    { x: -41.275, y: -9.525 },
    { x: -39.539240300655365, y: -40.3054840862751 },
    { x: 16.844818368554112, y: -60.51863729953766 },
    { x: 57.15, y: -61.9252 },
  ];
  let maxCtrlDev = 0;
  spline!.controlPoints.forEach((p, i) => {
    const dev = Math.hypot(p.x - goldControls[i]!.x, p.y - goldControls[i]!.y);
    maxCtrlDev = Math.max(maxCtrlDev, dev);
  });
  console.log(`[t2-mouse] spline 控制点最大偏差 = ${maxCtrlDev.toFixed(4)} mm`);
  expect(maxCtrlDev, '样条控制点偏差').toBeLessThan(1.0);

  console.log(`[t2-mouse] FINAL histogram=${JSON.stringify(histogram)} dims=${dims.length}`);
  await page.screenshot({ path: 'test-results/t2-mouse-99-final-sketch.png' });

  // ── 11. 退出草图 → 六特征链（真实特征对话框；E1 新建，E2/E3/R1 加入 Part 1）
  await exitSketch.click();
  await expect(exitSketch).toBeHidden({ timeout: 30_000 });
  const featureList = page.getByTestId('part-studio-feature-list');
  await expect(featureList.getByRole('button', { name: '草图 1' })).toBeVisible({ timeout: 60_000 });

  const regions = after.regions ?? [];
  expect(regions.length, `面域数=${regions.length}：${JSON.stringify(regions)}`).toBeGreaterThanOrEqual(4);
  const idxBase = regionIndexByArea(regions, 1572.585); // 底座 82.55×19.05（JGG）
  const idxBand = regionIndexByArea(regions, 1153.56); // 拱形环带+喉部（JGa）
  const idxBandWing = regionIndexByArea(regions, 483.87); // JGe：拱形中带（E2 第二面域）
  const idxRevolveProfile = regionIndexByArea(regions, 725.775); // JGW：旋转矩形轴右半（R1）
  const idxLobe = regionIndexByArea(regions, 2298.36); // 拱肩环面（JGK）
  console.log(`[t2-mouse] 面域映射：base=${idxBase} band=${idxBand} bandWing=${idxBandWing} revolve=${idxRevolveProfile} lobe=${idxLobe}（共 ${regions.length}）`);
  const axisLine = lines(after).find((l) =>
    typeof l.p1 === 'object' && typeof l.p2 === 'object'
    && Math.abs(l.p1.x - 85.725) < 1e-6 && Math.abs(l.p2.x - 85.725) < 1e-6);
  if (!axisLine) throw new Error('找不到旋转轴线');
  const axisLineId = axisLine.id;

  const dialog = page.getByTestId('part-studio-feature-dialog');
  await extrudeViaDialog(page, dialog, featureList, sketchId!, [idxBase], '127', '拉伸 1', 'new');
  await extrudeViaDialog(page, dialog, featureList, sketchId!, [idxBand, idxBandWing], '50.8', '拉伸 2', 'add');
  await extrudeViaDialog(page, dialog, featureList, sketchId!, [idxLobe], '15.875', '拉伸 3', 'add');
  await revolveViaDialog(page, dialog, featureList, sketchId!, idxRevolveProfile, axisLineId, '旋转 1');

  const treeAfter = await getFeatureTreeRpc(ctx, token);
  console.log(`[t2-mouse] feature tree: ${JSON.stringify(treeAfter.map((r) => ({ type: r.featureType, status: r.status })))}`);
  expect(treeAfter.map((r) => r.featureType)).toEqual(['sketch', 'extrude', 'extrude', 'extrude', 'revolve']);
  expect(treeAfter.every((r) => r.status === 0), '六列特征状态全 0').toBe(true);
  const bodies = await getBodiesRpc(ctx, token);
  const activeBodies = bodies.filter((b) => b.active);
  expect(activeBodies, `active authored body 唯一：${JSON.stringify(bodies)}`).toHaveLength(1);
  const mass = await getMassPropertiesRpc(ctx, token);
  const volumeMm3 = mass.reduce((sum, m) => sum + m.volume, 0);
  console.log(`[t2-mouse] 无圆角体积 = ${(volumeMm3 / 1000).toFixed(3)} cm³（fixture 无圆角 357.988）`);
  expect(volumeMm3 / 1000, '无圆角体积').toBeGreaterThan(357.988 * 0.995);
  expect(volumeMm3 / 1000, '无圆角体积').toBeLessThan(357.988 * 1.005);
  await page.screenshot({ path: 'test-results/t2-mouse-10-features.png' });

  // ── 12. Fillet 1：底座盒四根竖角棱（R5.08，切向延伸；右视拾右侧两条、左视拾左侧两条）
  await setStandardView(page, 6 /* Iso */, {
    low: { x: -90, y: -90, z: -40 }, high: { x: 180, y: 90, z: 90 },
  });
  await page.waitForTimeout(6_000); // tile 流送驻留（locate 命中依赖可见几何）
  await page.screenshot({ path: 'test-results/t2-mouse-11-iso.png' });

  await page.getByRole('button', { name: '圆角', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('半径').fill('5.08');
  const propagate = dialog.getByTestId('part-studio-feature-dialog-propagate-smooth').locator('input');
  if (!(await propagate.isChecked())) await propagate.check(); // gold tangentPropagation=true
  await dialog.getByTestId('part-studio-feature-dialog-add-edge').click();
  await expect(dialog.getByTestId('part-studio-feature-dialog-picking-hint')).toBeVisible({ timeout: 15_000 });

  const pickFillet = async (points: Vec3[]): Promise<void> => {
    for (const p of points) {
      const [px] = await projectWorld(page, hub, [p]);
      if (!px) throw new Error('投影失败');
      await page.mouse.move(px.x - 15, px.y + 12);
      await page.waitForTimeout(150);
      await page.mouse.move(px.x, px.y);
      await page.waitForTimeout(450); // boresite 运动定位窗口
      await page.mouse.down();
      await page.waitForTimeout(60);
      await page.mouse.up();
      await page.waitForTimeout(700);
    }
  };
  const chips = dialog.getByTestId('part-studio-feature-dialog-edge-chips');
  const dialogBox = await dialog.boundingBox();
  const canvasBox = await page.getByTestId('part-studio-viewport').locator('canvas').first().boundingBox();
  if (!dialogBox || !canvasBox) throw new Error('fillet 拾取缺少 dialog/canvas boundingBox');
  const safeMinX = dialogBox.x + dialogBox.width + 24;
  const safeMaxX = canvasBox.x + canvasBox.width - 24;

  /** 在指定标准视图里找一个取景体积，使给定世界点在对话框右侧、画布内。 */
  const framePointsRightOfDialog = async (viewId: number, points: Vec3[]): Promise<void> => {
    const centers = [-400, -300, -200, -100, 0, 100, 200, 300, 400];
    let last: Array<{ x: number; y: number }> = [];
    for (const centerY of centers) {
      const volume = {
        low: { x: -120, y: centerY - 260, z: -70 },
        high: { x: 170, y: centerY + 260, z: 70 },
      };
      await setStandardView(page, viewId, volume);
      last = await projectWorld(page, hub, points);
      if (last.every((p) => p.x > safeMinX && p.x < safeMaxX
        && p.y > canvasBox.y + 20 && p.y < canvasBox.y + canvasBox.height - 20)) {
        console.log(`[t2-mouse] fillet view=${viewId} centerY=${centerY} 投影=${JSON.stringify(last.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })))}`);
        return;
      }
    }
    throw new Error(`无法把 fillet 拾取点放到对话框右侧：view=${viewId} last=${JSON.stringify(last)} safe=[${safeMinX},${safeMaxX}]`);
  };

  // Onshape Fillet 1 = 底座四条**短 Z 竖棱**（19.05mm），不是长 Y 深棱。
  // 右视看 x=+41.275 面：两条短棱在 y=±63.5；左视看 x=-41.275 面。
  // 把整个面取景推到特性对话框右侧，逐条点击棱中点（z=0）。
  const rightFacePoints: Vec3[] = [
    { x: 41.275, y: -63.5, z: 0 },
    { x: 41.275, y: 63.5, z: 0 },
  ];
  const leftFacePoints: Vec3[] = [
    { x: -41.275, y: -63.5, z: 0 },
    { x: -41.275, y: 63.5, z: 0 },
  ];
  await framePointsRightOfDialog(3 /* Right */, rightFacePoints);
  await pickFillet(rightFacePoints);
  console.log(`[t2-mouse] fillet chips after Right = ${await chips.locator('li').count().catch(() => 0)}`);
  await framePointsRightOfDialog(2 /* Left */, leftFacePoints);
  await pickFillet(leftFacePoints);
  const chipCount = await chips.locator('li').count();
  console.log(`[t2-mouse] fillet chips = ${chipCount}/4`);
  await page.screenshot({ path: 'test-results/t2-mouse-12-fillet-picked.png' });
  expect(chipCount, '四条短竖棱逐条拾取（不重复）').toBe(4);

  await dialog.getByTestId('part-studio-feature-dialog-add-edge').click();
  await expect(dialog.getByTestId('part-studio-feature-dialog-picking-hint')).toBeHidden({ timeout: 10_000 });
  await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 10_000 });
  await dialog.getByRole('button', { name: '确认' }).click();
  await expect(
    featureList.getByRole('button', { name: '圆角 1' }).or(dialog.getByTestId('part-studio-feature-dialog-error')),
  ).toBeVisible({ timeout: 120_000 });
  if ((await dialog.getByTestId('part-studio-feature-dialog-error').count()) > 0)
    throw new Error(`圆角 1 被后端拒收：${await dialog.getByTestId('part-studio-feature-dialog-error').textContent()}`);
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  const finalTree = await getFeatureTreeRpc(ctx, token);
  console.log(`[t2-mouse] final tree: ${JSON.stringify(finalTree.map((r) => ({ type: r.featureType, status: r.status })))}`);
  expect(finalTree.map((r) => r.featureType)).toEqual(['sketch', 'extrude', 'extrude', 'extrude', 'revolve', 'fillet']);
  expect(finalTree.every((r) => r.status === 0), '六特征状态全 0').toBe(true);
  const finalBodies = await getBodiesRpc(ctx, token);
  expect(finalBodies.filter((b) => b.active), `单 active body：${JSON.stringify(finalBodies)}`).toHaveLength(1);
  const finalMass = await getMassPropertiesRpc(ctx, token);
  const finalVolumeMm3 = finalMass.reduce((sum, m) => sum + m.volume, 0);
  const finalCm3 = finalVolumeMm3 / 1000;
  const removalCm3 = volumeMm3 / 1000 - finalCm3;
  console.log(`[t2-mouse] 四短棱圆角体积 = ${finalCm3.toFixed(3)} cm³；去材 = ${removalCm3.toFixed(3)} cm³（fixture 357.566 / 去材 0.422）`);
  expect(removalCm3, '四短棱去材').toBeGreaterThan(0.35);
  expect(removalCm3, '四短棱去材').toBeLessThan(0.50);
  expect(finalCm3, '最终体积 ≤0.5% vs API 357.568').toBeGreaterThan(357.568 * 0.995);
  expect(finalCm3, '最终体积 ≤0.5% vs API 357.568').toBeLessThan(357.568 * 1.005);

  await setStandardView(page, 6 /* Iso */, {
    low: { x: -90, y: -90, z: -40 }, high: { x: 180, y: 90, z: 90 },
  });
  await page.waitForTimeout(6_000);
  await page.screenshot({ path: 'test-results/t2-mouse-99-final.png' });
});
