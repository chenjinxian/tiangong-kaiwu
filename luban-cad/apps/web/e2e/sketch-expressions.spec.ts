/**
 * ADR-0020 S1 真栈验收（RPC 级）：Part Studio 变量表 + 草图尺寸表达式。
 *
 * 依赖（未发布，运行前必须在本机就绪）：
 * - shared 1.71.0（工作树/已构建 dist）；
 * - 新后端 modeling-server（schema 01.00.01 + updateVariables/getVariables + 表达式求值），
 *   以源码模式启动 MS：`scripts/start-ms-host.ps1 -Source <luban-backend>\modeling-server`。
 *   产物模式（dist-backend）仍旧后端，会因未知 op/查询而失败。
 *
 * 链路：变量 width=10 → 10×10 方形草图（宽/高尺寸均为 `#width`）→ 拉伸 5 → **500 mm³**
 * → updateVariables width=20 → 草图重解为 20×20、体积 **2000** → undo 回 10/500 →
 * redo 回 20/2000；循环变量/未知变量显式拒收且零变更；表达式随 constraints 落库
 * （getSketch 回读 expression）。
 *
 * 说明：本 spec 只走 RPC（不操作 UI）；UI 表达式输入/变量面板（S2/S3）待 live 证据后实现。
 */
import { expect, test } from '@playwright/test';
import type {
  FeatureOp,
  SketchConstraintDto,
  SketchDto,
  SketchEntityDto,
  SketchPlaneDto,
} from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getMassPropertiesRpc,
  getSketchRpc,
  getVariablesRpc,
  openSeedImodelEditor,
  releaseWriteLease,
} from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

/** 矩形草图（与 SketchFlow 同形：8 点 + 4 线 + 10 约束 → 恰定）；宽/高表达式可选。 */
function rectangleSketch(
  width: number,
  height: number,
  widthExpression: string,
  heightExpression: string,
): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
  const entities: SketchEntityDto[] = [
    { kind: 'point', id: 1, x: 0, y: 0 },
    { kind: 'point', id: 2, x: width, y: 0 },
    { kind: 'point', id: 3, x: width, y: height },
    { kind: 'point', id: 4, x: 0, y: height },
    { kind: 'point', id: 5, x: 0, y: 0 },
    { kind: 'point', id: 6, x: width, y: 0 },
    { kind: 'point', id: 7, x: width, y: height },
    { kind: 'point', id: 8, x: 0, y: height },
    { kind: 'line', id: 11, p1: 5, p2: 6 },
    { kind: 'line', id: 12, p1: 6, p2: 7 },
    { kind: 'line', id: 13, p1: 7, p2: 8 },
    { kind: 'line', id: 14, p1: 8, p2: 5 },
  ];
  const constraints: SketchConstraintDto[] = [
    { kind: 'coincident', id: 21, refs: [1, 5] },
    { kind: 'coincident', id: 22, refs: [2, 6] },
    { kind: 'coincident', id: 23, refs: [3, 7] },
    { kind: 'coincident', id: 24, refs: [4, 8] },
    { kind: 'horizontal', id: 25, refs: [11] },
    { kind: 'horizontal', id: 26, refs: [13] },
    { kind: 'vertical', id: 27, refs: [12] },
    { kind: 'vertical', id: 28, refs: [14] },
    { kind: 'distance', id: 29, refs: [1, 2], value: width, expression: widthExpression },
    { kind: 'distance', id: 30, refs: [2, 3], value: height, expression: heightExpression },
  ];
  return { entities, constraints };
}

function pointX(sketch: SketchDto | undefined, pointId: number): number | undefined {
  const entity = sketch?.entities.find((candidate) => candidate.id === pointId);
  return entity?.kind === 'point' ? entity.x : undefined;
}

function pointY(sketch: SketchDto | undefined, pointId: number): number | undefined {
  const entity = sketch?.entities.find((candidate) => candidate.id === pointId);
  return entity?.kind === 'point' ? entity.y : undefined;
}

function constraintOf(sketch: SketchDto | undefined, constraintId: number): SketchConstraintDto | undefined {
  return sketch?.constraints.find((candidate) => candidate.id === constraintId);
}

test.describe('ADR-0020 S1 草图表达式与 Part Studio 变量（真栈 RPC）', () => {
  test('变量驱动尺寸 → 几何/体积重算 → undo/redo → 错误零变更', async ({ page, request }) => {
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
    const ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'sketch-expressions');
    const volumeOf = async (): Promise<number> => {
      const bodies = await getMassPropertiesRpc(ctx, token);
      return bodies.reduce((max, body) => Math.max(max, body.volume), 0);
    };
    try {
      // 1) 空变量表
      expect(await getVariablesRpc(ctx, token)).toEqual([]);

      // 2) 建变量 width=10
      let result = await applyFeatureOpRpc(ctx, {
        kind: 'updateVariables',
        variables: [{ id: 'v1', name: 'width', expression: '10' }],
      } as FeatureOp, lease, token);
      assertFeatureOpOk(result, '建变量表');
      // S3a（2026-11-17）：后端 getVariables 读面恒返回具体 type（缺省 length），
      // 属契约读面默认值，不是新增写入字段。
      expect(await getVariablesRpc(ctx, token)).toEqual([
        { id: 'v1', name: 'width', expression: '10', type: 'length' },
      ]);

      // 3) 方形草图：宽/高尺寸均为 #width（value 仅求解初值）
      result = await applyFeatureOpRpc(ctx, {
        kind: 'insertSketch',
        ...rectangleSketch(10, 10, '#width', '#width'),
        plane: XY_PLANE,
      }, lease, token);
      assertFeatureOpOk(result, '表达式方形草图');
      const sketchId = result.featureId!;

      await expect.poll(async () => pointX(await getSketchRpc(ctx, sketchId, token), 2), {
        timeout: 40_000,
        intervals: [600, 1000, 2000],
      }).toBeGreaterThan(9.9);
      const initialSketch = await getSketchRpc(ctx, sketchId, token);
      expect(pointX(initialSketch, 2)).toBeCloseTo(10, 3);
      expect(pointY(initialSketch, 3)).toBeCloseTo(10, 3);
      expect(constraintOf(initialSketch, 29)?.expression).toBe('#width');
      expect(constraintOf(initialSketch, 29)?.value).toBeCloseTo(10, 6);

      // 4) 拉伸 5 → 500 mm³
      result = await applyFeatureOpRpc(ctx, {
        kind: 'insertFeature',
        featureType: 'extrude',
        params: { profile: [], distance: 5, sketchId },
      }, lease, token);
      assertFeatureOpOk(result, '拉伸方形草图');
      await expect.poll(volumeOf, { timeout: 60_000, intervals: [800, 1200, 2000] })
        .toBeGreaterThan(499);
      expect(await volumeOf()).toBeLessThan(501);

      // 5) 改变量 width=20 → 草图重解 20×20、体积 2000
      result = await applyFeatureOpRpc(ctx, {
        kind: 'updateVariables',
        variables: [{ id: 'v1', name: 'width', expression: '20' }],
      }, lease, token);
      assertFeatureOpOk(result, '改变量 width=20');
      await expect.poll(async () => pointX(await getSketchRpc(ctx, sketchId, token), 2), {
        timeout: 40_000,
        intervals: [600, 1000, 2000],
      }).toBeGreaterThan(19.9);
      const grownSketch = await getSketchRpc(ctx, sketchId, token);
      expect(pointY(grownSketch, 3)).toBeCloseTo(20, 3);
      expect(constraintOf(grownSketch, 29)?.expression).toBe('#width');
      expect(constraintOf(grownSketch, 29)?.value).toBeCloseTo(20, 6);
      await expect.poll(volumeOf, { timeout: 60_000, intervals: [800, 1200, 2000] })
        .toBeGreaterThan(1999);
      expect(await volumeOf()).toBeLessThan(2001);

      // 6) undo → 10 / 500；redo → 20 / 2000
      result = await applyFeatureOpRpc(ctx, { kind: 'undo' }, lease, token);
      assertFeatureOpOk(result, 'undo 变量变更');
      await expect.poll(async () => pointX(await getSketchRpc(ctx, sketchId, token), 2), {
        timeout: 40_000,
        intervals: [600, 1000, 2000],
      }).toBeLessThan(10.1);
      expect((await getVariablesRpc(ctx, token))[0]?.expression).toBe('10');
      await expect.poll(volumeOf, { timeout: 60_000, intervals: [800, 1200, 2000] })
        .toBeLessThan(501);

      result = await applyFeatureOpRpc(ctx, { kind: 'redo' }, lease, token);
      assertFeatureOpOk(result, 'redo 变量变更');
      await expect.poll(async () => pointX(await getSketchRpc(ctx, sketchId, token), 2), {
        timeout: 40_000,
        intervals: [600, 1000, 2000],
      }).toBeGreaterThan(19.9);
      expect((await getVariablesRpc(ctx, token))[0]?.expression).toBe('20');
      await expect.poll(volumeOf, { timeout: 60_000, intervals: [800, 1200, 2000] })
        .toBeGreaterThan(1999);

      // 7) 循环变量 → 显式拒收，变量表不变
      result = await applyFeatureOpRpc(ctx, {
        kind: 'updateVariables',
        variables: [
          { id: 'a', name: 'a', expression: '#b + 1' },
          { id: 'b', name: 'b', expression: '#a + 1' },
        ],
      }, lease, token);
      expect(result.ok, '循环变量应被拒收').toBe(false);
      if (!result.ok)
        expect(result.error).toMatch(/循环|cycle/i);
      expect(await getVariablesRpc(ctx, token)).toEqual([
        { id: 'v1', name: 'width', expression: '20', type: 'length' },
      ]);

      // 8) 未知变量表达式 → 显式拒收（零新增草图）
      result = await applyFeatureOpRpc(ctx, {
        kind: 'insertSketch',
        ...rectangleSketch(10, 10, '#missing', '10'),
        plane: XY_PLANE,
      }, lease, token);
      expect(result.ok, '未知变量表达式应被拒收').toBe(false);
      if (!result.ok)
        expect(result.error).toContain('表达式错误');
    } finally {
      await releaseWriteLease(ctx, lease, token);
    }
  });
});
