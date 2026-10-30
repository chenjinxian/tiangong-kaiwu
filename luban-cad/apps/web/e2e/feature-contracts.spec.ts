/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 发布窗真栈合成（B1–B5）：经 MS HTTP RPC face 直发 insertSketch/applyFeatureOp，
 * 在**真实 MS 宿主 + 真实 briefcase + 真实内核**上依次验证：
 *   草图→Extrude→Mirror→Pattern(linear)→BooleanSubtract→Loft→Sweep→Pattern(circular)
 * 断言：每步 applyFeatureOp ok + 特征树该行 status=0（非死特征）、BodySolid 恰 1 个、
 * 页面树行可见、原生 Undo/Redo 可回退/重放最后一笔、全程零 console error。
 *
 * 为什么走 HTTP RPC 而非 UI 对话框：
 * - UI 对话框的载荷/门禁/字段映射已由 FeatureDialog 单测与既有 e2e 覆盖；本用例的
 *   目标是**真栈集成**（RPC face → FeatureService/EDE/preEvaluateDirty → 内核 →
 *   body 写回 → onCommitted 树刷新），逐特征点 UI 会引入大量绘图/拾取噪声。
 * - 与 tutorial2 的 L1 通道同源：MS BentleyCloud wire、text 载体、CSRF 双提交、
 *   X-Correlation-Id；dbKey = briefcase 相对路径，租约借用页面在持会话。
 *
 * 版本约束：URL 中 LubanFeatureRpcInterface-<version> 直接取自 `@luban-cad/shared`
 * 的 `LubanFeatureRpcInterface.interfaceVersion`（运行时导入，禁止硬编码——
 * 契约升版自动跟随，测试与 MS 不会版本漂移）。版本不匹配会以 HTTP 非 2xx 明确报红。
 */

import { expect, test } from '@playwright/test';
import type { FeatureOp } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  borrowWriteLease,
  collectConsoleErrors,
  getApiToken,
  getFeatureTreeRpc,
  openSeedImodelEditor,
} from './helpers';
import { resetBModelSeed } from './seed';

// P2.6a：数据面=共享 B 种子（项目带 data.luban.modelMode='B'）。每例 beforeEach
// 重置种子（直发 6 张草图 + 7 个特征，残留不得污染后续用例）；直连 RPC 一律
// 携带首开解析器落位的 Part Studio scope（applyFeatureOp 第 4 参）。
test.beforeEach(async ({ request }) => {
  test.setTimeout(900_000);
  await resetBModelSeed(request, await getApiToken());
});

interface Sketch2d {
  entities: unknown[];
  constraints: unknown[];
}

interface PlaneDto {
  origin: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  xDir: { x: number; y: number; z: number };
}

interface FeatureTreeRow {
  id: string;
  featureType: string;
  orderKey: number;
  suppressed: boolean;
  status: number;
  params: unknown;
}

/** 轴对齐矩形草图（与 tutorial2/rectangle 同构：每线独立端点 + coincident 焊接闭环）。 */
function rectangleSketch(x0: number, y0: number, x1: number, y1: number): Sketch2d {
  let next = 1;
  const nid = (): number => next++;
  const corners: Array<[number, number]> = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  const entities: unknown[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % 4]!;
    const idA = nid();
    const idB = nid();
    entities.push(
      { kind: 'point', id: idA, x: a[0], y: a[1] },
      { kind: 'point', id: idB, x: b[0], y: b[1] },
      { kind: 'line', id: nid(), p1: idA, p2: idB },
    );
    starts.push(idA);
    ends.push(idB);
  }
  const constraints = starts.map((_startId, i) => ({
    kind: 'coincident',
    id: nid(),
    refs: [ends[i], starts[(i + 1) % 4]],
  }));
  return { entities, constraints };
}

/** 圆草图（单半径约束，同 SweepFlow/SketchFlow 合成夹具）。 */
function circleSketch(radius: number): Sketch2d {
  return {
    entities: [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'circle', id: 2, center: 1, radius },
    ],
    constraints: [{ kind: 'radius', id: 3, refs: [2], value: radius }],
  };
}

/** 单直线草图（front 平面局部 v 轴 = 世界 −Z；本夹具向上走世界 +Z）。 */
function lineSketch(length: number): Sketch2d {
  return {
    entities: [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 0, y: -length },
      { kind: 'line', id: 3, p1: 1, p2: 2 },
    ],
    constraints: [
      { kind: 'vertical', id: 4, refs: [3] },
      { kind: 'distance', id: 5, refs: [1, 2], value: length },
    ],
  };
}

/** XY 平面 @ z（上视）。 */
function xyPlane(z: number): PlaneDto {
  return {
    origin: { x: 0, y: 0, z },
    normal: { x: 0, y: 0, z: 1 },
    xDir: { x: 1, y: 0, z: 0 },
  };
}

/** Front 平面（normal +Y；xDir +X → 局部 v = 世界 −Z）。 */
const FRONT_PLANE: PlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  xDir: { x: 1, y: 0, z: 0 },
};

test('真栈合成：B1–B5 特征 RPC 全链（boolean/loft/sweep/mirror/pattern）', async ({ page }) => {
  test.setTimeout(900_000); // 8 次内核求值 + 树刷新 + undo/redo；真实内核冷启动预算
  const consoleErrors = collectConsoleErrors(page);
  const accessToken = await getApiToken();
  // B 种子：helper 等 ?model= scope + 编辑器就绪；dbKey 取自已打开 briefcase。
  const ctx = await openSeedImodelEditor(page);
  expect(page.url()).toContain(`/documents/${ctx.itwinId}/${ctx.imodelId}`);
  console.log(`[release] B scope=${ctx.scopeId} dbKey=${ctx.dbKey}`);

  const lease = await borrowWriteLease(ctx, accessToken, 'feature-release');
  console.log(`[release] 租约 borrowed=${lease.borrowed} session=${lease.sessionId.slice(0, 8)}…`);

  const getTree = async (): Promise<FeatureTreeRow[]> =>
    (await getFeatureTreeRpc(ctx, accessToken)) as FeatureTreeRow[];

  /** 已落特征（末尾统一读一次树验 status=0；逐步 getTree 会把 MS RPC 打到限流）。 */
  const applied: Array<{ id: string; label: string }> = [];
  const applyFeature = async (op: Record<string, unknown>, label: string): Promise<string> => {
    const r = await applyFeatureOpRpc(ctx, op as unknown as FeatureOp, lease, accessToken);
    expect(r.ok, `${label} 被拒收：${r.error ?? JSON.stringify(r).slice(0, 300)}`).toBe(true);
    expect(r.featureId, `${label} 未返回 featureId`).toBeTruthy();
    applied.push({ id: r.featureId!, label });
    console.log(`[release] ${label} OK id=${r.featureId!.slice(0, 8)}…`);
    return r.featureId!;
  };

  const insertSketch = async (sketch: Sketch2d, plane: PlaneDto, label: string): Promise<string> => {
    const r = await applyFeatureOpRpc(
      ctx,
      { kind: 'insertSketch', entities: sketch.entities, constraints: sketch.constraints, plane } as unknown as FeatureOp,
      lease,
      accessToken,
    );
    expect(r.ok, `${label} 被拒收：${r.error ?? JSON.stringify(r).slice(0, 300)}`).toBe(true);
    expect(r.featureId, `${label} 未返回 sketchId`).toBeTruthy();
    console.log(`[release] ${label} OK id=${r.featureId!.slice(0, 8)}…`);
    return r.featureId!;
  };

  // ── 1) 草图 A + Extrude：20×20 @ z0，距离 10 ─────────────────────────────
  const sketchA = await insertSketch(rectangleSketch(0, 0, 20, 20), xyPlane(0), '草图 A');
  await applyFeature({
    kind: 'insertFeature', featureType: 'extrude',
    params: { profile: [], distance: 10, sketchId: sketchA, regions: [0] },
  }, 'extrude');

  // ── 2) Mirror XZ：盒体镜像并保留原体（上游+镜像体 Unite）──────────────────
  await applyFeature({
    kind: 'insertFeature', featureType: 'mirror',
    params: { plane: 'XZ', keepOriginal: true },
  }, 'mirror');

  // ── 3) Pattern linear：沿 X 3 份、间距 30（含原件）────────────────────────
  await applyFeature({
    kind: 'insertFeature', featureType: 'pattern',
    params: { kind: 'linear', count: 3, spacing: 30, axis: 'X' },
  }, 'pattern-linear');

  // ── 4) 草图 B + BooleanSubtract：顶部 5..15 方孔贯穿上游体 ────────────────
  const sketchB = await insertSketch(rectangleSketch(5, 5, 15, 15), xyPlane(0), '草图 B');
  await applyFeature({
    kind: 'insertFeature', featureType: 'booleanSubtract',
    params: { sketchId: sketchB, regions: [0], distance: 20, operation: 'subtract' },
  }, 'booleanSubtract');

  // ── 5) 草图 C/D + Loft：两平行截面（z0/z20 各 10×10）─────────────────────
  const sketchC = await insertSketch(rectangleSketch(0, 0, 10, 10), xyPlane(0), '草图 C');
  const sketchD = await insertSketch(rectangleSketch(0, 0, 10, 10), xyPlane(20), '草图 D');
  await applyFeature({
    kind: 'insertFeature', featureType: 'loft',
    params: { sketchIds: [sketchC, sketchD], bodyType: 'SOLID' },
  }, 'loft');

  // ── 6) 草图 E/F + Sweep：R2 圆沿 front 直线路径（世界 +Z 10）─────────────
  const sketchE = await insertSketch(circleSketch(2), xyPlane(0), '草图 E');
  const sketchF = await insertSketch(lineSketch(10), FRONT_PLANE, '草图 F');
  await applyFeature({
    kind: 'insertFeature', featureType: 'sweep',
    params: { profileSketchId: sketchE, pathSketchId: sketchF, bodyType: 'SOLID' },
  }, 'sweep');

  // ── 7) Pattern circular：绕世界 Z 3 份/360°（B5 圆周真栈通道）────────────
  await applyFeature({
    kind: 'insertFeature', featureType: 'pattern',
    params: { kind: 'circular', count: 3, angle: 360, axis: 'Z' },
  }, 'pattern-circular');

  // ── 8) 全链树：所有特征行绿 + 页面树行可见（onCommitted 刷新）─────────────
  const finalTree = await getTree();
  for (const { id, label } of applied) {
    const row = finalTree.find((entry) => entry.id === id);
    expect(row, `${label} 未入特征树`).toBeTruthy();
    expect(row!.status, `${label} status 应为 0（非死特征）`).toBe(0);
  }
  const featureTypes = new Set(finalTree.filter((row) => row.featureType !== 'sketch').map((row) => row.featureType));
  for (const expected of ['extrude', 'mirror', 'pattern', 'booleanSubtract', 'loft', 'sweep'])
    expect(featureTypes.has(expected), `特征树缺少 ${expected}（实得 ${[...featureTypes].join(',')}）`).toBe(true);
  expect(finalTree.filter((row) => row.featureType !== 'sketch' && row.status !== 0), '不应存在 status≠0 的死特征')
    .toEqual([]);
  console.log(`[release] 树 ${finalTree.length} 行，特征类型 ${[...featureTypes].join(',')}`);

  const featureList = page.getByTestId('part-studio-feature-list');
  for (const name of ['拉伸 1', '镜像 1', '阵列 1', '差集 1', '放样 1', '扫掠 1', '阵列 2'])
    await expect(featureList.getByRole('button', { name }), `页面树应有「${name}」`).toBeVisible({ timeout: 90_000 });

  // ── 9) BodySolid 恰 1 个（单 body 不变量；顺带守住直改副本/多体泄漏）──────
  const bodyCount = await page.evaluate(async () => {
    const cf = (await import('/@id/@itwin/core-frontend')) as {
      IModelApp: {
        viewManager: {
          getFirstOpenView(): {
            iModel: { elements: { queryProps(args: { from: string; wantProperties?: boolean }): Promise<Array<{ id: string }>> } };
          } | undefined;
        };
      };
    };
    const vp = cf.IModelApp.viewManager.getFirstOpenView();
    if (!vp) return -1;
    const rows = await vp.iModel.elements.queryProps({ from: 'LubanCAD.BodySolid', wantProperties: false });
    return rows.length;
  });
  expect(bodyCount, 'BodySolid 元素应恰为 1（单 body 不变量）').toBe(1);

  // ── 10) 原生 Undo/Redo：回退最后一笔圆周阵列，再重放 ─────────────────────
  // 用页面树计数（onCommitted 刷新）而非反复 getFeatureTree——后者在逐步验树时
  // 会把 MS HTTP RPC 打到限流（实测全量套件出现 429→编辑器连接连带卡死）。
  const featureCount = page.getByTestId('part-studio-feature-count');
  const undoButton = page.getByTestId('part-studio-undo-button');
  const redoButton = page.getByTestId('part-studio-redo-button');
  await expect(featureCount).toHaveText(`(${finalTree.length})`, { timeout: 90_000 });
  await expect(undoButton).toBeEnabled({ timeout: 90_000 });
  await undoButton.click();
  await expect(featureCount).toHaveText(`(${finalTree.length - 1})`, { timeout: 90_000 });
  await expect(redoButton).toBeEnabled({ timeout: 30_000 });
  await redoButton.click();
  await expect(featureCount).toHaveText(`(${finalTree.length})`, { timeout: 90_000 });
  console.log('[release] 原生 undo/redo 回退/重放最后一笔通过');

  // ── 11) 全程零 console error ─────────────────────────────────────────────
  expect(consoleErrors, `console error 应为空：\n${consoleErrors.join('\n')}`).toHaveLength(0);
});
