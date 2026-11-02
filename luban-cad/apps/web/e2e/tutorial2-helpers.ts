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
  const button = page.getByRole('toolbar', { name: '草图工具' }).getByRole('button', { name, exact: true });
  await expect(button).toBeVisible({ timeout: 15_000 });
  await button.click();
  await page.waitForTimeout(250);
  await disableSnap(page);
}

export async function clickWorld(page: Page, hub: { x: number; y: number }, p: Vec3): Promise<void> {
  const [px] = await projectWorld(page, hub, [p]);
  if (!px) throw new Error('投影失败');
  await dataPoint(page, px.x, px.y);
}

export async function addConstraint(page: Page, hub: { x: number; y: number }, name: string, points: Vec3[]): Promise<void> {
  await activate(page, name);
  for (const p of points) await clickWorld(page, hub, p);
  await page.waitForTimeout(1_200);
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
  const input = page.getByTestId('sketch-panel-candidate-input');
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill(String(value));
  await page.getByTestId('sketch-panel-candidate-confirm').click();
  await expect(input).toBeHidden({ timeout: 15_000 });
  await page.waitForTimeout(600);
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
  const input = page.getByTestId('sketch-panel-offset-input');
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill(String(value));
  await page.getByTestId('sketch-panel-offset-confirm').click();
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
