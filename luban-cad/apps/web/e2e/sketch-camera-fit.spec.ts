/**
 * 2026-11-13 用户反馈回归（真栈）：
 * 1) 选择草图平面后相机不动（Onshape live：不转正、不自动取景；相机交给用户）。
 * 2) 「缩放到合适大小」= 可见内容取景（模型 ∪ 活动草图；空场景基准面兜底），
 *    不改旋转、绝不使用 projectExtents。
 *
 * live 证据（私有 ui-evidence/sketch-camera-fit-20261113）：
 * - f4-sketch-plane-selected：选 Front 平面后仍是等轴测视角；
 * - 12-global-fit：草图编辑中 f 取景草图实体，ViewCube 旋转不变；
 * - 44-empty-sketch-fit：有实体 + 空草图时，空草图不改变取景。
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  getApiToken,
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
} from './tutorial2-helpers';

interface CameraState {
  rows: number[][];
  origin: number[];
  extents: number[];
}

async function camera(page: Page): Promise<CameraState> {
  return page.evaluate(() => {
    const vp = (window as any).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView;
    const vec = (v: { x: number; y: number; z: number }): number[] => [v.x, v.y, v.z];
    const r = vp.view.getRotation();
    return {
      rows: [vec(r.rowX()), vec(r.rowY()), vec(r.rowZ())],
      origin: vec(vp.view.getOrigin()),
      extents: vec(vp.view.getExtents()),
    };
  });
}

function expectSameRotation(a: CameraState, b: CameraState): void {
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++)
      expect(b.rows[row]![col]!, `rotation[${row}][${col}] 不得变化`).toBeCloseTo(a.rows[row]![col]!, 9);
  }
}

function expectSameCamera(a: CameraState, b: CameraState): void {
  expectSameRotation(a, b);
  for (let i = 0; i < 3; i++) {
    expect(b.origin[i]!, `origin[${i}] 不得变化`).toBeCloseTo(a.origin[i]!, 9);
    expect(b.extents[i]!, `extents[${i}] 不得变化`).toBeCloseTo(a.extents[i]!, 9);
  }
}

async function canvasHub(page: Page): Promise<{ x: number; y: number; box: { x: number; y: number; width: number; height: number } }> {
  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 90_000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas boundingBox 不可得');
  return { x: box.x, y: box.y, box };
}

test.describe('草图相机与缩放到合适大小（Onshape live 2026-11-13）', () => {
  test('选草图平面后相机不动；空场景适应窗口取景基准面（非 projectExtents）', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    await openSeedImodelEditor(page, seed);
    const hub = await canvasHub(page);

    const before = await camera(page);
    await page.getByRole('button', { name: '草图', exact: true }).click();
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
    await chooseSketchPlaneInViewport(page, 'front');
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });
    // Onshape live：选平面/进入草图编辑不转正、不缩放、不回放相机。
    await page.waitForTimeout(600);
    expectSameCamera(before, await camera(page));

    // 空 Part Studio（空草图）适应窗口：先缩远，再按 ViewCube 菜单「缩放到合适大小」。
    await page.mouse.move(hub.box.x + hub.box.width / 2, hub.box.y + hub.box.height / 2);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(120);
    }
    const zoomedOut = await camera(page);
    expect(Math.max(...zoomedOut.extents.map(Math.abs))).toBeGreaterThan(400);
    await page.getByTestId('viewcube-menu-trigger').click();
    await page.getByTestId('viewcube-menu-zoom-fit').click();
    await expect.poll(async () => Math.max(...(await camera(page)).extents.map(Math.abs)), {
      timeout: 15_000,
      intervals: [200, 400, 800],
    }).toBeLessThan(1_000);
    const fitted = await camera(page);
    // 不改旋转；基准面范围 ±150 mm 量级（绝不是 projectExtents ±500 m）。
    expectSameRotation(before, fitted);
    expect(Math.max(...fitted.extents.map(Math.abs))).toBeGreaterThan(20);

    await finishSketch(page);
  });

  test('草图实体参与可见内容取景：缩放聚焦草图且不改旋转', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    await openSeedImodelEditor(page, seed);
    const hub = await canvasHub(page);

    await page.getByRole('button', { name: '草图', exact: true }).click();
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
    await chooseSketchPlaneInViewport(page, 'front');
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });
    await disableSnap(page);
    const beforeDraw = await camera(page);

    // 在当前（未转正）相机下用拐角矩形画 20×20 mm（Onshape：用户可任意视角绘制）。
    await activate(page, '拐角矩形');
    await clickWorld(page, hub, P(-10, -10));
    await clickWorld(page, hub, P(10, 10));
    await page.waitForTimeout(1_500);

    // 草图对话框「缩放到合适大小」：Onshape 语义=可见内容（此处为草图实体）。
    const dialog = page.getByTestId('part-studio-sketch-dialog');
    await dialog.getByRole('button', { name: '缩放到合适大小' }).click();
    await expect.poll(async () => Math.max(...(await camera(page)).extents.map(Math.abs)), {
      timeout: 15_000,
      intervals: [200, 400, 800],
    }).toBeLessThan(100);
    const fitted = await camera(page);
    expectSameRotation(beforeDraw, fitted);
    expect(Math.max(...fitted.extents.map(Math.abs))).toBeGreaterThan(5);

    await finishSketch(page);
  });
});
