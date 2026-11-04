/**
 * 发布窗真栈：NEW-body 生命周期 + 零件树/getBodies/consumed 隐藏 + 原生 undo。
 *
 * P2.6a：数据面迁到 **B 种子**（`E2E B 项目` / `E2E B Seed`，项目带
 * data.luban.modelMode='B'）——每例 beforeEach 重置种子，首开编辑器由解析器
 * 创建默认 Part Studio；直连 RPC 一律携带该 scope（applyFeatureOp 第 4 参 /
 * getBodies/getFeatureTree 第 2 参），不再走 legacy 无 scope 读写。
 *
 * 场景：
 *   草图 A → extrude body1 → 草图 B → extrude(newBody) body2
 *   → getBodies 两个 active authored body；页面树两行
 *   → 逐 body eye：隐藏 body2（data-hidden + EmphasizeElements neverDrawn）→ 显示
 *   → 程序化 store part 选择（X-03 唯一权威；selectionSet 为其投影）→
 *     画布菜单出 part 删除项 → 清空 + 收合
 *   → Onshape 统一选择（2026-11-03）：无模式直接拾取面/边/点、空白清除、
 *     跨 body 普通单击替换、Ctrl 多选/再点取消、面 owner 菜单（选中所属/
 *     隐藏/删除）
 *   → 树删除 UI（B6 M-A5 T2）：newBody 特征行右键「删除」→ HITL 确认 →
 *     body2 consumed、树一行、几何 hide → 原生 undo → 两体恢复、hide 清除
 *   → 首个 delete 的原生 redo → body2 再消费 → undo 恢复两体基线
 *     （#45 修复后可达；见下）
 *   → 非默认体 fillet（真栈拾边）→ 抑制/取消抑制（行 data-suppressed 往返、
 *     无失败 toast）。
 *
 * #45（MS backend-20261028c）：deleteFeature 会 cache.delete(featureId)；
 * 首次 undo 后本页 onAfterUndoRedo 自动 refresh 的首个读 RPC 曾触发
 * FeatureService.ensureWarm 冷重建（rebuildAll 写体 + commit → 新事务清空
 * 原生 redo 栈）。修复后读初始化路径在 redo 栈存在时跳过重建，写路径强制
 * 补缓存；本 spec 直接断言首删 undo→redo→undo，不再用 disabled 哨兵或
 * 第二个 NEW-body 变通。
 *
 * 读面纪律（MS 全局 100 req/15min）：等待/同步一律走 UI（零件行数/隐藏集/
 * 行属性），getBodies/getTree 只在关键检查点单次读。
 */

import { expect, test, type Page } from '@playwright/test';
import type { FeatureOp } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  collectConsoleErrors,
  getApiToken,
  getBodiesRpc,
  getFeatureTreeRpc,
  openSeedImodelEditor,
} from './helpers';
import { resetBModelSeed, type SeedImodelRef } from './seed';

// L3：reset 返回的同一组 id 交给 open，避免各自按名解析。
let bSeed: SeedImodelRef | undefined;

test.beforeEach(async ({ request }) => {
  test.setTimeout(900_000);
  bSeed = await resetBModelSeed(request, await getApiToken());
});

interface Sketch2d { entities: unknown[]; constraints: unknown[] }
interface PlaneDto {
  origin: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  xDir: { x: number; y: number; z: number };
}
interface FeatureTreeRow { id: string; featureType: string; status: number }
interface BodyInfo { bodyKey: string; name?: string; active: boolean; authored?: boolean; sourceFeatureId?: string }

function rectangleSketch(x0: number, y0: number, x1: number, y1: number): Sketch2d {
  let next = 1;
  const nid = (): number => next++;
  const corners: Array<[number, number]> = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
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

const xyPlane = (z: number): PlaneDto => ({
  origin: { x: 0, y: 0, z },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
});

/** 视口 neverDrawn 当前集（consumed ∪ 手动隐藏；undefined→[]）。纯前端读，不耗 RPC。 */
async function hiddenElementIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const cf = ((window as any).__lubanE2E?.coreFrontend) as {
      IModelApp: { viewManager: { getFirstOpenView(): unknown } };
      EmphasizeElements: { get(vp: unknown): { getHiddenElements(vp: unknown): Iterable<string> | undefined } | undefined };
    };
    const vp = cf.IModelApp.viewManager.getFirstOpenView();
    const ee = cf.EmphasizeElements.get(vp);
    const set = ee?.getHiddenElements(vp);
    return set ? Array.from(set).map(String) : [];
  });
}

test('真栈：extrude newBody 两体 → eye/选择桥 → 树删除 undo/redo → fillet 抑制', async ({ page }) => {
  test.setTimeout(900_000);
  const consoleErrors = collectConsoleErrors(page);
  const accessToken = await getApiToken();
  // B 种子：helper 等 ?model= scope + 编辑器就绪；dbKey 取自已打开 briefcase。
  const ctx = await openSeedImodelEditor(page, bSeed);
  console.log(`[newbody] B scope=${ctx.scopeId} dbKey=${ctx.dbKey}`);

  const lease = await borrowWriteLease(ctx, accessToken, 'newbody');
  console.log(`[newbody] lease borrowed=${lease.borrowed}`);

  const apply = async (op: Record<string, unknown>, label: string): Promise<string> => {
    const r = await applyFeatureOpRpc(ctx, op as unknown as FeatureOp, lease, accessToken);
    assertFeatureOpOk(r, label);
    expect(r.featureId, `${label} 无 featureId`).toBeTruthy();
    console.log(`[newbody] ${label} OK ${r.featureId!.slice(0, 8)}…`);
    return r.featureId!;
  };
  const insertSketch = async (s: Sketch2d, plane: PlaneDto, label: string): Promise<string> =>
    apply({ kind: 'insertSketch', entities: s.entities, constraints: s.constraints, plane }, label);
  const getBodies = async (): Promise<BodyInfo[]> => (await getBodiesRpc(ctx, accessToken)) as BodyInfo[];
  const getTree = async (): Promise<FeatureTreeRow[]> =>
    (await getFeatureTreeRpc(ctx, accessToken)) as FeatureTreeRow[];

  // body1
  const sketchA = await insertSketch(rectangleSketch(0, 0, 2, 2), xyPlane(0), '草图 A');
  await apply({
    kind: 'insertFeature', featureType: 'extrude',
    params: { profile: [], distance: 1, sketchId: sketchA, regions: [0] },
  }, 'extrude body1');

  // body2（newBody）
  const sketchB = await insertSketch(rectangleSketch(4, 0, 6, 2), xyPlane(0), '草图 B');
  const newBodyFeatureId = await apply({
    kind: 'insertFeature', featureType: 'extrude',
    params: { profile: [], distance: 2, sketchId: sketchB, regions: [0], newBody: true },
  }, 'extrude newBody body2');

  const bodies = await getBodies();
  expect(bodies.filter((b) => b.active && b.authored !== false)).toHaveLength(2);
  const body2 = bodies.find((b) => b.sourceFeatureId === newBodyFeatureId);
  expect(body2, 'newBody feature 应驱动一个 active body').toBeTruthy();
  expect(body2!.bodyKey).toBeTruthy();
  console.log(`[newbody] bodies=${bodies.map((b) => `${b.bodyKey}:${b.active}`).join(',')}`);

  // 页面零件树两行（getBodies active authored）。B6 M-A5 T2 起行尾有逐 body
  // eye 钮——按主行 class 计数（getByRole('button') 会翻倍）。
  const partList = page.getByTestId('part-studio-part-list');
  await expect.poll(async () => partList.locator('.part-studio-tree-row').count(), { timeout: 90_000 }).toBe(2);
  // 画布菜单项名与桥同口径：label=BodyInfo.name ?? bodyKey（selectionName）。
  const body2Name = body2!.name ?? body2!.bodyKey;
  const body2Row = page.getByTestId(`tree-row-${body2!.bodyKey}`);
  const body2Eye = page.getByTestId(`tree-row-visibility-${body2!.bodyKey}`);

  // ── eye hide/show（B6 M-A5 T2 逐 body 可见性）：store.hiddenIds → neverDrawn 并集 ──
  await expect(body2Eye).toHaveAttribute('aria-pressed', 'false');
  await body2Eye.click();
  await expect(body2Row).toHaveAttribute('data-hidden', 'true');
  await expect(body2Eye).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => hiddenElementIds(page), { timeout: 90_000 }).toContain(body2!.bodyKey);
  await body2Eye.click();
  await expect(body2Row).not.toHaveAttribute('data-hidden', 'true');
  await expect(body2Eye).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => hiddenElementIds(page), { timeout: 90_000 }).not.toContain(body2!.bodyKey);
  console.log('[newbody] eye hide/show OK');

  // 画布几何与坐标（选择桥 / 等轴测 / fillet 拾边共用）。
  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas boundingBox 不可得');
  const cx = cb.x + cb.width / 2;
  const cy = cb.y + cb.height / 2;
  const canvasMenu = page.getByRole('menu', { name: '画布菜单' });

  // ── X-03 单一选择权威：store.canvas.selection 是事实源，selectionSet 是投影 ──
  // 右键画布 → part 菜单「删除 {body2}」在列（证明 store part 选择驱动菜单；
  // 不再依赖已删除的 selectionSet→store 反向桥）。
  await page.evaluate(async ({ bodyKey, name }) => {
    (window as any).__lubanE2EApp.usePartStudioStore.getState().setCanvasSelection([
      { kind: 'part', id: bodyKey, label: name },
    ]);
  }, { bodyKey: body2!.bodyKey, name: body2Name });
  await page.waitForTimeout(150);
  await page.mouse.click(cx, cy + 120, { button: 'right' });
  await expect(canvasMenu).toBeVisible();
  await expect(canvasMenu.getByRole('menuitem', { name: `删除 ${body2Name}`, exact: true })).toBeVisible();
  await expect(canvasMenu.getByRole('menuitem', { name: `隐藏 ${body2Name}`, exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const store = (window as any).__lubanE2EApp.usePartStudioStore.getState();
    store.setCanvasSelection([]);
    store.setSelectedNodeIds([]);
    const cf = ((window as any).__lubanE2E?.coreFrontend) as {
      IModelApp: {
        viewManager: {
          getFirstOpenView(): { iModel: { selectionSet: { emptyAll(): void } } } | undefined;
        };
      };
    };
    cf.IModelApp.viewManager.getFirstOpenView()?.iModel.selectionSet.emptyAll();
  });
  await page.keyboard.press('Escape');
  await expect(canvasMenu).toBeHidden();
  console.log(`[newbody] store part selection → 画布 part 菜单 OK（${body2Name}）`);

  // ── Onshape 统一选择（2026-11-03）：无模式直接拾取面/边/点 ──────────────
  // 等轴测 + 适应视图（确保两面/边可见；后续 fillet 接着用同一取景）。
  const projectPoints = async (points: Array<{ x: number; y: number; z: number }>) =>
    page.evaluate(async (worldPoints) => {
      const cf = ((window as any).__lubanE2E?.coreFrontend) as {
        IModelApp: {
          viewManager: {
            getFirstOpenView(): {
              worldToView(p: { x: number; y: number; z: number }): { x: number; y: number };
            } | undefined;
          };
        };
      };
      const vp = cf.IModelApp.viewManager.getFirstOpenView();
      if (!vp) throw new Error('无打开视口');
      return worldPoints.map((p) => vp.worldToView(p));
    }, points);

  await page.mouse.click(cx, cy + 120, { button: 'right' });
  await expect(canvasMenu).toBeVisible();
  await canvasMenu.getByRole('menuitem', { name: '等轴测视图' }).click();
  await expect(canvasMenu).toBeHidden();
  await page.mouse.click(cx, cy + 120, { button: 'right' });
  await expect(canvasMenu).toBeVisible();
  await canvasMenu.getByRole('menuitem', { name: '适应视图' }).click();
  await expect(canvasMenu).toBeHidden();

  type SelectionLike = { kind: string; id: string; ownerBodyKey?: string };
  const currentSelection = (): Promise<SelectionLike[]> => page.evaluate(() =>
    (window as any).__lubanE2EApp.usePartStudioStore.getState().canvas.selection,
  );

  /** 悬停离开再落到目标点（触发 locate），单击后等选择写回 store。 */
  const pickAt = async (p: { x: number; y: number }): Promise<void> => {
    const x = cb.x + p.x;
    const y = cb.y + p.y;
    await page.mouse.move(x - 12, y + 10);
    await page.waitForTimeout(150);
    await page.mouse.move(x, y);
    await page.waitForTimeout(250);
    await page.mouse.click(x, y);
    await page.waitForTimeout(500);
  };

  const activeToolId = (): Promise<string | null> => page.evaluate(() =>
    (window as any).__lubanE2E?.coreFrontend?.IModelApp?.toolAdmin?.activeTool?.toolId ?? null,
  );

  const pickMatching = async (
    points: Array<{ x: number; y: number }>,
    predicate: (entry: SelectionLike) => boolean,
    label: string,
  ): Promise<{ x: number; y: number }> => {
    for (const p of points) {
      await pickAt(p);
      // face/edge 的 resolve 走 WS RPC，首拾可能 >500ms；轮询选择落定再判定。
      try {
        await expect.poll(async () => (await currentSelection()).length, {
          timeout: 4_000,
          intervals: [100, 200, 500],
        }).toBeGreaterThan(0);
      } catch {
        console.log(`[newbody] ${label} miss @(${Math.round(p.x)},${Math.round(p.y)})`);
        continue;
      }
      const selectionNow = await currentSelection();
      console.log(
        `[newbody] ${label} @(${Math.round(p.x)},${Math.round(p.y)}) → ` +
          selectionNow.map((entry) => `${entry.kind}:${entry.ownerBodyKey ?? ''}`).join(','),
      );
      if (selectionNow.some(predicate))
        return p;
    }
    throw new Error(`${label}：${points.length} 个投影点均未命中`);
  };

  const body1 = bodies.find((b) => b.active && b.authored !== false && b.bodyKey !== body2!.bodyKey);
  expect(body1, '应存在第二个 active authored body（body1）').toBeTruthy();

  // 每个 body 取多面中心，规避等轴测遮挡；扫描直到 owner/kind 命中。
  const body1FacePoints = await projectPoints([
    { x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0.5 },
    { x: 1, y: 0, z: 0.5 }, { x: 2, y: 1, z: 0.5 }, { x: 1, y: 2, z: 0.5 },
  ]);
  const body2FacePoints = await projectPoints([
    { x: 5, y: 1, z: 2 }, { x: 5, y: 1, z: 0 }, { x: 4, y: 1, z: 1 },
    { x: 5, y: 0, z: 1 }, { x: 6, y: 1, z: 1 }, { x: 5, y: 2, z: 1 },
  ]);
  const edgePoints = await projectPoints([
    { x: 6, y: 0, z: 1 }, { x: 6, y: 2, z: 1 }, { x: 4, y: 0, z: 1 },
    { x: 5, y: 0, z: 2 }, { x: 5, y: 2, z: 2 }, { x: 4, y: 1, z: 2 },
    { x: 6, y: 1, z: 2 }, { x: 5, y: 0, z: 0 }, { x: 5, y: 2, z: 0 },
  ]);
  const vertexPoints = await projectPoints([
    { x: 6, y: 2, z: 2 }, { x: 4, y: 0, z: 2 }, { x: 4, y: 2, z: 2 },
    { x: 6, y: 0, z: 2 }, { x: 6, y: 2, z: 0 }, { x: 4, y: 0, z: 0 },
  ]);
  console.log(
    `[newbody] canvas=${JSON.stringify(cb)} activeTool=${await activeToolId()} ` +
      `body1=${body1?.bodyKey} body2=${body2!.bodyKey}`,
  );
  console.log(
    `[newbody] proj body1=[${body1FacePoints.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ')}] ` +
      `body2=[${body2FacePoints.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ')}]`,
  );
  // 空白清除：干净起点。
  await pickAt({ x: 30, y: 30 });
  expect(await currentSelection(), '空白点击必须清空选择').toEqual([]);

  // 面拾取 + owner 菜单（直接右键；无模式切换）。
  const body2FacePick = await pickMatching(
    body2FacePoints,
    (entry) => entry.kind === 'face' && entry.ownerBodyKey === body2!.bodyKey,
    'body2 面拾取',
  );
  let selection = await currentSelection();
  expect(selection, '面拾取后应恰一项 face').toHaveLength(1);
  expect(selection[0]!.kind).toBe('face');
  await page.mouse.click(cx, cy + 120, { button: 'right' });
  await expect(canvasMenu).toBeVisible();
  await expect(canvasMenu.getByRole('menuitem', { name: '隐藏所属实体', exact: true })).toBeVisible();
  await expect(canvasMenu.getByRole('menuitem', { name: '选中所属实体', exact: true })).toBeVisible();
  await expect(canvasMenu.getByRole('menuitem', { name: '删除', exact: true })).toBeEnabled();
  await canvasMenu.getByRole('menuitem', { name: '选中所属实体', exact: true }).click();
  await expect(body2Row).toHaveAttribute('aria-current', 'true');
  console.log('[newbody] 面直接拾取 → owner 菜单「选中所属实体」OK');
  await page.evaluate(async () => {
    const store = (window as any).__lubanE2EApp.usePartStudioStore.getState();
    store.setCanvasSelection([]);
    store.setSelectedNodeIds([]);
    const cf = ((window as any).__lubanE2E?.coreFrontend) as {
      IModelApp: {
        viewManager: {
          getFirstOpenView(): { iModel: { selectionSet: { emptyAll(): void } } } | undefined;
        };
      };
    };
    cf.IModelApp.viewManager.getFirstOpenView()?.iModel.selectionSet.emptyAll();
  });
  await expect.poll(async () => (await currentSelection()).length).toBe(0);
  await page.waitForTimeout(150);

  // 隐藏所属实体 → eye 恢复（复用首次命中的投影点）。
  if (!body2FacePick) throw new Error('面拾取成功点未记录');
  await pickMatching(
    [body2FacePick, ...body2FacePoints],
    (entry) => entry.kind === 'face' && entry.ownerBodyKey === body2!.bodyKey,
    'body2 面重拾',
  );
  await page.mouse.click(cx, cy + 120, { button: 'right' });
  await expect(canvasMenu).toBeVisible();
  const hideOwner = canvasMenu.getByRole('menuitem', { name: '隐藏所属实体' });
  await expect(hideOwner).toBeVisible({ timeout: 10_000 });
  await hideOwner.click();
  await expect(body2Eye).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => hiddenElementIds(page), { timeout: 90_000 }).toContain(body2!.bodyKey);
  await body2Eye.click();
  await expect(body2Eye).toHaveAttribute('aria-pressed', 'false');
  console.log('[newbody] hide owner + eye restore done');

  // 跨 body 普通单击 = 替换语义（先 body1 面、后 body2 面）。
  await pickMatching(
    body1FacePoints,
    (entry) => entry.kind === 'face' && entry.ownerBodyKey === body1!.bodyKey,
    'body1 面拾取',
  );
  selection = await currentSelection();
  expect(selection, 'body1 面单击后应恰一项').toHaveLength(1);
  expect(selection[0]!.ownerBodyKey).toBe(body1!.bodyKey);
  await pickMatching(
    body2FacePoints,
    (entry) => entry.kind === 'face' && entry.ownerBodyKey === body2!.bodyKey,
    'body2 面拾取（替换）',
  );
  selection = await currentSelection();
  expect(selection, '普通单击跨 body 必须替换（不累加）').toHaveLength(1);
  expect(selection[0]!.ownerBodyKey).toBe(body2!.bodyKey);
  console.log('[newbody] 跨 body 普通单击替换 OK');

  // Ctrl 多选：body1 面 + Ctrl body2 面 → 两项不同 owner；再 Ctrl body2 面 → 只剩 body1。
  await pickMatching(
    body1FacePoints,
    (entry) => entry.kind === 'face' && entry.ownerBodyKey === body1!.bodyKey,
    'body1 面拾取（Ctrl 基线）',
  );
  await page.keyboard.down('Control');
  const body2CtrlPick = await pickMatching(
    body2FacePoints,
    (entry) => entry.kind === 'face' && entry.ownerBodyKey === body2!.bodyKey,
    'body2 面 Ctrl 多选',
  );
  await page.keyboard.up('Control');
  selection = await currentSelection();
  expect(selection, 'Ctrl 多选应得两项').toHaveLength(2);
  expect(new Set(selection.map((entry) => entry.ownerBodyKey)))
    .toEqual(new Set([body1!.bodyKey, body2!.bodyKey]));
  await page.keyboard.down('Control');
  await pickAt(body2CtrlPick);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await currentSelection()).length).toBe(1);
  selection = await currentSelection();
  expect(selection[0]!.ownerBodyKey, 'Ctrl 再点同一面应取消该项，只剩 body1').toBe(body1!.bodyKey);
  console.log('[newbody] Ctrl 多选 + 再点取消 OK');

  // 边/点：直接悬停/点击（工具按 顶点(10px) > 边(6px) > 面 排序）。
  await pickMatching(edgePoints, (entry) => entry.kind === 'edge', 'body2 边拾取');
  console.log('[newbody] edge pick OK');
  await pickMatching(vertexPoints, (entry) => entry.kind === 'vertex', 'body2 顶点拾取');
  console.log('[newbody] vertex pick OK');

  // 收尾：空白清除（无模式可回退）。
  await pickAt({ x: 30, y: 30 });
  await expect.poll(async () => (await currentSelection()).length).toBe(0);
  console.log('[newbody] Onshape 统一选择 → 面/边/点直接拾取 + owner 菜单 OK');

  // ── 树删除 UI（T2）：特征行右键「删除」→ HITL 确认（dialog 作用域） ──
  const featureMenu = page.getByRole('menu', { name: '特征菜单' });
  const newBodyRow = page.getByTestId(`tree-row-${newBodyFeatureId}`);
  // 单点删除通道：右键特征行 → 「特征菜单」删除 → HITL 在 dialog 作用域确认。
  const deleteFeatureViaTree = async (featureId: string): Promise<void> => {
    const row = page.getByTestId(`tree-row-${featureId}`);
    const name = ((await row.textContent()) ?? '').trim();
    await row.click({ button: 'right' });
    await expect(featureMenu).toBeVisible();
    await featureMenu.getByRole('menuitem', { name: '删除', exact: true }).click();
    // dialog 作用域点「删除」——避免命中菜单同名项（菜单已收合，收窄仍是纪律）。
    const dialog = page.getByRole('dialog', { name: `删除 ${name}` });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '删除', exact: true }).click();
    await expect(dialog).toBeHidden();
  };
  await deleteFeatureViaTree(newBodyFeatureId);

  // 同步走 UI（零件行数/隐藏集），状态断言用单次 RPC 读（限流预算）。
  await expect.poll(async () => partList.locator('.part-studio-tree-row').count(), { timeout: 90_000 }).toBe(1);
  await expect.poll(() => hiddenElementIds(page), { timeout: 90_000 }).toContain(body2!.bodyKey);
  const afterDelete = await getBodies();
  expect(afterDelete.find((b) => b.bodyKey === body2!.bodyKey)?.active, 'UI 删除后 body2 应 consumed').toBe(false);
  console.log('[newbody] 树删除 UI（HITL）→ body2 consumed、树一行、hide 生效');

  // 原生 undo → 两体恢复、树两行、hide 清除、特征行恢复
  const undo = page.getByTestId('part-studio-ribbon-undo');
  const redo = page.getByTestId('part-studio-ribbon-redo');
  await expect(undo).toBeEnabled({ timeout: 90_000 });
  await undo.click();
  await expect.poll(async () => partList.locator('.part-studio-tree-row').count(), { timeout: 90_000 }).toBe(2);
  await expect.poll(() => hiddenElementIds(page), { timeout: 90_000 }).not.toContain(body2!.bodyKey);
  await expect(newBodyRow).toBeVisible({ timeout: 90_000 });
  const restored = await getBodies();
  expect(restored.find((b) => b.bodyKey === body2!.bodyKey)?.active, 'undo 后 body2 应恢复 active').toBe(true);
  const tree = await getTree();
  expect(tree.find((r) => r.id === newBodyFeatureId)?.status, 'undo 后 newBody 特征应恢复 status=0').toBe(0);

  // #45 修复：MS 读刷新（getFeatureTree/getBodies → ensureInitialized）在 redo
  // 栈存在时不再触发 rebuildAll 冷重建 commit——首个 delete→undo 后 redo 必须可达。
  await expect(redo).toBeEnabled({ timeout: 90_000 });
  await redo.click();
  await expect.poll(async () => partList.locator('.part-studio-tree-row').count(), { timeout: 90_000 }).toBe(1);
  await expect.poll(() => hiddenElementIds(page), { timeout: 90_000 }).toContain(body2!.bodyKey);
  const afterRedo = await getBodies();
  expect(afterRedo.find((b) => b.bodyKey === body2!.bodyKey)?.active, 'redo 后 body2 应再次 consumed').toBe(false);
  console.log('[newbody] 树删除 undo → redo → 再消费（#45 修复后首个 redo 可达）');

  // 回退到两体基线（后续 fillet 需要 body2 active/入树）。
  await expect(undo).toBeEnabled({ timeout: 90_000 });
  await undo.click();
  await expect.poll(async () => partList.locator('.part-studio-tree-row').count(), { timeout: 90_000 }).toBe(2);
  await expect.poll(() => hiddenElementIds(page), { timeout: 90_000 }).not.toContain(body2!.bodyKey);
  await expect(newBodyRow).toBeVisible({ timeout: 90_000 });
  console.log('[newbody] 第二 undo 恢复两体基线');

  // ── 非默认体 fillet 真栈：拾 body2 边 → target 自动 owner；body2.sourceFeatureId=fillet ──
  // undo/redo 后重新等轴测 + 适应视图（树/体恢复但相机可能停在旧取景；不
  // 重新 fit 会让后续投影点落在空画布上，实测量测 0 命中）。
  await page.mouse.click(cx, cy + 120, { button: 'right' });
  await expect(canvasMenu).toBeVisible();
  await canvasMenu.getByRole('menuitem', { name: '等轴测视图' }).click();
  await expect(canvasMenu).toBeHidden();
  await page.mouse.click(cx, cy + 120, { button: 'right' });
  await expect(canvasMenu).toBeVisible();
  await canvasMenu.getByRole('menuitem', { name: '适应视图' }).click();
  await expect(canvasMenu).toBeHidden();

  // 世界点（body2 盒 [4,6]×[0,2]×[0,2] 的竖边/顶边中点）投影后 boresite 点击。
  const projected = await projectPoints([
    { x: 6, y: 0, z: 1 }, { x: 6, y: 2, z: 1 }, { x: 4, y: 0, z: 1 }, { x: 4, y: 2, z: 1 },
    { x: 5, y: 0, z: 2 }, { x: 5, y: 2, z: 2 }, { x: 4, y: 1, z: 2 }, { x: 6, y: 1, z: 2 },
  ]);

  await page.getByRole('button', { name: '圆角', exact: true }).click();
  const fdialog = page.getByTestId('part-studio-feature-dialog');
  await expect(fdialog).toBeVisible();
  await fdialog.getByLabel('半径').fill('0.2');
  const addEdge = fdialog.getByTestId('part-studio-feature-dialog-add-edge');
  await addEdge.click();
  const chipCount = async (): Promise<number> =>
    fdialog.getByTestId('part-studio-feature-dialog-edge-chips').locator('li').count().catch(() => 0);
  let picked = 0;
  for (const p of projected) {
    if (picked > 0) break;
    const px = cb.x + p.x;
    const py = cb.y + p.y;
    await page.mouse.move(px - 15, py + 12);
    await page.waitForTimeout(120);
    await page.mouse.move(px, py);
    await page.waitForTimeout(350);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(500);
    picked = await chipCount();
  }
  expect(picked, '应在 body2 上拾到至少一条边').toBeGreaterThan(0);
  await addEdge.click(); // 结束拾取
  await expect(fdialog.getByRole('button', { name: '确认' })).toBeEnabled({ timeout: 15_000 });
  await fdialog.getByRole('button', { name: '确认' }).click();
  await expect(
    page.getByTestId('part-studio-feature-list').getByRole('button', { name: '圆角 1' })
      .or(fdialog.getByTestId('part-studio-feature-dialog-error')),
  ).toBeVisible({ timeout: 90_000 });
  if ((await fdialog.getByTestId('part-studio-feature-dialog-error').count()) > 0)
    throw new Error(`fillet 被拒收：${await fdialog.getByTestId('part-studio-feature-dialog-error').textContent()}`);

  const afterFilletTree = await getTree();
  const filletRow = afterFilletTree.find((r) => r.featureType === 'fillet');
  expect(filletRow, 'fillet 应入树').toBeTruthy();
  expect(filletRow!.status, 'fillet status 应为 0').toBe(0);
  const afterFilletBodies = await getBodies();
  const byFeature = afterFilletBodies.find((b) => b.sourceFeatureId === filletRow!.id);
  expect(byFeature, 'fillet 应驱动一个 body').toBeTruthy();
  expect(byFeature!.bodyKey, 'fillet 目标应为拾边的 body2（非默认 body1）').toBe(body2!.bodyKey);

  // ── fillet 抑制/取消抑制（T2 树菜单 → applyOp setFeatureSuppressed）──
  // 行 data-suppressed 由服务端 getFeatureTree 刷新驱动（非乐观改树）：属性在
  // 即证明 op 落库；同时排除失败 toast（失败路径不发刷新）。
  const filletRowLocator = page.getByTestId(`tree-row-${filletRow!.id}`);
  await expect(filletRowLocator).toBeVisible({ timeout: 90_000 });
  await filletRowLocator.click({ button: 'right' });
  await expect(featureMenu).toBeVisible();
  await featureMenu.getByRole('menuitem', { name: '抑制', exact: true }).click();
  await expect(filletRowLocator).toHaveAttribute('data-suppressed', 'true', { timeout: 90_000 });
  await expect(page.getByText('抑制操作失败')).toHaveCount(0);
  console.log('[newbody] fillet 抑制 OK');

  await filletRowLocator.click({ button: 'right' });
  await expect(featureMenu).toBeVisible();
  await featureMenu.getByRole('menuitem', { name: '取消抑制', exact: true }).click();
  await expect(filletRowLocator).not.toHaveAttribute('data-suppressed', 'true', { timeout: 90_000 });
  await expect(page.getByText('抑制操作失败')).toHaveCount(0);
  console.log('[newbody] fillet 取消抑制 OK');

  // ── M-A5.2 面删除真栈：body1 顶/底面 → HITL → deleteSubEntities + saveChanges ──
  // body1 是干净盒体（body2 已被 fillet 改造），面删除验证 cacheId → editor
  // SolidModelingCommand 的直通链；成功路径由 UI 清空选择，失败保持选择可重拾。
  const body1DeleteFacePoints = await projectPoints([
    { x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0.5 },
    { x: 1, y: 0, z: 0.5 }, { x: 2, y: 1, z: 0.5 }, { x: 1, y: 2, z: 0.5 },
  ]);
  await pickMatching(
    body1DeleteFacePoints,
    (entry) => entry.kind === 'face' && entry.ownerBodyKey === body1!.bodyKey,
    'body1 面删除拾取',
  );
  await page.mouse.click(cx, cy + 120, { button: 'right' });
  await expect(canvasMenu).toBeVisible();
  await expect(canvasMenu.getByRole('menuitem', { name: '删除', exact: true })).toBeEnabled();
  await canvasMenu.getByRole('menuitem', { name: '删除', exact: true }).click();
  const deleteFaceDialog = page.getByRole('dialog', { name: '删除 面' });
  await expect(deleteFaceDialog).toBeVisible();
  await deleteFaceDialog.getByRole('button', { name: '删除', exact: true }).click();
  // 内核边界（私有原生仓 reference）：
  // 普通盒体单面删除是既定负路径（api_remove_faces 邻面补不拢，Err 115006）；
  // SUCCESS 需要共面分裂种子。此处验证诚实负路径：错误 toast + 保持面选择。
  const deleteFailure = page.getByText(/删除失败/);
  await expect(deleteFailure).toBeVisible({ timeout: 90_000 });
  expect(await deleteFailure.first().textContent()).toContain('内核拒收');
  expect(
    (await currentSelection()).some(
      (entry) => entry.kind === 'face' && entry.ownerBodyKey === body1!.bodyKey,
    ),
    '删除失败后应保持面选择（可重拾）',
  ).toBe(true);
  await pickAt({ x: 30, y: 30 });
  await expect.poll(async () => (await currentSelection()).length).toBe(0);
  console.log('[newbody] M-A5.2 面删除负路径（盒体）→ 内核拒收 + 错误 toast OK');

  expect(consoleErrors, `console error 应为空：\n${consoleErrors.join('\n')}`).toHaveLength(0);
});
