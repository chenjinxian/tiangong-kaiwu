/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tutorial 2 真实 UI 交互助手（tutorial2.spec.ts / tutorial2-tools.spec.ts 共用）：
 * 画布数据点、工具激活、世界点投影、约束/尺寸/偏移提交、标准视图取景。
 * 所有操作都走真实 ribbon 工具 + canvas 鼠标事件；RPC 只用于只读回读。
 */
import { expect, type Page } from '@playwright/test';

export interface Vec3 { x: number; y: number; z: number }
/** 草图局部点（Onshape API 口径 y 向上）→ 世界系（Front 面：world z = −local y）。 */
export interface Local2 { x: number; y: number }
export const worldOf = (local: Local2): Vec3 => ({ x: local.x, y: 0, z: -local.y });
export const P = (x: number, y: number): Vec3 => worldOf({ x, y });

/** 画布数据点：近→目标两段移动 + 驻留（AccuSnap 热捕捉窗口），再 data 按下/抬起。 */
export async function dataPoint(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x - 24, y + 18);
  await page.waitForTimeout(120);
  await page.mouse.move(x, y);
  await page.waitForTimeout(450);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(400);
}

export async function disableSnap(page: Page): Promise<void> {
  await page.evaluate(() => {
    const cf = (window as unknown as { __lubanE2E?: { coreFrontend: { IModelApp: { accuSnap?: { enableSnap(v: boolean): void } } } } }).__lubanE2E?.coreFrontend;
    cf?.IModelApp.accuSnap?.enableSnap(false);
  });
}

export async function activate(page: Page, name: string): Promise<void> {
  const toolbar = page.getByRole('toolbar', { name: '草图工具' });
  // Onshape 草图只有一个尺寸按钮（无下拉）；长度/半径/距离均由同一工具按拾取
  // 动态推断。旧用例的名称保留为操作意图（决定后续拾取/放置点击），但工具相同。
  const dimensionNames = ['尺寸', '距离', '长度', '半径', '直径'];
  let target = toolbar.getByRole('button', {
    name: dimensionNames.includes(name) ? '尺寸' : name,
    exact: true,
  });
  if ((await target.count()) === 0) {
    // Onshape live：约束/绘制变体收在飞菜单（2026-11-02）；尺寸无飞菜单。
    const variantParent: Record<string, string> = {
      '中心矩形': 'Sketch.Rectangle',
      '对齐矩形': 'Sketch.Rectangle',
      '中心圆弧': 'Sketch.Arc3Point',
      '相切圆弧': 'Sketch.Arc3Point',
      '贝塞尔曲线': 'Sketch.Spline',
      '周边圆': 'Sketch.CenterCircle',
      '外切多边形': 'sketchInscribedPolygon',
    };
    const parent = variantParent[name];
    if (parent !== undefined) {
      const dropdown = toolbar.getByTestId(`part-studio-ribbon-dropdown-${parent}`);
      await dropdown.getByRole('button', { name: /▾/ }).click();
      target = page.getByRole('menuitem', { name, exact: true });
    } else {
      const inConstraints = ['水平', '竖直', '平行', '垂直', '相等', '中点', '相切', '固定'].includes(name);
      if (!inConstraints) throw new Error(`草图工具 ${name} 不在册`);
      const dropdown = toolbar.getByTestId('part-studio-ribbon-dropdown-Sketch.Constraint.Coincident');
      await dropdown.getByRole('button', { name: /▾/ }).click();
      target = page.getByRole('menuitem', { name, exact: true });
    }
  }
  await expect(target).toBeVisible({ timeout: 15_000 });
  await target.click();
  // 等 iTwin 真正完成工具切换（store.activeToolId 在 run 前即写入，不能当就绪信号）。
  const expectedToolId: Record<string, string> = {
    '线': 'Sketch.Line',
    '拐角矩形': 'Sketch.Rectangle',
    '中心矩形': 'Sketch.CenterRectangle',
    '对齐矩形': 'Sketch.AlignedRectangle',
    '中心圆弧': 'Sketch.CenterArc',
    '贝塞尔曲线': 'Sketch.Bezier',
    '相切圆弧': 'Sketch.TangentArc',
    '中心点圆': 'Sketch.CenterCircle',
    '周边圆': 'Sketch.PerimeterCircle',
    '内切多边形': 'sketchInscribedPolygon',
    '外切多边形': 'sketchCircumscribedPolygon',
    '3 点圆弧': 'Sketch.Arc3Point',
    '样条': 'Sketch.Spline',
    '偏移': 'Sketch.Offset',
    '镜像': 'Sketch.Mirror',
  '点': 'Sketch.Point',
    '重合': 'Sketch.Constraint.Coincident',
    '水平': 'Sketch.Constraint.Horizontal',
    '竖直': 'Sketch.Constraint.Vertical',
    '平行': 'Sketch.Constraint.Parallel',
    '垂直': 'Sketch.Constraint.Perpendicular',
    '相等': 'Sketch.Constraint.Equal',
    '中点': 'Sketch.Constraint.Midpoint',
    '相切': 'Sketch.Constraint.Tangent',
    '固定': 'Sketch.Constraint.Fixed',
    '尺寸': 'Sketch.Dimension',
    '距离': 'Sketch.Dimension',
    '长度': 'Sketch.Dimension',
    '半径': 'Sketch.Dimension',
    '直径': 'Sketch.Dimension',
  };
  const expected = expectedToolId[name];
  if (expected) {
    await page.waitForFunction(
      (toolId) => (window as unknown as {
        __lubanE2E?: { coreFrontend: { IModelApp: { _toolAdmin?: { activeTool?: { toolId?: string } } } } };
      }).__lubanE2E?.coreFrontend?.IModelApp?._toolAdmin?.activeTool?.toolId === toolId,
      expected,
      { timeout: 15_000 },
    );
  }
  await page.waitForTimeout(300);
  await disableSnap(page);
}

export async function clickWorld(page: Page, hub: { x: number; y: number }, p: Vec3): Promise<void> {
  const [px] = await projectWorld(page, hub, [p]);
  if (!px) throw new Error('投影失败');
  await dataPoint(page, px.x, px.y);
}

/** 只把光标移到世界点（不点击）——断言实时绘制标注后继续 dataPoint。 */
export async function hoverWorld(page: Page, hub: { x: number; y: number }, p: Vec3): Promise<void> {
  const [px] = await projectWorld(page, hub, [p]);
  if (!px) throw new Error('投影失败');
  await page.mouse.move(px.x - 24, px.y + 18);
  await page.waitForTimeout(120);
  await page.mouse.move(px.x, px.y);
  await page.waitForTimeout(450);
}

export async function addConstraint(page: Page, hub: { x: number; y: number }, name: string, points: Vec3[]): Promise<void> {
  await activate(page, name);
  for (const p of points) await clickWorld(page, hub, p);
  await page.waitForTimeout(1_200);
}

/**
 * 在画布右下空白处点击（Onshape 尺寸工具的「放置」点击）。避开左侧草图面板/
 * 特征对话框、右侧工具条与演示字幕；该位置离草图实体足够远，会走 placement
 * 分支而不是形成第二个距离拾取。
 */
export async function clickBlank(page: Page, _hub: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.getByTestId('part-studio-viewport').locator('canvas').first().boundingBox();
  if (!canvasBox) throw new Error('canvas boundingBox 不可得');
  await dataPoint(page, canvasBox.x + canvasBox.width * 0.9, canvasBox.y + canvasBox.height * 0.86);
}

export async function addDimension(
  page: Page,
  hub: { x: number; y: number },
  name: string,
  points: Vec3[],
  value: number,
): Promise<void> {
  await activate(page, name);
  for (const p of points) await clickWorld(page, hub, p);
  // Onshape 单尺寸工具：单线/单弧/单圆先拾取，再点击空白放置；两点/两线直接
  // 形成距离。长度/半径补一次 placing click。
  if (name === '长度' || name === '半径' || name === '直径') await clickBlank(page, hub);
  // Onshape：值确认框在标注放置位置弹出（不是左侧常驻面板）。
  const input = page.getByTestId('sketch-value-input');
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill(String(value));
  await page.getByTestId('sketch-value-confirm').click();
  await expect(input).toBeHidden({ timeout: 15_000 });
  await page.waitForTimeout(1500);
}

/** 完成草图：Onshape 同一草图对话框的绿色 ✓（编辑态）→ 退出草图模式。 */
export async function finishSketch(page: Page): Promise<void> {
  const dialog = page.getByTestId('part-studio-sketch-dialog');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole('button', { name: '确认' }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole('toolbar', { name: '特征工具' })).toBeVisible({ timeout: 30_000 });
}

/** 偏移工具：选链（seed）→ 光标定侧（place）→ 面板输入精确距离 → 确认提交。 */
export async function addOffset(
  page: Page,
  hub: { x: number; y: number },
  seed: Vec3,
  place: Vec3,
  value: number,
): Promise<void> {
  await activate(page, '偏移');
  await clickWorld(page, hub, seed);
  await page.waitForTimeout(500);
  await clickWorld(page, hub, place);
  const input = page.getByTestId('sketch-value-input');
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill(String(value));
  await page.getByTestId('sketch-value-confirm').click();
  await expect(input).toBeHidden({ timeout: 15_000 });
  await page.waitForTimeout(800);
}

/** 标准视图 + 取景（fillet 边拾取前的确定性视图；id：Left=2 Right=3 Front=4 Iso=6）。 */
export async function setStandardView(
  page: Page,
  id: number,
  volume: { low: Vec3; high: Vec3 },
): Promise<void> {
  await page.evaluate(({ id: viewId, volume: v }) => {
    const cf = (window as unknown as { __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { getFirstOpenView(): {
      setStandardRotation(id: number): void;
      view: { is3d(): boolean; turnCameraOff(): void };
      synchWithView(a: Record<string, never>): void;
      zoomToVolume(v: { low: { x: number; y: number; z: number }; high: { x: number; y: number; z: number } }): void;
    } | undefined } } } } }).__lubanE2E?.coreFrontend;
    const vp = cf?.IModelApp.viewManager.getFirstOpenView();
    if (!vp) return;
    vp.setStandardRotation(viewId);
    if (vp.view.is3d()) vp.view.turnCameraOff();
    vp.zoomToVolume(v);
    vp.synchWithView({});
  }, { id, volume });
  await page.waitForTimeout(1_500);
}

/** 非对称留白（lookAtVolume paddingPercent；小数=原范围的倍数）。 */
export interface ViewPadding { left?: number; right?: number; top?: number; bottom?: number }

/**
 * 标准视图 + 按模型范围紧取景（2026-11-02 fillet 相机修复）：
 * 用 ViewState.lookAtVolume 的 paddingPercent 把对话框需要的左侧留白做成
 * 非对称边距——模型仍然按自身范围最大化，不再用 500+ 单位的巨型体积把
 * 模型缩成视口 20%。paddingPercent 仅正交相机生效（本用法恒 turnCameraOff）。
 */
export async function frameStandardView(
  page: Page,
  id: number,
  range: { low: Vec3; high: Vec3 },
  padding: ViewPadding,
): Promise<void> {
  await page.evaluate(({ id: viewId, range: r, padding: p }) => {
    const cf = (window as unknown as { __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { getFirstOpenView(): {
      setStandardRotation(id: number): void;
      viewRect?: { aspect?: number };
      view: {
        is3d(): boolean;
        turnCameraOff(): void;
        lookAtVolume(v: { low: { x: number; y: number; z: number }; high: { x: number; y: number; z: number } }, aspect?: number, options?: { paddingPercent?: { left?: number; right?: number; top?: number; bottom?: number } }): void;
      };
      synchWithView(a: Record<string, never>): void;
    } | undefined } } } } }).__lubanE2E?.coreFrontend;
    const vp = cf?.IModelApp.viewManager.getFirstOpenView();
    if (!vp) return;
    vp.setStandardRotation(viewId);
    if (vp.view.is3d()) vp.view.turnCameraOff();
    vp.view.lookAtVolume(r, vp.viewRect?.aspect ?? 1, { paddingPercent: p });
    vp.synchWithView({});
  }, { id, range, padding });
  await page.waitForTimeout(1_200);
}

/**
 * 仅按模型范围紧取景，**不改旋转**（配合 ViewCube 角视图：保持 3D Iso 观感）。
 */
export async function frameCurrentView(
  page: Page,
  range: { low: Vec3; high: Vec3 },
  padding: ViewPadding,
): Promise<void> {
  await page.evaluate(({ range: r, padding: p }) => {
    const cf = (window as unknown as { __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { getFirstOpenView(): {
      viewRect?: { aspect?: number };
      view: {
        lookAtVolume(v: { low: { x: number; y: number; z: number }; high: { x: number; y: number; z: number } }, aspect?: number, options?: { paddingPercent?: { left?: number; right?: number; top?: number; bottom?: number } }): void;
      };
      synchWithView(a: Record<string, never>): void;
    } | undefined } } } } }).__lubanE2E?.coreFrontend;
    const vp = cf?.IModelApp.viewManager.getFirstOpenView();
    if (!vp) return;
    vp.view.lookAtVolume(r, vp.viewRect?.aspect ?? 1, { paddingPercent: p });
    vp.synchWithView({});
  }, { range, padding });
  await page.waitForTimeout(1_000);
}

/** 世界点 → 画布像素（viewport 坐标 + canvas 左上角偏移）。 */
export async function projectWorld(
  page: Page,
  hub: { x: number; y: number },
  points: Array<{ x: number; y: number; z: number }>,
): Promise<Array<{ x: number; y: number }>> {
  const view = await page.evaluate(async (pts) => {
    const cf = (window as unknown as { __lubanE2E?: { coreFrontend: { IModelApp: { viewManager: { getFirstOpenView(): { worldToView(p: { x: number; y: number; z: number }): { x: number; y: number } } | undefined } } } } }).__lubanE2E?.coreFrontend;
    const vp = cf?.IModelApp.viewManager.getFirstOpenView();
    if (!vp) throw new Error('无打开视口');
    return pts.map((p) => vp.worldToView(p));
  }, points);
  return view.map((v) => ({ x: hub.x + v.x, y: hub.y + v.y }));
}

export interface ScreenBounds {
  left: number; top: number; right: number; bottom: number;
  centerX: number; centerY: number; width: number; height: number;
}

/** 投影点集 → 画布像素包围盒（相机取景断言用）。 */
export function screenBounds(points: Array<{ x: number; y: number }>): ScreenBounds {
  if (points.length === 0) throw new Error('screenBounds 需要至少一个点');
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return {
    left, top, right, bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
    width: right - left,
    height: bottom - top,
  };
}

/** 面域判读：按面积最近匹配 regionIndex（2% 容差吸收鼠标取点/样条像素级偏差）。 */
export function regionIndexByArea(regions: Array<{ area: number }>, expected: number): number {
  let best = -1;
  let bestDiff = Infinity;
  regions.forEach((r, i) => {
    const diff = Math.abs(r.area - expected);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  });
  if (best < 0 || bestDiff > expected * 0.02)
    throw new Error(`面域判读失败：期望面积 ${expected} 附近无面域（最近差 ${bestDiff}）；regions=${JSON.stringify(regions)}`);
  return best;
}


/**
 * 拉伸/旋转对话框：Onshape 同款「在视口中点击草图面域」。
 * 1) 清空自动预选的 chip（点 chip 本体 = 移除）；
 * 2) 读 FeatureProfilePicker 暴露的每面域保证命中屏幕点；
 * 3) 逐一点击，断言 chip（data-region-index）出现。
 * 草图由对话框自动取最近一张，不再有草图下拉。
 */
export async function chooseProfileRegionsInViewport(
  page: Page,
  regionIndices: readonly number[],
): Promise<void> {
  const dialog = page.getByTestId('part-studio-feature-dialog');
  const field = dialog.getByTestId('part-studio-feature-dialog-profile-field');
  await expect(field).toBeVisible({ timeout: 20_000 });
  const chips = field.locator('button[data-region-index]');
  for (;;) {
    const count = await chips.count();
    if (count === 0) break;
    await chips.first().click();
    await expect(chips).toHaveCount(count - 1, { timeout: 10_000 });
  }
  const marker = page.getByTestId('feature-profile-picker');
  await expect(marker).toBeAttached({ timeout: 20_000 });
  const canvasBox = await page.getByTestId('part-studio-viewport').locator('canvas').first().boundingBox();
  if (!canvasBox) throw new Error('canvas boundingBox 不可得');
  for (const regionIndex of regionIndices) {
    let point: { x: number; y: number } | undefined;
    await expect.poll(async () => {
      const raw = await marker.getAttribute('data-region-points');
      let points: Array<{ sketchId: string; regionIndex: number; x: number; y: number }> = [];
      try {
        points = raw ? JSON.parse(raw) : [];
      } catch {
        points = [];
      }
      const hit = points.find((entry) => entry.regionIndex === regionIndex);
      point = hit ? { x: hit.x, y: hit.y } : undefined;
      return point !== undefined;
    }, { timeout: 20_000 }).toBe(true);
    if (!point) throw new Error(`面域 ${regionIndex} 无可用屏幕点`);
    // X-14 回归护栏：profile picker 的兜底点可能落在画布外；在真实鼠标点击前
    // 明确失败并打印坐标，避免 10s 超时把“取景不足”伪装成“选择失败”。
    if (point.x < 0 || point.y < 0 || point.x > canvasBox.width || point.y > canvasBox.height) {
      throw new Error(
        `面域 ${regionIndex} 的拾取点落在画布外：` +
          `point=(${point.x.toFixed(1)},${point.y.toFixed(1)}), canvas=${canvasBox.width}x${canvasBox.height}；` +
          `请先调整取景（X-14）`,
      );
    }
    await dataPoint(page, canvasBox.x + point.x, canvasBox.y + point.y);
    await expect(field.locator(`button[data-region-index="${regionIndex}"]`)).toBeVisible({ timeout: 10_000 });
  }
}

/**
 * 新草图对话框：在视口里点击 Top/Front/Right 基准面（Onshape 同款平面拾取）。
 * 使用 SketchPlanePicker 暴露的保证命中屏幕点；点后断言 data-selected。
 */
export async function chooseSketchPlaneInViewport(page: Page, planeId: 'top' | 'front' | 'right'): Promise<void> {
  const marker = page.getByTestId('sketch-plane-picker');
  await expect(marker).toBeAttached({ timeout: 15_000 });
  let points: Partial<Record<'top' | 'front' | 'right', { x: number; y: number }>> = {};
  await expect.poll(async () => {
    const raw = await marker.getAttribute('data-plane-points');
    try {
      points = raw ? JSON.parse(raw) : {};
    } catch {
      points = {};
    }
    return points[planeId] !== undefined;
  }, { timeout: 15_000 }).toBe(true);
  const point = points[planeId];
  if (!point) throw new Error(`草图平面 ${planeId} 无可用屏幕点：${await marker.getAttribute('data-plane-points')}`);
  const canvasBox = await page.getByTestId('part-studio-viewport').locator('canvas').first().boundingBox();
  if (!canvasBox) throw new Error('canvas boundingBox 不可得');
  await dataPoint(page, canvasBox.x + point.x, canvasBox.y + point.y);
  await expect(marker).toHaveAttribute('data-selected', planeId, { timeout: 10_000 });
}
