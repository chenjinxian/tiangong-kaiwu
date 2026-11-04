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
  gotoRoute,
  loginWithSession,
  openSeedImodelEditor,
} from './helpers';
import { resetBModelSeed } from './seed';
import {
  P,
  activate,
  addConstraint,
  addDimension,
  addOffset,
  chooseProfileRegionsInViewport,
  chooseSketchPlaneInViewport,
  clickWorld,
  disableSnap,
  finishSketch,
  frameCurrentView,
  frameStandardView,
  hoverWorld,
  projectWorld,
  regionIndexByArea,
  screenBounds,
  setStandardView,
  worldOf,
  type Local2,
  type Vec3,
} from './tutorial2-helpers';
import {
  SCENES,
  expectDynamicPreview,
  expectLivePreview,
  resetTutorial2Project,
  showcaseCaption,
  showcaseEnabled,
  showcaseScene,
  showcaseShot,
} from './tutorial2-showcase';

type Dialog = ReturnType<Page['getByTestId']>;

/** 拉伸对话框：视口点面域（Onshape「面和草图面域」）→距离→对称→确认→等树行/错误。 */
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
  // 草图自动取最近一张；面域在视口中点击（无草图/面域下拉）。
  const marker = page.getByTestId('feature-profile-picker');
  await expect(marker).toBeAttached({ timeout: 20_000 });
  await expect.poll(async () => {
    const raw = await marker.getAttribute('data-region-points');
    try {
      return (raw ? JSON.parse(raw) : []).some((entry: { sketchId: string }) => entry.sketchId === sketchId);
    } catch {
      return false;
    }
  }, { timeout: 20_000 }).toBe(true);
  await chooseProfileRegionsInViewport(page, regionIndices);
  if (operation === 'add') {
    await dialog.getByRole('tab', { name: '加入' }).click();
    await expect(dialog.getByTestId('part-studio-feature-dialog-merge-scope-hint')).toBeVisible({ timeout: 10_000 });
  }
  await dialog.getByLabel('距离').fill(distance);
  await dialog.getByTestId('part-studio-feature-dialog-symmetric-flat').locator('input').check();
  await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 10_000 });
  await expectLivePreview(page, treeRowName);
  await dialog.getByRole('button', { name: '确认' }).click();
  await expect(
    featureList.getByRole('button', { name: treeRowName }).or(dialog.getByTestId('part-studio-feature-dialog-error')),
  ).toBeVisible({ timeout: 90_000 });
  if ((await dialog.getByTestId('part-studio-feature-dialog-error').count()) > 0)
    throw new Error(`${treeRowName} 被后端拒收：${await dialog.getByTestId('part-studio-feature-dialog-error').textContent()}`);
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

/** 旋转对话框：视口点面域→轴→加入 Part 1→全方位→确认。 */
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
  const marker = page.getByTestId('feature-profile-picker');
  await expect(marker).toBeAttached({ timeout: 20_000 });
  await expect.poll(async () => {
    const raw = await marker.getAttribute('data-region-points');
    try {
      return (raw ? JSON.parse(raw) : []).some((entry: { sketchId: string }) => entry.sketchId === sketchId);
    } catch {
      return false;
    }
  }, { timeout: 20_000 }).toBe(true);
  await chooseProfileRegionsInViewport(page, [regionIndex]);
  await dialog.getByRole('combobox', { name: '旋转轴' }).selectOption(String(axisLineId));
  await dialog.getByRole('tab', { name: '加入' }).click();
  await expect(dialog.getByTestId('part-studio-feature-dialog-full-revolve').locator('input')).toBeChecked();
  await expect(dialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 10_000 });
  await expectLivePreview(page, treeRowName);
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
  // T2_KEEP_OPEN=1：演示完不关闭浏览器，留给用户手动操作（无超时）。
  const keepOpen = process.env.T2_KEEP_OPEN === '1';
  test.setTimeout(keepOpen ? 0 : 1_200_000);
  // 展示模式：新建并持久化「Tutorial 2 - Build a Part」项目/iModel（幂等）；
  // 回归模式：既有 B 种子重置（相机轨迹/断言不变）。
  const token0 = await getApiToken();
  const showcase = showcaseEnabled();
  const bSeed = showcase
    ? await resetTutorial2Project(request, token0)
    : await resetBModelSeed(request, token0);
  if (showcase) {
    // 展示模式先到文档中心：新项目「Tutorial 2 - Build a Part」已在列（随后
    // 直接进入该项目的编辑器；项目/iModel 由 API 新建并持久化）。
    await loginWithSession(page);
    await gotoRoute(page, '/documents', 'documents-route');
    await expect(
      page.getByTestId('projects-section')
        .getByRole('button', { name: 'Tutorial 2 - Build a Part' }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await showcaseShot(page, '新建项目', 1200);
  }
  const ctx = await openSeedImodelEditor(page, bSeed);
  await showcaseCaption(page, '步骤 2｜打开 Part Studio', '空白 Part Studio；左侧特征树、右侧 3D 视口。接下来从草图开始。');

  // 进入草图：Front（前视）平面。
  await showcaseCaption(page, '步骤 3｜新建草图', '点击工具栏「草图」→ 在视口中点击 Front 基准面（蓝色高亮）→ 绿色✓确认。');
  await page.getByRole('button', { name: '草图', exact: true }).click();
  const sketchDialog = page.getByTestId('part-studio-sketch-dialog');
  await expect(sketchDialog).toBeVisible();
  await chooseSketchPlaneInViewport(page, 'front');
  await expect(sketchDialog.getByRole('combobox', { name: '草图平面' })).toContainText('前视');
  await sketchDialog.getByRole('button', { name: '确认' }).click();
  // Onshape：创建后同一草图对话框保持打开（编辑态），草图工具条变身。
  await expect(
    page.getByRole('toolbar', { name: '草图工具' }).or(sketchDialog.getByTestId('part-studio-sketch-dialog-error')),
  ).toBeVisible({ timeout: 60_000 });
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
    // 把全部草图推到左上草图对话框覆盖区（canvas 左侧 ~285px）之右——否则
    // 样条起点/起点控制柄的点击会落到面板 DOM 上（实测被吞两次）。
    vp.zoomToVolume({ low: { x: -135, y: -100, z: -20 }, high: { x: 125, y: 100, z: 90 } });
    vp.synchWithView({});
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/t2-mouse-01-sketch-mode.png' });
  await showcaseScene(page, SCENES.sketchFull);

  // 长跑（演示 >4min）不得缓存 token：每次读 RPC 前经 getApiToken 单飞续命，
  // 否则 token 在草图/特征后段过期 → MS 401（2026-11-02 演示实录）。
  const tree = await getFeatureTreeRpc(ctx, await getApiToken());
  const sketchId = tree.find((row) => row.featureType === 'sketch')?.id;
  expect(sketchId, 'insertSketch 后树内应有 sketch 行').toBeTruthy();

  // 回归（2026-11-04）：LubanCAD.Sketch 不再写 native geometry stream（params 唯一数据源，
  // SketchCurvesDecoration 唯一显示源）——元素几何流必须为空，否则会在 XY（Bottom）出现重复。
  await expect.poll(async () => page.evaluate(async (id) => {
    const cf = (window as unknown as {
      __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { getFirstOpenView(): {
        iModel: { elements: { loadProps(id: string, options: { wantGeometry: true }): Promise<{ geom?: unknown[] } | undefined> } };
      } | undefined } } } };
    }).__lubanE2E?.coreFrontend;
    const vp = cf?.IModelApp.viewManager.getFirstOpenView();
    if (!vp) return -1;
    const props = await vp.iModel.elements.loadProps(id, { wantGeometry: true });
    return props?.geom?.length ?? 0;
  }, sketchId!), { timeout: 90_000 }).toBe(0);

  let sk: SketchDto;
  const read = async (): Promise<SketchDto> => {
    const got = await getSketchRpc(ctx, sketchId!, await getApiToken());
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
  await showcaseCaption(page, '步骤 4｜中心矩形', '工具：拐角矩形\n画布点击 (-20, 14) → (62, -5)（草图局部坐标，mm）\n第一角点落定后，光标旁实时显示宽度/高度（Onshape live）。');
  const rectButton = page.getByRole('toolbar', { name: '草图工具' }).getByRole('button', { name: '拐角矩形', exact: true });
  await expect(rectButton).toBeVisible({ timeout: 15_000 });
  await rectButton.click();
  await expect(rectButton).toHaveAttribute('aria-pressed', 'true');
  await disableSnap(page);
  await clickWorld(page, hub, P(-20, 14));
  // Onshape live 标注提示：第一角点落定后，光标旁必须出现实时宽/高（未驱动
  // 维度值=鼠标实际拖出的 82 × 19，随后尺寸才收敛到 82.55 × 19.05）。
  await hoverWorld(page, hub, P(62, -5));
  const liveFeedback = page.getByTestId('sketch-tool-feedback');
  await expect(liveFeedback, '绘制过程中应显示光标旁实时尺寸').toBeVisible({ timeout: 10_000 });
  const liveMeasures = (await liveFeedback.getAttribute('data-measures')) ?? '';
  const liveWidth = Number(/width=([\d.]+)/.exec(liveMeasures)?.[1]);
  const liveHeight = Number(/height=([\d.]+)/.exec(liveMeasures)?.[1]);
  expect(liveWidth, `实时宽度应≈82（像素取整误差内）：${liveMeasures}`).toBeGreaterThan(81);
  expect(liveWidth, `实时宽度应≈82（像素取整误差内）：${liveMeasures}`).toBeLessThan(83);
  expect(liveHeight, `实时高度应≈19（像素取整误差内）：${liveMeasures}`).toBeGreaterThan(18);
  expect(liveHeight, `实时高度应≈19（像素取整误差内）：${liveMeasures}`).toBeLessThan(20);
  await page.screenshot({ path: 'test-results/t2-mouse-02-live-feedback.png' });
  await page.waitForTimeout(500); // 演示驻留：让实时标注在录屏中可读
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
  await showcaseCaption(page, '步骤 5｜原点重合 + 尺寸', '重合：矩形中心 → 原点 (0, 0)\n长度尺寸：82.55 与 19.05\n尺寸落库后常驻画布标注（尺寸线/箭头/数值，Onshape 同款）。');
  await addConstraint(page, hub, '重合', [centerOf(sk!), P(0, 0)]);
  await counts(5, 11, 'origin 重合');
  // 82.55 / 19.05 长度尺寸（Onshape [12][13]）。
  await addDimension(page, hub, '长度', [midOf(topLine(sk!))], 82.55);
  await addDimension(page, hub, '长度', [midOf(leftLine(sk!))], 19.05);
  let after = await counts(5, 13, '基底长宽尺寸');
  expect(after.solve.status).toBe('ok');
  expect(after.solve.dof).toBe(0);
  // Onshape live：尺寸落库后画布必须出现尺寸标注（不是只有面板清单）。
  const annotationsMarker = page.getByTestId('sketch-annotations');
  await expect(annotationsMarker).toHaveAttribute('data-count', '2', { timeout: 15_000 });
  await expect(annotationsMarker).toHaveAttribute('data-labels', /82\.55/);
  await expect(annotationsMarker).toHaveAttribute('data-labels', /19\.05/);
  await showcaseScene(page, SCENES.sketchBase);

  // ── 2. 右腿竖线 + 竖直（Onshape [14][15]；起点自动焊到底边右角）
  await showcaseCaption(page, '步骤 6｜右腿', '工具：线\n(41.275, -9.525) → (41.275, -27.0002)\n起点自动焊到底边右角；约束：竖直。');
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
  await showcaseCaption(page, '步骤 7｜小弧', '工具：3 点圆弧\n(41.275, -27.0002) → (57.15, -42.8752) → (45.925, -38.225)\n起点焊到右腿末端；约束：与右腿相切。');
  await activate(page, '3 点圆弧');
  await clickWorld(page, hub, P(41.275, -27.0002));
  await clickWorld(page, hub, P(57.15, -42.8752));
  await clickWorld(page, hub, P(45.925, -38.225));
  await page.waitForTimeout(1_500);
  after = await counts(7, 16, '小弧（自动重合）');
  await addConstraint(page, hub, '相切', [P(45.925, -38.225), midOf(rightLegNow)]);
  after = await counts(7, 17, '小弧-右腿相切');

  // ── 4. 喉部水平线（起点自动焊到小弧末端）+ 相切 + 水平（[18][19][20]）
  await showcaseCaption(page, '步骤 8｜喉线', '工具：线\n(57.15, -42.8752) → (85.725, -42.8752)\n起点焊到小弧末端；约束：相切 + 水平。');
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
  await showcaseScene(page, SCENES.sketchRight);

  // ── 5. 第二矩形（中心矩形 (60.325,−66.675)↔(111.125,−38.1)；+5 实体/+10 约束）
  await showcaseCaption(page, '步骤 9｜第二矩形', '工具：拐角矩形\n(60.325, -66.675) → (111.125, -38.1)\n随后定位：中心竖直对齐喉线端点；尺寸 50.8 / 28.575 / 52.4002 / 76.2 / 44.45。');
  await activate(page, '拐角矩形');
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
  await showcaseScene(page, SCENES.sketchRect2);

  // ── 7. 偏移链（右腿+小弧+喉线 → 左腿+大弧+顶切线；精确距 19.05）[38]-[42]
  await showcaseCaption(page, '步骤 10｜偏移链', '工具：偏移\n选右腿 → 小弧 → 喉线链；光标放在链左侧\n距离 19.05；再标注右腿到左腿 19.05。');
  await addOffset(page, hub, midOf(rightLegNow), P(22.225, -52.3875), 19.05);
  after = await counts(16, 41, '偏移链');
  const leftLeg = lines(after).find((l) => {
    if (typeof l.p1 !== 'object' || typeof l.p2 !== 'object') return false;
    return Math.abs(l.p1.x - l.p2.x) < 1e-6 && Math.abs(l.p1.x - 22.225) < 2;
  })!;
  await addDimension(page, hub, '距离', [midOf(rightLegNow), midOf(leftLeg)], 19.05);
  after = await counts(16, 42, '偏移距尺寸');

  // ── 8. 旋转轴（第二矩形两条水平边中点的竖直线）[43][44]
  await showcaseCaption(page, '步骤 11｜旋转轴', '工具：线\n(85.725, -38.1) → (85.725, -66.675)\n两端点分别与第二矩形两条水平边的中点约束。');
  await activate(page, '线');
  await clickWorld(page, hub, P(85.725, -38.1));
  await clickWorld(page, hub, P(85.725, -66.675));
  await page.waitForTimeout(1_200);
  after = await counts(17, 42, '旋转轴线');
  await addConstraint(page, hub, '中点', [P(85.725, -38.1), P(100, -38.1)]);
  after = await counts(17, 43, '轴线起点中点');
  await addConstraint(page, hub, '中点', [P(85.725, -66.675), P(100, -66.675)]);
  after = await counts(17, 44, '轴线终点中点');
  await showcaseScene(page, SCENES.sketchOffset);

  // ── 9. 精确三次贝塞尔样条（起点→终点→起点柄→终点柄；端点自动焊）[45]-[48]
  await showcaseCaption(page, '步骤 12｜样条', '工具：样条\n起点 (-41.275, -9.525) → 终点 (57.15, -61.9252)\n→ 起点控制柄 (-39.5392, -40.3055) → 终点控制柄 (16.8448, -60.5186)\n端点自动焊接到基座与偏移链。');
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
  // 9 条尺寸约束全部在画布上有标注（Onshape live：长度/距离/半径）。
  await expect(annotationsMarker).toHaveAttribute('data-count', '9', { timeout: 15_000 });
  const annotationLabels = (await annotationsMarker.getAttribute('data-labels')) ?? '';
  for (const label of ['82.55', '19.05', 'R15.875', '50.8', '52.4002', '28.575', '76.2', '44.45']) {
    expect(annotationLabels, `草图标注应包含 ${label}`).toContain(label);
  }
  await page.screenshot({ path: 'test-results/t2-mouse-99-final-sketch.png' });
  await showcaseScene(page, SCENES.sketchFull);
  await showcaseCaption(page, '步骤 13｜草图完成', '18 实体 / 48 约束 / 9 尺寸；DOF = 0；识别 8 个面域。\n画布上 9 条尺寸标注全部可见：长度/距离/半径（R15.875）。', 1800);

  // ── 11. 退出草图 → 六特征链（真实特征对话框；E1 新建，E2/E3/R1 加入 Part 1）
  await showcaseCaption(page, '步骤 14｜退出草图', '点击草图对话框绿色 ✓（完成）→ 回到 3D Iso 视口（自动适应模型）。');
  await finishSketch(page);
  const featureList = page.getByTestId('part-studio-feature-list');
  await expect(featureList.getByRole('button', { name: '草图 1' })).toBeVisible({ timeout: 60_000 });
  await showcaseScene(page, SCENES.partIso);

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
  await showcaseCaption(page, '步骤 15｜拉伸 1（新建）', '点击「拉伸」→ 草图自动选中 → 在视口中点击基座面域（1570）\n距离 127，勾选对称；新建实体。');
  await extrudeViaDialog(page, dialog, featureList, sketchId!, [idxBase], '127', '拉伸 1', 'new');
  await showcaseScene(page, SCENES.partIso);
  await showcaseCaption(page, '步骤 16｜拉伸 2（加入）', '拉伸 → 在视口中依次点击拱形带面域（1150）+ 翼面域（484）\n两个面域各出现一个「草图 1 的面」chip；距离 50.8，对称；加入 Part 1。');
  await extrudeViaDialog(page, dialog, featureList, sketchId!, [idxBand, idxBandWing], '50.8', '拉伸 2', 'add');
  await showcaseScene(page, SCENES.partIso);
  await showcaseCaption(page, '步骤 17｜拉伸 3（加入）', '拉伸 → 在视口中点击拱肩面域（2310）\n距离 15.875，对称；加入 Part 1。');
  await extrudeViaDialog(page, dialog, featureList, sketchId!, [idxLobe], '15.875', '拉伸 3', 'add');
  await showcaseScene(page, SCENES.partIso);
  await showcaseCaption(page, '步骤 18｜旋转 1（加入）', '点击「旋转」→ 在视口中点击轴右半面域（726）\n旋转轴：竖直线 7；全方位 360°；加入 Part 1。');
  await revolveViaDialog(page, dialog, featureList, sketchId!, idxRevolveProfile, axisLineId, '旋转 1');
  await showcaseScene(page, SCENES.partIso);

  const treeAfter = await getFeatureTreeRpc(ctx, await getApiToken());
  console.log(`[t2-mouse] feature tree: ${JSON.stringify(treeAfter.map((r) => ({ type: r.featureType, status: r.status })))}`);
  expect(treeAfter.map((r) => r.featureType)).toEqual(['sketch', 'extrude', 'extrude', 'extrude', 'revolve']);
  expect(treeAfter.every((r) => r.status === 0), '六列特征状态全 0').toBe(true);
  const bodies = await getBodiesRpc(ctx, await getApiToken());
  const activeBodies = bodies.filter((b) => b.active);
  expect(activeBodies, `active authored body 唯一：${JSON.stringify(bodies)}`).toHaveLength(1);
  const mass = await getMassPropertiesRpc(ctx, await getApiToken());
  const volumeMm3 = mass.reduce((sum, m) => sum + m.volume, 0);
  console.log(`[t2-mouse] 无圆角体积 = ${(volumeMm3 / 1000).toFixed(3)} cm³（fixture 无圆角 357.988）`);
  expect(volumeMm3 / 1000, '无圆角体积').toBeGreaterThan(357.988 * 0.995);
  expect(volumeMm3 / 1000, '无圆角体积').toBeLessThan(357.988 * 1.005);
  await page.screenshot({ path: 'test-results/t2-mouse-10-features.png' });

  // ── 12. Fillet 1：底座盒四根竖角棱（R5.08，切向延伸；右视拾右侧两条、左视拾左侧两条）
  // 相机纪律（2026-11-02 按演示反馈修正）：不再用 500+ 单位的巨型取景体积
  // 把模型推到对话框右侧；统一按模型真实范围 lookAtVolume + 非对称留白。
  const modelBounds = {
    low: { x: -41.275, y: -63.5, z: -9.525 },
    high: { x: 41.275, y: 63.5, z: 66.675 },
  };
  const modelCorners: Vec3[] = [];
  for (const x of [modelBounds.low.x, modelBounds.high.x])
    for (const y of [modelBounds.low.y, modelBounds.high.y])
      for (const z of [modelBounds.low.z, modelBounds.high.z])
        modelCorners.push({ x, y, z });

  await frameStandardView(page, 6 /* Iso */, modelBounds, { left: 0.55, right: 0.05, top: 0.08, bottom: 0.22 });
  await page.waitForTimeout(6_000); // tile 流送驻留（locate 命中依赖可见几何）
  await page.screenshot({ path: 'test-results/t2-mouse-11-iso.png' });

  await showcaseCaption(page, '步骤 19｜圆角 1', '点击「圆角」→ 半径 5.08，勾选切向延伸\n保持 Iso 立体视角：先拾取可见侧 2 条短竖棱；再绕竖直轴旋转 180°（高度不变）\n拾取背面 2 条。结果预览：后端影子求值 → TileRpc 动态 iMdl。', 1600);
  await page.getByRole('button', { name: '圆角', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('半径').fill('5.08');
  const propagate = dialog.getByTestId('part-studio-feature-dialog-propagate-smooth').locator('input');
  if (!(await propagate.isChecked())) await propagate.check(); // gold tangentPropagation=true
  await dialog.getByTestId('part-studio-feature-dialog-add-edge').click();
  await expect(dialog.getByTestId('part-studio-feature-dialog-picking-hint')).toBeVisible({ timeout: 15_000 });

  const clickFilletPoint = async (p: Vec3): Promise<void> => {
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
  };
  const chips = dialog.getByTestId('part-studio-feature-dialog-edge-chips');
  const dialogBox = await dialog.boundingBox();
  const canvasBox = await page.getByTestId('part-studio-viewport').locator('canvas').first().boundingBox();
  if (!dialogBox || !canvasBox) throw new Error('fillet 拾取缺少 dialog/canvas boundingBox');
  /**
   * 每条边点击后核对 chips 增量；未命中时最多重试两次。
   * 关键：重试前把鼠标移到远处并等待 >900ms，避免连续两次落空点击被宿主
   * 解释成双击（实测会触发视图操作，把标准左视旋成角视图——演示 2026-11-02
   * 失败现场的相机漂移根因）。
   */
  const pickFillet = async (points: Vec3[]): Promise<void> => {
    for (const p of points) {
      const before = await chips.locator('li').count();
      for (let attempt = 0; attempt < 3; attempt++) {
        await clickFilletPoint(p);
        if ((await chips.locator('li').count()) !== before) break;
        await page.mouse.move(
          canvasBox.x + canvasBox.width * 0.72,
          canvasBox.y + canvasBox.height * 0.82,
        );
        await page.waitForTimeout(950);
      }
    }
  };
  const safeMinX = dialogBox.x + dialogBox.width + 24;
  const safeMaxX = canvasBox.x + canvasBox.width - 24;
  const safeCenterX = (safeMinX + safeMaxX) / 2;

  const assertModelFramed = async (label: string, minWidthRatio: number): Promise<void> => {
    const projected = await projectWorld(page, hub, modelCorners);
    const bounds = screenBounds(projected);
    console.log(`[t2-mouse] ${label} 取景=${JSON.stringify({
      left: Math.round(bounds.left), right: Math.round(bounds.right),
      top: Math.round(bounds.top), bottom: Math.round(bounds.bottom),
      width: Math.round(bounds.width), height: Math.round(bounds.height),
    })} safe=[${Math.round(safeMinX)},${Math.round(safeMaxX)}]`);
    expect(bounds.left, `${label}：模型应完全在特性对话框右侧`).toBeGreaterThan(safeMinX);
    expect(bounds.right, `${label}：模型应在画布内`).toBeLessThan(safeMaxX);
    expect(bounds.top, `${label}：模型应在画布内`).toBeGreaterThan(canvasBox.y + 10);
    expect(bounds.bottom, `${label}：模型应在画布内`).toBeLessThan(canvasBox.y + canvasBox.height - 10);
    expect(bounds.width, `${label}：模型宽度应≥可用区 50%`).toBeGreaterThan(canvasBox.width * minWidthRatio);
    expect(Math.abs(bounds.centerX - safeCenterX), `${label}：模型应居中于对话框右侧可用区`).toBeLessThan(canvasBox.width * 0.08);
    expect(
      Math.abs(bounds.centerY - (canvasBox.y + canvasBox.height / 2)),
      `${label}：模型应垂直居中`,
    ).toBeLessThan(canvasBox.height * 0.12);
  };

  // Onshape Fillet 1 = 底座四条**短 Z 竖棱**（19.05mm），不是长 Y 深棱。
  // 演示相机纪律（2026-11-03 用户反馈）：**始终保持在 Iso 立体视角**，不再切
  // Right/Left 正交视图；先拾当前可见侧两条，再用 ViewCube 罗盘箭头绕世界 Z
  // 旋转 180°（俯仰角不变），拾背面两条。
  const rightFacePoints: Vec3[] = [
    { x: 41.275, y: -63.5, z: 0 },
    { x: 41.275, y: 63.5, z: 0 },
  ];
  const leftFacePoints: Vec3[] = [
    { x: -41.275, y: -63.5, z: 0 },
    { x: -41.275, y: 63.5, z: 0 },
  ];
  const readViewZ = async (): Promise<{ x: number; y: number; z: number }> =>
    page.evaluate(() => {
      const cf = (window as unknown as { __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { getFirstOpenView(): {
        view: { getZVector(): { x: number; y: number; z: number } };
      } | undefined } } } } }).__lubanE2E?.coreFrontend;
      const vp = cf?.IModelApp.viewManager.getFirstOpenView();
      return vp ? vp.view.getZVector() : { x: 0, y: 0, z: 0 };
    });
  const normalizeDeg = (deg: number): number => ((deg + 540) % 360) - 180;
  const yawRight = page.getByRole('button', { name: '向右旋转 15°' });
  const yawLeftArrow = page.getByRole('button', { name: '向左旋转 15°' });
  /** 保持俯仰角，仅绕世界 Z 用 ViewCube 罗盘箭头转到目标方位角（15° 步进）。 */
  const yawToAzimuth = async (targetDeg: number): Promise<void> => {
    let z = await readViewZ();
    let current = (Math.atan2(z.y, z.x) * 180) / Math.PI;
    let err = normalizeDeg(targetDeg - current);
    if (Math.abs(err) < 5) return;
    // 校准一次箭头方向（右箭头可能对应 +15° 或 -15° 方位角）。
    await yawRight.click();
    await page.waitForTimeout(150);
    z = await readViewZ();
    const after = (Math.atan2(z.y, z.x) * 180) / Math.PI;
    const moved = normalizeDeg(after - current);
    const arrow = Math.sign(moved) === Math.sign(err) ? yawRight : yawLeftArrow;
    let remaining = normalizeDeg(targetDeg - after);
    const steps = Math.min(24, Math.max(0, Math.round(Math.abs(remaining) / 15)));
    for (let i = 0; i < steps; i++) {
      await arrow.click();
      await page.waitForTimeout(140);
    }
  };

  // 视图 z 指向屏幕内：z.x<0 表示相机在 +X 侧（右侧面可见）。
  const viewZ = await readViewZ();
  const firstIsRight = viewZ.x < 0;
  const firstPair = firstIsRight ? rightFacePoints : leftFacePoints;
  const secondPair = firstIsRight ? leftFacePoints : rightFacePoints;
  // 目标：同一俯仰角，水平方位贴近拾取面（±15°），仍保持 3D Iso 观感。
  const ySign = viewZ.y >= 0 ? 1 : -1;
  const firstTarget = firstIsRight ? 180 - 15 * ySign : 0 + 15 * ySign;
  const secondTarget = firstIsRight ? 0 + 15 * ySign : 180 - 15 * ySign;
  await showcaseCaption(page, '步骤 19｜圆角 1 · Iso 斜视（第一侧）', '保持 Iso 俯仰角，用 ViewCube 罗盘绕竖直轴转到第一侧斜视。\n拾取该侧两条短竖棱；模型按真实范围紧取景于对话框右侧。', 1200);
  await yawToAzimuth(firstTarget);
  await frameCurrentView(page, modelBounds, { left: 0.55, right: 0.05, top: 0.08, bottom: 0.12 });
  await assertModelFramed('圆角-Iso 第一侧', 0.45);
  const firstScreen = await projectWorld(page, hub, firstPair);
  for (const p of firstScreen)
    expect(p.x > safeMinX && p.x < safeMaxX, `Iso 拾取点应在对话框右侧：${JSON.stringify(p)}`).toBe(true);
  await page.waitForTimeout(1_200);
  await pickFillet(firstPair);
  const firstChips = await chips.locator('li').count();
  console.log(`[t2-mouse] fillet chips after Iso side 1 = ${firstChips}`);
  expect(firstChips, '第一侧两条短竖棱').toBe(2);

  // 同一俯仰角绕世界 Z 转到另一侧（约 180°），不切 Right/Left 正交视图。
  await showcaseCaption(page, '步骤 19｜圆角 1 · Iso 斜视（第二侧）', '保持 Iso 俯仰角，用 ViewCube 罗盘绕竖直轴转到另一侧。\n**不切换到右视/左视**；相机始终是 3D Iso 观感。', 1200);
  await yawToAzimuth(secondTarget);
  await frameCurrentView(page, modelBounds, { left: 0.55, right: 0.05, top: 0.08, bottom: 0.12 });
  await assertModelFramed('圆角-Iso 第二侧', 0.45);
  await page.waitForTimeout(2_500); // 转向后 tile/locate 缓存落定
  await pickFillet(secondPair);
  const chipCount = await chips.locator('li').count();
  console.log(`[t2-mouse] fillet chips = ${chipCount}/4`);
  await page.screenshot({ path: 'test-results/t2-mouse-12-fillet-picked.png' });
  expect(chipCount, '四条短竖棱逐条拾取（不重复）').toBe(4);

  // 结果预览一出现即切实心（源体透明化，不是 neverDrawn）：橙线走
  // FilletEdgePickTool 独立 WorldOverlay，不受源体显隐影响。灰透明副本会与
  // 源体共面产生深度噪点（演示反馈 #1）。
  await expect(
    page.getByTestId('part-studio-feature-preview'),
    '预览出现后应进入源体透明的实心结果预览',
  ).toHaveAttribute('data-source-hidden', '1', { timeout: 30_000 });

  // 回到 Iso：整模居中且足够大，动态圆角预览必须能看清（演示反馈 #1）。
  await showcaseCaption(page, '步骤 19｜圆角 1 · 结果预览', '相机回到 Iso 立体并紧贴整模取景。\n实心灰体 = 后端影子求值的真实圆角结果（源体临时透明）；橙色 = 已选 4 条短竖棱。', 1200);
  await frameStandardView(page, 6 /* Iso */, modelBounds, { left: 0.55, right: 0.05, top: 0.08, bottom: 0.22 });
  await assertModelFramed('圆角-Iso 预览', 0.3);
  await expectDynamicPreview(page, '圆角结果');
  await page.screenshot({ path: 'test-results/t2-mouse-13-fillet-preview.png' });

  // 结果确认前结束拾取（Onshape：参数对话框打开期间已选边高亮保留）。
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
  await showcaseShot(page, '圆角完成', 800);

  const finalTree = await getFeatureTreeRpc(ctx, await getApiToken());
  console.log(`[t2-mouse] final tree: ${JSON.stringify(finalTree.map((r) => ({ type: r.featureType, status: r.status })))}`);
  expect(finalTree.map((r) => r.featureType)).toEqual(['sketch', 'extrude', 'extrude', 'extrude', 'revolve', 'fillet']);
  expect(finalTree.every((r) => r.status === 0), '六特征状态全 0').toBe(true);
  const finalBodies = await getBodiesRpc(ctx, await getApiToken());
  expect(finalBodies.filter((b) => b.active), `单 active body：${JSON.stringify(finalBodies)}`).toHaveLength(1);
  const finalMass = await getMassPropertiesRpc(ctx, await getApiToken());
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
  await showcaseCaption(page, '步骤 20｜完成', '四短竖棱圆角完成：最终体积 357.716 cm³（去材 0.422 cm³）\n收官三视角：Iso 立体 → 正视图 → 右视图。', 1600);
  // 收官三视角：Iso 立体 → 正视轮廓 → 右视厚度。
  await showcaseScene(page, SCENES.partIso);
  await showcaseScene(page, SCENES.partFront);
  await showcaseScene(page, SCENES.partRight);

  if (keepOpen) {
    // 演示完成：回到 Iso 并撤掉字幕，浏览器保持打开供用户自由操作。
    await setStandardView(page, 6 /* Iso */, {
      low: { x: -90, y: -90, z: -40 }, high: { x: 180, y: 90, z: 90 },
    });
    await showcaseCaption(
      page,
      '演示完成｜可自由操作',
      '浏览器将保持打开。可旋转视图、双击特征树二次编辑、继续草图/拉伸等操作。\n关闭 Chrome 结束本次演示。',
      5_000,
    );
    await page.evaluate(() => document.getElementById('t2-demo-caption')?.remove());
    console.log('[t2-demo] READY keep-open：演示完成，浏览器保持打开供手动操作');
    await page.waitForTimeout(6 * 60 * 60 * 1000);
  }
});
