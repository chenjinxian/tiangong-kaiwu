/**
 * ADR-0018 S1e 真栈验收：草图尺寸数值双击改值（Onshape 对拍）。
 *
 * 覆盖：进入草图编辑 → 双击半径数值 → 输入新值 Enter → getSketch 解算后半径更新；
 * 双击线长数值 → 新长度生效（几何全链重解算）；输入框关闭、草图保持编辑态。
 *
 * 2026-11-16 W10a（live dimension-dialog）：编辑中点击画布空白不关闭对话框
 * （值不静默提交）；确认按钮提交（同一 updateSketchConstraint 路径）、取消
 * 按钮关闭并丢弃；Enter 提交路径保留。
 *
 * 2026-11-16 W17（live 尺寸对话框全结构）：对话框 209×47；禁用展开器 +
 * 禁用参数状态切换；拖拽条拖动对话框；输入框方向键 ±1 步进（不提交），
 * ✗ 取消丢弃。
 *
 * 2026-11-16 W21（live S1c）：尺寸工具点击已标注线 → 打开既有尺寸对话框
 * （预填约束值），✗ 取消不变；再次拾取改值 → 原地更新（约束数不变，不追加）。
 *
 * 2026-11-16 W22（live）：两条非平行线拾取 → 角度尺寸——值弹层按度预填
 * （`deg` 后缀）、确认后契约存弧度；画布出现角度标注；✗ 取消不落约束。
 *
 * 2026-11-17 W31-A（live）：尺寸菜单首行 = 驱动/从动状态切换。本 spec 的
 * W20 段相应更新（当前 driving →「更改为从动尺寸」且可点；启用行文字色
 * 与其它启用行一致）；切换全流程真栈链见 sketch-driven-dimension.spec.ts。
 */
import { expect, test } from '@playwright/test';
import type { SketchConstraintDto, SketchDto, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getSketchRpc,
  openSeedImodelEditor,
  releaseWriteLease,
} from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { activate, clickBlank, dataPoint, projectWorld, setStandardView } from './tutorial2-helpers.js';

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

const LINE_ID = 11;
const CIRCLE_ID = 21;
const HORIZONTAL_ID = 1;
const LENGTH_ID = 2;
const RADIUS_ID = 3;

const ENTITIES: SketchEntityDto[] = [
  { kind: 'line', id: LINE_ID, p1: { x: -10, y: -12 }, p2: { x: 10, y: -12 } },
  { kind: 'circle', id: CIRCLE_ID, center: { x: 0, y: 10 }, radius: 4 },
];
const CONSTRAINTS: SketchConstraintDto[] = [
  { kind: 'horizontal', id: HORIZONTAL_ID, refs: [LINE_ID] },
  { kind: 'length', id: LENGTH_ID, refs: [LINE_ID], value: 20 },
  { kind: 'radius', id: RADIUS_ID, refs: [CIRCLE_ID], value: 4 },
];

/** W22 角度尺寸草图：两条非平行线（水平 + 竖直，中点远离端点便于曲线拾取）。 */
const ANGLE_LINE_A = 31;
const ANGLE_LINE_B = 32;
const ANGLE_ENTITIES: SketchEntityDto[] = [
  { kind: 'line', id: ANGLE_LINE_A, p1: { x: -12, y: 0 }, p2: { x: 0, y: 0 } },
  { kind: 'line', id: ANGLE_LINE_B, p1: { x: 0, y: 0 }, p2: { x: 0, y: 12 } },
];

interface Pt { x: number; y: number }

function circleRadius(sketch: SketchDto | undefined): number | null {
  const circle = sketch?.entities.find((entity) => entity.kind === 'circle' && entity.id === CIRCLE_ID);
  return circle && circle.kind === 'circle' && typeof circle.radius === 'number' ? circle.radius : null;
}

function lineLength(sketch: SketchDto | undefined): number | null {
  const line = sketch?.entities.find((entity) => entity.kind === 'line' && entity.id === LINE_ID);
  if (!line || line.kind !== 'line')
    return null;
  const resolve = (ref: Pt | number): Pt | null => {
    if (typeof ref === 'number') {
      const point = sketch!.entities.find((entity) => entity.id === ref) as
        | { kind?: string; x?: number; y?: number }
        | undefined;
      return point && point.kind === 'point' ? { x: point.x ?? 0, y: point.y ?? 0 } : null;
    }
    return ref;
  };
  const p1 = resolve(line.p1);
  const p2 = resolve(line.p2);
  return p1 && p2 ? Math.hypot(p2.x - p1.x, p2.y - p1.y) : null;
}

/** 线中点草图局部坐标（本 spec 平面 = XY：世界 = (x, y, 0)）。 */
function lineMidpointLocal(sketch: SketchDto | undefined): Pt | null {
  const line = sketch?.entities.find((entity) => entity.kind === 'line' && entity.id === LINE_ID);
  if (!line || line.kind !== 'line')
    return null;
  const resolve = (ref: Pt | number): Pt | null => {
    if (typeof ref === 'number') {
      const point = sketch!.entities.find((entity) => entity.id === ref) as
        | { kind?: string; x?: number; y?: number }
        | undefined;
      return point && point.kind === 'point' ? { x: point.x ?? 0, y: point.y ?? 0 } : null;
    }
    return ref;
  };
  const p1 = resolve(line.p1);
  const p2 = resolve(line.p2);
  return p1 && p2 ? { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } : null;
}

test.describe('草图尺寸双击改值（ADR-0018 S1e）', () => {
  test('半径与长度内联改值 → 解算后几何更新', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const openWithRetry = async () => {
      try {
        return await openSeedImodelEditor(page, seed);
      } catch {
        await page.reload();
        return openSeedImodelEditor(page, seed);
      }
    };
    let ctx = await openWithRetry();

    const lease = await borrowWriteLease(ctx, token, 'sketch-dimension-edit');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: ENTITIES, constraints: CONSTRAINTS, plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openWithRetry();
    const sketchRow = page.getByTestId(`tree-row-${sketchId}`);
    await expect(sketchRow).toBeVisible({ timeout: 60_000 });
    await sketchRow.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const initial = await getSketchRpc(ctx, sketchId, token);
    expect(circleRadius(initial)).toBeCloseTo(4, 6);
    expect(lineLength(initial)).toBeCloseTo(20, 6);

    // S4b 右下角读数（2026-11-15）：悬停画布 → 世界点 3 位小数 mm。
    // 单位口径 = 产品 mm（种子 20 坐标=20 mm）；若误乘 1000 会得到万级 X。
    const viewportBox = (await page.getByTestId('part-studio-viewport').boundingBox())!;
    await page.mouse.move(viewportBox.x + viewportBox.width / 2, viewportBox.y + viewportBox.height / 2);
    const pointReadout = page.getByTestId('sketch-status-point');
    await expect(pointReadout).toBeVisible({ timeout: 15_000 });
    const pointText = (await pointReadout.textContent()) ?? '';
    expect(pointText).toMatch(/X -?\d+\.\d{3} mm Y -?\d+\.\d{3} mm Z -?\d+\.\d{3} mm/);
    const readoutX = Number(/X (-?[\d.]+)/.exec(pointText)?.[1]);
    expect(Math.abs(readoutX)).toBeLessThan(1000);

    // 标注标签（与绘制同源布局）暴露命中中心；双精度点击用真实鼠标。
    const labels = page.getByTestId('sketch-dimension-label');
    await expect(labels).toHaveCount(2, { timeout: 60_000 });
    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const centerOf = async (constraintId: number): Promise<Pt> => {
      const marker = page.locator(`[data-testid="sketch-dimension-label"][data-constraint-id="${constraintId}"]`);
      await expect(marker).toBeAttached();
      const center = await marker.getAttribute('data-center');
      expect(center).not.toBeNull();
      const parts = center!.split(',').map(Number);
      return { x: box!.x + (parts[0] ?? 0), y: box!.y + (parts[1] ?? 0) };
    };

    /**
     * 标注布局刷新等待（W10a 复核）：提交后 React 重算标注是异步的；先等输入框
     * 卸载（宿主 applyConstraintValue 完成后 commit 才关框），再等 marker 重新
     * 挂载 + 两帧布局稳定 + data-center 可解析，避免用陈旧位置双击。
     */
    const waitForLabelLayout = async (constraintId: number): Promise<void> => {
      const marker = page.locator(`[data-testid="sketch-dimension-label"][data-constraint-id="${constraintId}"]`);
      await expect(marker).toBeAttached({ timeout: 30_000 });
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
      await expect.poll(async () => {
        const center = await marker.getAttribute('data-center');
        const parts = (center ?? '').split(',').map(Number);
        return parts.length === 2 && parts.every((value) => Number.isFinite(value));
      }, { timeout: 20_000, intervals: [100, 200, 400] }).toBe(true);
    };

    // ---- 1) 半径 4 → 6（live 2026-11-16：编辑中点击画布空白不关闭对话框；
    //         确认按钮走同一 updateSketchConstraint 提交路径） ----
    const radiusAt = await centerOf(RADIUS_ID);
    await page.mouse.dblclick(radiusAt.x, radiusAt.y);
    const input = page.getByTestId('sketch-dimension-input');
    await expect(input).toBeVisible({ timeout: 10_000 });
    // 空画布右上区（y=+40，x 左移 200 避开右上 ViewCube 150×150 stage；
    // 草图对话框在左上 ≤300px，种子几何居中）：对话框保持打开（旧 blur-cancel
    // 会关闭）。
    await page.mouse.click(box!.x + box!.width - 200, box!.y + 40);
    await expect(input).toBeVisible();
    await expect(page.getByTestId('sketch-dimension-confirm')).toBeVisible();
    await input.fill('6');
    await page.getByTestId('sketch-dimension-confirm').click();
    await expect.poll(async () => {
      const value = circleRadius(await getSketchRpc(ctx, sketchId, token));
      return value === null ? 999 : Math.abs(value - 6);
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBeLessThan(0.001);
    await expect(input).toHaveCount(0);
    await waitForLabelLayout(LENGTH_ID);

    // ---- 1b) live 尺寸对话框结构 / 拖拽条拖动 / 方向键步进（不提交） ----
    const lengthAtLive = await centerOf(LENGTH_ID);
    await page.mouse.dblclick(lengthAtLive.x, lengthAtLive.y);
    const dialog = page.getByTestId('sketch-dimension-dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(Math.abs(dialogBox!.width - 209)).toBeLessThanOrEqual(1);
    expect(Math.abs(dialogBox!.height - 47)).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('sketch-dimension-expander')).toBeAttached();
    await expect(page.getByTestId('sketch-dimension-state-toggle')).toBeDisabled();

    // 拖拽条（仅 13px 条可拖）：+40/+30 → 对话框位移 ≥20（边缘钳制允许略小）。
    const dragbar = page.getByTestId('sketch-dimension-dragbar');
    const dragbarBox = await dragbar.boundingBox();
    expect(dragbarBox).not.toBeNull();
    const dragStartX = dragbarBox!.x + dragbarBox!.width / 2;
    const dragStartY = dragbarBox!.y + dragbarBox!.height / 2;
    await page.mouse.move(dragStartX, dragStartY);
    await page.mouse.down();
    await page.mouse.move(dragStartX + 40, dragStartY + 30, { steps: 5 });
    await page.mouse.up();
    const draggedBox = await dialog.boundingBox();
    expect(draggedBox).not.toBeNull();
    expect(draggedBox!.x - dialogBox!.x).toBeGreaterThanOrEqual(20);
    expect(draggedBox!.y - dialogBox!.y).toBeGreaterThanOrEqual(20);

    // 方向键步进（live）：点入输入框得到光标（无选区），ArrowDown −1、ArrowUp 还原。
    const stepInput = page.getByTestId('sketch-dimension-input');
    // live S2w：输入文本内联单位（`15.7 mm`）——取数值前缀。
    const stepBefore = Number.parseFloat(await stepInput.inputValue());
    expect(Number.isFinite(stepBefore)).toBe(true);
    await stepInput.click();
    // 兜底折叠选区（刚打开时全选；live 有选区不步进）：光标本就在末尾，无副作用。
    await stepInput.press('End');
    await stepInput.press('ArrowDown');
    const afterDown = Number.parseFloat(await stepInput.inputValue());
    expect(Math.abs(afterDown - (stepBefore - 1))).toBeLessThan(1e-6);
    await stepInput.press('ArrowUp');
    const afterUp = Number.parseFloat(await stepInput.inputValue());
    expect(Math.abs(afterUp - stepBefore)).toBeLessThan(1e-6);

    // ✗ 取消：步进不提交，长度保持 20。
    await page.getByTestId('sketch-dimension-cancel').click();
    await expect(stepInput).toHaveCount(0);
    const afterStepCancel = await getSketchRpc(ctx, sketchId, token);
    expect(lineLength(afterStepCancel)).toBeCloseTo(20, 2);

    // ---- 2) 长度 20 → 30（水平约束保持，几何整体重解算；保留 Enter 提交路径） ----
    const lengthAt = await centerOf(LENGTH_ID);
    await page.mouse.dblclick(lengthAt.x, lengthAt.y);
    const input2 = page.getByTestId('sketch-dimension-input');
    await expect(input2).toBeVisible({ timeout: 10_000 });
    await input2.fill('30');
    await input2.press('Enter');
    await expect.poll(async () => {
      const value = lineLength(await getSketchRpc(ctx, sketchId, token));
      return value === null ? 999 : Math.abs(value - 30);
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBeLessThan(0.01);
    await expect(input2).toHaveCount(0);
    // 解算后标注布局异步刷新：等 marker 重新挂载 + data-center 稳定再读位置。
    await waitForLabelLayout(LENGTH_ID);

    // ---- 2b) 取消按钮：关闭并丢弃（不静默改值） ----
    const lengthAt2 = await centerOf(LENGTH_ID);
    await page.mouse.dblclick(lengthAt2.x, lengthAt2.y);
    const input3 = page.getByTestId('sketch-dimension-input');
    await expect(input3).toBeVisible({ timeout: 10_000 });
    await input3.fill('999');
    await page.getByTestId('sketch-dimension-cancel').click();
    await expect(input3).toHaveCount(0);
    await expect.poll(async () => {
      const value = lineLength(await getSketchRpc(ctx, sketchId, token));
      return value === null ? 999 : Math.abs(value - 30);
    }, { timeout: 20_000, intervals: [600, 1000, 2000] }).toBeLessThan(0.01);

    // 草图保持编辑态；半径与其它约束未被改值路径破坏。
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible();
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible();
    const finalSketch = await getSketchRpc(ctx, sketchId, token);
    expect(circleRadius(finalSketch)).toBeCloseTo(6, 3);
    expect(lineLength(finalSketch)).toBeCloseTo(30, 2);
    expect(finalSketch?.constraints.map((constraint) => constraint.kind).sort())
      .toEqual(['horizontal', 'length', 'radius']);

    // ---- 2c) W20 live：右键尺寸标签 → 尺寸菜单（删除尺寸走宿主既有
    //     updateSketch 约束删除；撤消恢复——可撤销硬约束）。
    //     W31-A（2026-11-17 live）：首行是驱动/从动状态切换，当前为 driving
    //     →「更改为从动尺寸」且可点（状态切换本身的真栈链见
    //     sketch-driven-dimension.spec.ts）。 ----
    const lengthAtMenu = await centerOf(LENGTH_ID);
    await page.mouse.click(lengthAtMenu.x, lengthAtMenu.y, { button: 'right' });
    const dimensionMenu = page.getByTestId('sketch-dimension-menu');
    await expect(dimensionMenu).toBeVisible({ timeout: 10_000 });
    const drivenRow = dimensionMenu.getByTestId('sketch-dimension-menu-driven');
    await expect(drivenRow).toBeEnabled();
    await expect(drivenRow).toHaveText('更改为从动尺寸');
    await expect(dimensionMenu.getByTestId('sketch-dimension-menu-delete')).toBeEnabled();

    // W24 live（2026-11-17）：尺寸菜单皮肤 154px / 22px 行 / 12px·18px /
    // #DEF1FB hover / 7 条 #ddd 分隔线 / 17px 图标 / 选择行 CSS ►。
    const skin = await dimensionMenu.evaluate((el) => {
      const style = getComputedStyle(el);
      // W31-A：首行（更改为从动尺寸）现在也 enabled——皮肤探针固定取「确认
      // 草图」行，保持行高/内边距断言的代表性不随首行状态漂移。
      const row = el.querySelector<HTMLElement>('[data-testid="sketch-dimension-menu-confirm"]');
      const rowStyle = row ? getComputedStyle(row) : null;
      const separator = el.querySelector('[role="separator"]');
      const separatorStyle = separator ? getComputedStyle(separator) : null;
      const iconSvg = el.querySelector(
        '[data-testid="sketch-dimension-menu-delete"] .part-studio-sketch-dimension-menu__icon svg',
      );
      const iconRect = iconSvg?.getBoundingClientRect();
      const selectRow = Array.from(el.querySelectorAll<HTMLElement>('[role="menuitem"]'))
        .find((item) => (item.textContent ?? '').trim() === '选择');
      const rect = el.getBoundingClientRect();
      const rowRect = row?.getBoundingClientRect();
      return {
        width: Math.round(rect.width),
        marginTop: style.marginTop,
        borderTop: style.borderTop,
        radius: style.borderTopLeftRadius,
        shadow: style.boxShadow,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        rowHeight: rowRect ? Math.round(rowRect.height) : 0,
        rowPadding: rowStyle
          ? `${rowStyle.paddingTop} ${rowStyle.paddingRight} ${rowStyle.paddingBottom} ${rowStyle.paddingLeft}`
          : '',
        rowRadius: rowStyle?.borderTopLeftRadius ?? '',
        separators: el.querySelectorAll('[role="separator"]').length,
        separatorBorder: separatorStyle?.borderBottom ?? '',
        iconSize: iconRect ? [Math.round(iconRect.width), Math.round(iconRect.height)] : null,
        selectText: selectRow?.textContent ?? null,
        selectSubmenu: selectRow?.classList.contains('part-studio-tree-menu__item--has-submenu') ?? false,
      };
    });
    expect(skin.width).toBe(154);
    expect(skin.marginTop).toBe('2px');
    expect(skin.borderTop).toBe('1px solid rgb(204, 204, 204)');
    expect(skin.radius).toBe('4px');
    expect(skin.shadow).toBe('rgba(0, 0, 0, 0.2) 0px 5px 10px 0px');
    expect(skin.fontSize).toBe('12px');
    expect(skin.lineHeight).toBe('18px');
    expect(skin.rowHeight).toBe(22);
    expect(skin.rowPadding).toBe('2px 8px 2px 35px');
    expect(skin.rowRadius).toBe('0px');
    expect(skin.separators).toBe(7);
    expect(skin.separatorBorder).toBe('1px solid rgb(221, 221, 221)');
    expect(skin.iconSize).toEqual([17, 17]);
    expect(skin.selectText).toBe('选择');
    expect(skin.selectSubmenu).toBe(true);
    await dimensionMenu.getByTestId('sketch-dimension-menu-fit').hover();
    await expect.poll(async () => dimensionMenu.getByTestId('sketch-dimension-menu-fit')
      .evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(222, 241, 251)');
    // W31-A：首行已启用——启用行文字色与另一启用行（删除尺寸）一致；
    // 精确色值 live 未采到，不发明硬编码值（保留皮肤断言的意义）。
    expect(await dimensionMenu.getByTestId('sketch-dimension-menu-driven')
      .evaluate((el) => getComputedStyle(el).color))
      .toBe(await dimensionMenu.getByTestId('sketch-dimension-menu-delete')
        .evaluate((el) => getComputedStyle(el).color));
    await dimensionMenu.getByTestId('sketch-dimension-menu-delete').click();
    await expect.poll(async () => {
      const now = await getSketchRpc(ctx, sketchId, token);
      return (now?.constraints ?? []).some((constraint) => constraint.id === LENGTH_ID);
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBe(false);
    await page.getByRole('button', { name: '撤消' }).click();
    await expect.poll(async () => {
      const now = await getSketchRpc(ctx, sketchId, token);
      return (now?.constraints ?? []).some((constraint) => constraint.id === LENGTH_ID);
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBe(true);
    await waitForLabelLayout(LENGTH_ID);

    // ---- 3) 单击尺寸数值 → 选中（唯一选择权威 sketchConstraint）；Delete 移除约束 ----
    const radiusLabel = page.locator(
      `[data-testid="sketch-dimension-label"][data-constraint-id="${RADIUS_ID}"]`,
    );
    const radiusAt2 = await centerOf(RADIUS_ID);
    await page.mouse.click(radiusAt2.x, radiusAt2.y);
    await expect(radiusLabel).toHaveAttribute('data-selected', 'true', { timeout: 10_000 });
    const selection = await page.evaluate(() => {
      const store = (window as unknown as {
        __lubanE2EApp?: { usePartStudioStore?: { getState: () => { canvas: { selection: { kind: string; constraintId?: number }[] } } } };
      }).__lubanE2EApp?.usePartStudioStore;
      return store?.getState().canvas.selection ?? [];
    });
    expect(selection.some((entry) => entry.kind === 'sketchConstraint' && entry.constraintId === RADIUS_ID)).toBe(true);
    await page.keyboard.press('Delete');
    await expect.poll(async () => {
      const sketchNow = await getSketchRpc(ctx, sketchId, token);
      return (sketchNow?.constraints ?? []).some((constraint) => constraint.id === RADIUS_ID);
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBe(false);
    // 实体与其它约束保留（删除只动选中的约束）。
    const afterConstraintDelete = await getSketchRpc(ctx, sketchId, token);
    expect(circleRadius(afterConstraintDelete)).toBeCloseTo(6, 3);
    expect(lineLength(afterConstraintDelete)).toBeCloseTo(30, 2);
    expect(afterConstraintDelete?.constraints.map((constraint) => constraint.kind).sort())
      .toEqual(['horizontal', 'length']);
    await expect(page.getByTestId('sketch-dimension-label')).toHaveCount(1);

    // ---- 4) W21（live S1c）：尺寸工具点击已标注线 → 打开**既有**尺寸对话框
    //          （预填约束值 30），✗ 取消不变；再次拾取改 25 → 原地更新
    //          （约束数不变，不追加重复尺寸）。 ----
    // 俯视 XY 草图平面并紧取景：尺寸工具按「光标射线 ∩ 草图平面」拾取，
    // 正对视角保证线中点投影落在线上（斜视角下与圆/端点重叠或退化）。
    await setStandardView(page, 0, {
      low: { x: -40, y: -40, z: 0 },
      high: { x: 40, y: 40, z: 10 },
    });
    const hub = { x: box!.x, y: box!.y };
    const projectLineMid = async (): Promise<Pt> => {
      const mid = lineMidpointLocal(await getSketchRpc(ctx, sketchId, token));
      expect(mid).not.toBeNull();
      const [screen] = await projectWorld(page, hub, [{ x: mid!.x, y: mid!.y, z: 0 }]);
      expect(screen).toBeDefined();
      return screen!;
    };

    await activate(page, '尺寸');
    const existingPopup = page.getByTestId('sketch-value-popup');
    const existingInput = page.getByTestId('sketch-value-input');
    const midScreen = await projectLineMid();
    await dataPoint(page, midScreen.x, midScreen.y); // 拾线
    await clickBlank(page, hub); // 放置点击 → 既有尺寸候选
    await expect(existingPopup).toBeVisible({ timeout: 20_000 });
    await expect(existingInput).toHaveValue('30');

    await page.getByTestId('sketch-value-cancel').click();
    await expect(existingPopup).toHaveCount(0, { timeout: 10_000 });
    const afterExistingCancel = await getSketchRpc(ctx, sketchId, token);
    expect(afterExistingCancel?.constraints).toHaveLength(2);
    expect(afterExistingCancel?.constraints.find((constraint) => constraint.id === LENGTH_ID)?.value).toBe(30);
    // W19：弹层关闭后尺寸工具保持安装（无需重新点 ribbon）。
    await expect.poll(async () => page.evaluate(() => (window as unknown as {
      __lubanE2E?: { coreFrontend: { IModelApp: { _toolAdmin?: { activeTool?: { toolId?: string } } } } };
    }).__lubanE2E?.coreFrontend?.IModelApp?._toolAdmin?.activeTool?.toolId), {
      timeout: 15_000,
    }).toBe('Sketch.Dimension');

    const midScreen2 = await projectLineMid();
    await dataPoint(page, midScreen2.x, midScreen2.y); // 拾线（工具仍安装）
    await clickBlank(page, hub);
    await expect(existingPopup).toBeVisible({ timeout: 20_000 });
    await expect(existingInput).toHaveValue('30');
    await existingInput.fill('25');
    await page.getByTestId('sketch-value-confirm').click();
    await expect(existingPopup).toHaveCount(0, { timeout: 20_000 });
    await expect.poll(async () => {
      const now = await getSketchRpc(ctx, sketchId, token);
      const value = now?.constraints.find((constraint) => constraint.id === LENGTH_ID)?.value;
      return typeof value === 'number' ? Math.abs(value - 25) : 999;
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBeLessThan(0.001);
    const afterExistingEdit = await getSketchRpc(ctx, sketchId, token);
    // 约束数不变（无重复 length 尺寸）；值持久化并驱动几何。
    expect(afterExistingEdit?.constraints).toHaveLength(2);
    expect(afterExistingEdit?.constraints.filter((constraint) => constraint.kind === 'length')).toHaveLength(1);
    expect(afterExistingEdit?.constraints.find((constraint) => constraint.id === LENGTH_ID)?.value).toBe(25);
    expect(lineLength(afterExistingEdit)).toBeCloseTo(25, 1);
  });

  test('直径尺寸双击改值（后端 v1.69 同期白名单）', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 240_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const openWithRetry = async () => {
      try {
        return await openSeedImodelEditor(page, seed);
      } catch {
        await page.reload();
        return openSeedImodelEditor(page, seed);
      }
    };
    let ctx = await openWithRetry();

    const lease = await borrowWriteLease(ctx, token, 'sketch-dimension-diameter');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [
        { kind: 'point', id: 1, x: 0, y: 0 },
        { kind: 'circle', id: 2, center: 1, radius: 5 },
      ],
      constraints: [{ kind: 'diameter', id: 4, refs: [2], value: 10 }],
      plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '直径草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openWithRetry();
    const sketchRow = page.getByTestId(`tree-row-${sketchId}`);
    await expect(sketchRow).toBeVisible({ timeout: 60_000 });
    await sketchRow.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });
    const marker = page.locator('[data-testid="sketch-dimension-label"][data-constraint-id="4"]');
    await expect(marker).toBeAttached({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const center = await marker.getAttribute('data-center');
    expect(center).not.toBeNull();
    const parts = center!.split(',').map(Number);
    const x = box!.x + (parts[0] ?? 0);
    const y = box!.y + (parts[1] ?? 0);

    await page.mouse.dblclick(x, y);
    const input = page.getByTestId('sketch-dimension-input');
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill('30');
    await input.press('Enter');
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      const circle = sketch?.entities.find((entity) => entity.kind === 'circle');
      return circle && circle.kind === 'circle' && typeof circle.radius === 'number'
        ? Math.abs(circle.radius - 15)
        : 999;
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBeLessThan(0.001);
    const sketch = await getSketchRpc(ctx, sketchId, token);
    expect(sketch?.constraints.find((constraint) => constraint.id === 4)?.value).toBe(30);
  });

  test('W22：两条非平行线 → 角度尺寸（度预填/弧度落库；取消不落约束）', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const openWithRetry = async () => {
      try {
        return await openSeedImodelEditor(page, seed);
      } catch {
        await page.reload();
        return await openSeedImodelEditor(page, seed);
      }
    };
    let ctx = await openWithRetry();

    const lease = await borrowWriteLease(ctx, token, 'sketch-dimension-angle');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: ANGLE_ENTITIES, constraints: [], plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '角度草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openWithRetry();
    const sketchRow = page.getByTestId(`tree-row-${sketchId}`);
    await expect(sketchRow).toBeVisible({ timeout: 60_000 });
    await sketchRow.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    // 俯视 XY 草图平面并紧取景：尺寸工具按「光标射线 ∩ 草图平面」拾取，
    // 两线中点（远离端点/交点）必须落在曲线命中半径内。
    await setStandardView(page, 0, {
      low: { x: -30, y: -20, z: 0 },
      high: { x: 30, y: 30, z: 10 },
    });
    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const hub = { x: box!.x, y: box!.y };
    const projectLocal = async (p: Pt): Promise<Pt> => {
      const [screen] = await projectWorld(page, hub, [{ x: p.x, y: p.y, z: 0 }]);
      expect(screen).toBeDefined();
      return screen!;
    };
    const midA = await projectLocal({ x: -6, y: 0 });
    const midB = await projectLocal({ x: 0, y: 6 });

    await activate(page, '尺寸');
    const popup = page.getByTestId('sketch-value-popup');
    const valueInput = page.getByTestId('sketch-value-input');
    await dataPoint(page, midA.x, midA.y); // 线 A
    await dataPoint(page, midB.x, midB.y); // 线 B → 非平行 → 角度候选
    await expect(popup).toBeVisible({ timeout: 20_000 });
    // live：角度值对话框按度预填（7 位小数去尾零）+ deg 后缀。
    await expect(valueInput).toHaveValue('90');
    await expect(page.getByTestId('sketch-value-unit')).toHaveText('deg');

    // ✗ 取消：不落约束（W19 工具保持安装，无需重新点 ribbon）。
    await page.getByTestId('sketch-value-cancel').click();
    await expect(popup).toHaveCount(0, { timeout: 10_000 });
    const afterCancel = await getSketchRpc(ctx, sketchId, token);
    expect(afterCancel?.constraints ?? []).toHaveLength(0);

    // 再次两线拾取 → 确认（沿用预填 90°）→ 契约弧度 π/2 落库。
    const midA2 = await projectLocal({ x: -6, y: 0 });
    const midB2 = await projectLocal({ x: 0, y: 6 });
    await dataPoint(page, midA2.x, midA2.y);
    await dataPoint(page, midB2.x, midB2.y);
    await expect(popup).toBeVisible({ timeout: 20_000 });
    await expect(valueInput).toHaveValue('90');
    await page.getByTestId('sketch-value-confirm').click();
    await expect(popup).toHaveCount(0, { timeout: 20_000 });

    let angleConstraint: SketchConstraintDto | undefined;
    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, sketchId, token);
      angleConstraint = sketch?.constraints.find((constraint) => constraint.kind === 'angle');
      const value = angleConstraint?.value;
      return typeof value === 'number' ? Math.abs(value - Math.PI / 2) : 999;
    }, { timeout: 40_000, intervals: [600, 1000, 2000, 3000] }).toBeLessThan(1e-6);
    expect(angleConstraint).toBeDefined();
    expect(angleConstraint!.kind).toBe('angle');
    expect(angleConstraint!.refs).toHaveLength(2);
    const afterConfirm = await getSketchRpc(ctx, sketchId, token);
    // 恰好一条角度尺寸（不是 degree 值误存的 distance/再追加）。
    expect((afterConfirm?.constraints ?? []).filter((constraint) => constraint.kind === 'angle')).toHaveLength(1);
    expect((afterConfirm?.constraints ?? []).filter((constraint) => constraint.kind === 'distance')).toHaveLength(0);

    // 画布角度标注（弧 + 度数文本）出现（与绘制/布局同源标记）。
    const label = page.locator(
      `[data-testid="sketch-dimension-label"][data-constraint-id="${angleConstraint!.id}"]`,
    );
    await expect(label).toBeAttached({ timeout: 30_000 });
  });
});
