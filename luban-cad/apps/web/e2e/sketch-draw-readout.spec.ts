/**
 * 草图绘制画布读数（2026-11-16 E6/S5 + W12 + W15 + W16 Onshape live）：第一点
 * 落定后只移动光标（不落后续点）——
 * - 拐角矩形：宽/高数值贴在对应边旁（蓝色文字、随边旋转），同项尺寸不再
 *   渲染光标旁白卡片；
 * - 直线：长度读数贴线显示（随线旋转）；
 * - 中心点圆：`Ø` 直径点标签水平落在圆心→光标半径段中点（半径卡被替代）；
 * - 三点圆弧：起点/终点已锚、光标为弧上点时 `R` 半径点标签水平落在弧角向
 *   中点外侧（半径卡被替代）；
 * - 内切多边形：与中心点圆同一圆心→光标半径状态的 `Ø` 直径点标签（半径卡
 *   被替代，输入边数不改变读数）；
 * - 圆心圆弧（W25）：阶段 1 `R` 半径点标签落在圆心→光标段中点；阶段 2
 *   （起点已锚）固定在圆心→起点中点、扫角光标不移动/不改值，无角度白卡。
 * - 相切圆弧（W28）：切点选定后移动光标，`R` 半径点标签水平落在
 *   「切点→弧终点（光标）」弦的投影中点，随光标移动并更新读数；
 * - 3 点圆（W31-B）：前两点已点、移动光标定第三点时 `Ø` 直径点标签水平落在
 *   **预览圆圆心与第一个已点点的投屏中点**（与光标角度无关，跟随预览圆）。
 * 除 W28 先提交一条直线作切点基线外，其余工具 Esc 退出、取消草图 = 不提交几何。
 */
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { getApiToken, openSeedImodelEditor } from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import {
  P,
  activate,
  chooseSketchPlaneInViewport,
  clickWorld,
  disableSnap,
  hoverWorld,
  projectWorld,
  setStandardView,
} from './tutorial2-helpers.js';

/** 等工具真正退出（Esc 后工具实例卸载；toolId 不变即旧实例仍在）。 */
async function expectToolExited(page: Page, toolId: string): Promise<void> {
  await expect.poll(() => page.evaluate(() => {
    const im = (window as unknown as { __lubanE2E?: { coreFrontend: { IModelApp: { _toolAdmin?: { activeTool?: { toolId?: string } } } } } })
      .__lubanE2E?.coreFrontend?.IModelApp;
    return (im?._toolAdmin)?.activeTool?.toolId;
  }), { timeout: 15_000 }).not.toBe(toolId);
}

/** 从内联 style 提取 rotate 角度（与覆盖层同一布局语义）。 */
function rotationDeg(style: string | null): number {
  const match = /rotate\((-?[\d.]+)deg\)/.exec(style ?? '');
  return match ? Number(match[1]) : Number.NaN;
}

/** 标签可视中心（页面坐标；点标签以 `point` 为 translate(-50%,-50%) 中心）。 */
async function labelCenter(label: Locator): Promise<{ x: number; y: number }> {
  const box = await label.boundingBox();
  if (!box) throw new Error('标签无包围盒');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** 两投影点中点（页面坐标；与 sketchPointLabelCenter 同一中点口径）。 */
function midpointOf(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

test.describe('草图绘制画布读数（E6/S5 + W12 + W15 + W16 + W25 + W28）', () => {
  test('矩形宽/高、直线长度、圆/多边形 Ø 直径、三点弧/圆心弧/相切弧 R 半径读数可见；Esc 退出不提交', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 120_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    await openSeedImodelEditor(page, seed);

    await page.getByRole('button', { name: '草图', exact: true }).click();
    const dialog = page.getByTestId('part-studio-sketch-dialog');
    await expect(dialog).toBeVisible();
    await chooseSketchPlaneInViewport(page, 'front');
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas boundingBox 不可得');
    const hub = { x: box.x, y: box.y };
    await setStandardView(page, 4, {
      low: { x: -100, y: -100, z: -100 }, high: { x: 100, y: 100, z: 100 },
    });
    await disableSnap(page);

    await activate(page, '拐角矩形');
    // 第一点落定；随后只移动鼠标（不第二次点击，形状不提交）。
    await clickWorld(page, hub, P(0, 0));
    await hoverWorld(page, hub, P(10, 5));

    const widthLabel = page.getByTestId('sketch-draw-edge-label-width');
    const heightLabel = page.getByTestId('sketch-draw-edge-label-height');
    await expect(widthLabel, '宽边旁应有实时数值').toBeVisible({ timeout: 10_000 });
    await expect(heightLabel, '高边旁应有实时数值').toBeVisible({ timeout: 10_000 });

    const widthValue = (await widthLabel.textContent())?.trim() ?? '';
    const heightValue = (await heightLabel.textContent())?.trim() ?? '';
    expect(widthValue).toMatch(/^\d+(\.\d+)?$/);
    expect(heightValue).toMatch(/^\d+(\.\d+)?$/);
    expect(Number(widthValue)).toBeGreaterThan(0);
    expect(Number(heightValue)).toBeGreaterThan(0);

    // 贴边标签随边旋转且保持正立（CSS rotate 值域 −90°..90°）。
    const rotations = await Promise.all([widthLabel, heightLabel].map(async (label) => {
      const transform = (await label.getAttribute('style')) ?? '';
      const match = /rotate\((-?[\d.]+)deg\)/.exec(transform);
      return match ? Number(match[1]) : Number.NaN;
    }));
    for (const rotation of rotations) {
      expect(Number.isNaN(rotation)).toBe(false);
      expect(Math.abs(rotation)).toBeLessThanOrEqual(90.0001);
    }

    // 这两项尺寸已贴边 → 不再渲染白卡片；阶段提示 pill 保留。
    await expect(page.getByTestId('sketch-tool-feedback')).toHaveCount(0);
    await expect(page.getByTestId('sketch-tool-hint')).toBeVisible();

    // Esc 退出工具（未落第二点=未提交）。
    await page.keyboard.press('Escape');
    await expectToolExited(page, 'Sketch.Rectangle');

    // ── W12 直线：长度读数贴在线上方、随线旋转（live：中点略上方） ──
    await activate(page, '线');
    await clickWorld(page, hub, P(0, 0));
    await hoverWorld(page, hub, P(10, 10));
    const lengthLabel = page.getByTestId('sketch-draw-edge-label-length');
    await expect(lengthLabel, '直线上应有贴线长度读数').toBeVisible({ timeout: 10_000 });
    const lengthText = (await lengthLabel.textContent())?.trim() ?? '';
    expect(lengthText).toMatch(/^\d+(\.\d+)?$/);
    expect(Number(lengthText)).toBeGreaterThan(0);
    // 45° 线：读数随线旋转但保持正立（CSS rotate 值域 −90°..90°）。
    const lineRotation = rotationDeg(await lengthLabel.getAttribute('style'));
    expect(Number.isNaN(lineRotation)).toBe(false);
    expect(Math.abs(lineRotation)).toBeGreaterThan(0.5);
    expect(Math.abs(lineRotation)).toBeLessThanOrEqual(90.0001);
    // live：直线拖拽同一帧只有旋转的长度读数，角度卡也不渲染 → 无白卡片。
    await expect(page.getByTestId('sketch-tool-feedback')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expectToolExited(page, 'Sketch.Line');

    // ── W12 中心点圆：Ø 直径点标签水平落在半径段中点 ──
    // 圆心 P(0,0)、光标 P(10,0) → 半径 10 mm、直径 ≈20 mm（像素取整容差 ±1，
    // 与 tutorial2 贴边宽断言同口径）。
    await activate(page, '中心点圆');
    await clickWorld(page, hub, P(0, 0));
    await hoverWorld(page, hub, P(10, 0));
    const diameterLabel = page.getByTestId('sketch-draw-point-label-diameter');
    await expect(diameterLabel, '圆心→光标半径段中点应有 Ø 直径读数').toBeVisible({ timeout: 10_000 });
    const diameterText = (await diameterLabel.textContent())?.trim() ?? '';
    expect(diameterText.startsWith('Ø'), `直径读数应以 Ø 开头：${diameterText}`).toBe(true);
    const diameterValue = Number(diameterText.slice('Ø'.length));
    expect(diameterValue).toBeGreaterThan(19);
    expect(diameterValue).toBeLessThan(21);
    // 点标签水平不旋转（只有居中平移）。
    expect(await diameterLabel.getAttribute('style')).not.toContain('rotate');
    // 半径读数已由 Ø 点标签替代 → 不再渲染白卡片；阶段提示 pill 保留。
    await expect(page.getByTestId('sketch-tool-feedback')).toHaveCount(0);
    await expect(page.getByTestId('sketch-tool-hint')).toBeVisible();
    await page.keyboard.press('Escape');
    await expectToolExited(page, 'Sketch.CenterCircle');

    // ── W15 三点圆弧：起点→终点→弧上点拖动时的 R 半径点标签 ──
    // 起点 P(0,0)、终点 P(10,0)、弧上点 P(5,5) → 过三点圆半径 5 mm；标签
    // 水平落在弧角向中点外侧（live：R 前缀、无白卡片）。
    await activate(page, '三点圆弧');
    await clickWorld(page, hub, P(0, 0));
    await clickWorld(page, hub, P(10, 0));
    await hoverWorld(page, hub, P(5, 5));
    const radiusLabel = page.getByTestId('sketch-draw-point-label-radius');
    await expect(radiusLabel, '三点圆弧拖拽应有 R 半径点标签').toBeVisible({ timeout: 10_000 });
    const radiusText = (await radiusLabel.textContent())?.trim() ?? '';
    expect(radiusText.startsWith('R'), `半径读数应以 R 开头：${radiusText}`).toBe(true);
    const arcRadius = Number(radiusText.slice('R'.length));
    expect(Number.isFinite(arcRadius)).toBe(true);
    expect(arcRadius).toBeGreaterThan(0);
    // 点标签水平不旋转（只有居中平移）。
    expect(await radiusLabel.getAttribute('style')).not.toContain('rotate');
    // 半径读数已由 R 点标签替代 → 无白卡片；阶段提示 pill 保留。
    await expect(page.getByTestId('sketch-tool-feedback')).toHaveCount(0);
    await expect(page.getByTestId('sketch-tool-hint')).toBeVisible();
    await page.keyboard.press('Escape');
    await expectToolExited(page, 'Sketch.Arc3Point');

    // ── W25 圆心圆弧：R 半径点标签落在圆心→半径段的投影中点 ──
    // live 2026-11-17：阶段 1（仅圆心、光标定起点）标签居中于圆心→光标段
    // 中点；阶段 2（起点已锚）固定在圆心→起点中点，扫角光标不移动/不改值，
    // 两阶段均无角度白卡。圆心 P(0,0)、起点 P(10,0)、扫角光标 P(10,10)。
    const [centerScreen, startScreen] = await projectWorld(page, hub, [P(0, 0), P(10, 0)]);
    const radiiMidpoint = midpointOf(centerScreen!, startScreen!);

    await activate(page, '圆心圆弧');
    await clickWorld(page, hub, P(0, 0));
    await hoverWorld(page, hub, P(10, 0));
    const centerArcLabel = page.getByTestId('sketch-draw-point-label-radius');
    await expect(centerArcLabel, '圆心圆弧阶段 1 应有 R 半径点标签')
      .toBeVisible({ timeout: 10_000 });
    const stage1Text = (await centerArcLabel.textContent())?.trim() ?? '';
    expect(stage1Text.startsWith('R'), `半径读数应以 R 开头：${stage1Text}`).toBe(true);
    const stage1Radius = Number(stage1Text.slice('R'.length));
    expect(Number.isFinite(stage1Radius)).toBe(true);
    expect(stage1Radius).toBeGreaterThan(9);
    expect(stage1Radius).toBeLessThan(11);
    // 点标签水平不旋转（只有居中平移）。
    expect(await centerArcLabel.getAttribute('style')).not.toContain('rotate');
    // 标签中心 = 圆心/光标投影中点（±2 px，吸收画布/文字包围盒取整）。
    await expect.poll(async () => {
      const center = await labelCenter(centerArcLabel);
      return Math.max(Math.abs(center.x - radiiMidpoint.x), Math.abs(center.y - radiiMidpoint.y));
    }, { timeout: 10_000 }).toBeLessThanOrEqual(2);
    // 半径读数已由 R 点标签替代 → 无白卡片；阶段提示 pill 保留。
    await expect(page.getByTestId('sketch-tool-feedback')).toHaveCount(0);
    await expect(page.getByTestId('sketch-tool-hint')).toBeVisible();

    // 阶段 2：落起点后扫角光标移到另一象限——标签位置/读数保持不变。
    await clickWorld(page, hub, P(10, 0));
    await hoverWorld(page, hub, P(10, 10));
    await expect(centerArcLabel, '圆心圆弧阶段 2 应保留 R 半径点标签')
      .toBeVisible({ timeout: 10_000 });
    const stage2Text = (await centerArcLabel.textContent())?.trim() ?? '';
    expect(stage2Text, '阶段 2 读数应固定为圆心→起点半径').toBe(stage1Text);
    await expect.poll(async () => {
      const center = await labelCenter(centerArcLabel);
      return Math.max(Math.abs(center.x - radiiMidpoint.x), Math.abs(center.y - radiiMidpoint.y));
    }, { timeout: 10_000 }).toBeLessThanOrEqual(2);
    // 阶段 2 不显示角度：无白卡片，阶段提示 pill 保留。
    await expect(page.getByTestId('sketch-tool-feedback')).toHaveCount(0);
    await expect(page.getByTestId('sketch-tool-hint')).toBeVisible();
    await page.keyboard.press('Escape');
    await expectToolExited(page, 'Sketch.CenterArc');

    // ── W28 相切圆弧：切点→弧终点的弦投影中点 `R` 半径点标签 ──
    // live 2026-11-17：点选线端点定切点、移动光标定弧终点，`R<半径>` 水平落在
    // 弦的投屏中点（无白卡）。先提交一条 P(0,0)→P(10,0) 直线（两次点击，Esc
    // 退出工具），再从 P(0,0) 切出：光标 P(5,5) → r=5；换 P(5,10) → r=6.25，
    // 标签随新弦中点移动并更新读数。
    await activate(page, '线');
    await clickWorld(page, hub, P(0, 0));
    await clickWorld(page, hub, P(10, 0));
    await page.waitForTimeout(1_200);
    await page.keyboard.press('Escape');
    await expectToolExited(page, 'Sketch.Line');

    const [tChordStart1, tChordEnd1] = await projectWorld(page, hub, [P(0, 0), P(5, 5)]);
    const [tChordStart2, tChordEnd2] = await projectWorld(page, hub, [P(0, 0), P(5, 10)]);
    const tChordMidpoint1 = midpointOf(tChordStart1!, tChordEnd1!);
    const tChordMidpoint2 = midpointOf(tChordStart2!, tChordEnd2!);

    await activate(page, '相切圆弧');
    await clickWorld(page, hub, P(0, 0));
    await hoverWorld(page, hub, P(5, 5));
    const tangentArcLabel = page.getByTestId('sketch-draw-point-label-radius');
    await expect(tangentArcLabel, '相切圆弧切点选定后应有 R 半径点标签')
      .toBeVisible({ timeout: 10_000 });
    const tangentText1 = (await tangentArcLabel.textContent())?.trim() ?? '';
    expect(tangentText1.startsWith('R'), `半径读数应以 R 开头：${tangentText1}`).toBe(true);
    const tangentRadius1 = Number(tangentText1.slice('R'.length));
    expect(tangentRadius1).toBeGreaterThan(4.5);
    expect(tangentRadius1).toBeLessThan(5.5);
    // 点标签水平不旋转（只有居中平移）。
    expect(await tangentArcLabel.getAttribute('style')).not.toContain('rotate');
    // 标签中心 = 切点/光标投影弦中点（±2 px，吸收画布/文字包围盒取整）。
    await expect.poll(async () => {
      const center = await labelCenter(tangentArcLabel);
      return Math.max(Math.abs(center.x - tChordMidpoint1.x), Math.abs(center.y - tChordMidpoint1.y));
    }, { timeout: 10_000 }).toBeLessThanOrEqual(2);
    // 相切圆弧本就不发光标旁白卡片（measures 恒空）；阶段提示 pill 保留。
    await expect(page.getByTestId('sketch-tool-feedback')).toHaveCount(0);
    await expect(page.getByTestId('sketch-tool-hint')).toBeVisible();

    // 光标移到 P(5,10)：标签跟随新弦中点、读数更新（r=6.25）。
    await hoverWorld(page, hub, P(5, 10));
    await expect.poll(async () => (await tangentArcLabel.textContent())?.trim())
      .not.toBe(tangentText1);
    const tangentText2 = (await tangentArcLabel.textContent())?.trim() ?? '';
    expect(tangentText2.startsWith('R'), `半径读数应以 R 开头：${tangentText2}`).toBe(true);
    const tangentRadius2 = Number(tangentText2.slice('R'.length));
    expect(tangentRadius2).toBeGreaterThan(6);
    expect(tangentRadius2).toBeLessThan(6.5);
    await expect.poll(async () => {
      const center = await labelCenter(tangentArcLabel);
      return Math.max(Math.abs(center.x - tChordMidpoint2.x), Math.abs(center.y - tChordMidpoint2.y));
    }, { timeout: 10_000 }).toBeLessThanOrEqual(2);
    await expect(page.getByTestId('sketch-tool-feedback')).toHaveCount(0);
    await expect(page.getByTestId('sketch-tool-hint')).toBeVisible();
    await page.keyboard.press('Escape');
    await expectToolExited(page, 'Sketch.TangentArc');

    // ── W31-B 3 点圆（周边圆）：Ø 直径点标签落在预览圆圆心与第一点投屏中点 ──
    // live 2026-11-17：前两点已点、移动光标定第三点时显示水平 `Ø<直径>`（无
    // 白卡），锚点=预览圆圆心与第一个已点点的屏幕空间线性中点，与光标角度
    // 无关；读数跟随预览圆（圆心/半径）而非光标。先落 P(0,0)/P(10,0)，光标
    // P(5,5) → 过三点圆圆心 P(5,0)、r=5 → 直径 10 mm（数值容差见下）。
    const [circleCenter1, circleP1] = await projectWorld(page, hub, [P(5, 0), P(0, 0)]);
    const circleAnchor1 = midpointOf(circleCenter1!, circleP1!);

    await activate(page, '3 点圆');
    await clickWorld(page, hub, P(0, 0));
    await clickWorld(page, hub, P(10, 0));
    await hoverWorld(page, hub, P(5, 5));
    const perimeterDiameter = page.getByTestId('sketch-draw-point-label-diameter');
    await expect(perimeterDiameter, '3 点圆第三点候选应有 Ø 直径读数')
      .toBeVisible({ timeout: 10_000 });
    /** Ø 读数 → 数值（容错解析：非 Ø/空文本返回 NaN；轮询回调内不断言）。 */
    const parseDiameterMm = async (label: Locator): Promise<number> => {
      const text = (await label.textContent())?.trim() ?? '';
      return text.startsWith('Ø') ? Number(text.slice('Ø'.length)) : Number.NaN;
    };
    // Ø 前缀只断言一次（放在轮询之外——回调内断言会中断重试而非等待）。
    const perimeterPrefixText = (await perimeterDiameter.textContent())?.trim() ?? '';
    expect(perimeterPrefixText.startsWith('Ø'), `直径读数应以 Ø 开头：${perimeterPrefixText}`)
      .toBe(true);
    /**
     * 轮询解析后的 Ø 数值进入期望区间（与相邻 W12/W25/W28 同口径：真实栈
     * 鼠标落点有亚毫米差，用容差；三个期望值互不相交）。失败时 Playwright
     * 报告观测到的数值，而非笼统的布尔 false。
     */
    const expectDiameterAround = async (expected: number, tolerance: number): Promise<void> => {
      await expect.poll(() => parseDiameterMm(perimeterDiameter), { timeout: 10_000 })
        .toBeGreaterThan(expected - tolerance);
      await expect.poll(() => parseDiameterMm(perimeterDiameter), { timeout: 10_000 })
        .toBeLessThan(expected + tolerance);
    };
    await expectDiameterAround(10, 0.5);
    // 点标签水平不旋转（只有居中平移）。
    expect(await perimeterDiameter.getAttribute('style')).not.toContain('rotate');
    // 标签中心 = 预览圆圆心/第一点投影中点（±2 px，吸收画布/文字包围盒取整）。
    await expect.poll(async () => {
      const center = await labelCenter(perimeterDiameter);
      return Math.max(Math.abs(center.x - circleAnchor1.x), Math.abs(center.y - circleAnchor1.y));
    }, { timeout: 10_000 }).toBeLessThanOrEqual(2);
    // 直径读数已由 Ø 点标签替代 → 无白卡片；阶段提示 pill 保留。
    await expect(page.getByTestId('sketch-tool-feedback')).toHaveCount(0);
    await expect(page.getByTestId('sketch-tool-hint')).toBeVisible();

    // 光标 P(0,10)：过三点圆圆心 P(5,5)、r=√50 → 直径 14.14；
    // 锚点 = 圆心与第一个点的投屏中点（标签跟随预览圆，不跟随光标）。
    const [circleCenter2] = await projectWorld(page, hub, [P(5, 5)]);
    const circleAnchor2 = midpointOf(circleCenter2!, circleP1!);
    await hoverWorld(page, hub, P(0, 10));
    await expectDiameterAround(14.14, 0.7);
    await expect.poll(async () => {
      const center = await labelCenter(perimeterDiameter);
      return Math.max(Math.abs(center.x - circleAnchor2.x), Math.abs(center.y - circleAnchor2.y));
    }, { timeout: 10_000 }).toBeLessThanOrEqual(2);

    // 再换光标 P(5,10)：预览圆变心 P(5,3.75)、r=6.25 → 直径 12.5，
    // 读数/锚点继续跟随预览圆。
    const [circleCenter3] = await projectWorld(page, hub, [P(5, 3.75)]);
    const circleAnchor3 = midpointOf(circleCenter3!, circleP1!);
    await hoverWorld(page, hub, P(5, 10));
    await expectDiameterAround(12.5, 0.6);
    await expect.poll(async () => {
      const center = await labelCenter(perimeterDiameter);
      return Math.max(Math.abs(center.x - circleAnchor3.x), Math.abs(center.y - circleAnchor3.y));
    }, { timeout: 10_000 }).toBeLessThanOrEqual(2);
    await expect(page.getByTestId('sketch-tool-feedback')).toHaveCount(0);
    await expect(page.getByTestId('sketch-tool-hint')).toBeVisible();
    // 读数段只 hover 不提交；Esc 退出工具（草图不退出——后续段落继续使用对话框）。
    await page.keyboard.press('Escape');
    await expectToolExited(page, 'Sketch.PerimeterCircle');

    // ── W16 内切多边形：与中心点圆同一圆心→光标半径状态的 Ø 直径点标签 ──
    // 圆心 P(0,0)、光标 P(10,0) → 半径 10 mm；live 2026-11-16（内切多边形）
    // 半径段中点同样给 `Ø<直径>`，输入边数不改变读数。
    await activate(page, '内接多边形');
    await clickWorld(page, hub, P(0, 0));
    await hoverWorld(page, hub, P(10, 0));
    const polygonDiameter = page.getByTestId('sketch-draw-point-label-diameter');
    await expect(polygonDiameter, '多边形圆心→光标半径段中点应有 Ø 直径读数')
      .toBeVisible({ timeout: 10_000 });
    const polygonText = (await polygonDiameter.textContent())?.trim() ?? '';
    expect(polygonText.startsWith('Ø'), `多边形直径读数应以 Ø 开头：${polygonText}`).toBe(true);
    expect(Number(polygonText.slice('Ø'.length))).toBeGreaterThan(0);
    // 点标签水平不旋转（只有居中平移）。
    expect(await polygonDiameter.getAttribute('style')).not.toContain('rotate');
    // 半径读数已由 Ø 点标签替代 → 无白卡片；阶段提示 pill 保留。
    await expect(page.getByTestId('sketch-tool-feedback')).toHaveCount(0);
    await expect(page.getByTestId('sketch-tool-hint')).toBeVisible();
    await page.keyboard.press('Escape');
    await expectToolExited(page, 'sketchInscribedPolygon');

    // 清理：多边形工具上的 Escape 可能同时退出工具并关闭草图对话框（真栈实测
    // dialog=false）。对话框仍在时点「取消」；已关闭则直接等待隐藏——不能对
    // 已销毁的按钮重试点击（会把测试拖到超时）。
    const cancel = dialog.getByRole('button', { name: '取消' });
    if (await dialog.isVisible().catch(() => false)
      && await cancel.isEnabled().catch(() => false)) {
      await cancel.click({ timeout: 5_000 }).catch(() => {});
    }
    await expect(dialog).toBeHidden({ timeout: 30_000 });
  });
});
