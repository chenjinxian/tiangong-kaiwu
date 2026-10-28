/**
 * 发布窗真栈：NEW-body 生命周期 + 零件树/getBodies/consumed 隐藏 + 原生 undo。
 *
 * 场景（自建独立 iModel，避开共享 Seed）：
 *   草图 A → extrude body1 → 草图 B → extrude(newBody) body2
 *   → getBodies 两个 active authored body；页面树两行
 *   → 删除 body2 的 newBody feature（RPC，targetBodyId）→ body2 consumed、树一行、几何 hide
 *   → 原生 undo → body2 active、树两行、hide 清除。
 *
 * 该用例同时覆盖首开并发（全新 iModel 首次打开）与 1.15 getBodies RPC；
 * 非默认体 fillet 的 UI 路由由 FeatureDialog/private T9c 单测覆盖（真栈边拾取另批）。
 */

import { expect, test, type APIRequestContext } from '@playwright/test';
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
    data: { displayName: `两体发布窗-${stamp}`, class: 'Project' },
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

test('真栈：extrude newBody 两体 → getBodies/树 → consumed 隐藏 → undo', async ({ page, request }) => {
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

  // 页面零件树两行（getBodies active authored）
  const partList = page.getByTestId('part-studio-part-list');
  await expect.poll(async () => partList.getByRole('button').count(), { timeout: 90_000 }).toBe(2);

  // 删除 newBody feature（targetBodyId 指向 body2）→ consumed、树一行、几何 hidden
  const del = await msRpc(
    itwinId, imodelId, 'applyFeatureOp',
    [dbKey, { kind: 'deleteFeature', featureId: newBodyFeatureId, targetBodyId: body2!.bodyKey }, leaseSessionId],
    accessToken,
  );
  expect((del as { ok: boolean; error?: string }).ok, `delete newBody: ${(del as { error?: string }).error ?? ''}`).toBe(true);
  await expect.poll(async () => (await getBodies()).filter((b) => b.active).length, { timeout: 90_000 }).toBe(1);
  await expect.poll(async () => partList.getByRole('button').count(), { timeout: 90_000 }).toBe(1);

  const hidden = await page.evaluate(async () => {
    const cf = (await import('/@id/@itwin/core-frontend')) as {
      IModelApp: { viewManager: { getFirstOpenView(): unknown } };
      EmphasizeElements: { get(vp: unknown): { getHiddenElements(vp: unknown): Iterable<string> | undefined } | undefined };
    };
    const vp = cf.IModelApp.viewManager.getFirstOpenView();
    const ee = cf.EmphasizeElements.get(vp);
    const set = ee?.getHiddenElements(vp);
    return set ? Array.from(set) : [];
  });
  expect(hidden.map(String), 'consumed body2 应进入 neverDrawn').toContain(body2!.bodyKey);
  console.log(`[newbody] hidden=${hidden.join(',')}`);

  // 原生 undo → active 恢复、树两行、hide 清除
  const undo = page.getByTestId('part-studio-undo-button');
  await expect(undo).toBeEnabled({ timeout: 90_000 });
  await undo.click();
  await expect.poll(async () => (await getBodies()).filter((b) => b.active).length, { timeout: 90_000 }).toBe(2);
  await expect.poll(async () => partList.getByRole('button').count(), { timeout: 90_000 }).toBe(2);
  const hiddenAfterUndo = await page.evaluate(async () => {
    const cf = (await import('/@id/@itwin/core-frontend')) as {
      IModelApp: { viewManager: { getFirstOpenView(): unknown } };
      EmphasizeElements: { get(vp: unknown): { getHiddenElements(vp: unknown): Iterable<string> | undefined } | undefined };
    };
    const vp = cf.IModelApp.viewManager.getFirstOpenView();
    const ee = cf.EmphasizeElements.get(vp);
    const set = ee?.getHiddenElements(vp);
    return set ? Array.from(set) : [];
  });
  expect(hiddenAfterUndo.map(String), 'undo 后 body2 不应仍 hidden').not.toContain(body2!.bodyKey);

  // 树中 newBody 特征 status=0（删除前已落库；undo 后恢复）
  const tree = await getTree();
  expect(tree.find((r) => r.id === newBodyFeatureId)?.status).toBe(0);

  // ── 非默认体 fillet 真栈：拾 body2 边 → target 自动 owner；body2.sourceFeatureId=fillet ──
  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  const cb = await canvas.boundingBox();
  if (!cb) throw new Error('canvas boundingBox 不可得');
  const cx = cb.x + cb.width / 2;
  const cy = cb.y + cb.height / 2;

  // 等轴测 + 适应视图（两条盒体都入框）
  await page.mouse.click(cx, cy + 120, { button: 'right' });
  const menu = page.getByRole('menu', { name: '画布菜单' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: '等轴测视图' }).click();
  await expect(menu).toBeHidden();
  await page.mouse.click(cx, cy + 120, { button: 'right' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: '适应视图' }).click();
  await expect(menu).toBeHidden();

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

  expect(consoleErrors, `console error 应为空：\n${consoleErrors.join('\n')}`).toHaveLength(0);
});
