/**
 * 发布窗真栈：NEW-body 生命周期 + 零件树/getBodies/consumed 隐藏 + 原生 undo。
 *
 * 场景（自建独立 iModel，避开共享 Seed）：
 *   草图 A → extrude body1 → 草图 B → extrude(newBody) body2
 *   → getBodies 两个 active authored body；页面树两行
 *   → 逐 body eye：隐藏 body2（data-hidden + EmphasizeElements neverDrawn）→ 显示
 *   → 程序化 SelectionSet 桥：replace([body2Key]) → 画布菜单出 part 删除项 →
 *     emptyAll + 收合
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

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  authHeaders,
  collectConsoleErrors,
  getApiToken,
  loginWithSession,
  waitEditorReady,
} from './helpers';

const RPC_VERSION = '1.16.0';
const BS = String.fromCharCode(92);
let scratchProjectId = '';

test.afterAll(async ({ request }) => {
  if (!scratchProjectId) return;
  try {
    const token = await getApiToken();
    await request.delete(`/itwins/${scratchProjectId}`, { headers: authHeaders(token) });
  } catch (error) {
    console.warn(`[newbody] 清理独立项目失败（${scratchProjectId}）：`, error);
  }
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

interface RpcMeta { csrfHeader: string; csrf: string }
let rpcMeta: RpcMeta | undefined;

async function getRpcMeta(): Promise<RpcMeta> {
  if (rpcMeta) return rpcMeta;
  const res = await fetch('http://localhost:5401/rpc/metadata');
  const setCookie = res.headers.get('set-cookie') ?? '';
  const csrf = /csrf-token=([^;]+)/.exec(setCookie)?.[1] ?? '';
  rpcMeta = { csrfHeader: res.headers.get('x-csrf-token') ?? csrf, csrf };
  return rpcMeta;
}

async function msRpc(
  itwinId: string,
  imodelId: string,
  operation: string,
  args: unknown[],
  accessToken: string,
): Promise<unknown> {
  const { csrfHeader, csrf } = await getRpcMeta();
  const stamp = Date.now().toString(16).padStart(12, '0');
  const url =
    `http://localhost:5401/LubanCAD/v1.0/mode/primary/context/${itwinId}/imodel/${imodelId}` +
    `/changeset/0/LubanFeatureRpcInterface-${RPC_VERSION}-${operation}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      Authorization: `Bearer ${accessToken}`,
      'X-CSRF-Token': csrfHeader,
      Cookie: `csrf-token=${csrf}`,
      'X-Correlation-Id': `7e19b6a0-0000-4000-8000-${stamp}`,
      'X-Application-Id': 'LubanCAD',
      'X-Application-Version': 'v1.0',
      'X-Session-Id': `7e19b6a0-0000-4000-8000-${stamp}`,
    },
    body: JSON.stringify([...args, operation]),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MS RPC ${operation} HTTP ${res.status}: ${text.slice(0, 240)}`);
  const parsed = JSON.parse(text) as unknown;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'result' in parsed
    && !('ok' in (parsed as Record<string, unknown>))) {
    return (parsed as { result: unknown }).result;
  }
  return parsed;
}

async function createScratchImodel(
  request: APIRequestContext,
  accessToken: string,
): Promise<{ itwinId: string; imodelId: string }> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const project = await request.post('/itwins', {
    headers: authHeaders(accessToken),
    data: { displayName: `两体发布窗-${stamp}`, class: 'Endeavor', subClass: 'Project' },
  });
  expect(project.status(), `项目创建失败：HTTP ${project.status()}`).toBe(201);
  const itwinId = ((await project.json()) as { iTwin: { id: string } }).iTwin.id;
  scratchProjectId = itwinId;

  const created = await request.post('/imodels', {
    headers: authHeaders(accessToken),
    data: { iTwinId: itwinId, name: `NewBody-${stamp}` },
  });
  expect(created.status(), `iModel 创建失败：HTTP ${created.status()}`).toBe(201);
  const imodelId = ((await created.json()) as { iModel: { id: string } }).iModel.id;

  let state = 'unknown';
  for (let i = 0; i < 110; i++) {
    const detail = await request.get(`/imodels/${imodelId}`, { headers: authHeaders(accessToken) });
    state = ((await detail.json()) as { iModel?: { state?: string } }).iModel?.state ?? 'unknown';
    if (state === 'initialized') break;
    if (state === 'failed' || state === 'missingFiles')
      throw new Error(`baseline 终态 ${state}`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  expect(state, `iModel 未 initialized（最后 ${state}）`).toBe('initialized');
  // baseline 传播窗（同 feature-contracts）。
  await new Promise((resolve) => setTimeout(resolve, 15_000));
  return { itwinId, imodelId };
}

/** 视口 neverDrawn 当前集（consumed ∪ 手动隐藏；undefined→[]）。纯前端读，不耗 RPC。 */
async function hiddenElementIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const cf = (await import('/@id/@itwin/core-frontend')) as {
      IModelApp: { viewManager: { getFirstOpenView(): unknown } };
      EmphasizeElements: { get(vp: unknown): { getHiddenElements(vp: unknown): Iterable<string> | undefined } | undefined };
    };
    const vp = cf.IModelApp.viewManager.getFirstOpenView();
    const ee = cf.EmphasizeElements.get(vp);
    const set = ee?.getHiddenElements(vp);
    return set ? Array.from(set).map(String) : [];
  });
}

test('真栈：extrude newBody 两体 → eye/选择桥 → 树删除 undo/redo → fillet 抑制', async ({ page, request }) => {
  test.setTimeout(900_000);
  const consoleErrors = collectConsoleErrors(page);
  const accessToken = await getApiToken();
  const { itwinId, imodelId } = await createScratchImodel(request, accessToken);

  await loginWithSession(page);
  await page.goto(`/documents/${itwinId}/${imodelId}`);
  await waitEditorReady(page);

  const dbKey = `briefcase-cache${BS}imodels${BS}${imodelId}${BS}briefcases${BS}2.bim`;
  const probeId = `newbody-probe-${Math.random().toString(36).slice(2)}`;
  const probe = (await msRpc(itwinId, imodelId, 'acquireWriteLease', [dbKey, probeId], accessToken)) as {
    ok: boolean;
    holder?: string;
  };
  const leaseSessionId = probe.ok ? probeId : (probe.holder ?? probeId);
  if (probe.ok)
    await msRpc(itwinId, imodelId, 'acquireWriteLease', [dbKey, leaseSessionId], accessToken);
  console.log(`[newbody] lease borrowed=${!probe.ok}`);

  const apply = async (op: Record<string, unknown>, label: string): Promise<string> => {
    const raw = await msRpc(itwinId, imodelId, 'applyFeatureOp', [dbKey, op, leaseSessionId], accessToken);
    const r = raw as { ok: boolean; featureId?: string; error?: string };
    expect(r.ok, `${label} 被拒收：${r.error ?? JSON.stringify(raw).slice(0, 300)}`).toBe(true);
    expect(r.featureId, `${label} 无 featureId`).toBeTruthy();
    console.log(`[newbody] ${label} OK ${r.featureId!.slice(0, 8)}…`);
    return r.featureId!;
  };
  const insertSketch = async (s: Sketch2d, plane: PlaneDto, label: string): Promise<string> =>
    apply({ kind: 'insertSketch', entities: s.entities, constraints: s.constraints, plane }, label);
  const getBodies = async (): Promise<BodyInfo[]> =>
    (await msRpc(itwinId, imodelId, 'getBodies', [dbKey], accessToken)) as BodyInfo[];
  const getTree = async (): Promise<FeatureTreeRow[]> =>
    (await msRpc(itwinId, imodelId, 'getFeatureTree', [dbKey], accessToken)) as FeatureTreeRow[];

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

  // ── 程序化 selection bridge（T1）：selectionSet.replace → store part 选择 ──
  // 右键画布 → part 菜单「删除 {body2}」在列（证明桥已写入 store；不新增 RPC）。
  await page.evaluate(async (bodyKey) => {
    const cf = (await import('/@id/@itwin/core-frontend')) as {
      IModelApp: {
        viewManager: {
          getFirstOpenView(): {
            iModel: { selectionSet: { replace(ids: string[]): void; emptyAll(): void } };
          } | undefined;
        };
      };
    };
    const vp = cf.IModelApp.viewManager.getFirstOpenView();
    if (!vp) throw new Error('无打开视口');
    vp.iModel.selectionSet.replace([bodyKey]);
  }, body2!.bodyKey);
  // 桥 onChanged 同步写 store；留一帧 React 提交（菜单读 store 快照）。
  await page.waitForTimeout(150);
  await page.mouse.click(cx, cy + 120, { button: 'right' });
  await expect(canvasMenu).toBeVisible();
  await expect(canvasMenu.getByRole('menuitem', { name: `删除 ${body2Name}`, exact: true })).toBeVisible();
  await expect(canvasMenu.getByRole('menuitem', { name: `隐藏 ${body2Name}`, exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const cf = (await import('/@id/@itwin/core-frontend')) as {
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
  console.log(`[newbody] selection bridge → 画布 part 菜单 OK（${body2Name}）`);

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
  const undo = page.getByTestId('part-studio-undo-button');
  const redo = page.getByTestId('part-studio-redo-button');
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
  // 等轴测 + 适应视图（两条盒体都入框；选择已在上段清空 → 空白态菜单）。
  await page.mouse.click(cx, cy + 120, { button: 'right' });
  await expect(canvasMenu).toBeVisible();
  await canvasMenu.getByRole('menuitem', { name: '等轴测视图' }).click();
  await expect(canvasMenu).toBeHidden();
  await page.mouse.click(cx, cy + 120, { button: 'right' });
  await expect(canvasMenu).toBeVisible();
  await canvasMenu.getByRole('menuitem', { name: '适应视图' }).click();
  await expect(canvasMenu).toBeHidden();

  // 世界点（body2 盒 [4,6]×[0,2]×[0,2] 的竖边/顶边中点）投影后 boresite 点击
  const projected = await page.evaluate(async (points) => {
    const cf = (await import('/@id/@itwin/core-frontend')) as {
      IModelApp: { viewManager: { getFirstOpenView(): { worldToView(p: { x: number; y: number; z: number }): { x: number; y: number } } | undefined } };
    };
    const vp = cf.IModelApp.viewManager.getFirstOpenView();
    if (!vp) throw new Error('无打开视口');
    return points.map((p) => vp.worldToView(p));
  }, [
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

  expect(consoleErrors, `console error 应为空：\n${consoleErrors.join('\n')}`).toHaveLength(0);
});
