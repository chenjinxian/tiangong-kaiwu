/**
 * W31-A 真栈验收（2026-11-17 live 对拍）：草图尺寸 driven（从动/参考）↔
 * driving（驱动）切换。
 *
 * live 证据行为：
 * - 尺寸标签右键菜单首行是状态切换：当前 driven →「更改为驱动尺寸」，否则
 *   →「更改为从动尺寸」；点击立即切换、再次右键文案翻转；
 * - driven 尺寸双击什么都不发生（无编辑器、无提示）；
 * - driven 尺寸只读：尺寸工具不打开既有尺寸改值框（产品 W21 的
 *   `findExistingDimensionConstraint` 已排除 driven）；
 * - 切换持久化到草图 params（完成草图 → 双击树行重开 → 文案保持）。
 *
 * 本 spec 通过 RPC 播种一张含 driving length 尺寸的草图（与既有
 * sketch-dimension-edit 同法），再走真实 UI 菜单/双击/完成草图链。**只写不跑**
 * （父代理统一定点跑真栈，避免并发争 MS 限流/端口）。
 *
 * 范围说明：「尺寸工具点 driven 尺寸不改值」不做 e2e 断言——尺寸工具需要
 * 「拾取 + 放置」两步，单点标签本身不可能弹框，负向断言无法因正确原因失败；
 * 该排除语义由纯匹配器单测 `findExistingDimensionConstraint` 钉死
 * （sketch-dimension-tool.test.ts），e2e 只保留双击无编辑器。
 *
 * 已知差异（E-5 / P0-10 既有例外，不在本 spec 断言）：live 的 Ctrl+Z 可撤销
 * 切换；产品 wholesale `updateSketch` 已登记为非 invertible，undo 报「无可
 * 撤销」。后端求解门禁会拒收过约束草图（live 允许过约束并显示红色错误态）。
 */
import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import type { SketchConstraintDto, SketchDto, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getSketchRpc,
  openSeedImodelEditor,
  releaseWriteLease, reloadWithFlush } from './helpers';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { finishSketch } from './tutorial2-helpers.js';

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

const LINE_ID = 11;
const LENGTH_ID = 2;

/** 驱动 length 尺寸：线长 30（driving 初态；driven 切换不改变几何）。 */
const ENTITIES: SketchEntityDto[] = [
  { kind: 'line', id: LINE_ID, p1: { x: -15, y: 0 }, p2: { x: 15, y: 0 } },
];
const CONSTRAINTS: SketchConstraintDto[] = [
  { kind: 'length', id: LENGTH_ID, refs: [LINE_ID], value: 30 },
];

interface Pt { x: number; y: number }

function lineLength(sketch: SketchDto | undefined): number | null {
  const line = sketch?.entities.find((entity) => entity.kind === 'line' && entity.id === LINE_ID);
  if (!line || line.kind !== 'line')
    return null;
  if (typeof line.p1 !== 'object' || typeof line.p2 !== 'object')
    return null;
  return Math.hypot(line.p2.x - line.p1.x, line.p2.y - line.p1.y);
}

/**
 * 目标约束的 driven 状态：缺失 / driving（driven 键不存在）/ driven。
 * 显式区分「键不存在」与 `driven:false`——契约口径是仅 true 才携带该键。
 */
function constraintDrivenState(
  sketch: SketchDto | undefined,
): 'missing' | 'driven' | 'driving' | 'driven-key-present' {
  const constraint = sketch?.constraints.find((candidate) => candidate.id === LENGTH_ID);
  if (!constraint) return 'missing';
  if (constraint.driven === true) return 'driven';
  return Object.prototype.hasOwnProperty.call(constraint, 'driven') ? 'driven-key-present' : 'driving';
}

test.describe('草图尺寸驱动/从动切换（W31-A live）', () => {
  test('右键首行切换 driven/driving：几何与数值不变、driven 双击无编辑器、完成重开持久化（尺寸工具排除由单测覆盖）', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 360_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const openWithRetry = async () => {
      try {
        return await openSeedImodelEditor(page, seed);
      } catch {
        await reloadWithFlush(page);
        return openSeedImodelEditor(page, seed);
      }
    };
    let ctx = await openWithRetry();

    const lease = await borrowWriteLease(ctx, token, 'sketch-driven-dimension');
    const created = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch', entities: ENTITIES, constraints: CONSTRAINTS, plane: XY_PLANE,
    }, lease, token);
    assertFeatureOpOk(created, '驱动尺寸草图');
    const sketchId = created.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await reloadWithFlush(page);
    ctx = await openWithRetry();
    const sketchRow = page.getByTestId(`tree-row-${sketchId}`);
    await expect(sketchRow).toBeVisible({ timeout: 60_000 });
    await sketchRow.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    /** 尺寸标签中心（client 坐标；data-center 是画布局部）。 */
    const labelCenter = async (): Promise<Pt> => {
      const marker = page.locator(`[data-testid="sketch-dimension-label"][data-constraint-id="${LENGTH_ID}"]`);
      await expect(marker).toBeAttached({ timeout: 60_000 });
      const center = await marker.getAttribute('data-center');
      expect(center).not.toBeNull();
      const parts = center!.split(',').map(Number);
      return { x: box!.x + (parts[0] ?? 0), y: box!.y + (parts[1] ?? 0) };
    };

    /** 标注布局刷新（提交后 React 重算异步；两帧后再读 data-center）。 */
    const waitForLabelLayout = async (): Promise<void> => {
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
      await expect.poll(async () => {
        const marker = page.locator(`[data-testid="sketch-dimension-label"][data-constraint-id="${LENGTH_ID}"]`);
        const center = await marker.getAttribute('data-center');
        const parts = (center ?? '').split(',').map(Number);
        return parts.length === 2 && parts.every((value) => Number.isFinite(value));
      }, { timeout: 20_000, intervals: [100, 200, 400] }).toBe(true);
    };

    /** 右键尺寸标签 → 尺寸菜单（首行 = 驱动/从动状态切换）。 */
    const openDimensionMenu = async (): Promise<Locator> => {
      await waitForLabelLayout();
      const at = await labelCenter();
      await page.mouse.click(at.x, at.y, { button: 'right' });
      const menu = page.getByTestId('sketch-dimension-menu');
      await expect(menu).toBeVisible({ timeout: 10_000 });
      return menu;
    };

    const switchRow = (menu: Locator): Locator => menu.getByTestId('sketch-dimension-menu-driven');

    /**
     * 轮询 params 中目标约束的 driven 状态（客户端刷新是异步的）：
     * 约束必须存在；期望 driving 时要求 driven 键**不存在**（`driven:false` 不算通过）。
     */
    const expectDriven = async (driven: boolean): Promise<void> => {
      await expect.poll(async () => constraintDrivenState(await getSketchRpc(ctx, sketchId, token)), {
        timeout: 40_000,
        intervals: [600, 1000, 2000, 3000],
      }).toBe(driven ? 'driven' : 'driving');
    };

    // ---- 1) 初态 driving：右键首行 = 更改为从动尺寸（可点） ----
    let menu = await openDimensionMenu();
    await expect(switchRow(menu)).toHaveText('更改为从动尺寸');
    await expect(switchRow(menu)).toBeEnabled();
    const labelCenterBefore = await labelCenter();

    // ---- 2) 切换为 driven：再右键首行 = 更改为驱动尺寸；几何/数值不变 ----
    const storedValueBefore = (await getSketchRpc(ctx, sketchId, token))
      ?.constraints.find((constraint) => constraint.id === LENGTH_ID)?.value;
    await switchRow(menu).click();
    await expectDriven(true);
    const afterDriven = await getSketchRpc(ctx, sketchId, token);
    expect(lineLength(afterDriven)).toBeCloseTo(30, 2);
    expect(afterDriven?.constraints.find((constraint) => constraint.id === LENGTH_ID)?.value)
      .toBe(storedValueBefore);
    await waitForLabelLayout();
    const labelCenterAfter = await labelCenter();
    // 标签**锚点**不变（相机未动，允许 2px 抖动）。标签文字由画布装饰器渲染，
    // DOM 不可读——文本相等由 sketch-annotations 单测覆盖；存储值与几何已在
    // 上方用 RPC 断言。
    expect(Math.hypot(
      labelCenterAfter.x - labelCenterBefore.x,
      labelCenterAfter.y - labelCenterBefore.y,
    )).toBeLessThanOrEqual(2);

    menu = await openDimensionMenu();
    await expect(switchRow(menu)).toHaveText('更改为驱动尺寸');
    await expect(switchRow(menu)).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('sketch-dimension-menu')).toHaveCount(0, { timeout: 10_000 });

    // ---- 3) driven：双击标签无编辑器（尺寸工具排除语义由单测覆盖，见头部注记） ----
    const drivenAt = await labelCenter();
    await page.mouse.dblclick(drivenAt.x, drivenAt.y);
    await page.waitForTimeout(750);
    await expect(page.getByTestId('sketch-dimension-dialog')).toHaveCount(0);
    await expect(page.getByTestId('sketch-dimension-input')).toHaveCount(0);

    // ---- 4) 切回 driving：右键首行 = 更改为从动尺寸；双击打开编辑器（预填 30） ----
    menu = await openDimensionMenu();
    await expect(switchRow(menu)).toHaveText('更改为驱动尺寸');
    await switchRow(menu).click();
    await expectDriven(false);

    menu = await openDimensionMenu();
    await expect(switchRow(menu)).toHaveText('更改为从动尺寸');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('sketch-dimension-menu')).toHaveCount(0, { timeout: 10_000 });

    await waitForLabelLayout();
    const drivingAt = await labelCenter();
    await page.mouse.dblclick(drivingAt.x, drivingAt.y);
    const input = page.getByTestId('sketch-dimension-input');
    await expect(input).toBeVisible({ timeout: 10_000 });
    await expect(input).toHaveValue('30 mm');
    await input.press('Enter');
    await expect(input).toHaveCount(0, { timeout: 20_000 });

    // ---- 5) 再切 driven → 完成草图（✓）→ 双击树行重开：首行仍为 更改为驱动尺寸 ----
    menu = await openDimensionMenu();
    await expect(switchRow(menu)).toHaveText('更改为从动尺寸');
    await switchRow(menu).click();
    await expectDriven(true);

    await finishSketch(page);
    await expect(sketchRow).toBeVisible({ timeout: 30_000 });
    await sketchRow.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    menu = await openDimensionMenu();
    await expect(switchRow(menu)).toHaveText('更改为驱动尺寸');
    await expect(switchRow(menu)).toBeEnabled();

    // ---- 6) 恢复 driving 后完成/关闭（不把参考尺寸留在种子草图里） ----
    await switchRow(menu).click();
    await expectDriven(false);
    await finishSketch(page);

    const finalSketch = await getSketchRpc(ctx, sketchId, token);
    expect(lineLength(finalSketch)).toBeCloseTo(30, 2);
    expect(constraintDrivenState(finalSketch)).toBe('driving');
  });
});
