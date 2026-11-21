/**
 * 草图「穿透」UI 真栈验收（S2 UI 2026-11-21）。
 *
 * 链路：RPC 建 20×20 源草图（xy@z=0，以原点为中心）→ 拉伸 10 盒体
 * （-10..10 × -10..10 × 0..10）→ 目标草图 @z=5 仅含一个点 (0,0) → UI 打开
 * 目标草图 → ribbon 约束飞菜单「穿透」(shift+g 同入口) → 先点草图点、再点
 * (10,10) 处竖直边 → 工具走既有 FeatureOp 管道提交 externalRefs 行
 * `kind="pierce"` / `entityIds: []` / `localEntityId=1` → 后端把点钉到边×平面
 * 精确交点 (10,10)，读面 projection ok / DOF 0 / 无隐藏实体或约束。
 *
 * 相机取等轴测（`StandardViewId.Iso`）：竖直边 (10,10,0..10) 投影为可点击的
 * 屏幕线段，z=5 中点远离全部水平边（顶视图下竖直边退化为角点，与顶/底面两条
 * 水平边屏幕距离并列，会先命中平行于草图平面的水平边而拒收）。
 *
 * 单用例：MS 限流 100 req/15min；429 时按 retryAfter 等窗口后重跑，不绕限流。
 * 工具激活断言只用公开提示 pill（`sketch-tool-hint` 的 data-tool/文案），
 * 不读私有 hook。
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SketchConstraintDto, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
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
import { activate, dataPoint, finishSketch } from './tutorial2-helpers.js';

function centeredRectangleSketch(width: number, height: number): {
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
} {
  const halfW = width / 2;
  const halfH = height / 2;
  return {
    entities: [
      { kind: 'point', id: 1, x: -halfW, y: -halfH },
      { kind: 'point', id: 2, x: halfW, y: -halfH },
      { kind: 'point', id: 3, x: halfW, y: halfH },
      { kind: 'point', id: 4, x: -halfW, y: halfH },
      { kind: 'point', id: 5, x: -halfW, y: -halfH },
      { kind: 'point', id: 6, x: halfW, y: -halfH },
      { kind: 'point', id: 7, x: halfW, y: halfH },
      { kind: 'point', id: 8, x: -halfW, y: halfH },
      { kind: 'line', id: 11, p1: 5, p2: 6 },
      { kind: 'line', id: 12, p1: 6, p2: 7 },
      { kind: 'line', id: 13, p1: 7, p2: 8 },
      { kind: 'line', id: 14, p1: 8, p2: 5 },
    ],
    constraints: [
      { kind: 'coincident', id: 21, refs: [1, 5] },
      { kind: 'coincident', id: 22, refs: [2, 6] },
      { kind: 'coincident', id: 23, refs: [3, 7] },
      { kind: 'coincident', id: 24, refs: [4, 8] },
      { kind: 'horizontal', id: 25, refs: [11] },
      { kind: 'horizontal', id: 26, refs: [13] },
      { kind: 'vertical', id: 27, refs: [12] },
      { kind: 'vertical', id: 28, refs: [14] },
      { kind: 'distance', id: 29, refs: [1, 2], value: width },
      { kind: 'distance', id: 30, refs: [2, 3], value: height },
    ],
  };
}

const PLANE = (z: number): SketchPlaneDto => ({
  origin: { x: 0, y: 0, z },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
});

/**
 * 相机等轴测取景盒体：竖直边投影为屏幕线段，点击其 z=5 中点时不与任何水平
 * 边重合（顶视图下竖直边投影为角点，会与顶/底面两条水平边在端点并列，
 * 屏幕最邻近命中会先取到平行于草图平面的水平边 → `projection-pierce-miss`）。
 */
async function orientToIso(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = (window as any).__lubanE2E?.coreFrontend as
      | {
        StandardViewId?: { Iso: number };
        IModelApp?: { viewManager?: { selectedView?: any } };
      }
      | undefined;
    const vp = host?.IModelApp?.viewManager?.selectedView;
    const isoId = host?.StandardViewId?.Iso;
    if (!vp?.view || isoId === undefined)
      throw new Error('等轴测取景失败：StandardViewId/viewport 不可用');
    vp.view.setStandardRotation(isoId);
    vp.synchWithView?.();
    vp.invalidateScene?.();
    vp.zoomToVolume?.({ low: { x: -14, y: -14, z: 0 }, high: { x: 14, y: 14, z: 10 } });
  });
  await page.waitForTimeout(400);
}

/** 画布内世界坐标投屏（worldToView，CSS 像素 + canvas 偏移）。 */
async function projectToPage(
  page: Page,
  box: { x: number; y: number },
  world: { x: number; y: number; z: number },
): Promise<{ x: number; y: number }> {
  const view = await page.evaluate((point) => {
    const vp = (window as any).__lubanE2E?.coreFrontend?.IModelApp?.viewManager?.selectedView as
      | { worldToView: (p: { x: number; y: number; z: number }) => { x: number; y: number } }
      | undefined;
    if (!vp)
      return null;
    const projected = vp.worldToView(point);
    return { x: projected.x, y: projected.y };
  }, world);
  expect(view, 'worldToView 不可用（真实栈未就绪）').not.toBeNull();
  return { x: box.x + view!.x, y: box.y + view!.y };
}

test.describe('草图「穿透」约束（Sketch.Constraint.Pierce UI 真栈）', () => {
  test('草图点 + 竖直边 → pierce externalRef/(10,10)/DOF 0；工具保持激活', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const openWithRetry = async (): Promise<Awaited<ReturnType<typeof openSeedImodelEditor>>> => {
      try {
        return await openSeedImodelEditor(page, seed);
      } catch {
        await page.reload();
        return await openSeedImodelEditor(page, seed);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'sketch-pierce-ui');

    const source = centeredRectangleSketch(20, 20);
    const sourceSketch = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: source.entities,
      constraints: source.constraints,
      plane: PLANE(0),
    }, lease, token);
    assertFeatureOpOk(sourceSketch, '源草图');
    const extrude = await applyFeatureOpRpc(ctx, {
      kind: 'insertFeature',
      featureType: 'extrude',
      params: {
        profile: [],
        distance: 10,
        sketchId: sourceSketch.featureId!,
        regions: [0],
        operation: 'new',
      },
    }, lease, token);
    assertFeatureOpOk(extrude, '源拉伸 10');
    const target = await applyFeatureOpRpc(ctx, {
      kind: 'insertSketch',
      entities: [{ kind: 'point', id: 1, x: 0, y: 0 }],
      constraints: [],
      plane: PLANE(5),
    }, lease, token);
    assertFeatureOpOk(target, '目标草图 @z=5');
    const targetSketchId = target.featureId!;
    await releaseWriteLease(ctx, lease, token);

    await page.reload();
    ctx = await openWithRetry();
    const row = page.getByTestId(`tree-row-${targetSketchId}`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.dblclick({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

    await orientToIso(page);
    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    // 约束飞菜单「穿透」；工具激活只由公开提示 pill 断言（不读私有 hook）。
    await activate(page, '穿透');
    const hint = page.getByTestId('sketch-tool-hint');
    await expect(hint).toHaveAttribute('data-tool', 'Sketch.Constraint.Pierce', { timeout: 30_000 });
    await expect(hint).toContainText('单击草图点', { timeout: 15_000 });

    // 第一步：点目标草图的 (0,0) 点（z=5）。
    const pointScreen = await projectToPage(page, box!, { x: 0, y: 0, z: 5 });
    await dataPoint(page, pointScreen.x, pointScreen.y);
    // 候选异步加载：提示切到「单击模型边」即读边完成。
    await expect(hint).toContainText('单击模型边', { timeout: 30_000 });

    // 第二步：盒体 (10,10) 竖直边在 z=5 的世界点（顶视下该边投影为一个角点）。
    const edgeScreen = await projectToPage(page, box!, { x: 10, y: 10, z: 5 });
    await page.mouse.move(edgeScreen.x, edgeScreen.y);
    await expect(hint).toContainText('钉住该边', { timeout: 15_000 });
    await dataPoint(page, edgeScreen.x, edgeScreen.y);

    await expect.poll(async () => (await getSketchRpc(ctx, targetSketchId, token))?.projection?.status, {
      timeout: 60_000,
      intervals: [500, 1000, 2000],
    }).toBe('ok');

    const sketch = await getSketchRpc(ctx, targetSketchId, token);
    if (!sketch)
      throw new Error('目标草图读面为空');
    expect(sketch.externalRefs).toHaveLength(1);
    const ref = sketch.externalRefs![0]!;
    expect(ref.kind).toBe('pierce');
    expect(ref.entityIds).toEqual([]);
    expect(ref.localEntityId).toBe(1);
    expect(ref.source.kind).toBe('bodyEdge');
    // 本地点被钉到精确交点；无派生实体/隐藏约束泄漏。
    expect(sketch.entities).toHaveLength(1);
    expect(sketch.entities[0]).toMatchObject({ kind: 'point', id: 1 });
    const point = sketch.entities[0] as { x?: number; y?: number; projected?: unknown };
    expect(point.x).toBeCloseTo(10, 4);
    expect(point.y).toBeCloseTo(10, 4);
    expect(point.projected).toBeUndefined();
    expect(sketch.constraints).toHaveLength(0);
    expect(sketch.solve.dof).toBe(0);
    expect(sketch.regions).toBeUndefined();

    // 连续约束语义：成功后工具不退出，回到第一步提示。
    await expect(hint).toContainText('单击草图点', { timeout: 15_000 });

    // 干净退出草图（✓ 完成；种子 iModel 每轮重置）。
    await finishSketch(page);
  });
});
