/**
 * B-model P2.0 发布门 9：生产 BriefcaseDb/IPC + init-floor undo E2E。
 *
 * 需要真实栈：hub（iTwin/iModel/baseline）+ 宿主 modeling-server :5401 +
 * Vite :5300。`StandaloneDb` raw native 探针不等价于生产 Briefcase IPC undo 栈。
 *
 * 场景（P2.4 前没有双 scope 页签 UI，按计划用 RPC 构造第二个 scope，并明确标注）：
 *   1) 浏览器经 UI 打开 `?model=ps-1`——生产 PartStudioPage 把 WorkspaceRef.modelId
 *      透传给 getFeatureTree/applyFeatureOp，UI 首读初始化 ps-1；
 *   2) RPC `getFeatureTree(..., 'ps-2')` 初始化 ps-2——这是更晚的 studio init；
 *   3) 在 ps-1 做特征 A（位于 init ps-2 之下），断言 Undo 被 init floor 禁用；
 *   4) ps-1 做 B、ps-2 做 C（均在 floor 之上），活动页签仍是 ps-1；
 *   5) 点 UI Undo：文档级栈先撤 ps-2 的 C（若按页签撤销则会先撤 ps-1 的 B）；
 *      再点 Undo 撤 ps-1 的 B；此时最新待撤销事务=init ps-2，Undo 再次禁用，
 *      A 位于 floor 之下不可达；
 *   6) Redo 依次恢复 B、C；最后撤 C 后做新特征 D，断言 redo 栈被新编辑清空。
 *
 * 该用例只断言当前已裁决的语义：原生 undo 是文档级、最新 studio init 之上可撤，
 * 不承诺页签级 undo（ADR-0001 决策 A / §8.6 gate 9）。
 *
 * B 项目标记（`data.luban.modelMode='B'`）是 P2.1 的工作；本门在 P2.0 用
 * `?model=` 强制 scoped 读，不依赖该标记。
 */

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { LubanFeatureRpcInterface } from '@luban-cad/shared';
import {
  authHeaders,
  collectConsoleErrors,
  getApiToken,
  loginWithSession,
  waitEditorReady,
} from './helpers';

const RPC_VERSION = LubanFeatureRpcInterface.interfaceVersion;
const BS = String.fromCharCode(92);

let scratchProjectId = '';

test.afterAll(async ({ request }) => {
  if (!scratchProjectId) return;
  try {
    const token = await getApiToken();
    await request.delete(`/itwins/${scratchProjectId}`, { headers: authHeaders(token) });
  } catch (error) {
    console.warn(`[b-undo] 清理独立项目失败（${scratchProjectId}）：`, error);
  }
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
  status: number;
}

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

interface RpcMeta {
  csrfHeader: string;
  csrf: string;
}
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
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MS RPC ${operation} HTTP ${res.status}: ${text.slice(0, 240)}`);
  const parsed = JSON.parse(text) as unknown;
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    'result' in parsed &&
    !('ok' in (parsed as Record<string, unknown>))
  ) {
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
    data: { displayName: `B模型undo门-${stamp}`, subClass: 'Project' },
  });
  expect(project.status(), `项目创建失败：HTTP ${project.status()}`).toBe(201);
  const itwinId = ((await project.json()) as { iTwin: { id: string } }).iTwin.id;
  scratchProjectId = itwinId;

  const created = await request.post('/imodels', {
    headers: authHeaders(accessToken),
    data: { iTwinId: itwinId, name: `B-Undo-${stamp}` },
  });
  expect(created.status(), `iModel 创建失败：HTTP ${created.status()}`).toBe(201);
  const imodelId = ((await created.json()) as { iModel: { id: string } }).iModel.id;

  let state = 'unknown';
  for (let i = 0; i < 110; i++) {
    const detail = await request.get(`/imodels/${imodelId}`, { headers: authHeaders(accessToken) });
    state = ((await detail.json()) as { iModel?: { state?: string } }).iModel?.state ?? 'unknown';
    if (state === 'initialized') break;
    if (state === 'failed' || state === 'missingFiles') throw new Error(`baseline 终态 ${state}`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  expect(state, `iModel 未 initialized（最后 ${state}）`).toBe('initialized');
  // baseline 传播窗（同 boolean-bodies/newbody）。
  await new Promise((resolve) => setTimeout(resolve, 15_000));
  return { itwinId, imodelId };
}

test('生产 IPC：双 scope 文档级 undo、init floor 与 redo 清空', async ({ page, request }) => {
  test.setTimeout(1_200_000);
  const consoleErrors = collectConsoleErrors(page);
  const accessToken = await getApiToken();
  const { itwinId, imodelId } = await createScratchImodel(request, accessToken);

  // UI 入口：生产路由 ?model= 把 Part Studio scope 透传到特征 RPC。
  await loginWithSession(page);
  await page.goto(`/documents/${itwinId}/${imodelId}?model=ps-1`);
  await waitEditorReady(page);

  const dbKey = `briefcase-cache${BS}imodels${BS}${imodelId}${BS}briefcases${BS}2.bim`;
  const probeId = `b-undo-probe-${Math.random().toString(36).slice(2)}`;
  const probe = (await msRpc(itwinId, imodelId, 'acquireWriteLease', [dbKey, probeId], accessToken)) as {
    ok: boolean;
    holder?: string;
  };
  const leaseSessionId = probe.ok ? probeId : (probe.holder ?? probeId);
  if (probe.ok) await msRpc(itwinId, imodelId, 'acquireWriteLease', [dbKey, leaseSessionId], accessToken);

  const scopeTree = async (scope: string): Promise<FeatureTreeRow[]> =>
    (await msRpc(itwinId, imodelId, 'getFeatureTree', [dbKey, scope], accessToken)) as FeatureTreeRow[];

  const applySketch = async (scope: string, label: string): Promise<string> => {
    const sketch = rectangleSketch(0, 0, 2, 2);
    const raw = await msRpc(
      itwinId,
      imodelId,
      'applyFeatureOp',
      [dbKey, { kind: 'insertSketch', entities: sketch.entities, constraints: sketch.constraints, plane: xyPlane(0) }, leaseSessionId, scope],
      accessToken,
    );
    const r = raw as { ok: boolean; featureId?: string; error?: string };
    expect(r.ok, `${label} 被拒收：${r.error ?? JSON.stringify(raw).slice(0, 300)}`).toBe(true);
    expect(r.featureId, `${label} 无 featureId`).toBeTruthy();
    console.log(`[b-undo] ${label} OK scope=${scope} ${r.featureId!.slice(0, 8)}…`);
    return r.featureId!;
  };

  const undo = page.getByTestId('part-studio-undo-button');
  const redo = page.getByTestId('part-studio-redo-button');
  const ids = (rows: FeatureTreeRow[]): string[] => rows.map((row) => row.id);

  // 1) UI 首读已初始化 ps-1（空图）；干净态 undo 禁用。
  expect(ids(await scopeTree('ps-1'))).toEqual([]);
  await expect(undo).toBeDisabled();

  // 2) floor 之下的 A：先做 A，再初始化更晚的 ps-2。最新待撤销事务=init ps-2，
  //    Undo 必须被 init 守卫禁用（不能撤销初始化事务，也不能越过它撤 A）。
  const aId = await applySketch('ps-1', 'A(below floor)');
  await expect(undo).toBeEnabled({ timeout: 60_000 });
  expect(ids(await scopeTree('ps-2'))).toEqual([]); // 本次 RPC 创建 ps-2 init
  await expect(undo).toBeDisabled({ timeout: 30_000 });
  expect(ids(await scopeTree('ps-1')), 'A 在 floor 之下且仍在册').toContain(aId);

  // 3) floor 之上的 B（ps-1）与 C（ps-2）。
  const bId = await applySketch('ps-1', 'B(above floor)');
  await expect(undo).toBeEnabled({ timeout: 60_000 });
  const cId = await applySketch('ps-2', 'C(above floor)');
  await expect(undo).toBeEnabled({ timeout: 60_000 });

  // 4) 活动页签=ps-1，但原生 undo 是文档级：第一次撤销最新事务 C（ps-2），
  //    不是按页签撤 B（若页签级则会先撤 B——此断言即为决策 A 的证据）。
  await undo.click();
  await expect.poll(async () => ids(await scopeTree('ps-2')).length, {
    timeout: 60_000,
    intervals: [1000],
  }).toBe(0);
  const afterUndoC = ids(await scopeTree('ps-1'));
  expect(afterUndoC).toContain(aId);
  expect(afterUndoC).toContain(bId);
  expect(afterUndoC).not.toContain(cId);

  // 5) 第二次撤销 B；此时最新待撤销事务=init ps-2 → Undo 再次禁用，A 不可达。
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect.poll(async () => ids(await scopeTree('ps-1')).length, {
    timeout: 60_000,
    intervals: [1000],
  }).toBe(1);
  expect(ids(await scopeTree('ps-1'))).toEqual([aId]);
  await expect(undo).toBeDisabled({ timeout: 30_000 });

  // 6) Redo 依次恢复 B、C；随后撤 C 并做新编辑 D，redo 栈必须被新事务清空。
  await expect(redo).toBeEnabled({ timeout: 30_000 });
  await redo.click();
  await expect.poll(async () => ids(await scopeTree('ps-1')).length, {
    timeout: 60_000,
    intervals: [1000],
  }).toBe(2);
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect.poll(async () => ids(await scopeTree('ps-2')).length, {
    timeout: 60_000,
    intervals: [1000],
  }).toBe(1);

  await expect(undo).toBeEnabled();
  await undo.click();
  await expect.poll(async () => ids(await scopeTree('ps-2')).length, {
    timeout: 60_000,
    intervals: [1000],
  }).toBe(0);
  const dId = await applySketch('ps-1', 'D(after undo)');
  await expect(redo).toBeDisabled({ timeout: 30_000 });
  expect(ids(await scopeTree('ps-1'))).toContain(dId);
  console.log('[b-undo] init floor + 文档级 undo/redo + redo 清空 OK');

  expect(consoleErrors, `编辑器 console 错误：\n${consoleErrors.join('\n')}`).toEqual([]);
});
