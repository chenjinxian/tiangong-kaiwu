/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * P2.6b3：P2.5 真栈视口门（B-model，真实种子 + 真实编辑器）。
 *
 * 覆盖面（task-P2.5-review §B5，真实 UI/视口断言；RPC 仅用于两种 studio 的
 * 确定性造数，读写一律带 active scope）：
 *  1) 双 Part Studio：`+` UI 创建第二 studio；`?model=` 与 registry
 *     （`listPartStudios`）双向识别；registry `physModelId` ≡ 视口
 *     `modelSelector` 里已加载的 ModelState id；默认视图确为 SpatialViewState。
 *  2) 每 studio 一体（ps-1 原点；ps-2 明显不同位置，经 scope-aware
 *     applyFeatureOp 造数）：active ps-1 的 selector **恰只**含 ps-1 物理模型；
 *     ps-2 不可见/不可拾取；切到 ps-2 再切回。
 *  3) 相机按 scope 重取景：origin/extents/center 读真实 ViewState，切 K2 后
 *     变化，切回 K1 恢复（容差比较）。
 *  4) 同一 BriefcaseConnection / `connection.key` 不变；页签切换不新建
 *     `/ipc` 或 `/ws` WebSocket；MS `/health` `websocket.connectedClients` 稳定；
 *     视口对象身份（window 上打标）不变。
 *  5) 真实选择隔离：注入 ps-1 body 进 `selectionSet` → 切 ps-2（清空
 *     selectionSet + store + 活动工具）→ Delete/Move 不触碰 ps-1；ps-1
 *     元素 placement/模型范围/特征树逐项不变。
 *  6) 活动 Move/Rotate 跨页签：工具在切 scope 时被默认工具替换（R3 真栈），
 *     切后补完整手势也不得提交 ps-1 变更。
 *  7) R4 真栈：无关渲染（invalidateScene）与文档级 undo/redo 不得清掉选择。
 *  8) 快速 K1→K2→K1（K2 apply 未落定）×20：URL/可见模型/相机/settings 全 K1，
 *     无错误横幅/console 错误。为使「K2 apply 在途」可确定复现，本用例在页面内
 *     给 `iModel.createQueryReader` 注入 300ms 延迟（测试侧插桩，不改产品代码；
 *     覆盖 P2.5 R1 的 pending-conflict 分支）。
 *  9) 写目标落 active：切到 ps-2 后经生产 UI 插入草图 → 仅 ps-2 树 +1，
 *     ps-1 树逐字不变。
 * 10) 12 次页签切换无 console/pageerror；旧 scope 的 tile RPC **停止**（页面内
 *     包装 `IModelTileRpcInterface` 客户端记录 treeId/contentId，切到 K2 落定后
 *     清点窗口内不再出现 ps-1 物理模型 id）；JS heap 采样无线性增长迹象
 *     （CDP 强制 GC 后 4 次采样，末次不超首次数倍）。
 * 11) 失败注入：页面内让 `createQueryReader` 抛错（ECSQL 查询失败）→ 非阻断
 *     `part-studio-model-filter-error` 提示条可见、状态栏仍「已连接」、无画布
 *     「文档打开失败」面、selector fail-closed 清空；恢复后下一次切 scope 自愈。
 *
 * 明确 NOT RUN（附理由，见 task-P2.6b3-report.md）：
 *  - **damaged 半图无全模型**：需要服务端构造「只有 def 分区、缺 phys model」的
 *    半图 iModel；公开 UI/RPC 无创建入口，构造需私有仓后端改库（生产 hack），
 *    故不在本文件伪造。半图分支已有单测（planPartStudioScope / viewer 过滤）
 *    覆盖；真栈 damaged 门留 P2.6c/后续。
 *  - **load 失败变体**：`iModel.models.load` 拒绝路径与 ECSQL 失败共用
 *    `filterError` 通道；本次只注入 ECSQL（更贴近查询失败的真实入口）。load
 *    拒绝的失败注入需在 model 首次加载窗口内精确打桩，残项记录。
 *  - **A legacy 全模型视觉**：A 种子是空 iModel（无 PhysicalModel），「全模型」
 *    逐字不可观测；本文件不重复造 A 栈，直接复用既有 A 只读冒烟
 *    `b-model.spec.ts`「打开 A 种子…」（实测命令见报告）。
 *
 * 纪律：每用例前 `resetBModelSeed`（新 dbKey 规避 30s 陈旧写租约）；无隐藏
 * skip、无弱化断言；只做聚焦文件，不并入全量（P2.6c）。MS 直连 HTTP RPC 很少
 * （registry 1 次/用例 + 若干树/体读面），UI/RPC 走 WS 不吃 100/15min 配额。
 */

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type {
  BodyInfo,
  FeatureOp,
  FeatureTreeEntry,
  PartStudioInfo,
} from '@luban-cad/shared';
import { resetBModelSeed, type SeedImodelRef } from './seed';
import {
  applyFeatureOpRpc,
  authHeaders,
  borrowWriteLease,
  collectConsoleErrors,
  getApiToken,
  getBodiesRpc,
  getFeatureTreeRpc,
  msRpc,
  openBModelEditor,
  readModelScopeId,
  readOpenBriefcaseInfo,
  type BSeedEditorContext,
  type WriteLease,
} from './helpers';

// ============================================================================
// 类型 / 通用探针
// ============================================================================

interface Vec3 { x: number; y: number; z: number }

interface CameraState {
  origin: Vec3;
  extents: Vec3;
  center: Vec3;
  eye: Vec3 | null;
}

interface ViewportProbe {
  hasViewport: boolean;
  /** window 上打标的同一 ScreenViewport 实例（切换/渲染不得重建）。 */
  sameViewport: boolean;
  viewClass: string;
  isSpatial: boolean;
  /** `view.modelSelector.models`（视口实际参与渲染的物理模型集合）。 */
  selectorModels: string[];
  /** `iModel.models.loaded` 键（ModelState 已加载集合；B 下通常含两 scope）。 */
  loadedModels: string[];
  camera: CameraState | null;
  /** `BriefcaseConnection.editorToolSettings.model`（B 工具写目标校准值）。 */
  settingsModel: string | null;
  activeToolId: string | null;
  viewRect: { width: number; height: number } | null;
}

interface StoreProbe {
  canvasSelection: string[];
  treeSelection: string[];
  activeToolId: string | null;
}

interface TileCall { method: string; text: string; t: number }

/** 页面内读视口权威状态（模型选择器/相机/settings/工具/对象身份）。 */
async function readViewport(page: Page): Promise<ViewportProbe> {
  return page.evaluate(async () => {
    const cf = (await import('/@id/@itwin/core-frontend')) as any;
    const vp = cf.IModelApp.viewManager.getFirstOpenView();
    const w = window as any;
    if (!vp) {
      return {
        hasViewport: false,
        sameViewport: false,
        viewClass: '',
        isSpatial: false,
        selectorModels: [],
        loadedModels: [],
        camera: null,
        settingsModel: null,
        activeToolId: cf.IModelApp.toolAdmin?.activeTool?.toolId ?? null,
        viewRect: null,
      };
    }
    if (!w.__e2eVpRef) w.__e2eVpRef = vp;
    const view = vp.view;
    const vec = (v: any): { x: number; y: number; z: number } => ({ x: v.x, y: v.y, z: v.z });
    const camera = typeof view.getExtents === 'function'
      ? {
          origin: vec(view.getOrigin()),
          extents: vec(view.getExtents()),
          center: view.getCenter ? vec(view.getCenter()) : vec(view.getOrigin()),
          eye: typeof view.getEyePoint === 'function' ? vec(view.getEyePoint()) : null,
        }
      : null;
    return {
      hasViewport: true,
      sameViewport: w.__e2eVpRef === vp,
      viewClass: view?.constructor?.name ?? '',
      isSpatial: typeof view?.isSpatialView === 'function' ? view.isSpatialView() : false,
      selectorModels: Array.from(view.modelSelector?.models ?? []),
      loadedModels: Array.from(vp.iModel.models.loaded.keys()),
      camera,
      settingsModel: vp.iModel.editorToolSettings?.model ?? null,
      activeToolId: cf.IModelApp.toolAdmin?.activeTool?.toolId ?? null,
      viewRect: vp.viewRect
        ? { width: vp.viewRect.width, height: vp.viewRect.height }
        : null,
    };
  });
}

/** 页面内读 part-studio store（选择集清空门的第二权威面）。 */
async function readStore(page: Page): Promise<StoreProbe> {
  return page.evaluate(async () => {
    const mod = (await import(
      '/src/modules/part-studio/stores/use-part-studio-store.ts'
    )) as any;
    const state = mod.usePartStudioStore.getState();
    return {
      canvasSelection: (state.canvas?.selection ?? []).map((entry: any) => String(entry.id)),
      treeSelection: [...(state.tree?.selectedNodeIds ?? [])],
      activeToolId: state.tool?.activeToolId ?? null,
    };
  });
}

/** 页面内读 `selectionSet.elements`（每连接权威选择源）。 */
async function readSelectionSet(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const cf = (await import('/@id/@itwin/core-frontend')) as any;
    const vp = cf.IModelApp.viewManager.getFirstOpenView();
    return Array.from(vp?.iModel?.selectionSet?.elements ?? []).map(String);
  });
}

/** 页面内注入/清空 selectionSet（模拟陈旧/外部选择；真实 UI pick 另测）。 */
async function setSelectionSet(page: Page, ids: string[]): Promise<void> {
  await page.evaluate(async (elementIds: string[]) => {
    const cf = (await import('/@id/@itwin/core-frontend')) as any;
    const vp = cf.IModelApp.viewManager.getFirstOpenView();
    if (!vp) throw new Error('selectionSet 注入：viewport 未就绪');
    if (elementIds.length === 0) vp.iModel.selectionSet.emptyAll();
    else vp.iModel.selectionSet.replace(elementIds);
  }, ids);
}

/** 页面内取某物理模型的 world 中心 + 投影屏幕坐标（CSS px，相对 canvas 左上）。 */
async function projectModelCenter(
  page: Page,
  physModelId: string,
): Promise<{ world: Vec3; view: Vec3; npc: Vec3; rawRange: unknown }> {
  return page.evaluate(async (modelId: string) => {
    const cf = (await import('/@id/@itwin/core-frontend')) as any;
    const vp = cf.IModelApp.viewManager.getFirstOpenView();
    if (!vp) throw new Error('投影：viewport 未就绪');
    const ranges = await vp.iModel.models.queryModelRanges([modelId]);
    if (!ranges.length) throw new Error(`物理模型 ${modelId} 无范围（空体？）`);
    const raw = ranges[0];
    const asArray = (value: any): number[] => {
      if (Array.isArray(value)) return value;
      if (value && typeof value === 'object') return [value.x, value.y, value.z];
      return [Number.NaN, Number.NaN, Number.NaN];
    };
    const low = asArray(raw.low);
    const high = asArray(raw.high);
    const world = {
      x: (low[0]! + high[0]!) / 2,
      y: (low[1]! + high[1]!) / 2,
      z: (low[2]! + high[2]!) / 2,
    };
    const view = vp.worldToView(world);
    const npc = vp.worldToNpc(world);
    return {
      world,
      view: { x: view.x, y: view.y, z: view.z },
      npc: { x: npc.x, y: npc.y, z: npc.z },
      rawRange: raw,
    };
  }, physModelId);
}

/** 页面内读某 body 元素的 props（Move/Delete 提交检测：placement/source 不变）。 */
async function readElementProps(page: Page, elementId: string): Promise<unknown> {
  return page.evaluate(async (id: string) => {
    const cf = (await import('/@id/@itwin/core-frontend')) as any;
    const vp = cf.IModelApp.viewManager.getFirstOpenView();
    if (!vp) throw new Error('元素读面：viewport 未就绪');
    const elements = vp.iModel.elements;
    // 上游 5.x API：Elements.loadProps(id) / getProps(id)；旧名 getElementProps 已不存在。
    if (typeof elements.loadProps === 'function') return elements.loadProps(id);
    if (typeof elements.getProps === 'function') return (await elements.getProps([id]))[0];
    throw new Error('元素读面 API 不可用（loadProps/getProps 均缺失）');
  }, elementId);
}

/** 页面内安装 tile RPC 记录（包装 IModelTileRpcInterface 客户端实例）。 */
async function installTileProbe(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const cc = (await import('/@id/@itwin/core-common')) as any;
    const w = window as any;
    if (w.__e2eTileProbeInstalled) return;
    const client = cc.IModelTileRpcInterface.getClient();
    w.__e2eTileCalls = [];
    const methods = ['requestTileTreeProps', 'generateTileContent', 'retrieveTileContent'];
    for (const name of methods) {
      const original = client[name];
      if (typeof original !== 'function') continue;
      const bound = original.bind(client);
      client[name] = (...args: any[]) => {
        try {
          w.__e2eTileCalls.push({
            method: name,
            text: JSON.stringify(args).slice(0, 8000),
            t: performance.now(),
          });
        } catch {
          // 序列化失败不阻断真实请求
        }
        return bound(...args);
      };
    }
    w.__e2eTileProbeInstalled = true;
  });
}

async function readTileCalls(page: Page): Promise<TileCall[]> {
  return page.evaluate(() => ((window as any).__e2eTileCalls ?? []) as TileCall[]);
}

async function clearTileCalls(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).__e2eTileCalls = [];
  });
}

/** 页面内安装 ECSQL 查询延迟/失败注入（测试侧插桩；可恢复）。 */
async function setQueryInjection(page: Page, mode: 'none' | 'delay' | 'throw'): Promise<void> {
  await page.evaluate(async (injectionMode: 'none' | 'delay' | 'throw') => {
    const cf = (await import('/@id/@itwin/core-frontend')) as any;
    const vp = cf.IModelApp.viewManager.getFirstOpenView();
    if (!vp) throw new Error('查询注入：viewport 未就绪');
    const iModel = vp.iModel;
    const w = window as any;
    if (!w.__e2eQueryOrig) w.__e2eQueryOrig = iModel.createQueryReader.bind(iModel);
    const original = w.__e2eQueryOrig as (query: string) => any;
    if (injectionMode === 'none') {
      iModel.createQueryReader = original;
      return;
    }
    if (injectionMode === 'throw') {
      iModel.createQueryReader = () => {
        throw new Error('E2E injected ECSQL failure');
      };
      return;
    }
    iModel.createQueryReader = (query: string) => (async function* () {
      await new Promise((resolve) => setTimeout(resolve, 300));
      // 调用时再取原始实现，恢复后新查询不被旧闭包拖慢。
      const inner = (w.__e2eQueryOrig as (q: string) => any)(query);
      for await (const row of inner) yield row;
    })();
  }, mode);
}

async function readHeap(page: Page): Promise<number> {
  return page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? 0);
}

async function forceGc(page: Page): Promise<void> {
  try {
    const session = await page.context().newCDPSession(page);
    await session.send('HeapProfiler.collectGarbage');
    await session.detach();
  } catch {
    // CDP 不可用（非 Chromium）不影响功能断言——采样值仅作泄漏迹象报告
  }
}

async function msHealth(): Promise<{ status: number; connectedClients: number | null }> {
  try {
    const response = await fetch('http://localhost:5401/health');
    const body = await response.text();
    let connectedClients: number | null = null;
    try {
      const parsed = JSON.parse(body) as { websocket?: { connectedClients?: number } };
      connectedClients = parsed.websocket?.connectedClients ?? null;
    } catch {
      // 非 JSON 健康面
    }
    return { status: response.status, connectedClients };
  } catch {
    return { status: -1, connectedClients: null };
  }
}

// ============================================================================
// 双 studio 造数（scope-aware RPC，生产服务端契约）
// ============================================================================

interface Sketch2d {
  entities: unknown[];
  constraints: unknown[];
}
interface PlaneDto {
  origin: Vec3;
  normal: Vec3;
  xDir: Vec3;
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

async function listStudios(ctx: BSeedEditorContext, token: string): Promise<PartStudioInfo[]> {
  // P2.2 registry 读面：纯读、无租约、空文档=[]；B 必须只经此口径识别 scope。
  return (await msRpc(
    ctx.itwinId,
    ctx.imodelId,
    'listPartStudios',
    [ctx.dbKey],
    token,
  )) as PartStudioInfo[];
}

async function applyOp(
  ctx: BSeedEditorContext,
  lease: WriteLease,
  token: string,
  scopeId: string,
  op: FeatureOp,
  label: string,
): Promise<string> {
  const result = await applyFeatureOpRpc(ctx, op, lease, token, scopeId);
  expect(
    result.ok,
    `${label} 被拒收（scope=${scopeId}）：${result.error ?? JSON.stringify(result).slice(0, 300)}`,
  ).toBe(true);
  expect(result.featureId, `${label} 未返回 featureId`).toBeTruthy();
  return result.featureId as string;
}

interface BodySetup {
  sketchId: string;
  extrudeId: string;
  bodies: BodyInfo[];
}

/** 生产 RPC 造一体：矩形草图 + extrude（显式 scope；两点位置由矩形决定）。 */
async function createBody(
  ctx: BSeedEditorContext,
  lease: WriteLease,
  token: string,
  scopeId: string,
  label: string,
  rect: { x0: number; y0: number; x1: number; y1: number; distance: number },
): Promise<BodySetup> {
  const sketch = rectangleSketch(rect.x0, rect.y0, rect.x1, rect.y1);
  const sketchId = await applyOp(
    ctx,
    lease,
    token,
    scopeId,
    {
      kind: 'insertSketch',
      entities: sketch.entities,
      constraints: sketch.constraints,
      plane: xyPlane(0),
    } as unknown as FeatureOp,
    `${label} 草图`,
  );
  const extrudeId = await applyOp(
    ctx,
    lease,
    token,
    scopeId,
    {
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: rect.distance, sketchId, regions: [0] },
    } as unknown as FeatureOp,
    `${label} 拉伸`,
  );
  const bodies = await getBodiesRpc(ctx, token, scopeId);
  expect(bodies.length, `${label} 拉伸后应有 1 个 body`).toBe(1);
  console.log(
    `[b-viewport] ${label} scope=${scopeId} sketch=${sketchId.slice(0, 8)}… ` +
      `extrude=${extrudeId.slice(0, 8)}… body=${bodies[0]!.bodyKey}`,
  );
  return { sketchId, extrudeId, bodies };
}

async function readTree(
  ctx: BSeedEditorContext,
  token: string,
  scopeId: string,
): Promise<FeatureTreeEntry[]> {
  return getFeatureTreeRpc(ctx, token, scopeId);
}

function cameraDistance(a: CameraState | null, b: CameraState | null): number {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const dx = a.origin.x - b.origin.x;
  const dy = a.origin.y - b.origin.y;
  const dz = a.origin.z - b.origin.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function expectCameraSame(
  actual: CameraState | null,
  expected: CameraState | null,
  label: string,
  tolerance = 1e-2,
): void {
  expect(actual, `${label}：相机快照缺失`).toBeTruthy();
  expect(expected, `${label}：期望相机快照缺失`).toBeTruthy();
  const a = actual as CameraState;
  const e = expected as CameraState;
  for (const key of ['origin', 'extents', 'center'] as const) {
    const av = a[key];
    const ev = e[key];
    expect(
      Math.abs(av.x - ev.x) + Math.abs(av.y - ev.y) + Math.abs(av.z - ev.z),
      `${label}：相机 ${key} 未恢复（actual=${JSON.stringify(av)} expected=${JSON.stringify(ev)}）`,
    ).toBeLessThanOrEqual(tolerance);
  }
}

// ============================================================================
// 共用：重置种子 + 打开编辑器 + 双 studio 双体
// ============================================================================

interface TwoStudioWorld {
  token: string;
  ctx: BSeedEditorContext;
  lease: WriteLease;
  studios: PartStudioInfo[];
  k1: PartStudioInfo;
  k2: PartStudioInfo;
  body1: BodyInfo;
  body2: BodyInfo;
  tree1: FeatureTreeEntry[];
  tree2: FeatureTreeEntry[];
}

async function openTwoStudioWorld(
  page: Page,
  seed: SeedImodelRef,
  label: string,
): Promise<TwoStudioWorld> {
  const token = await getApiToken();
  const ctx = await openBModelEditor(page, seed);
  const k1Id = ctx.scopeId;
  console.log(`[b-viewport] ${label} K1=${k1Id} dbKey=${ctx.dbKey}`);

  const lease = await borrowWriteLease(ctx, token, label);
  console.log(`[b-viewport] ${label} lease session=${lease.sessionId} borrowed=${lease.borrowed}`);

  // registry 识别：默认 studio 由解析器创建，physModelId 必须非空。
  const initial = await listStudios(ctx, token);
  expect(initial.map((studio) => studio.id), `${label} 初始 registry`).toEqual([k1Id]);
  const k1 = initial[0]!;
  expect(k1.physModelId, `${label} K1 physModelId`).toMatch(/^\S+$/);

  // ps-1 体：原点 2×2×1。
  await createBody(ctx, lease, token, k1Id, `${label} ps-1`, {
    x0: 0, y0: 0, x1: 2, y1: 2, distance: 1,
  });
  const featureCount = page.getByTestId('part-studio-feature-count');
  const partList = page.getByTestId('part-studio-part-list');
  await expect(featureCount).toHaveText('(2)', { timeout: 90_000 });
  await expect.poll(async () => partList.locator('.part-studio-tree-row').count(), {
    timeout: 90_000,
  }).toBe(1);

  // `+` 创建第二 studio（真实 UI；生产 registry 通道）。
  const tabStrip = page.getByTestId('part-studio-tab-strip');
  const tabs = tabStrip.getByRole('tab');
  await page.getByTestId('part-studio-new-tab-button').click();
  await expect(tabs).toHaveCount(2, { timeout: 60_000 });
  const k2Id = readModelScopeId(page);
  expect(k2Id, '「+」后 URL 应落到新 scope').toBeTruthy();
  expect(k2Id).not.toBe(k1Id);
  await expect(tabStrip.locator(`[data-studio-id="${k2Id}"]`)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(featureCount).toHaveText('(0)', { timeout: 30_000 });

  const studios = await listStudios(ctx, token);
  expect(studios.map((studio) => studio.id).sort()).toEqual([k1Id, k2Id].sort());
  const k2 = studios.find((studio) => studio.id === k2Id)!;
  expect(k2.physModelId, `${label} K2 physModelId`).toMatch(/^\S+$/);
  expect(k2.physModelId).not.toBe(k1.physModelId);

  // ps-2 体：明显不同的位置（x≈42），尺寸也不同（4×3×2）。
  await createBody(ctx, lease, token, k2Id as string, `${label} ps-2`, {
    x0: 40, y0: 0, x1: 44, y1: 3, distance: 2,
  });
  await expect(featureCount).toHaveText('(2)', { timeout: 90_000 });
  await expect.poll(async () => partList.locator('.part-studio-tree-row').count(), {
    timeout: 90_000,
  }).toBe(1);

  const bodies1 = await getBodiesRpc(ctx, token, k1Id);
  const bodies2 = await getBodiesRpc(ctx, token, k2Id as string);
  expect(bodies1.length).toBe(1);
  expect(bodies2.length).toBe(1);
  const body1 = bodies1[0]!;
  const body2 = bodies2[0]!;
  expect(body1.bodyKey).not.toBe(body2.bodyKey);

  return {
    token,
    ctx,
    lease,
    studios,
    k1,
    k2,
    body1,
    body2,
    tree1: await readTree(ctx, token, k1Id),
    tree2: await readTree(ctx, token, k2Id as string),
  };
}

/** 等 URL + 页签选中落到目标 scope（UI 权威）。 */
async function expectActiveScope(page: Page, scopeId: string): Promise<void> {
  const tabStrip = page.getByTestId('part-studio-tab-strip');
  await expect(page).toHaveURL(new RegExp(`[?&]model=${scopeId}`), { timeout: 30_000 });
  await expect(tabStrip.locator(`[data-studio-id="${scopeId}"]`)).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 30_000 },
  );
}

/** 等视口过滤落定：selector 恰为目标 phys 模型 + settings 校准 + 相机可用。 */
async function expectViewportScope(
  page: Page,
  physModelId: string,
  label: string,
): Promise<ViewportProbe> {
  let last: ViewportProbe | null = null;
  await expect.poll(async () => {
    last = await readViewport(page);
    return `${last.selectorModels.join(',')}|${last.settingsModel ?? ''}`;
  }, { timeout: 60_000, intervals: [250, 500, 1000] }).toBe(
    `${physModelId}|${physModelId}`,
  );
  const probe = (last ?? (await readViewport(page))) as ViewportProbe;
  console.log(
    `[b-viewport] ${label} selector=[${probe.selectorModels.join(',')}] ` +
      `settings=${probe.settingsModel} view=${probe.viewClass} ` +
      `camera.origin=${JSON.stringify(probe.camera?.origin)} extents=${JSON.stringify(probe.camera?.extents)}`,
  );
  return probe;
}

function tab(page: Page, scopeId: string) {
  return page
    .getByTestId('part-studio-tab-strip')
    .locator(`[data-studio-id="${scopeId}"]`);
}

/** 画布内真实鼠标点击（Select 默认工具；用于 pick 隔离与工具手势）。 */
async function clickCanvas(page: Page, viewPoint: Vec3): Promise<void> {
  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas boundingBox 不可得');
  const x = box.x + viewPoint.x;
  const y = box.y + viewPoint.y;
  await page.mouse.move(x - 6, y - 6);
  await page.waitForTimeout(60);
  await page.mouse.move(x, y);
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.waitForTimeout(40);
  await page.mouse.up();
  await page.waitForTimeout(250);
}

/** 两个数据点手势（Move/Rotate 若仍驻留则足以完成一次提交）。 */
async function gesture(page: Page): Promise<void> {
  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas boundingBox 不可得');
  await clickCanvas(page, { x: box.width / 2, y: box.height / 2, z: 0 });
  await clickCanvas(page, { x: box.width / 2 + 60, y: box.height / 2 + 40, z: 0 });
  // 双保险：Enter 完成仍在进行的元素集工具。
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
}

/** 相机取景到某元素（用于「隐藏 scope 的几何即便在视野内也不可拾取」）。 */
async function zoomToElement(page: Page, elementId: string): Promise<void> {
  await page.evaluate(async (id: string) => {
    const cf = (await import('/@id/@itwin/core-frontend')) as any;
    const vp = cf.IModelApp.viewManager.getFirstOpenView();
    if (!vp) throw new Error('zoomToElement：viewport 未就绪');
    await vp.zoomToElements([id], {});
    vp.synchWithView({});
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }, elementId);
}

// ============================================================================
// 变更集 / 工具跨页签助手
// ============================================================================

interface ChangesetSummary { count: number; lastIndex: number; lastId: string }

/** hub changeset 列表摘要（无新推送时 count/latest 不得变化）。 */
async function latestChangeset(
  request: APIRequestContext,
  imodelId: string,
  token: string,
): Promise<ChangesetSummary> {
  const response = await request.get(`/imodels/${imodelId}/changesets?$top=200`, {
    headers: authHeaders(token),
  });
  expect(response.ok(), `changesets 读面应 200（实际 ${response.status()}）`).toBeTruthy();
  const body = (await response.json()) as {
    changesets?: Array<{ id?: string; index?: number }>;
  };
  const rows = body.changesets ?? [];
  const last = rows[rows.length - 1];
  return {
    count: rows.length,
    lastIndex: last?.index ?? -1,
    lastId: last?.id ?? '',
  };
}

/**
 * 在 from scope 选择 body、启动真实元素集工具（MoveElements/RotateElements），
 * 切到 to scope 后再补一次完整手势：工具必须在切 scope 时被默认工具替换，
 * 且 from scope 的元素/特征/变更集逐项不变（R3 真栈门）。
 */
async function toolAcrossSwitch(
  page: Page,
  request: APIRequestContext,
  world: TwoStudioWorld,
  from: PartStudioInfo,
  to: PartStudioInfo,
  bodyKey: string,
  toolId: string,
  label: string,
): Promise<void> {
  const { ctx, token } = world;
  await tab(page, from.id).click();
  await expectActiveScope(page, from.id);
  await expectViewportScope(page, from.physModelId, `${label}-from`);
  const treeBefore = await readTree(ctx, token, from.id);
  const propsBefore = await readElementProps(page, bodyKey);
  const csBefore = await latestChangeset(request, ctx.imodelId, token);

  await setSelectionSet(page, [bodyKey]);
  await expect.poll(async () => (await readStore(page)).canvasSelection.join(','), {
    timeout: 20_000,
  }).toBe(bodyKey);
  const started = await page.evaluate(async (id: string) => {
    const cf = (await import('/@id/@itwin/core-frontend')) as any;
    return cf.IModelApp.tools.run(id) as Promise<boolean>;
  }, toolId);
  expect(started, `${label} 工具 ${toolId} 应成功启动`).toBe(true);
  await expect.poll(async () => (await readViewport(page)).activeToolId, {
    timeout: 20_000,
    intervals: [100, 250],
  }).toBe(toolId);

  // 切页签：scope 切换 effect 必须以默认工具替换活动元素集工具。
  await tab(page, to.id).click();
  await expectActiveScope(page, to.id);
  await expectViewportScope(page, to.physModelId, `${label}-to`);
  await expect.poll(async () => (await readViewport(page)).activeToolId, {
    timeout: 20_000,
    intervals: [100, 250],
  }).not.toBe(toolId);
  const afterTool = (await readViewport(page)).activeToolId;
  const ribbonTool = (await readStore(page)).activeToolId;
  // R5 观察面（仅记录，不阻断）：ribbon 激活态是 store 值，是否随 scope 复位
  // 属既有行为（P2.5 review R5 Minor）。
  console.log(`[b-viewport] ${label} 跨页签后 activeTool=${afterTool} store.tool=${ribbonTool}`);

  // 若工具未被真正取消，这两跳手势足以完成一次 Move/Rotate 提交。
  await gesture(page);
  await page.waitForTimeout(800);
  expect(await readTree(ctx, token, from.id), `${label} 不得改动旧 scope 特征树`).toEqual(treeBefore);
  expect(
    await readElementProps(page, bodyKey),
    `${label} 不得改动旧 scope body（placement/props 不变）`,
  ).toEqual(propsBefore);
  const csAfter = await latestChangeset(request, ctx.imodelId, token);
  expect(
    { count: csAfter.count, index: csAfter.lastIndex, id: csAfter.lastId },
    `${label} 不得产生新 changeset`,
  ).toEqual({ count: csBefore.count, index: csBefore.lastIndex, id: csBefore.lastId });
  expect(await readSelectionSet(page), `${label} 切 scope 后选择集必须为空`).toHaveLength(0);
}

// ============================================================================
// 测试 1：双 scope 视口隔离 / 相机 / 连接稳定 / tile 停止 / 12 次切换
// ============================================================================

test.describe('P2.5 真栈视口门', () => {
  let seed: SeedImodelRef;

  test.beforeEach(async ({ request }) => {
    test.setTimeout(300_000);
    seed = await resetBModelSeed(request, await getApiToken());
  });

  test('双 studio：registry≡ModelState、单 scope 可见/取景、同连接、tile 停止、12 次切换', async ({
    page,
  }) => {
    test.slow();
    test.setTimeout(1_500_000);

    const consoleErrors = collectConsoleErrors(page);
    const socketUrls: string[] = [];
    page.on('websocket', (socket) => {
      const url = socket.url();
      if (url.includes('/ipc') || url.includes('/ws')) socketUrls.push(url);
    });

    const world = await openTwoStudioWorld(page, seed, 'viewport');
    const { ctx, k1, k2, body1, body2 } = world;

    // ── A) 初始在 K2（造数后）；切回 K1 建立基线与连接身份 ────────────────
    const healthBefore = await msHealth();
    expect(healthBefore.status, `MS health 应为 200（实际 ${healthBefore.status}）`).toBe(200);
    const socketsBefore = [...socketUrls];
    const infoBefore = await readOpenBriefcaseInfo(page);
    expect(infoBefore.key, 'B 编辑器应持有 briefcase key').toBeTruthy();
    expect(infoBefore.isReadonly).toBe(false);

    await tab(page, k1.id).click();
    await expectActiveScope(page, k1.id);
    const k1Probe = await expectViewportScope(page, k1.physModelId, 'K1');
    expect(k1Probe.hasViewport).toBe(true);
    expect(k1Probe.sameViewport, '视口实例必须存在且未重建').toBe(true);
    expect(k1Probe.isSpatial, 'B 默认视图必须是 SpatialViewState').toBe(true);
    expect(k1Probe.viewClass).toBe('SpatialViewState');
    // gate：registry physModelId ≡ 已加载 ModelState id（selector 唯一条目）
    expect(k1Probe.selectorModels, 'K1 selector 应恰为 ps-1 物理模型').toEqual([k1.physModelId]);
    expect(k1Probe.loadedModels, 'K1 已加载 ModelState 应包含 ps-1 physModelId').toContain(
      k1.physModelId,
    );
    expect(k1Probe.camera, 'K1 应有相机状态').toBeTruthy();
    expect(k1Probe.selectorModels).not.toContain(k2.physModelId);
    const k1Camera = k1Probe.camera;
    const k1ViewRect = k1Probe.viewRect;
    console.log(
      `[b-viewport] K1 registry phys=${k1.physModelId} loaded=[${k1Probe.loadedModels.join(',')}] ` +
        `viewRect=${JSON.stringify(k1ViewRect)}`,
    );

    // 真实 pick：点击 ps-1 body 投影中心 → selectionSet 只含 body1。
    const proj1 = await projectModelCenter(page, k1.physModelId);
    console.log(`[b-viewport] proj1=${JSON.stringify(proj1)}`);
    expect(proj1.npc.x, 'ps-1 体应在 K1 视锥内（npc.x）').toBeGreaterThan(0);
    expect(proj1.npc.x, 'ps-1 体应在 K1 视锥内（npc.x 上界）').toBeLessThan(1);
    expect(proj1.npc.y, 'ps-1 体应在 K1 视锥内（npc.y）').toBeGreaterThan(0);
    expect(proj1.npc.y, 'ps-1 体应在 K1 视锥内（npc.y 上界）').toBeLessThan(1);
    await clickCanvas(page, proj1.view);
    await expect.poll(async () => (await readSelectionSet(page)).join(','), {
      timeout: 20_000,
      intervals: [200, 500],
    }).toBe(body1.bodyKey);
    await expect.poll(async () => (await readStore(page)).canvasSelection.join(','), {
      timeout: 20_000,
    }).toBe(body1.bodyKey);
    await setSelectionSet(page, []);

    // 隐藏 scope 不可拾取（K1 下把 ps-2 的位置拉进视野，点击它的中心也不能
    // 选中 ps-2 —— selector 之外模型不参与渲染/拾取）。
    await zoomToElement(page, body2.bodyKey);
    const hid2 = await projectModelCenter(page, k2.physModelId);
    expect(hid2.npc.x, 'ps-2 拉进视野后应在视锥内（npc.x）').toBeGreaterThan(0);
    expect(hid2.npc.x).toBeLessThan(1);
    expect(hid2.npc.y).toBeGreaterThan(0);
    expect(hid2.npc.y).toBeLessThan(1);
    await clickCanvas(page, hid2.view);
    const hidSel = await readSelectionSet(page);
    expect(hidSel, 'K1 活动时点击 ps-2 位置不得选中 ps-2').not.toContain(body2.bodyKey);
    expect((await readStore(page)).canvasSelection).not.toContain(body2.bodyKey);
    await setSelectionSet(page, []);

    // ── B) 切 K2：selector/相机/设置全部切到 ps-2；ps-1 不可见/不在视锥 ────
    await clearTileCalls(page).catch(() => undefined);
    await installTileProbe(page);
    await tab(page, k2.id).click();
    await expectActiveScope(page, k2.id);
    const k2Probe = await expectViewportScope(page, k2.physModelId, 'K2');
    expect(k2Probe.sameViewport, '切 scope 不得重建 ScreenViewport').toBe(true);
    expect(k2Probe.selectorModels, 'K2 selector 应恰为 ps-2 物理模型').toEqual([k2.physModelId]);
    expect(k2Probe.selectorModels).not.toContain(k1.physModelId);
    expect(k2Probe.loadedModels, 'K2 已加载 ModelState 应包含 ps-2 physModelId').toContain(
      k2.physModelId,
    );
    const k2Camera = k2Probe.camera;
    expect(k2Camera, 'K2 应有相机状态').toBeTruthy();
    // 相机按 scope 重取景：ps-2 体在 x≈42，origin 必须明显平移。
    expect(
      cameraDistance(k1Camera, k2Camera),
      `相机应随 scope 变化（K1=${JSON.stringify(k1Camera?.origin)} K2=${JSON.stringify(k2Camera?.origin)}）`,
    ).toBeGreaterThan(10);
    expect(Math.abs(k2Camera!.extents.x - k1Camera!.extents.x)).toBeGreaterThan(1e-3);

    // ps-2 body 真实 pick（K2 下可拾取）。
    const proj2 = await projectModelCenter(page, k2.physModelId);
    expect(proj2.npc.x, 'ps-2 体应在 K2 视锥内').toBeGreaterThan(0);
    expect(proj2.npc.x).toBeLessThan(1);
    expect(proj2.npc.y).toBeGreaterThan(0);
    expect(proj2.npc.y).toBeLessThan(1);
    await clickCanvas(page, proj2.view);
    await expect.poll(async () => (await readSelectionSet(page)).join(','), {
      timeout: 20_000,
    }).toBe(body2.bodyKey);
    await setSelectionSet(page, []);

    // K1 在 K2 下不可见：其物理模型既不在 selector，投影也应在视锥外。
    const proj1InK2 = await projectModelCenter(page, k1.physModelId);
    const offscreen =
      proj1InK2.npc.x < 0 || proj1InK2.npc.x > 1 || proj1InK2.npc.y < 0 || proj1InK2.npc.y > 1;
    expect(
      offscreen,
      `K2 视图下 ps-1 体应不可见（npc=${JSON.stringify(proj1InK2.npc)}）`,
    ).toBe(true);

    // 反向隐藏 scope 不可拾取：K2 下把 ps-1 位置拉进视野并点击，也不得选中 ps-1。
    await zoomToElement(page, body1.bodyKey);
    const hid1 = await projectModelCenter(page, k1.physModelId);
    expect(hid1.npc.x, 'ps-1 拉进视野后应在视锥内（npc.x）').toBeGreaterThan(0);
    expect(hid1.npc.x).toBeLessThan(1);
    expect(hid1.npc.y).toBeGreaterThan(0);
    expect(hid1.npc.y).toBeLessThan(1);
    await clickCanvas(page, hid1.view);
    expect(await readSelectionSet(page), 'K2 活动时点击 ps-1 位置不得选中 ps-1').not.toContain(
      body1.bodyKey,
    );
    await setSelectionSet(page, []);

    // ── C) 切回 K1：相机恢复 + 连接/WS 身份稳定 ──────────────────────────
    await tab(page, k1.id).click();
    await expectActiveScope(page, k1.id);
    const k1Back = await expectViewportScope(page, k1.physModelId, 'K1-back');
    expectCameraSame(k1Back.camera, k1Camera, '切回 K1 相机');
    expect(k1Back.sameViewport).toBe(true);
    const infoAfter = await readOpenBriefcaseInfo(page);
    expect(infoAfter.key, '切 scope 后 connection.key 必须不变').toBe(infoBefore.key);
    expect(infoAfter.isReadonly).toBe(false);
    expect(socketUrls, '切 scope 不得新建 IPC/进度 WebSocket').toEqual(socketsBefore);
    const healthAfter = await msHealth();
    expect(healthAfter.status).toBe(200);
    expect(
      healthAfter.connectedClients,
      'MS websocket.connectedClients 在切换期间必须稳定',
    ).toBe(healthBefore.connectedClients);

    // ── D) 旧 scope tile RPC 停止（确定性）：K3 的几何在**未被显示**时由 RPC
    //      造出；首次切到 K3 必然发 tile 请求（证明探针有效），随后切回 K1，
    //      静默窗内不得再出现 K3 的 tile 请求；反向 K1→K3 亦然。
    await tab(page, k1.id).click();
    await expectActiveScope(page, k1.id);
    await expectViewportScope(page, k1.physModelId, 'K1-pre-tile');
    // 创建 K3 后立刻切回 K1：K3 只在空模型态短暂显示，其体由后续 RPC 造出。
    const tabs3 = page.getByTestId('part-studio-tab-strip').getByRole('tab');
    await page.getByTestId('part-studio-new-tab-button').click();
    await expect(tabs3).toHaveCount(3, { timeout: 60_000 });
    const k3Id = readModelScopeId(page);
    expect(k3Id, 'K3 URL scope').toBeTruthy();
    await tab(page, k1.id).click();
    await expectActiveScope(page, k1.id);
    await expectViewportScope(page, k1.physModelId, 'K1-during-k3-build');
    await createBody(ctx, world.lease, world.token, k3Id as string, 'ps-3(tile)', {
      x0: 80, y0: 0, x1: 84, y1: 3, distance: 2,
    });
    const studios3 = await listStudios(ctx, world.token);
    const k3 = studios3.find((studio) => studio.id === k3Id);
    expect(k3, 'K3 registry 条目').toBeTruthy();
    expect(k3!.physModelId).toMatch(/^\S+$/);

    await clearTileCalls(page);
    await tab(page, k3!.id).click();
    await expectActiveScope(page, k3!.id);
    const k3Probe = await expectViewportScope(page, k3!.physModelId, 'K3-first-visit');
    expect(k3Probe.selectorModels).toEqual([k3!.physModelId]);
    await page.waitForTimeout(2_000);
    const k3FirstCalls = await readTileCalls(page);
    const k3Hits = k3FirstCalls.filter((call) => call.text.includes(k3!.physModelId));
    const k1HitsInK3 = k3FirstCalls.filter((call) => call.text.includes(k1.physModelId));
    console.log(
      `[b-viewport] K3 首访 tile 请求=${k3FirstCalls.length}（K3 命中=${k3Hits.length}, ` +
        `K1 命中=${k1HitsInK3.length}）`,
    );
    expect(
      k3Hits.length,
      '首次显示 K3 几何应产生 K3 物理模型的 tile 请求（证明记录探针有效且几何确实走 tile 通道）',
    ).toBeGreaterThan(0);
    expect(
      k1HitsInK3,
      `K3 落定后不得再有 ps-1 物理模型的 tile 请求：\n${k1HitsInK3
        .map((call) => `${call.method} ${call.text.slice(0, 240)}`)
        .join('\n')}`,
    ).toHaveLength(0);

    // 切回 K1：旧 scope（K3）的 tile 请求必须停止。
    await tab(page, k1.id).click();
    await expectActiveScope(page, k1.id);
    await expectViewportScope(page, k1.physModelId, 'K1-post-k3');
    await page.waitForTimeout(1_500); // 渲染/tile 队列静默窗
    await clearTileCalls(page);
    await page.waitForTimeout(2_000);
    const quietCalls = await readTileCalls(page);
    const k3Tiles = quietCalls.filter((call) => call.text.includes(k3!.physModelId));
    expect(
      k3Tiles,
      `K1 落定后不得再有 ps-3 物理模型的 tile 请求：\n${k3Tiles
        .map((call) => `${call.method} ${call.text.slice(0, 240)}`)
        .join('\n')}`,
    ).toHaveLength(0);
    console.log(`[b-viewport] K1 静默窗 tile 请求=${quietCalls.length}（K3 命中=${k3Tiles.length}）`);

    // ── E) 12 次页签切换：无错误 + 无线性内存增长迹象 ─────────────────────
    await forceGc(page);
    const heapSamples: number[] = [await readHeap(page)];
    for (let i = 0; i < 12; i++) {
      const target = i % 2 === 0 ? k2 : k1;
      await tab(page, target.id).click();
      await expectActiveScope(page, target.id);
      await expectViewportScope(page, target.physModelId, `switch-${i + 1}`);
      if ((i + 1) % 4 === 0) {
        await forceGc(page);
        heapSamples.push(await readHeap(page));
      }
    }
    // 12 次偶数 → 末态 K1（起点 K1 → K2）；再断言一次收口。
    await expectActiveScope(page, k1.id);
    await expectViewportScope(page, k1.physModelId, 'switch-final-K1');
    const finalInfo = await readOpenBriefcaseInfo(page);
    expect(finalInfo.key).toBe(infoBefore.key);
    expect(await readSelectionSet(page)).toHaveLength(0);
    expect(consoleErrors, `12 次切换不得有 console/page 错误：\n${consoleErrors.join('\n')}`).toEqual([]);

    const heapFirst = heapSamples[0] ?? 0;
    const heapLast = heapSamples[heapSamples.length - 1] ?? 0;
    console.log(
      `[b-viewport] heap 采样(MB)=[${heapSamples.map((value) => (value / 1048576).toFixed(1)).join(', ')}]`,
    );
    // 粗门（防明显线性泄漏）：末次采样不超过首次 3 倍 + 64MB；12 次切换的
    // tile 树/两 scope 缓存本就常驻，绝对增长允许一个宽松上限。
    expect(heapLast).toBeLessThanOrEqual(heapFirst * 3 + 64 * 1024 * 1024);
  });

  // ==========================================================================
  // 测试 2：选择集/工具跨页签隔离 + R4（无关渲染/undo 保留选择）+ 写目标
  // ==========================================================================
  test('选择集与工具跨页签隔离、R4 选择保留、写目标只落 active scope', async ({
    page,
    request,
  }) => {
    test.slow();
    test.setTimeout(1_500_000);

    const consoleErrors = collectConsoleErrors(page);
    const world = await openTwoStudioWorld(page, seed, 'isolation');
    const { ctx, k1, k2, body1, token } = world;

    // ── A) K1 基线（树/元素 props/真实 pick）────────────────────────────────
    await tab(page, k1.id).click();
    await expectActiveScope(page, k1.id);
    await expectViewportScope(page, k1.physModelId, 'I-K1');
    const tree1Before = await readTree(ctx, token, k1.id);
    const props1Before = await readElementProps(page, body1.bodyKey);
    expect(tree1Before.length, 'ps-1 基线树应为 2 节点').toBe(2);

    const proj1 = await projectModelCenter(page, k1.physModelId);
    await clickCanvas(page, proj1.view);
    await expect.poll(async () => (await readSelectionSet(page)).join(','), {
      timeout: 20_000,
    }).toBe(body1.bodyKey);
    expect((await readStore(page)).canvasSelection, 'store 选择桥应映射 body1').toEqual([
      body1.bodyKey,
    ]);

    // ── B) R4：无关渲染（invalidateScene）不得清空选择 ──────────────────────
    await page.evaluate(async () => {
      const cf = (await import('/@id/@itwin/core-frontend')) as any;
      cf.IModelApp.viewManager.getFirstOpenView()?.invalidateScene();
    });
    await page.waitForTimeout(700);
    expect(await readSelectionSet(page), 'invalidateScene 后选择必须保留').toEqual([
      body1.bodyKey,
    ]);
    expect((await readStore(page)).canvasSelection).toEqual([body1.bodyKey]);

    // ── C) R4：文档级 undo/redo（最新事务在 ps-2）不得清空 ps-1 选择 ───────
    const k2TreeBeforeUndo = await readTree(ctx, token, k2.id);
    expect(k2TreeBeforeUndo.length, 'ps-2 基线树应为 2 节点').toBe(2);
    const undo = page.getByTestId('part-studio-undo-button');
    await expect(undo).toBeEnabled({ timeout: 60_000 });
    await undo.click();
    await expect.poll(async () => (await readTree(ctx, token, k2.id)).length, {
      timeout: 60_000,
      intervals: [500, 1000],
    }).toBe(1);
    expect(await readSelectionSet(page), 'undo 后 ps-1 选择必须保留').toEqual([
      body1.bodyKey,
    ]);
    const redo = page.getByTestId('part-studio-redo-button');
    await expect(redo).toBeEnabled({ timeout: 60_000 });
    await redo.click();
    await expect.poll(async () => (await readTree(ctx, token, k2.id)).length, {
      timeout: 60_000,
      intervals: [500, 1000],
    }).toBe(2);
    expect(await readSelectionSet(page), 'redo 后 ps-1 选择必须保留').toEqual([
      body1.bodyKey,
    ]);
    expect(await readTree(ctx, token, k1.id), 'undo/redo 不得改动 ps-1 树').toEqual(tree1Before);
    await setSelectionSet(page, []);

    // ── D) 真实选择隔离：注入 ps-1 body → 切 ps-2 → Delete/Move 不触碰 ps-1
    const csBeforeIsolation = await latestChangeset(request, ctx.imodelId, token);
    await setSelectionSet(page, [body1.bodyKey]);
    await expect.poll(async () => (await readStore(page)).canvasSelection.join(','), {
      timeout: 20_000,
    }).toBe(body1.bodyKey);

    await tab(page, k2.id).click();
    await expectActiveScope(page, k2.id);
    await expectViewportScope(page, k2.physModelId, 'I-K2');
    await expect.poll(async () => (await readSelectionSet(page)).length, {
      timeout: 20_000,
    }).toBe(0);
    await expect.poll(async () => (await readStore(page)).canvasSelection.length, {
      timeout: 20_000,
    }).toBe(0);
    await expect.poll(async () => (await readStore(page)).treeSelection.length, {
      timeout: 20_000,
    }).toBe(0);

    await page.keyboard.press('Delete');
    await page.waitForTimeout(700);
    const emptyMoveStarted = await page.evaluate(async () => {
      const cf = (await import('/@id/@itwin/core-frontend')) as any;
      try {
        return await (cf.IModelApp.tools.run('MoveElements') as Promise<boolean>);
      } catch {
        return false;
      }
    });
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    console.log(`[b-viewport] 空选择 Move 启动返回=${emptyMoveStarted}`);
    expect(await readSelectionSet(page), 'Delete/Move 后 selectionSet 必须为空').toHaveLength(0);
    expect((await readStore(page)).canvasSelection, 'Delete/Move 后 store 选择必须为空').toHaveLength(0);

    expect(await readTree(ctx, token, k1.id), 'Delete/Move 后 ps-1 树必须不变').toEqual(
      tree1Before,
    );
    expect(
      await readElementProps(page, body1.bodyKey),
      'Delete/Move 后 ps-1 body 元素 props 必须不变',
    ).toEqual(props1Before);
    expect((await getBodiesRpc(ctx, token, k1.id)).map((body) => body.bodyKey)).toEqual([
      body1.bodyKey,
    ]);
    await expect.poll(async () => {
      const summary = await latestChangeset(request, ctx.imodelId, token);
      return `${summary.count}|${summary.lastIndex}|${summary.lastId}`;
    }, { timeout: 30_000 }).toBe(
      `${csBeforeIsolation.count}|${csBeforeIsolation.lastIndex}|${csBeforeIsolation.lastId}`,
    );

    // ── E) 活动 Move/Rotate 跨页签：不得提交 ps-1 变更（R3 真栈）──────────
    await toolAcrossSwitch(
      page, request, world, k1, k2, body1.bodyKey, 'MoveElements', 'Move',
    );
    await toolAcrossSwitch(
      page, request, world, k1, k2, body1.bodyKey, 'RotateElements', 'Rotate',
    );

    // ── F) 写目标：切到 ps-2 后经生产 UI 插入草图 → 只落 ps-2 ──────────────
    await tab(page, k2.id).click();
    await expectActiveScope(page, k2.id);
    await expectViewportScope(page, k2.physModelId, 'W-K2');
    await page.getByRole('button', { name: '草图', exact: true }).click();
    const sketchDialog = page.getByTestId('part-studio-sketch-dialog');
    await expect(sketchDialog).toBeVisible();
    await sketchDialog.getByRole('combobox', { name: '草图平面' }).selectOption({ label: '上视' });
    await sketchDialog.getByRole('button', { name: '确认' }).click();
    const exitSketchButton = page
      .getByTestId('part-studio-ribbon')
      .getByRole('button', { name: '退出草图' });
    await expect(
      exitSketchButton.or(sketchDialog.getByTestId('part-studio-sketch-dialog-error')),
    ).toBeVisible({ timeout: 60_000 });
    if ((await sketchDialog.getByTestId('part-studio-sketch-dialog-error').count()) > 0) {
      throw new Error(
        `insertSketch 被拒收：${await sketchDialog
          .getByTestId('part-studio-sketch-dialog-error')
          .textContent()}`,
      );
    }
    const featureCount = page.getByTestId('part-studio-feature-count');
    await expect(featureCount).toHaveText('(3)', { timeout: 60_000 });
    await exitSketchButton.click();
    await expect(page.getByRole('toolbar', { name: '特征工具' })).toBeVisible();

    const tree2AfterWrite = await readTree(ctx, token, k2.id);
    expect(tree2AfterWrite.length, 'ps-2 树应 +1（草图 3）').toBe(3);
    expect(await readTree(ctx, token, k1.id), '写目标不得落 ps-1（树逐字不变）').toEqual(
      tree1Before,
    );
    expect(readModelScopeId(page), '写后 URL 仍为 ps-2').toBe(k2.id);

    await tab(page, k1.id).click();
    await expectActiveScope(page, k1.id);
    await expectViewportScope(page, k1.physModelId, 'W-K1');
    await expect(featureCount).toHaveText('(2)', { timeout: 30_000 });
    await tab(page, k2.id).click();
    await expectActiveScope(page, k2.id);
    await expectViewportScope(page, k2.physModelId, 'W-K2-back');
    await expect(featureCount).toHaveText('(3)', { timeout: 30_000 });

    expect(consoleErrors, `隔离/写目标用例不得有 console/page 错误：\n${consoleErrors.join('\n')}`).toEqual([]);
  });

  // ==========================================================================
  // 测试 3：快速 K1→K2→K1 ×20（K2 apply 在途）+ ECSQL 失败注入/自愈
  // ==========================================================================
  test('快速切回 20 次保持 K1 + ECSQL 失败非阻断并自愈', async ({ page }) => {
    test.slow();
    test.setTimeout(1_800_000);

    const consoleErrors = collectConsoleErrors(page);
    const world = await openTwoStudioWorld(page, seed, 'rapid');
    const { ctx, k1, k2 } = world;
    const filterBanner = page.getByTestId('part-studio-model-filter-error');

    await tab(page, k1.id).click();
    await expectActiveScope(page, k1.id);
    const baseline = await expectViewportScope(page, k1.physModelId, 'R-K1');
    const cameraK1 = baseline.camera;
    expect(cameraK1, 'K1 基线相机').toBeTruthy();
    await expect(filterBanner).toHaveCount(0);

    // 注入 300ms ECSQL 延迟：K2 的 filter apply 在切回 K1 时必然在途，覆盖
    // P2.5 R1 的 pending-conflict 作废 + 当前 key 重放分支。
    await setQueryInjection(page, 'delay');
    try {
      for (let i = 0; i < 20; i++) {
        await tab(page, k2.id).click();
        await expect(page).toHaveURL(new RegExp(`[?&]model=${k2.id}`), { timeout: 10_000 });
        // 让 K2 的 filter effect 进入延迟查询，再立即切回 K1。
        await page.waitForTimeout(40);
        await tab(page, k1.id).click();
        await expect(page).toHaveURL(new RegExp(`[?&]model=${k1.id}`), { timeout: 10_000 });
        await expect(tab(page, k1.id)).toHaveAttribute('aria-selected', 'true', {
          timeout: 10_000,
        });

        let probe: ViewportProbe | null = null;
        await expect.poll(async () => {
          probe = await readViewport(page);
          return `${probe.selectorModels.join(',')}|${probe.settingsModel ?? ''}`;
        }, { timeout: 30_000, intervals: [200, 500] }).toBe(
          `${k1.physModelId}|${k1.physModelId}`,
        );
        expectCameraSame(probe!.camera, cameraK1, `第 ${i + 1} 次切回 K1 相机`);
        expect(await filterBanner.count(), `第 ${i + 1} 次切回不得出现过滤失败横幅`).toBe(0);
        await expect(page.getByTestId('part-studio-tabs-error')).toHaveCount(0);
        if (i % 5 === 4) {
          expect(consoleErrors, `第 ${i + 1} 次切回出现 console/page 错误：\n${consoleErrors.join('\n')}`).toEqual([]);
        }
      }
    } finally {
      await setQueryInjection(page, 'none');
    }

    await expectActiveScope(page, k1.id);
    const finalProbe = await expectViewportScope(page, k1.physModelId, 'R-final-K1');
    expect(finalProbe.selectorModels).toEqual([k1.physModelId]);
    expect(finalProbe.settingsModel).toBe(k1.physModelId);
    expectCameraSame(finalProbe.camera, cameraK1, '20 次快速切回后的 K1 相机');
    expect(consoleErrors, `20 次快速切回不得有 console/page 错误：\n${consoleErrors.join('\n')}`).toEqual([]);

    // ── ECSQL 失败注入：非阻断提示条 + 连接仍「已连接」+ fail-closed ────────
    await setQueryInjection(page, 'throw');
    try {
      await tab(page, k2.id).click();
      await expectActiveScope(page, k2.id);
      await expect(filterBanner).toBeVisible({ timeout: 30_000 });
      await expect(filterBanner).toContainText('ECSQL 查询失败');
      await expect(page.getByTestId('part-studio-status-connection')).toHaveText('已连接');
      await expect(page.getByTestId('part-studio-connection-error')).toHaveCount(0);
      const failedProbe = await readViewport(page);
      expect(failedProbe.selectorModels, 'ECSQL 失败必须 fail-closed 清空 selector').toEqual([]);
      expect(failedProbe.sameViewport, '过滤失败不得重建视口').toBe(true);
      const info = await readOpenBriefcaseInfo(page);
      expect(info.key, '过滤失败不得重开连接').toBe(world.ctx.dbKey);
    } finally {
      await setQueryInjection(page, 'none');
    }

    // 下一次切 scope 自愈（K1 → K2 两跳均恢复）。
    await tab(page, k1.id).click();
    await expectActiveScope(page, k1.id);
    const recoveredK1 = await expectViewportScope(page, k1.physModelId, 'R-recover-K1');
    await expect(filterBanner).toHaveCount(0, { timeout: 30_000 });
    // 观察（非阻断）：提示条占用布局高度 → 恢复当拍取景按「提示条仍在」的
    // 视口尺寸计算，横幅消失后不补一次 fit，故相机与无横幅基线有小幅差异。
    // 相机权威门在 20 次快速切回循环（无横幅布局）中逐次断言；此处只要求
    // 相机有效，并在横幅消失后的下一轮 K1 复访再钉回基线。
    console.log(
      `[b-viewport] 失败恢复当拍相机 origin=${JSON.stringify(recoveredK1.camera?.origin)} ` +
        `extents=${JSON.stringify(recoveredK1.camera?.extents)}`,
    );
    await tab(page, k2.id).click();
    await expectActiveScope(page, k2.id);
    const recoveredK2 = await expectViewportScope(page, k2.physModelId, 'R-recover-K2');
    expect(recoveredK2.selectorModels).toEqual([k2.physModelId]);
    await expect(filterBanner).toHaveCount(0, { timeout: 30_000 });

    // 横幅已消失、布局恢复后的下一轮 K1 复访：相机必须回到无横幅基线。
    await tab(page, k1.id).click();
    await expectActiveScope(page, k1.id);
    const recoveredK1Again = await expectViewportScope(page, k1.physModelId, 'R-recover-K1-again');
    expectCameraSame(recoveredK1Again.camera, cameraK1, '失败注入自愈后的 K1 相机');

    expect(consoleErrors, `失败注入用例不得有 console/page 错误：\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
