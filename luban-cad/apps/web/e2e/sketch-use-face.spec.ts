/**
 * 草图「使用」（Use）平面面拾取真栈验收（S1b 2026-11-21）。
 *
 * 链路：RPC 建 20×20 源草图并拉伸 10 → 盒体（4000 mm³）→ 目标草图落在
 * z=10 顶面平面 → UI 打开目标草图 → 激活「使用」→ 在顶面中心世界坐标
 * (0,0,10) 的投屏位置悬停 + 点击 → 覆盖层以面候选（屏幕外环多边形命中）
 * 交给宿主，生成 externalRefs 行：
 *   source.kind="bodyFace"、loops="outer"、外环 4 线 → 12 实体 id
 * → 后端投影读面 ok / 12 实体（4 线 + 8 端点）/ DOF 0 / 面积 400。
 * 改源宽约束 20→30 → 面边界联动 → 投影面积 600 且 externalRefs 仍在。
 *
 * 单用例：MS 限流 100 req/15min；429 时按 retryAfter 等窗口后重跑，不绕限流。
 * 面枚举复用既有只读观测面（`readBrepFaceHandles`）+ `resolveFaceRef`，
 * 覆盖层复用既有 Use 会话/FeatureOp 管道（无第二套工具/拾取）。
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type {
  SketchConstraintDto,
  SketchEntityDto,
  SketchPlaneDto,
} from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getSketchRpc,
  openSeedImodelEditor,
  releaseWriteLease, reloadWithFlush } from './helpers';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';

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

interface Pt { x: number; y: number }

/**
 * 相机正视顶面（z=10 平面，屏幕 up=+Y）。
 *
 * 默认等轴测视图下，z=0 源草图的角点（以及盒体背面隐藏顶点）会投影到顶面
 * 中心 6 px 内——端点候选按设计优先于面命中（不能回归既有拾取）。正视顶面
 * 后顶面中心远离全部边/点候选，`(0,0,10)` 投屏点稳定落在面内。
 */
async function orientToTopFace(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = (window as any).__lubanE2E?.coreFrontend as
      | {
        StandardViewId?: { Top: number };
        IModelApp?: { viewManager?: { selectedView?: any } };
      }
      | undefined;
    const vp = host?.IModelApp?.viewManager?.selectedView;
    const topId = host?.StandardViewId?.Top;
    if (!vp?.view || topId === undefined)
      throw new Error('正视顶面失败：StandardViewId/viewport 不可用');
    vp.view.setStandardRotation(topId);
    vp.synchWithView?.();
    vp.invalidateScene?.();
    vp.zoomToVolume?.({ low: { x: -14, y: -14, z: 0 }, high: { x: 14, y: 14, z: 10 } });
  });
  await page.waitForTimeout(400);
}

/** 画布内世界坐标投屏（worldToView，CSS 像素 + canvas 偏移）。 */
async function projectToPage(page: Page, box: { x: number; y: number }, world: Pt & { z: number }): Promise<Pt> {
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

interface UseFaceScene {
  ctx: Awaited<ReturnType<typeof openSeedImodelEditor>>;
  token: string;
  sourceSketchId: string;
  targetSketchId: string;
}

/**
 * 源草图 20×20 @z=0 → 拉伸 10 盒体（x/y 以原点为中心的 20×20×10）→
 * 目标草图 @z=10（空草图）→ reload + 打开目标草图编辑态 + 激活「使用」。
 */
async function openUseFaceScene(
  page: Page,
  request: Parameters<typeof resetBModelSeed>[0],
): Promise<UseFaceScene> {
  const token = await getApiToken();
  const seed = await resetBModelSeed(request, token);
  const openWithRetry = async (): Promise<Awaited<ReturnType<typeof openSeedImodelEditor>>> => {
    try {
      return await openSeedImodelEditor(page, seed);
    } catch {
      await reloadWithFlush(page);
      return await openSeedImodelEditor(page, seed);
    }
  };
  let ctx = await openWithRetry();
  const lease = await borrowWriteLease(ctx, token, 'sketch-use-face');

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
  const targetSketch = await applyFeatureOpRpc(ctx, {
    kind: 'insertSketch',
    entities: [],
    constraints: [],
    plane: PLANE(10),
  }, lease, token);
  assertFeatureOpOk(targetSketch, '目标草图 @z=10');
  await releaseWriteLease(ctx, lease, token);

  await reloadWithFlush(page);
  ctx = await openWithRetry();
  const row = page.getByTestId(`tree-row-${targetSketch.featureId!}`);
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.dblclick({ timeout: 30_000 });
  await expect(page.getByTestId('part-studio-sketch-dialog')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 60_000 });

  // 正视顶面并取景盒体（默认等轴测下隐藏顶点会落进顶面中心的 6 px 端点半径）。
  await orientToTopFace(page);

  await page.getByRole('button', { name: '使用（投影/转换）', exact: true }).click();
  const prompt = page.getByTestId('sketch-use-prompt');
  await expect(prompt).toContainText('使用', { timeout: 30_000 });
  // 覆盖层确实读到了平面面候选（不是仅靠模型边把提示撑起来）。
  await expect(prompt).toHaveAttribute('data-face-candidates', /^[1-9][0-9]*$/, { timeout: 30_000 });

  return { ctx, token, sourceSketchId: sourceSketch.featureId!, targetSketchId: targetSketch.featureId! };
}

test.describe('草图「使用」平面面（Use bodyFace outer 真栈）', () => {
  test('顶面中心点击 → bodyFace/outer 12 实体/面积 400；改源宽 30 → 600', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const { ctx, token, sourceSketchId, targetSketchId } = await openUseFaceScene(page, request);

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    // 顶面中心 (0,0,10)：面命中=屏幕外环多边形内（孔环不适用本盒体）。
    const center = await projectToPage(page, box!, { x: 0, y: 0, z: 10 });
    // 与既有 Use 规格同款稳定性：先移开再移回候选，等 hover 态落定后点击。
    await page.mouse.move(center.x + 6, center.y + 6);
    await page.mouse.move(center.x, center.y);
    await page.waitForTimeout(200);
    // 面命中=屏幕外环多边形内（边/端点优先半径内无候选）。
    await expect(page.getByTestId('sketch-use-prompt')).toHaveAttribute('data-hover-kind', 'face', { timeout: 15_000 });
    await page.mouse.click(center.x, center.y);

    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, targetSketchId, token);
      return sketch?.projection?.status;
    }, { timeout: 60_000, intervals: [500, 1000, 2000] }).toBe('ok');

    const projected = await getSketchRpc(ctx, targetSketchId, token);
    if (!projected)
      throw new Error('目标草图读面为空');
    expect(projected.externalRefs).toHaveLength(1);
    const ref = projected.externalRefs![0]!;
    expect(ref.kind).toBe('project');
    expect(ref.source.kind).toBe('bodyFace');
    if (ref.source.kind === 'bodyFace')
      expect(ref.source.loops).toBe('outer');
    // 外环 4 线 → 4×3 = 12 个实体 id；读面 4 线 + 8 端点。
    expect(ref.entityIds).toHaveLength(12);
    expect(projected.entities).toHaveLength(12);
    expect(projected.entities.filter((entity) => entity.kind === 'line')).toHaveLength(4);
    expect(projected.solve.dof).toBe(0);
    expect(projected.regions).toHaveLength(1);
    expect(projected.regions?.[0]?.area).toBeCloseTo(400, 4);

    // 工具保持激活（连续使用语义不回归）。
    await expect(page.getByTestId('sketch-use-prompt')).toBeVisible();

    // 改源宽 20→30：面边界联动 → 投影环 600、externalRefs 仍在（persistent ref）。
    const lease = await borrowWriteLease(ctx, token, 'sketch-use-face-source-update');
    const updated = await applyFeatureOpRpc(
      ctx,
      { kind: 'updateSketchConstraint', sketchId: sourceSketchId, constraintId: 29, value: 30 },
      lease,
      token,
    );
    assertFeatureOpOk(updated, '改源宽 30');
    await releaseWriteLease(ctx, lease, token);

    await expect.poll(async () => {
      const sketch = await getSketchRpc(ctx, targetSketchId, token);
      const area = sketch?.regions?.[0]?.area;
      return area === undefined ? -1 : Math.round(area);
    }, { timeout: 60_000, intervals: [500, 1000, 2000] }).toBe(600);
    const afterWidth = await getSketchRpc(ctx, targetSketchId, token);
    expect(afterWidth?.projection?.status).toBe('ok');
    expect(afterWidth?.externalRefs).toHaveLength(1);
    expect(afterWidth?.externalRefs?.[0]?.source.kind).toBe('bodyFace');

    // 退出 Use（不要求第二次面拾取；测试的种子 iModel 每轮重置）。
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('sketch-use-prompt')).toHaveCount(0);
  });
});
