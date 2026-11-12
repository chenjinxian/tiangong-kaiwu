// src/modules/part-studio/test/PartStudioPage.test.tsx
//
// M3 Task 3 结构断言（brief Step 1）+ M4 Task 2 连接/视口组合接线：
// /documents/:iTwinId/:iModelId Part Studio 编辑器布局壳五区存在性验收（对齐
// os-11）——
//  1) 顶栏（part-studio-top-bar）：面包屑 文档 → iTwin 名 → iModel 名 + 分支
//     徽标（Main）+ 分享钮 + 用户菜单 + 帮助钮；
//  2) 左栏（part-studio-sidebar）：竖图标条（part-studio-icon-rail）+ 双段树
//     （特征段 / 零件段，段头可收起、点击写 store tree.activeTab）；
//  3) 画布（part-studio-canvas）：viewport 挂载点（part-studio-viewport）；
//  4) 右停靠（part-studio-dock）：工具设置 / 版本历史 / 显示设置三页签——
//     点击写 store dock.activeTab 并展开占位内容，再点活动页签收合；
//  5) 底部页签条（part-studio-tab-strip）：适应视图钮 + 「+」（T7 开页签
//     管理器）+ 活动页签「Part Studio 1」+ 状态栏（连接态/编辑模式/单位/视图类型）。
// M4 Task 2（连接/视口相位锚点）——
//  6) useBriefcaseConnection 以路由 ids + viewOnly 调用（readonly=viewOnly）；
//     connection 下传 useViewport.iModel；viewport 下传画布（data-viewport-ready）；
//  7) 底色接线：viewport 就位即按 data-theme 应用（缺省 light）+ MutationObserver
//     跟随 dark/light 切换。
// M5 Task 2（连接失败 UX 批）——
//  8) 连接相位呈现（briefcase isLoading/error 此前零消费，M4 终审 T2-②）：
//     下载中 → 状态栏「正在打开文档…」+ 画布骨架覆盖层；失败 → 画布错误面
//     （error.message 透传）+ 状态栏连接失败 + 诚实重试路径（无假重试钮）；
//  9) T7-② 推送对话框断连兜底：对话框开着时连接消失 → 收合且 notifications
//     toast 说明（不无声消失）。
// M5 Task 3（权限判定接线批）——
//  10) 权限门：usePermissions 加载中传 null options 关闭连接（旧应用竞态
//      教训——首开定读写，权限未落定早开=恒只读），落定后以合流 readonly
//     （viewOnly ∨ 权限只读）开；权限只读时编辑面整体收口（编辑作用域不
//      进入 + 推送入口拦截）。
// M5 发布窗（B2 只读写门禁批）——
//  11) 权限只读下写面对话框提交面关死（canEdit 单点下传 Canvas→FeatureDialog，
//      ✓ 禁用+只读提示，零 op/零租约 IPC——不进租约获取等待环）。
//
// 定位：五区结构存在性 + store 接线验收层；mock 口径与 document-details 结构
// 测试一致——真实 store/hooks 参与，客户端（ItwinsClient / ImodelsClient /
// AuthSession）与 viewer（useViewport/useBriefcaseConnection/
// applyViewportBackground）模块级 mock（零真实请求/零查看器）。

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Matrix3d } from '@itwin/core-geometry';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  itwinsGet: vi.fn(),
  itwinsUpdate: vi.fn(),
  imodelsGet: vi.fn(),
  imodelsList: vi.fn(),
  // M4-T7：版本历史数据源（dock 真面板的查询通道）。
  imodelsListChangesets: vi.fn(),
  // B-model P0 Task 5：Named Version 通道（顶栏保存版本 + dock 命名版本列表）。
  imodelsCreateNamedVersion: vi.fn(),
  imodelsListNamedVersions: vi.fn(),
  // M5-T3：iModel 级我的权限查询（briefcase readonly 合流的数据源）。
  accessControlGetMyPermissions: vi.fn(),
  // P2.4 F2：iTwin 级权限（分享管理门源，与 iModel 权限分离）。
  accessControlGetITwinPermissions: vi.fn(),
}));

const viewerMocks = vi.hoisted(() => ({
  useViewport: vi.fn(),
  useBriefcaseConnection: vi.fn(),
  applyViewportBackground: vi.fn(),
  ensureEditTools: vi.fn().mockResolvedValue(undefined),
  toggleProjectExtents: vi.fn(),
}));

// M4-T3 编排错误面：IModelApp 可观测替身——未 startup 的真实 IModelApp 缺
// notifications/toolAdmin（waitForToolAdmin 会白等 5s），此处钉就绪态 +
// outputMessage 捕获；类与常量（NotifyMessageDetails/OutputMessagePriority/
// StandardViewId/EmphasizeElements…）走真实模块。
const coreFrontendMocks = vi.hoisted(() => ({
  outputMessage: vi.fn(),
  // M4-T4：undo/redo 走 IModelApp.tools.run('Undo'/'Redo')（viewer 内置在册）。
  toolsRun: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
  // M6-a T5：草图绘制工具注册面（registerSketchTools 经 initTools 懒引注册）。
  toolsRegister: vi.fn(),
}));

vi.mock('@itwin/core-frontend', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    IModelApp: {
      ...(actual.IModelApp as object),
      initialized: true,
      toolAdmin: { startDefaultTool: vi.fn() },
      viewManager: { selectedView: undefined },
      notifications: { outputMessage: coreFrontendMocks.outputMessage },
      tools: { run: coreFrontendMocks.toolsRun, register: coreFrontendMocks.toolsRegister },
    },
  };
});

vi.mock('@clients/itwins/ItwinsClient.js', () => ({
  ItwinsClient: class {
    get = mocks.itwinsGet;
    list = vi.fn();
    create = vi.fn();
    update = mocks.itwinsUpdate;
    delete = vi.fn();
    listFavorites = vi.fn();
    listRecents = vi.fn();
  },
}));

vi.mock('@clients/imodels/ImodelsClient.js', () => ({
  ImodelsClient: class {
    get = mocks.imodelsGet;
    list = mocks.imodelsList;
    listChangesets = mocks.imodelsListChangesets;
    createNamedVersion = mocks.imodelsCreateNamedVersion;
    listNamedVersions = mocks.imodelsListNamedVersions;
    create = vi.fn();
    delete = vi.fn();
  },
}));

// M5-T3：权限判定数据层替身（缺省=创建者权限组，editable——既有用例的
// 「briefcase 可写打开」前提；权限门用例在用例内改写）。
vi.mock('@clients/access-control/AccessControlClient.js', () => ({
  AccessControlClient: class {
    getMyIModelPermissions = mocks.accessControlGetMyPermissions;
    getITwinPermissions = mocks.accessControlGetITwinPermissions;
  },
}));

// P2.4 F2：分享对话框注入面可观测（B/A 文档身份 + 门源），网络面不属页面测试。
vi.mock('@modules/documents', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    ShareDocumentDialog: (props: {
      doc: { id: string; mode: string; projectId: string } | null;
      imodelId?: string | null;
      canManageShare?: boolean;
      isOpen: boolean;
    }) =>
      props.isOpen
        ? React.createElement('div', {
            'data-testid': 'share-dialog-stub',
            'data-doc-id': props.doc?.id,
            'data-mode': props.doc?.mode,
            'data-project-id': props.doc?.projectId,
            'data-imodel-id': props.imodelId ?? '',
            'data-can-manage': String(props.canManageShare ?? false),
          })
        : null,
  };
});

vi.mock('@clients/auth/AuthSession.js', () => ({
  AuthSession: {
    getStoredAuth: vi.fn().mockReturnValue({
      accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 999_999,
      user: { id: 'user-9', email: 'alan@example.com', name: 'Alan Chen' },
    }),
    logout: vi.fn().mockResolvedValue(undefined),
    getValidAccessToken: vi.fn().mockResolvedValue('tok'),
  },
}));

// M4-T6：Session 内层挂 useFeatureSystem——RPC 面替身（空树/租约可得），
// 隔离真实 LubanFeatureRpcInterface 的注册态依赖；hoisted 便于接线断言。
// M6-a T6 增 getSketch：FeatureDialog 拉伸草图通道的面域读面（选中草图后直调）。
const featureRpc = vi.hoisted(() => ({
  // 返回型放宽为 unknown 形（hoisted 块内不做契约型标注——mockResolvedValue
  // 注入树/草图替身时以 unknown 进出，消费方类型由真实 interface 契约保证）。
  getFeatureTree: vi.fn(async (_key: string): Promise<unknown[]> => []),
  // B6 M-A3.2a：body 读面（缺省空集；I1 用例覆写为初次失败）。
  getBodies: vi.fn(async (_key: string): Promise<unknown[]> => []),
  applyFeatureOp: vi.fn(
    async (_key: string, _op: unknown, _sessionId: string, _partStudioId?: string): Promise<{ ok: boolean; featureId?: string }> =>
      ({ ok: true, featureId: 'f-new' }),
  ),
  acquireWriteLease: vi.fn(async (_key: string, _sessionId: string) => ({ ok: true, holder: 'tester' })),
  releaseWriteLease: vi.fn(async (_key: string, _sessionId: string) => undefined),
  getSketch: vi.fn(async (_key: string, _sketchId: string): Promise<unknown> => undefined),
  // B-model P2.4：注册表（usePartStudios——scope 解析/页签/写方法）。
  listPartStudios: vi.fn(async (_key: string): Promise<unknown[]> => []),
  createPartStudio: vi.fn(async (_key: string, _name: string, _sessionId: string): Promise<unknown> => undefined),
  renamePartStudio: vi.fn(async (_key: string, _id: string, _name: string, _sessionId: string): Promise<unknown> => undefined),
  deletePartStudio: vi.fn(async (_key: string, _id: string, _sessionId: string): Promise<void> => undefined),
}));

vi.mock('@luban-cad/shared', async (importOriginal) => ({
  // ADR-0017：display-actions 消费 shared RENDER_DEFAULTS/rgbToHex；保留真实导出，
  // 只覆盖测试锚点。
  ...(await importOriginal<typeof import('@luban-cad/shared')>()),
  LUBAN_INIT_TXN_DESCRIPTION: 'partstudio init',
  LubanFeatureRpcInterface: {
    getClient: () => featureRpc,
  },
}));

// 2026-11-03：默认 Onshape 选择工具生命周期替身——真实 hook 依赖 ToolAdmin
// 的 activeToolChanged 事件面（本文件 IModelApp 桩不提供）；调用形状在此断言。
const onshapeSelectionMock = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useOnshapeSelection.js', () => ({
  useOnshapeSelection: onshapeSelectionMock,
}));

// 结构测试零查看器启动：useViewport 钉 ready 相位 + 假 viewport 实例、
// useBriefcaseConnection 钉就绪连接（状态栏「已连接」与 M4-T2 接线断言依赖）。
vi.mock('@luban-cad/viewer', () => ({
  useViewport: viewerMocks.useViewport,
  useBriefcaseConnection: viewerMocks.useBriefcaseConnection,
  applyViewportBackground: viewerMocks.applyViewportBackground,
  ensureEditTools: viewerMocks.ensureEditTools,
  toggleProjectExtents: viewerMocks.toggleProjectExtents,
  fitViewToModelRanges: vi.fn().mockResolvedValue(true),
  queryAllPhysicalModelIds: vi.fn().mockResolvedValue([]),
  DatumPlanesDecoration: class {
    constructor() { /* noop */ }
    setVisibility() { /* noop */ }
    dispose() { /* noop */ }
  },
  SketchCurvesDecoration: class {
    constructor() { /* noop */ }
    setPolylines() { /* noop */ }
    dispose() { /* noop */ }
  },
  SketchDimensionsDecoration: class {
    constructor() { /* noop */ }
    setAnnotations() { /* noop */ }
    dispose() { /* noop */ }
  },
  BrepTopologyDecoration: class {
    constructor() { /* noop */ }
    setTopology() { /* noop */ }
    setOptions() { /* noop */ }
    dispose() { /* noop */ }
  },
  acquireViewer: vi.fn().mockResolvedValue(undefined),
  releaseViewer: vi.fn().mockResolvedValue(undefined),
  ensureAccuSnap: vi.fn().mockResolvedValue(undefined),
}));

import { usePartStudioStore } from '../index.js';
import { PartStudioPage } from '../PartStudioPage.js';
// review-8 I-2：useViewport.notifications 注入断言的数据面（app 生命期单例）。
import { viewerNotifications } from '@app/providers/ViewerNotifications.js';
// M4-T8：超时用例需在 mock 对象上改写 initialized（importOriginal 摊平的
// 同一实例——vi.mock 工厂与测试文件共享模块图）。
import { IModelApp } from '@itwin/core-frontend';

// B-model P2.4：默认夹具 = B 项目（marker data.luban.modelMode='B'）——编辑链
// 仅在 B 文档开放（A 旧文档只读）；A 专用用例经 renderAPage 覆写标记。
const ITWIN_DETAIL = {
  id: 'itwin-1',
  displayName: '演示文档',
  status: 'Active',
  data: { luban: { modelMode: 'B', schemaVersion: 1 } },
};

const A_ITWIN_DETAIL = { id: 'itwin-1', displayName: '演示文档', status: 'Active' };

const STUDIO_1 = {
  id: 'ps-1',
  name: 'Part Studio 1',
  order: 1,
  defModelId: 'def-1',
  physModelId: 'phys-1',
};

const IMODEL_DETAIL = {
  id: 'im-1',
  displayName: '楼层模型',
  name: '楼层模型',
  iTwinId: 'itwin-1',
};

// M4-T4 起连接替身需承载编辑作用域/事务桩（useEditingScope/useUndoRedo/
// editorToolSettings 配置段全链真实参与）；M4-T6 起另承载特征系统面：
//  - txns 事件桩 = BeEvent 兼容最小面（addListener 返回退订 + raise 直发）；
//    onModelGeometryChanged 供 useFeatureDisplaySync 订阅；
//  - editingScope/supportsGraphicalEditing/enterEditingScope 供作用域进入路径；
//  - saveChanges 供顶栏保存代理断言；editorToolSettings 供类目/模型补全断言；
//  - createQueryReader 供 FeatureTree 零件段物理元素查询（空集游标）。
function makeTxnsStub() {
  const makeEvent = () => {
    const listeners = new Set<() => void>();
    return {
      // BeEvent 兼容双面：addListener 返回退订（useFeatureDisplaySync 消费）、
      // removeListener 显式移除（useFeatureSystem 退订）。
      addListener: (fn: () => void): (() => void) => {
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
        };
      },
      removeListener: (fn: () => void): void => {
        listeners.delete(fn);
      },
      raise: (): void => {
        for (const fn of [...listeners]) fn();
      },
    };
  };
  return {
    isUndoPossible: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
    getUndoString: vi.fn<() => Promise<string>>().mockResolvedValue('feature op: insertFeature'),
    isRedoPossible: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
    hasPendingTxns: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
    onCommit: makeEvent(),
    onCommitted: makeEvent(),
    onAfterUndoRedo: makeEvent(),
    onChangesPushed: makeEvent(),
    onModelGeometryChanged: makeEvent(),
  };
}

// X-03：SelectionSet 最小桩（空 elements + BeEvent 兼容 onChanged）。选择权威
// 在 store.canvas.selection；本桩只承接单向投影（replace/emptyAll）与 F1 隔离断言。
// 本文件所有用例的 body 读面缺省空集、选择集缺省空 → 等值守卫不写 store。
function makeSelectionSetStub() {
  const listeners = new Set<() => void>();
  const raise = (): void => {
    for (const fn of [...listeners]) fn();
  };
  const elements = new Set<string>();
  return {
    elements,
    /** P2.5 F1：scope 切换/过滤落定后的选择集清空（真实 SelectionSet.emptyAll）。 */
    emptyAll: vi.fn((): void => {
      elements.clear();
      raise();
    }),
    /** 测试播种选择集（真实 SelectionSet.replace）。 */
    replace: vi.fn((ids: readonly string[]): void => {
      elements.clear();
      ids.forEach((id) => elements.add(id));
      raise();
    }),
    onChanged: {
      addListener: (fn: () => void): (() => void) => {
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
        };
      },
      removeListener: (fn: () => void): void => {
        listeners.delete(fn);
      },
      raise,
    },
  };
}

let FAKE_CONNECTION = {
  key: 'briefcase-key',
  isReadonly: false,
  isBriefcaseConnection: () => true,
  txns: makeTxnsStub(),
  selectionSet: makeSelectionSetStub(),
  editingScope: undefined as unknown,
  supportsGraphicalEditing: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
  enterEditingScope: vi.fn(),
  saveChanges: vi.fn<(description?: string) => Promise<void>>().mockResolvedValue(undefined),
  // M4-T7：推送代理 + 当前版本标记数据源（dock 历史面板比对）。
  pushChanges: vi.fn<(description: string) => Promise<{ id: string; index: number }>>()
    .mockResolvedValue({ id: 'cs-new', index: 3 }),
  changeset: { id: 'cs-2', index: 2 },
  editorToolSettings: { category: undefined, model: undefined },
  // M5-T1（D-T9-4 层2）：useFeatureDisplaySync 的 undo/redo 全量失效扫
  // connection.tiles（可迭代；空集=零 extant tree）。
  tiles: [],
  // 零件段查询替身：空集（异步可迭代）。
  createQueryReader: () => (async function* () { /* 空集 */ })(),
};

const FAKE_VIEWPORT = {
  viewFlags: { toJSON: () => ({}) },
  antialiasSamples: 1,
  turnCameraOn: vi.fn(),
  turnCameraOff: vi.fn(),
  synchWithView: vi.fn(),
  view: {
    displayStyle: {
      backgroundColor: undefined,
      settings: {
        modelAppearanceOverrides: new Map(),
        overrideModelAppearance: vi.fn(),
        dropModelAppearanceOverride: vi.fn(),
      },
    },
    viewsCategory: vi.fn<() => boolean>().mockReturnValue(true),
    viewsModel: vi.fn<() => boolean>().mockReturnValue(true),
    is2d: vi.fn<() => boolean>().mockReturnValue(false),
    isSpatialView: vi.fn<() => boolean>().mockReturnValue(false),
    categorySelector: { categories: ['cat-1', 'cat-2'] },
    modelSelector: { models: ['model-1'] },
    getRotation: () => Matrix3d.createIdentity(),
  },
  onViewChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  invalidateScene: vi.fn(),
  // B6 M-A3.2a I3：FeatureTree consumed 隐藏 effect 经真 viewport 下传后触达
  // EmphasizeElements 的 provider 注册面（桩必须可被 getOrCreate 注册）。
  findFeatureOverrideProviderOfType: vi.fn(() => undefined),
  addFeatureOverrideProvider: vi.fn(),
};

/** store 复位：八切片回缺省（结构用例间互不渗漏）。 */
function resetStore(): void {
  usePartStudioStore.setState({
    tree: { activeTab: 'features', selectedNodeIds: [], expandedNodeIds: [] },
    dock: { activeTab: 'toolSettings', isOpen: false },
    tool: { activeToolId: null },
    sketch: { isActive: false, activeSketchId: null, activeSketchPlane: null },
    commandPalette: { isOpen: false, query: '', highlightEnabled: true },
    canvas: { selection: [], hiddenIds: [] },
    dialog: { active: null },
    viewOnly: { isActive: false },
    datum: {
      visibility: { origin: true, top: true, front: true, right: true },
      visibilityOverrides: {},
      expanded: true,
      selectedId: null,
    },
  });
}

/** 路由探针（P2.4：页签切换/默认创建只换 URL 的断言面）。 */
function LocationProbe(): React.JSX.Element {
  const location = useLocation();
  const navigationType = useNavigationType();
  return (
    <>
      <output data-testid="location-probe">{`${location.pathname}${location.search}`}</output>
      <output data-testid="navigation-type">{navigationType}</output>
    </>
  );
}

function pageTree(entry = '/documents/itwin-1/im-1?model=ps-1', strict = false): React.JSX.Element {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/documents/:iTwinId/:iModelId" element={<PartStudioPage />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return strict ? <React.StrictMode>{tree}</React.StrictMode> : tree;
}

function renderPage(entry?: string): ReturnType<typeof render> {
  return render(pageTree(entry));
}

/** R2：dev 真栈形态（main.tsx 以 StrictMode 包壳）——双挂载哨兵回归面。 */
function renderPageStrict(entry?: string): ReturnType<typeof render> {
  return render(pageTree(entry, true));
}

/** A 旧文档页（无 marker）：只读面用例。 */
function renderAPage(entry = '/documents/itwin-1/im-1'): ReturnType<typeof render> {
  mocks.itwinsGet.mockResolvedValue(A_ITWIN_DETAIL);
  return render(pageTree(entry));
}

/**
 * B 页 + 等 scope 解析落定（编辑面开放 = 顶栏「保存版本」钮可用）。
 * P2.4 起 canEdit 需 marker→list→scope ready 三跳，编辑交互用例先等门开。
 */
async function renderReadyPage(entry?: string): Promise<ReturnType<typeof render>> {
  const rendered = renderPage(entry);
  await waitFor(() => {
    const save = screen.getByTestId('part-studio-panel-rail-create-version') as HTMLButtonElement;
    expect(save.disabled === false && save.getAttribute('aria-disabled') !== 'true').toBe(true);
  }, { timeout: 10_000 });
  return rendered;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  mocks.itwinsGet.mockResolvedValue(ITWIN_DETAIL);
  mocks.imodelsGet.mockResolvedValue(IMODEL_DETAIL);
  // 注册表替身复位：clearAllMocks 不清 once 队列——上一用例未消费的
  // mockResolvedValueOnce 会串场（StrictMode 用例曾因此多计一次 create）。
  featureRpc.listPartStudios.mockReset();
  featureRpc.createPartStudio.mockReset();
  featureRpc.renamePartStudio.mockReset();
  featureRpc.deletePartStudio.mockReset();
  featureRpc.deletePartStudio.mockResolvedValue(undefined);
  // B 文档注册表：缺省一个完整 scope（URL ?model=ps-1 命中 → scope ready）。
  featureRpc.listPartStudios.mockResolvedValue([STUDIO_1]);
  // T7 页签管理器（底部「+」开合）：列表查询零真实请求。
  mocks.imodelsList.mockResolvedValue([IMODEL_DETAIL]);
  // M4-T7：dock 版本历史查询零真实请求（页面级测试默认空集）。
  mocks.imodelsListChangesets.mockResolvedValue([]);
  // B-model P0 Task 5：Named Version 通道零真实请求（默认空列表/成功创建）。
  mocks.imodelsListNamedVersions.mockResolvedValue([]);
  mocks.imodelsCreateNamedVersion.mockResolvedValue({ id: 'nv-new', name: 'NV', changesetId: 'cs-new' });
  // M5-T3：权限查询缺省=创建者权限组（editable）——既有用例的「briefcase
  // 可写打开」前提；权限门/合流用例在用例内改写返回值。
  mocks.accessControlGetMyPermissions.mockResolvedValue([
    'imodels_webview',
    'imodels_read',
    'imodels_write',
  ]);
  // P2.4 F2：iTwin 权限缺省=管理员（分享门开；与 iModel 写权限互不替代）。
  mocks.accessControlGetITwinPermissions.mockResolvedValue([
    'imodels_manage',
    'imodels_webview',
  ]);
  // M4-T3：注册编排桩复位（mockReset 清实现，重挂成功缺省）。
  viewerMocks.ensureEditTools.mockReset().mockResolvedValue(undefined);
  // M4-T4：连接替身桩复位（作用域进入成功路径 + 干净事务态）。exit 按真实
  // 契约回 Promise（卸载退出链 .catch 依赖）。
  // P2.5：editorToolSettings 是可变桩对象——跨用例复位，防上一用例写入的
  // model/category 值渗漏（clearAllMocks 不还原属性值）。
  FAKE_CONNECTION.editorToolSettings = { category: undefined, model: undefined };
  // P2.5 F1：选择集是共享可变桩——跨用例清空，防播种残留。
  FAKE_CONNECTION.selectionSet.elements.clear();
  FAKE_CONNECTION.supportsGraphicalEditing.mockResolvedValue(true);
  FAKE_CONNECTION.enterEditingScope.mockResolvedValue({
    isDisposed: false,
    exit: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  });
  FAKE_CONNECTION.saveChanges.mockResolvedValue(undefined);
  FAKE_CONNECTION.txns.isUndoPossible.mockResolvedValue(false);
  FAKE_CONNECTION.txns.isRedoPossible.mockResolvedValue(false);
  FAKE_CONNECTION.txns.hasPendingTxns.mockResolvedValue(false);
  // viewer mock 桩：连接就绪 + viewport 就位（M4-T2 接线断言的数据面）。
  viewerMocks.useBriefcaseConnection.mockReturnValue({
    connection: FAKE_CONNECTION,
    isLoading: false,
    error: null,
    saveChanges: vi.fn().mockResolvedValue(undefined),
    pushChanges: vi.fn().mockResolvedValue(undefined),
    pullChanges: vi.fn().mockResolvedValue(undefined),
  });
  viewerMocks.useViewport.mockReturnValue({
    viewportRef: { current: null },
    phase: 'ready',
    error: null,
    viewport: FAKE_VIEWPORT,
  });
  document.documentElement.removeAttribute('data-theme');
});

describe('PartStudioPage 结构断言（M3 Task 3，五区存在性）', () => {
  it('顶栏：面包屑 文档 → iTwin 名 → iModel 名 + 分支徽标 + 分享/用户菜单/帮助', async () => {
    renderPage();
    const topBar = screen.getByTestId('part-studio-top-bar');
    // 并行慢 worker 下 react-query 落位可超缺省 1s 窗（M6c-T5 登记 flake）——
    // 三个异步查找显式放大到 10s（确定性等待，非 sleep 竞速）。
    const slow = { timeout: 10_000 };
    expect(await screen.findByRole('button', { name: '文档' }, slow)).toBeDefined();
    expect(await screen.findByRole('button', { name: '演示文档' }, slow)).toBeDefined();
    expect(await screen.findByRole('button', { name: '楼层模型' }, slow)).toBeDefined();
    expect(within(topBar).getByText('Main')).toBeDefined();
    expect(within(topBar).getByRole('button', { name: '分享' })).toBeDefined();
    expect(within(topBar).getByRole('button', { name: '用户菜单' })).toBeDefined();
    expect(within(topBar).getByRole('button', { name: '帮助' })).toBeDefined();
  });

  it('左栏：Onshape 40px 面板选择条 + 双段树（特征段 / 零件段；M4-T6 真数据源接线）', async () => {
    renderPage();
    // 2026-11-02 Onshape live：类别窄条退役，改为文档级 7 钮面板选择条。
    const rail = screen.getByTestId('part-studio-panel-rail');
    expect(within(rail).getByTestId('part-studio-panel-rail-history')).toBeDefined();
    expect(within(rail).getByTestId('part-studio-panel-rail-create-version')).toBeDefined();

    const tree = screen.getByTestId('part-studio-tree');
    expect(within(tree).getByTestId('part-studio-feature-section-header')).toBeDefined();
    expect(within(tree).getByTestId('part-studio-feature-list')).toBeDefined();
    expect(within(tree).getByTestId('part-studio-part-section-header')).toBeDefined();
    // 空数据落定后：特征段仍有 Onshape 默认几何图元组；零件段 empty。
    // 读树/零件段查询异步，先过 loading 骨架。
    expect(await within(tree).findByTestId('tree-datum-group')).toBeDefined();
    expect(await within(tree).findByTestId('tree-row-datum-origin')).toBeDefined();
    // Onshape live：零件数 (0) 下不显示「暂无零件」占位行。
    expect(within(tree).queryByText('暂无零件')).toBeNull();
  });

  it('双段树：段头点击收起列表并写 store tree.activeTab', async () => {
    const user = userEvent.setup();
    renderPage();
    const featuresHeader = within(screen.getByTestId('part-studio-tree')).getByTestId('part-studio-feature-section-header');
    expect(featuresHeader.getAttribute('aria-expanded')).toBe('true');
    await user.click(featuresHeader);
    expect(featuresHeader.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('part-studio-feature-list')).toBeNull();
    expect(usePartStudioStore.getState().tree.activeTab).toBe('features');
    await user.click(within(screen.getByTestId('part-studio-tree')).getByTestId('part-studio-part-section-header'));
    expect(usePartStudioStore.getState().tree.activeTab).toBe('parts');
    expect(screen.queryByTestId('part-studio-part-list')).toBeNull();
  });

  it('画布：part-studio-canvas 锚点 + viewport 挂载点', () => {
    renderPage();
    const canvas = screen.getByTestId('part-studio-canvas');
    expect(within(canvas).getByTestId('part-studio-viewport')).toBeDefined();
  });

  it('右缘 5 钮（Onshape live）：外观接显示面板，再点收合；其余占位无动作', async () => {
    const user = userEvent.setup();
    renderPage();
    const dock = screen.getByTestId('part-studio-dock');
    for (const id of ['appearances', 'configurations', 'featurescript-table', 'model-based-definition', 'variable-table']) {
      expect(within(dock).getByTestId(`part-studio-dock-tab-${id}`)).toBeDefined();
    }

    // 外观钮：展开显示设置面板。
    await user.click(within(dock).getByTestId('part-studio-dock-tab-appearances'));
    expect(usePartStudioStore.getState().dock.activeTab).toBe('display');
    expect(usePartStudioStore.getState().dock.isOpen).toBe(true);
    expect(within(dock).getByTestId('part-studio-dock-body')).toBeDefined();
    // 再点活动钮：收合。
    await user.click(within(dock).getByTestId('part-studio-dock-tab-appearances'));
    expect(usePartStudioStore.getState().dock.isOpen).toBe(false);
    expect(within(dock).queryByTestId('part-studio-dock-body')).toBeNull();
    // 占位钮点击不改变 dock 状态（UI 保留，行为未实现）。
    await user.click(within(dock).getByTestId('part-studio-dock-tab-configurations'));
    expect(usePartStudioStore.getState().dock.isOpen).toBe(false);
  });

  it('左缘历史钮：点击展开版本历史面板', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByTestId('part-studio-panel-rail-history'));
    expect(usePartStudioStore.getState().dock.activeTab).toBe('history');
    expect(usePartStudioStore.getState().dock.isOpen).toBe(true);
    expect(within(screen.getByTestId('part-studio-dock')).getByTestId('part-studio-dock-body')).toBeDefined();
  });

  it('页签条（P2.4/Stage C）：活动页签=注册表 scope；「插入新页签→创建 Part Studio」自动命名并导航', async () => {
    const user = userEvent.setup();
    const created = {
      id: 'ps-new', name: 'Part Studio 2', order: 2, defModelId: 'def-2', physModelId: 'phys-2',
    };
    featureRpc.createPartStudio.mockResolvedValueOnce(created);
    // 写后 refresh 返回含新 scope 的权威列表（真栈语义）。
    featureRpc.listPartStudios.mockResolvedValue([STUDIO_1, created]);
    await renderReadyPage();
    const strip = screen.getByTestId('part-studio-tab-strip');
    // 活动页签来自注册表列表（?model=ps-1）。
    const activeTab = within(strip).getByRole('tab', { name: 'Part Studio 1' });
    expect(activeTab.getAttribute('aria-selected')).toBe('true');
    // 「+」= Onshape「插入新页签」菜单 → 创建 Part Studio（共享会话 + connection.key）；
    // 本测试的列表替身已同时返回 Part Studio 1 与 2 → 新自动名 = 未占用的
    // Part Studio 3，成功后换 URL。
    const newTabButton = within(strip).getByRole('button', { name: '插入新页签' });
    expect(newTabButton.getAttribute('aria-disabled')).not.toBe('true');
    await user.click(newTabButton);
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: '创建 Part Studio' }));
    expect(featureRpc.createPartStudio).toHaveBeenCalledWith(
      'briefcase-key',
      'Part Studio 3',
      expect.any(String),
    );
    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toContain('?model=ps-new'),
    );
    expect(within(strip).getByRole('tab', { name: 'Part Studio 2' }).getAttribute('aria-selected')).toBe('true');
  });

  it('多余状态栏已移除：仅保留隐藏连接态节点（e2e 就绪信号）', () => {
    renderPage();
    expect(screen.queryByTestId('part-studio-status-bar')).toBeNull();
    expect(screen.getByTestId('part-studio-status-connection').textContent).toBe('已连接');
  });
});

describe('M4-T2 连接/视口组合接线', () => {
  it('useBriefcaseConnection 以路由 ids + viewOnly 调用；connection 下传 useViewport.iModel', async () => {
    renderPage();
    // M5-T3 起权限落定前 options 为 null（权限门）——等权限查询落定后的
    // 选项形态（权限缺省替身=创建者权限组 editable）。
    await waitFor(() =>
      expect(viewerMocks.useBriefcaseConnection).toHaveBeenCalledWith({
        iTwinId: 'itwin-1',
        iModelId: 'im-1',
        readonly: false,
      }),
    );
    const lastViewportCall = viewerMocks.useViewport.mock.calls.at(-1);
    expect(lastViewportCall).toBeDefined();
    const viewportOptions = (lastViewportCall ?? [])[0] as { iModel: unknown; backendUrl: string; notifications: unknown };
    expect(viewportOptions.iModel).toBe(FAKE_CONNECTION);
    expect(viewportOptions.backendUrl).toBe(window.location.origin);
    // notifications 呈现桥注入（review-8 I-2）：官方注入点换掉 core 哑通道。
    expect(viewportOptions.notifications).toBe(viewerNotifications);
  });

  it('viewOnly 激活 → readonly 透传连接钩子（权限门合流：viewOnly ∨ 权限只读）', async () => {
    renderPage();
    // 权限落定（editable）且首开形态就位后再翻 viewOnly——首开定读写
    //（useBriefcaseConnection 打开 effect deps 不含 readonly）。
    await waitFor(() =>
      expect(viewerMocks.useBriefcaseConnection).toHaveBeenLastCalledWith({
        iTwinId: 'itwin-1',
        iModelId: 'im-1',
        readonly: false,
      }),
    );
    act(() => {
      usePartStudioStore.getState().setViewOnly(true);
    });
    expect(viewerMocks.useBriefcaseConnection).toHaveBeenLastCalledWith({
      iTwinId: 'itwin-1',
      iModelId: 'im-1',
      readonly: true,
    });
  });

  it('viewport 下传画布：part-studio-canvas data-viewport-ready=true', () => {
    renderPage();
    expect(screen.getByTestId('part-studio-canvas').getAttribute('data-viewport-ready')).toBe('true');
  });

  it('底色接线：viewport 就位即按 data-theme 应用（缺省 light；MutationObserver 跟随切换）', async () => {
    renderPage();
    expect(viewerMocks.applyViewportBackground).toHaveBeenCalledWith(FAKE_VIEWPORT, 'light');

    act(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await waitFor(() =>
      expect(viewerMocks.applyViewportBackground).toHaveBeenLastCalledWith(FAKE_VIEWPORT, 'dark'),
    );

    act(() => {
      document.documentElement.removeAttribute('data-theme');
    });
    await waitFor(() =>
      expect(viewerMocks.applyViewportBackground).toHaveBeenLastCalledWith(FAKE_VIEWPORT, 'light'),
    );
  });
});

// ── M5 Task 3（权限判定接线）────────────────────────────────────────────────
// 旧应用竞态教训（必须遵守）：权限解析前早开 briefcase → 首开定读写
//（useBriefcaseConnection 打开 effect deps 不含 readonly）→ 权限解析 editable
// 但连接恒只读 → 保存失败。接线裁决：权限 isLoading 期间传 null options 关闭
// 连接，权限落定后再以合流 readonly（viewOnly ∨ 权限只读）开。
describe('M5-T3 权限门（权限未载不开连接）+ briefcase readonly 三源合流', () => {
  it('权限加载中：useBriefcaseConnection 只收 null options（零 IPC 不早开，防旧竞态）', () => {
    // 恒挂起权限查询：整个用例生命期 isLoading 恒真。
    mocks.accessControlGetMyPermissions.mockReturnValue(new Promise<string[]>(() => {}));
    renderPage();

    // 出现过 null 门禁调用；从未以任何非空 options 调用（briefcase 未早开）。
    expect(viewerMocks.useBriefcaseConnection).toHaveBeenCalledWith(null);
    expect(viewerMocks.useBriefcaseConnection).not.toHaveBeenCalledWith(
      expect.objectContaining({ iTwinId: 'itwin-1' }),
    );
  });

  it('权限落定 editable：以 readonly:false 开连接（缺省可写语义不变）', async () => {
    mocks.accessControlGetMyPermissions.mockResolvedValue(['imodels_webview', 'imodels_write']);
    renderPage();
    await waitFor(() =>
      expect(viewerMocks.useBriefcaseConnection).toHaveBeenLastCalledWith({
        iTwinId: 'itwin-1',
        iModelId: 'im-1',
        readonly: false,
      }),
    );
  });

  it('权限落定 readonly（仅 webview）：viewOnly=false 仍以 readonly:true 开连接（权限只读合流）', async () => {
    mocks.accessControlGetMyPermissions.mockResolvedValue(['imodels_webview']);
    renderPage();
    await waitFor(() =>
      expect(viewerMocks.useBriefcaseConnection).toHaveBeenLastCalledWith({
        iTwinId: 'itwin-1',
        iModelId: 'im-1',
        readonly: true,
      }),
    );
  });

  it('viewOnly 与权限只读双活：单点合流仍 readonly:true（∨ 语义，不双开不冲突）', async () => {
    mocks.accessControlGetMyPermissions.mockResolvedValue(['imodels_webview']);
    act(() => {
      usePartStudioStore.getState().setViewOnly(true);
    });
    renderPage();
    await waitFor(() =>
      expect(viewerMocks.useBriefcaseConnection).toHaveBeenLastCalledWith({
        iTwinId: 'itwin-1',
        iModelId: 'im-1',
        readonly: true,
      }),
    );
  });

  it('权限只读落定：编辑面整体收口（编辑作用域不进入 + 推送对话框不开）', async () => {
    mocks.accessControlGetMyPermissions.mockResolvedValue(['imodels_webview']);
    renderPage();
    // 连接替身照常就绪（readonly 打开也会成功）——编辑面收口只由 canEdit 门驱动。
    await waitFor(() =>
      expect(viewerMocks.useBriefcaseConnection).toHaveBeenLastCalledWith(
        expect.objectContaining({ readonly: true }),
      ),
    );
    // readonly briefcase 无编辑面：编辑作用域不进入。
    expect(FAKE_CONNECTION.enterEditingScope).not.toHaveBeenCalled();

    // 推送入口（顶栏保存版本钮）被 canEdit 门拦截：有未推送变更也不开对话框。
    FAKE_CONNECTION.txns.hasPendingTxns.mockResolvedValue(true);
    act(() => {
      FAKE_CONNECTION.txns.onChangesPushed.raise();
    });
    const user = userEvent.setup();
    const save = screen.getByTestId('part-studio-panel-rail-create-version') as HTMLButtonElement;
    await user.click(save);
    expect(screen.queryByRole('dialog', { name: '创建来自 Main 的版本' })).toBeNull();
  });

  it('B2 只读写门禁（页级）：权限只读下拉伸对话框 ✓ 禁用+只读提示，提交不发起 op/租约', async () => {
    // B2 现场：E2E Seed 对测试账号仅 imodels_webview → readonly 连接 +
    // canEdit=false 单点下传 Canvas→FeatureDialog——提交入口被 UI 门拦死
    //（此前可开对话框并提交，卡进租约获取等待环 aria-busy 40-65s）。
    mocks.accessControlGetMyPermissions.mockResolvedValue(['imodels_webview']);
    renderPage();
    await waitFor(() =>
      expect(viewerMocks.useBriefcaseConnection).toHaveBeenLastCalledWith(
        expect.objectContaining({ readonly: true }),
      ),
    );
    // readonly 下特征系统租约生命周期不启动（enabled=isEditingScopeReady=false）。
    await waitFor(() => expect(featureRpc.getFeatureTree).toHaveBeenCalled());

    act(() => {
      usePartStudioStore.getState().openFeatureDialog({ mode: 'new', featureType: 'extrude' });
    });
    const dialog = await screen.findByTestId('part-studio-feature-dialog');
    expect(within(dialog).getByTestId('part-studio-feature-dialog-readonly-hint')).toBeDefined();
    // 租约警示不谎报（提交已禁用，「等待租约」不成立）。
    expect(within(dialog).queryByTestId('part-studio-feature-dialog-lease-warning')).toBeNull();
    expect((within(dialog).getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);

    const user = userEvent.setup();
    await user.click(within(dialog).getByRole('button', { name: '确认' }));
    expect(featureRpc.applyFeatureOp).not.toHaveBeenCalled();
    expect(featureRpc.acquireWriteLease).not.toHaveBeenCalled();
  });
});

describe('M4-T3 工具注册编排（Editor.tsx:262-309 序移植）', () => {
  it('phase ready → waitForToolAdmin 通过 → ensureEditTools 恰一次（幂等在 viewer flag）', async () => {
    renderPage();
    await waitFor(() => expect(viewerMocks.ensureEditTools).toHaveBeenCalledTimes(1));
  });

  it('phase 未就绪（starting）→ 不编排注册', () => {
    viewerMocks.useViewport.mockReturnValue({
      viewportRef: { current: null },
      phase: 'starting',
      error: null,
      viewport: undefined,
    });
    renderPage();
    expect(viewerMocks.ensureEditTools).not.toHaveBeenCalled();
  });

  it('注册失败 → IModelApp.notifications 错误可见（不静默吞，消息含原因）', async () => {
    viewerMocks.ensureEditTools.mockRejectedValueOnce(new Error('host not ready'));
    renderPage();

    await waitFor(() => expect(coreFrontendMocks.outputMessage).toHaveBeenCalledTimes(1));
    const details = coreFrontendMocks.outputMessage.mock.calls[0]?.[0] as { briefMessage: string } | undefined;
    expect(details?.briefMessage).toContain('工具注册失败');
    expect(details?.briefMessage).toContain('host not ready');
    // 失败不外抛（错误面消化后页面照常呈现）。
    expect(screen.getByTestId('part-studio-page')).toBeDefined();
  });
});

describe('M4-T4 编辑作用域 + 撤销/重做/保存顶栏接线', () => {
  it('编辑作用域进入：connection 就绪 → enterEditingScope 调用（Editor.tsx:322-371 序）', async () => {
    renderPage();
    await waitFor(() => expect(FAKE_CONNECTION.enterEditingScope).toHaveBeenCalledTimes(1));
    expect(FAKE_CONNECTION.supportsGraphicalEditing).toHaveBeenCalledTimes(1);
  });

  it('工具栏撤消/重做 + 左缘创建版本：干净事务态 undo/redo 禁用、创建版本可用；事件驱动可解锁', async () => {
    const user = userEvent.setup();
    renderPage();
    // iTwinUI v3 美观禁用口径：disabled 属性或 aria-disabled 均算禁用
    //（PartStudioTopBar.test 同款判定）。
    const isDisabled = (button: HTMLElement): boolean =>
      (button as HTMLButtonElement).disabled === true
      || button.getAttribute('aria-disabled') === 'true';
    const undo = screen.getByTestId('part-studio-ribbon-undo');
    const redo = screen.getByTestId('part-studio-ribbon-redo');
    const save = screen.getByTestId('part-studio-panel-rail-create-version');
    expect(isDisabled(undo)).toBe(true);
    expect(isDisabled(redo)).toBe(true);
    // B-model P0 Task 5：保存版本钮由 canSaveVersion 门驱动（canEdit ∧ 连接就绪）
    //——干净态也可命名当前 changeset，不再随 hasPendingTxns 回落禁用。权限查询
    // 落定前 canEdit 占位只读 → 等门开。
    await waitFor(() => expect(isDisabled(save)).toBe(false));

    // undo 可能 + 有未推送变更（txns 查询桩翻真）→ 事件驱动重查询后钮解锁。
    FAKE_CONNECTION.txns.isUndoPossible.mockResolvedValue(true);
    FAKE_CONNECTION.txns.hasPendingTxns.mockResolvedValue(true);
    act(() => {
      FAKE_CONNECTION.txns.onAfterUndoRedo.raise();
    });
    await waitFor(() => expect(isDisabled(undo)).toBe(false));
    await waitFor(() => expect(isDisabled(save)).toBe(false));

    await user.click(undo);
    expect(coreFrontendMocks.toolsRun).toHaveBeenCalledWith('Undo');
  });

  it('保存版本入口（B-model P0 Task 5）：点击开 Named Version 对话框，有未保存变更先 pushChanges 再以 changeset id 命名', async () => {
    const user = userEvent.setup();
    FAKE_CONNECTION.txns.hasPendingTxns.mockResolvedValue(true);
    renderPage();
    const save = screen.getByTestId('part-studio-panel-rail-create-version') as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    await user.click(save);

    // Onshape f7 对话框就位（名称缺省 V1，可改；说明可选）。
    const dialog = await screen.findByRole('dialog', { name: '创建来自 Main 的版本' });
    const name = within(dialog).getByLabelText('名称') as HTMLInputElement;
    expect(name.value).toBe('V1');
    const confirm = within(dialog).getByRole('button', { name: '创建' });
    await user.type(within(dialog).getByLabelText(/说明/), 'first');
    await user.click(confirm);

    await waitFor(() => expect(FAKE_CONNECTION.pushChanges).toHaveBeenCalledWith('V1'));
    await waitFor(() =>
      expect(mocks.imodelsCreateNamedVersion).toHaveBeenCalledWith('im-1', {
        name: 'V1',
        description: 'first',
        changesetId: 'cs-new',
      }),
    );
    // 顶栏不再是本地 saveChanges 通道（no-op 提交已除名）。
    expect(FAKE_CONNECTION.saveChanges).not.toHaveBeenCalled();
    // 成功 toast（IModelApp.notifications 标准管道）+ 对话框收合。
    await waitFor(() => expect(coreFrontendMocks.outputMessage).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('干净态命名：无未保存变更 → 不 push，命名 index 最大 changeset；完成后保存版本钮仍可用', async () => {
    const user = userEvent.setup();
    mocks.imodelsListChangesets.mockResolvedValue([
      { id: 'cs-1', index: 1, description: '初始', displayName: 'cs1', pushDateTime: '2026-10-19T09:00:00Z' },
      { id: 'cs-2', index: 2, description: '加圆角', displayName: 'cs2', pushDateTime: '2026-10-20T09:00:00Z' },
    ]);
    renderPage();
    const save = screen.getByTestId('part-studio-panel-rail-create-version') as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));

    await user.click(save);
    const dialog = await screen.findByRole('dialog', { name: '创建来自 Main 的版本' });
    const name = within(dialog).getByLabelText('名称');
    await user.clear(name);
    await user.type(name, '收敛验证');
    await user.click(within(dialog).getByRole('button', { name: '创建' }));

    await waitFor(() =>
      expect(mocks.imodelsCreateNamedVersion).toHaveBeenCalledWith('im-1', {
        name: '收敛验证',
        changesetId: 'cs-2',
      }),
    );
    // 干净态命名不 push。
    expect(FAKE_CONNECTION.pushChanges).not.toHaveBeenCalled();
    // B-model P0 Task 5：命名成功后保存版本钮仍可用（干净态可继续命名当前 changeset）。
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(save.disabled).toBe(false);
  });

  it('viewOnly 激活：三钮即使解锁点击也不触发（回调门与键盘保存同口径）', async () => {
    const user = userEvent.setup();
    act(() => {
      usePartStudioStore.getState().setViewOnly(true);
    });
    renderPage();
    // 事务态桩翻真 + 事件驱动刷新：三钮可点击态，但 viewOnly 门拦截触发。
    FAKE_CONNECTION.txns.isUndoPossible.mockResolvedValue(true);
    FAKE_CONNECTION.txns.isRedoPossible.mockResolvedValue(true);
    FAKE_CONNECTION.txns.hasPendingTxns.mockResolvedValue(true);
    act(() => {
      FAKE_CONNECTION.txns.onAfterUndoRedo.raise();
    });

    const undo = screen.getByTestId('part-studio-ribbon-undo');
    const redo = screen.getByTestId('part-studio-ribbon-redo');
    const save = screen.getByTestId('part-studio-panel-rail-create-version');
    // Onshape 化后工具钮同时受写门控制：viewOnly 下撤消/重做保持禁用。
    expect((undo as HTMLButtonElement).disabled).toBe(true);
    expect((redo as HTMLButtonElement).disabled).toBe(true);
    // B-model P0 Task 5：保存版本钮由 canSaveVersion（canEdit ∧ 连接）直接禁用
    //——viewOnly 下即使 txns 有未推送变更也不解锁。
    expect(
      (save as HTMLButtonElement).disabled === true
        || save.getAttribute('aria-disabled') === 'true',
    ).toBe(true);

    await user.click(undo);
    await user.click(redo);
    await user.click(save);
    expect(coreFrontendMocks.toolsRun).not.toHaveBeenCalled();
    expect(FAKE_CONNECTION.pushChanges).not.toHaveBeenCalled();
    // viewOnly 门拦截保存版本入口：对话框不开。
    expect(screen.queryByRole('dialog', { name: '创建来自 Main 的版本' })).toBeNull();
  });

  it('editorToolSettings 配置段：viewport+connection+scope 就绪 → 类目补全（Editor.tsx:200-235 移植）', async () => {
    renderPage();
    await waitFor(() =>
      expect(FAKE_CONNECTION.editorToolSettings.category).toBe('cat-1'),
    );
    // 非空间视图（stub isSpatialView=false）不触发项目范围装饰件。
    expect(viewerMocks.toggleProjectExtents).not.toHaveBeenCalled();
  });

  it('空间视图：项目范围包围盒不再默认显示（Onshape 无 project-extents 框）', async () => {
    (FAKE_VIEWPORT.view.isSpatialView as ReturnType<typeof vi.fn>).mockReturnValue(true);
    renderPage();
    await waitFor(() =>
      expect(FAKE_CONNECTION.editorToolSettings.category).toBe('cat-1'),
    );
    expect(viewerMocks.toggleProjectExtents).not.toHaveBeenCalled();
  });
});

describe('M4-T6 拉伸闭环接线（Session 内层特征系统 + 树/对话框消费）', () => {
  it('Session 内层挂 useFeatureSystem：RPC 读树（connection.key）+ 编辑作用域就绪后申请写租约', async () => {
    renderPage();
    // P2.4：B 文档 URL 带 ?model=ps-1——读树携带 scope；租约会话与 scope 无关。
    await waitFor(() => expect(featureRpc.getFeatureTree).toHaveBeenCalledWith('briefcase-key', 'ps-1'));
    await waitFor(() => expect(featureRpc.acquireWriteLease).toHaveBeenCalledWith('briefcase-key', expect.any(String)));
  });

  it('I1：body 读面初次失败可见（错误条 + 重试，不静默回退）', async () => {
    const user = userEvent.setup();
    featureRpc.getBodies.mockRejectedValueOnce(new Error('init race'));
    renderPage();
    const warning = await screen.findByTestId('part-studio-part-read-surface-error');
    expect(warning.textContent).toContain('init race');
    const callsBefore = featureRpc.getBodies.mock.calls.length;
    await user.click(within(warning).getByRole('button', { name: '重试' }));
    await waitFor(() =>
      expect(featureRpc.getBodies.mock.calls.length).toBeGreaterThan(callsBefore),
    );
  });

  it('useFeatureDisplaySync 订阅几何变化（M4-T5 移植件的挂载位）', async () => {
    // txns 事件桩的 addListener 经 spyOn 可观测：挂载即订阅（行为断言归
    // useFeatureDisplaySync.test，此处钉「Session 已挂」的接线事实）。
    const addListener = vi.spyOn(FAKE_CONNECTION.txns.onModelGeometryChanged, 'addListener');
    renderPage();
    await waitFor(() => expect(addListener).toHaveBeenCalled());
  });

  // ── 2026-11-03：默认 Onshape 选择工具 + 零件列表选择桥 ──────────────────
  it('默认选择工具：useOnshapeSelection(connection, viewport, paused=false)', async () => {
    renderPage();
    await waitFor(() =>
      expect(onshapeSelectionMock).toHaveBeenCalledWith(FAKE_CONNECTION, FAKE_VIEWPORT, false),
    );
  });

  it('对话框打开 → useOnshapeSelection paused=true（关闭后恢复 false）', async () => {
    renderPage();
    await waitFor(() => expect(onshapeSelectionMock).toHaveBeenCalledWith(FAKE_CONNECTION, FAKE_VIEWPORT, false));

    act(() => {
      usePartStudioStore.getState().openFeatureDialog({ mode: 'new', featureType: 'extrude' });
    });
    await waitFor(() =>
      expect(onshapeSelectionMock).toHaveBeenLastCalledWith(FAKE_CONNECTION, FAKE_VIEWPORT, true),
    );

    act(() => {
      usePartStudioStore.getState().closeDialog();
    });
    await waitFor(() =>
      expect(onshapeSelectionMock).toHaveBeenLastCalledWith(FAKE_CONNECTION, FAKE_VIEWPORT, false),
    );
  });

  it('零件列表选中 part 节点 → SelectionSet.replace(partIds)', async () => {
    featureRpc.getBodies.mockResolvedValueOnce([
      { bodyKey: '0x15', name: 'Base', active: true, authored: true },
    ]);
    renderPage();
    await waitFor(() => expect(featureRpc.getBodies).toHaveBeenCalled());

    act(() => {
      usePartStudioStore.getState().setSelectedNodeIds(['0x15']);
    });
    await waitFor(() =>
      expect(FAKE_CONNECTION.selectionSet.replace).toHaveBeenCalledWith(['0x15']),
    );
  });

  it('拉伸闭环（页级）：new/extrude 对话框提交 → applyFeatureOp 形状钉死（M6-a T6 草图通道）+ 对话框关闭', async () => {
    const user = userEvent.setup();
    // M6-a T6：树含 sketch 节点（Session 过滤映射成对话框下拉选项）+ getSketch
    // 面域替身——载荷 {sketchId, regions, profile:[]}（M6-c T3：面域寻址升级为
    // regions 多选数组，regionIndex 不再发；mockResolvedValueOnce：
    // 挂载首跳吃树内草图，提交后 refresh 回落缺省空树，实现不跨用例渗漏）。
    featureRpc.getFeatureTree.mockResolvedValueOnce([
      { id: 'sk-1', featureType: 'sketch', orderKey: 1, suppressed: false, status: 0, params: {} },
    ]);
    featureRpc.getSketch.mockResolvedValue({
      id: 'sk-1',
      entities: [],
      constraints: [],
      solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
      regions: [{ area: 0.25, outerEntityIds: [1, 2, 3, 4] }],
    });
    renderPage();
    await waitFor(() => expect(featureRpc.acquireWriteLease).toHaveBeenCalled());
    act(() => {
      usePartStudioStore.getState().openFeatureDialog({ mode: 'new', featureType: 'extrude' });
    });
    const dialog = await screen.findByTestId('part-studio-feature-dialog');
    // 选草图（树映射命名「草图 1」）→ 单面域自动 regions [0] → 提交。
    // Onshape：最近草图自动选中（无草图下拉）；单面域自动 [0] → 提交。
    await within(dialog).findByText('草图 1 的面');
    await user.click(within(dialog).getByRole('button', { name: '确认' }));
    await waitFor(() =>
      expect(featureRpc.applyFeatureOp).toHaveBeenCalledWith(
        'briefcase-key',
        {
          kind: 'insertFeature',
          featureType: 'extrude',
          params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0], operation: 'new' },
        },
        expect.any(String),
        'ps-1',
      ),
    );
    await waitFor(() => expect(usePartStudioStore.getState().dialog.active).toBeNull());
  });
});

describe('M4-T7 版本历史真面板接线（dock 数据源 + 推送对话框共享）', () => {
  const CHANGESETS = [
    { id: 'cs-2', index: 2, description: '加圆角', displayName: 'cs2', pushDateTime: '2026-10-20T09:00:00Z' },
    { id: 'cs-1', index: 1, description: '初始特征', displayName: 'cs1', pushDateTime: '2026-10-19T09:00:00Z' },
  ];

  it('dock 版本历史：changesets 查询（官方 SDK 封装）+ 当前版本标记（connection.changeset.id 比对）', async () => {
    const user = userEvent.setup();
    mocks.imodelsListChangesets.mockResolvedValue(CHANGESETS);
    renderPage();
    const dock = screen.getByTestId('part-studio-dock');
    await user.click(screen.getByTestId('part-studio-panel-rail-history'));
    expect(mocks.imodelsListChangesets).toHaveBeenCalledWith('im-1');

    const list = await within(dock).findByTestId('part-studio-changesets-list');
    const rows = within(list).getAllByTestId('part-studio-changeset-row');
    expect(rows).toHaveLength(2);
    // 当前版本标记数据源 = connection.changeset.id（'cs-2'）。
    expect(within(rows[0]!).getByText('当前版本')).toBeDefined();
    expect(within(rows[1]!).queryByText('当前版本')).toBeNull();
  });

  it('ADR-0017 Stage F：dock 无保存/推送钮；自动保存状态节点在场（Onshape 语义）', async () => {
    const user = userEvent.setup();
    FAKE_CONNECTION.txns.hasPendingTxns.mockResolvedValue(false);
    renderPage();
    const dock = screen.getByTestId('part-studio-dock');
    await user.click(screen.getByTestId('part-studio-panel-rail-history'));
    await within(dock).findByTestId('part-studio-dock-history');
    expect(within(dock).queryByTestId('part-studio-dock-save-button')).toBeNull();
    expect(within(dock).queryByTestId('part-studio-dock-push-button')).toBeNull();
    expect(screen.getByTestId('part-studio-autosave-state')).toBeDefined();
  });
});

// ── M4 Task 8（M3 终审挂账清偿）────────────────────────────────────────────

describe('M4-T8：waitForToolAdmin 5s 耗尽超时可见（不静默）', () => {
  it('ToolAdmin 未就绪等满 5s → notifications 错误面 + 不触发 ensureEditTools', async () => {
    // 未就绪现场：initialized=false（waitForToolAdmin 轮询 100ms×50 白等）。
    const realInitialized = (IModelApp as { initialized: boolean }).initialized;
    (IModelApp as { initialized: boolean }).initialized = false;
    vi.useFakeTimers();
    try {
      renderPage();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_100);
      });
      expect(coreFrontendMocks.outputMessage).toHaveBeenCalledTimes(1);
      const details = coreFrontendMocks.outputMessage.mock.calls[0]?.[0] as { briefMessage: string };
      expect(details.briefMessage).toContain('工具初始化等待超时');
      // 超时路不进注册（工具带全灭必须有诊断线索，但不误投注册）。
      expect(viewerMocks.ensureEditTools).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      (IModelApp as { initialized: boolean }).initialized = realInitialized;
    }
  });
});

// ── M5 Task 2（连接失败 UX 批）──────────────────────────────────────────────
// M4 终审 T2-②：useBriefcaseConnection 的 isLoading/error 两出口此前零消费——
// 连接失败时状态栏走 useViewport ready 相位显示「已连接」、画布永不出图（黑屏）。
// 本批把连接三态（下载中/失败/就绪）做进编辑器页呈现，并给断连时的推送对话框
// 一个有声有色的收场（T7-②：收合 + notifications toast 说明，不无声消失）。
describe('M5-T2 连接相位呈现（briefcase isLoading/error 消费）+ 推送对话框断连兜底', () => {
  // briefcase 打开中替身（connection=null + isLoading=true——T2-② 下载相位）；
  // 断连兜底用例的「断开后重开中」中间态即同一相位（复用，见 T7-② 用例内注）。
  const openingMock = () => ({
    connection: null as unknown,
    isLoading: true,
    error: null as Error | null,
    saveChanges: vi.fn().mockResolvedValue(undefined),
    pushChanges: vi.fn().mockResolvedValue(undefined),
    pullChanges: vi.fn().mockResolvedValue(undefined),
  });

  it('连接失败：画布错误面（error.message 透传）+ 状态栏连接失败（briefcase 失败优先于 host ready 相位）+ 刷新页面恢复入口', () => {
    viewerMocks.useBriefcaseConnection.mockReturnValue({
      connection: null,
      isLoading: false,
      error: new Error('downloadBriefcase failed: briefcase quota exceeded'),
      saveChanges: vi.fn().mockResolvedValue(undefined),
      pushChanges: vi.fn().mockResolvedValue(undefined),
      pullChanges: vi.fn().mockResolvedValue(undefined),
    });
    renderPage();

    // 画布错误面：标题 + error.message 原文透传（诊断线索不裁剪）+ 诚实重试指引。
    const face = within(screen.getByTestId('part-studio-canvas')).getByTestId('part-studio-connection-error');
    expect(within(face).getByText('文档打开失败')).toBeDefined();
    expect(within(face).getByText('downloadBriefcase failed: briefcase quota exceeded')).toBeDefined();
    expect(within(face).getByText(/重新打开文档/)).toBeDefined();
    // 页面级 IPC host 无公开重连 API：给真实“刷新页面”入口，不放行不通的假重试。
    expect(within(face).getByRole('button', { name: '刷新页面' })).toBeDefined();
    // 状态栏同步失败态——host 相位 ready 被 briefcase 失败覆盖（T2-② 缺陷本体）。
    expect(screen.getByTestId('part-studio-status-connection').textContent).toBe('连接失败');
  });

  it('下载中：状态栏「正在打开文档…」+ 画布骨架覆盖层（五区在场不重排——零布局跳动）', () => {
    viewerMocks.useBriefcaseConnection.mockReturnValue(openingMock());
    renderPage();
    expect(screen.getByTestId('part-studio-status-connection').textContent).toBe('正在打开文档…');
    expect(within(screen.getByTestId('part-studio-canvas')).getByTestId('part-studio-connection-loading')).toBeDefined();
    // 覆盖层为绝对定位叠加：五区结构照常在场（不因连接相位重排布局）。
    expect(screen.getByTestId('part-studio-top-bar')).toBeDefined();
    expect(screen.getByTestId('part-studio-sidebar')).toBeDefined();
    expect(screen.getByTestId('part-studio-dock')).toBeDefined();
    expect(screen.getByTestId('part-studio-status-connection')).toBeDefined();
  });

  it('viewport 创建失败（phase ready 但 error 在场）→ 画布错误面 + 状态栏连接失败（不被 host ready 掩盖）；briefcase 失败优先合流', async () => {
    // 子类现场：briefcase 已就绪（连接在场），viewport 创建链失败——useViewport
    // 只 setError 不翻相位，phase 恒 ready（T2 评审 Important：该子类此前残存
    // 「已连接+黑屏」）。
    viewerMocks.useViewport.mockReturnValue({
      viewportRef: { current: null },
      phase: 'ready',
      error: 'No view state available',
      viewport: undefined,
    });
    const { rerender } = renderPage();

    // 画布错误面呈现 viewport 错误消息；状态栏失败态（ready 相位被 error 覆盖）。
    const face = within(screen.getByTestId('part-studio-canvas')).getByTestId('part-studio-connection-error');
    expect(within(face).getByText('No view state available')).toBeDefined();
    expect(screen.getByTestId('part-studio-status-connection').textContent).toBe('连接失败');

    // 合流优先级与状态栏序一致：briefcase 失败在场 → 错误面取 briefcase 消息
    //（viewport 消息退位——同屏两源只报更上游的失败因）。
    viewerMocks.useBriefcaseConnection.mockReturnValue({
      connection: null,
      isLoading: false,
      error: new Error('briefcase quota exceeded'),
      saveChanges: vi.fn().mockResolvedValue(undefined),
      pushChanges: vi.fn().mockResolvedValue(undefined),
      pullChanges: vi.fn().mockResolvedValue(undefined),
    });
    await act(async () => {
      await rerender(pageTree());
    });
    const mergedFace = within(screen.getByTestId('part-studio-canvas')).getByTestId('part-studio-connection-error');
    expect(mergedFace.textContent).toContain('briefcase quota exceeded');
    expect(mergedFace.textContent).not.toContain('No view state available');
  });

  it('T7-② 断连兜底：推送对话框开着时连接消失 → 对话框收合且 notifications toast 说明（不无声消失）', async () => {
    const user = userEvent.setup();
    FAKE_CONNECTION.txns.hasPendingTxns.mockResolvedValue(true);
    const { rerender } = renderPage();
    const save = (await screen.findByTestId('part-studio-panel-rail-create-version')) as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    await user.click(save);
    expect(await screen.findByRole('dialog', { name: '创建来自 Main 的版本' })).toBeDefined();
    // 开对话框路径本身无 toast（兜底只在「开→断」跃迁发声）。
    expect(coreFrontendMocks.outputMessage).not.toHaveBeenCalled();

    // 连接消失（页签切换重开连接的中间态——「断开后重开中」，同 openingMock
    // 相位）：mock 翻转 + rerender 驱动 hook 重查询。
    viewerMocks.useBriefcaseConnection.mockReturnValue(openingMock());
    await act(async () => {
      await rerender(pageTree());
    });

    // 对话框收合 + toast 说明（notifications 通道）——不无声消失。
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '创建来自 Main 的版本' })).toBeNull());
    await waitFor(() => expect(coreFrontendMocks.outputMessage).toHaveBeenCalledTimes(1));
    const details = coreFrontendMocks.outputMessage.mock.calls[0]?.[0] as { briefMessage: string };
    expect(details.briefMessage).toContain('连接已断开');

    // Minor-1：翻回连接（重开完成）→ 对话框不复现——钉 setPushDialogOpen(false)
    // 半边（开态不残留，否则连接恢复即幽灵复现），且兜底 toast 不补发（只
    // 「开→断」跃迁发一次）。
    viewerMocks.useBriefcaseConnection.mockReturnValue({
      connection: FAKE_CONNECTION,
      isLoading: false,
      error: null,
      saveChanges: vi.fn().mockResolvedValue(undefined),
      pushChanges: vi.fn().mockResolvedValue(undefined),
      pullChanges: vi.fn().mockResolvedValue(undefined),
    });
    await act(async () => {
      await rerender(pageTree());
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '创建来自 Main 的版本' })).toBeNull());
    expect(coreFrontendMocks.outputMessage).toHaveBeenCalledTimes(1);
  });
});

// ── B-model P2.4：scope 解析 / A 只读 / 租约共享 / URL 切换不重连 ─────────────
describe('B-model P2.4：编辑器 scope 解析与 A 只读', () => {
  const STUDIO_2 = {
    id: 'ps-2', name: 'Part Studio 2', order: 2, defModelId: 'def-2', physModelId: 'phys-2',
  };
  const HALF = {
    id: 'half-1', name: 'half-1', order: 0, defModelId: 'def-half', physModelId: '',
  };

  const locationText = (): string => screen.getByTestId('location-probe').textContent ?? '';
  const navigationType = (): string => screen.getByTestId('navigation-type').textContent ?? '';

  it('A 旧文档（未标记）：只读横幅 + 只读连接 + 零 registry + 编辑面收口', async () => {
    renderAPage('/documents/itwin-1/im-1');
    expect(await screen.findByTestId('part-studio-readonly-banner')).toBeDefined();
    // 只读打开（A 语义）：权限 editable 也强制 readonly。
    await waitFor(() =>
      expect(viewerMocks.useBriefcaseConnection).toHaveBeenLastCalledWith({
        iTwinId: 'itwin-1',
        iModelId: 'im-1',
        readonly: true,
      }),
    );
    // 零 Part Studio 注册表调用（A 不列/不建/不写）。
    expect(featureRpc.listPartStudios).not.toHaveBeenCalled();
    expect(featureRpc.createPartStudio).not.toHaveBeenCalled();
    expect(featureRpc.acquireWriteLease).not.toHaveBeenCalled();
    // legacy 读面照常（无 ?model= → 省略 scope 实参）。
    await waitFor(() => expect(featureRpc.getFeatureTree).toHaveBeenCalledWith('briefcase-key'));
    // 编辑面整体收口：不进编辑作用域、保存版本禁用、「+」禁用。
    expect(FAKE_CONNECTION.enterEditingScope).not.toHaveBeenCalled();
    const save = screen.getByTestId('part-studio-panel-rail-create-version') as HTMLButtonElement;
    expect(save.disabled || save.getAttribute('aria-disabled') === 'true').toBe(true);
    const newTab = screen.getByRole('button', { name: '插入新页签' }) as HTMLButtonElement;
    expect(newTab.disabled || newTab.getAttribute('aria-disabled') === 'true').toBe(true);
    // legacy 单页签仍在。
    expect(screen.getByRole('tab', { name: 'Part Studio 1' }).getAttribute('aria-selected')).toBe('true');
  });

  it('A 只读写尝试（F10）：Ribbon/命令搜索/dock 保存推送全部无效（零 tools.run/零对话框）', async () => {
    const user = userEvent.setup();
    renderAPage('/documents/itwin-1/im-1');
    await waitFor(() => expect(featureRpc.getFeatureTree).toHaveBeenCalledWith('briefcase-key'));

    // Ribbon full 写工具禁用 → 点击不开 FeatureDialog、不投 tools.run。
    const extrude = screen.getByRole('button', { name: '拉伸' }) as HTMLButtonElement;
    expect(extrude.disabled || extrude.getAttribute('aria-disabled') === 'true').toBe(true);
    await user.click(extrude);
    expect(screen.queryByTestId('part-studio-feature-dialog')).toBeNull();
    expect(coreFrontendMocks.toolsRun).not.toHaveBeenCalled();

    // 命令搜索可开，但激活写命令不派发（canEdit=false 门）。
    fireEvent.keyDown(window, { key: '/', altKey: true });
    const palette = await screen.findByRole('dialog', { name: '搜索工具' });
    await user.type(within(palette).getByRole('textbox'), '拉伸');
    const results = within(palette).getByRole('list');
    await user.click(within(results).getByRole('button', { name: '拉伸' }));
    expect(coreFrontendMocks.toolsRun).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().dialog.active).toBeNull();
    fireEvent.keyDown(window, { key: '/', altKey: true });

    // Stage F：dock 不再有保存/推送入口；A 文档零写入（自动保存也不推送）。
    await user.click(screen.getByTestId('part-studio-panel-rail-history'));
    expect(screen.queryByTestId('part-studio-dock-save-button')).toBeNull();
    expect(screen.queryByTestId('part-studio-dock-push-button')).toBeNull();
    expect(FAKE_CONNECTION.saveChanges).not.toHaveBeenCalled();
    expect(FAKE_CONNECTION.pushChanges).not.toHaveBeenCalled();
  });

  it('B 文档无 ?model=：列表空 → 创建默认 Part Studio 1（共享租约）→ replace 导航', async () => {
    const created = {
      id: 'ps-created', name: 'Part Studio 1', order: 1, defModelId: 'def-new', physModelId: 'phys-new',
    };
    // 首列空 → 创建；写后 refresh 返回含新 scope 的权威列表。
    featureRpc.listPartStudios.mockResolvedValueOnce([]).mockResolvedValue([created]);
    featureRpc.createPartStudio.mockResolvedValueOnce(created);
    renderPage('/documents/itwin-1/im-1');
    await waitFor(() =>
      expect(featureRpc.createPartStudio).toHaveBeenCalledWith('briefcase-key', 'Part Studio 1', expect.any(String)),
    );
    // pre-editor create 先取同一会话租约（assertHeld 前提）。
    await waitFor(() => expect(featureRpc.acquireWriteLease).toHaveBeenCalled());
    const sessionIds = new Set([
      ...featureRpc.acquireWriteLease.mock.calls.map((call) => call[1] as string),
      featureRpc.createPartStudio.mock.calls.at(-1)?.[2] as string,
    ]);
    expect(sessionIds.size).toBe(1);
    // replace 导航（默认 scope 解析不得留历史步）。
    await waitFor(() => expect(locationText()).toContain('?model=ps-created'));
    expect(navigationType()).toBe('REPLACE');
    // 解析完成后读树携带新 scope。
    await waitFor(() => expect(featureRpc.getFeatureTree).toHaveBeenCalledWith('briefcase-key', 'ps-created'));
  });

  it('B 文档非法 ?model=：回落到第一个完整 scope（replace，不创建）', async () => {
    featureRpc.listPartStudios.mockResolvedValue([HALF, STUDIO_1, STUDIO_2]);
    renderPage('/documents/itwin-1/im-1?model=missing');
    await waitFor(() => expect(locationText()).toContain('?model=ps-1'));
    expect(navigationType()).toBe('REPLACE');
    expect(featureRpc.createPartStudio).not.toHaveBeenCalled();
    await waitFor(() => expect(featureRpc.getFeatureTree).toHaveBeenCalledWith('briefcase-key', 'ps-1'));
  });

  it('B 文档仅半图条目（无完整 scope）：显示恢复/删除入口，绝不自动 create', async () => {
    featureRpc.listPartStudios.mockResolvedValue([HALF]);
    renderPage('/documents/itwin-1/im-1');
    expect(await screen.findByTestId('part-studio-scope-recovery')).toBeDefined();
    await waitFor(() => expect(featureRpc.listPartStudios).toHaveBeenCalled());
    expect(featureRpc.createPartStudio).not.toHaveBeenCalled();
    expect(screen.getByTestId('part-studio-damaged-delete-half-1')).toBeDefined();
    // 视口/特征读面保持门禁（不读任何 scope 的树）。
    expect(featureRpc.getFeatureTree).not.toHaveBeenCalled();
    // 删除最后一个半图后列表为空 → 解析器创建全新默认 scope（P2.4：允许；
    // 墓碑 id 不重建，新 scope 是新 UUID）。
    featureRpc.createPartStudio.mockResolvedValueOnce({
      id: 'ps-fresh', name: 'Part Studio 1', order: 1, defModelId: 'def-fresh', physModelId: 'phys-fresh',
    });
    // 恢复删除走 HITL：确认前后端零写；确认后走同一会话的 deletePartStudio。
    const user = userEvent.setup();
    await user.click(screen.getByTestId('part-studio-damaged-delete-half-1'));
    const dialog = await screen.findByRole('dialog', { name: '删除 Part Studio' });
    expect(featureRpc.deletePartStudio).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: '删除' }));
    await waitFor(() =>
      expect(featureRpc.deletePartStudio).toHaveBeenCalledWith('briefcase-key', 'half-1', expect.any(String)),
    );
  });

  it('B 文档只读（仅 webview）+ 空文档：不自动 create（诚实空态、零租约/零写）', async () => {
    mocks.accessControlGetMyPermissions.mockResolvedValue(['imodels_webview']);
    featureRpc.listPartStudios.mockResolvedValue([]);
    renderPage('/documents/itwin-1/im-1');
    expect(await screen.findByTestId('part-studio-scope-empty')).toBeDefined();
    expect(featureRpc.createPartStudio).not.toHaveBeenCalled();
    expect(featureRpc.acquireWriteLease).not.toHaveBeenCalled();
    expect(locationText()).not.toContain('?model=');
  });

  it('B 文档活动 scope 为半图（?model=half-1）：损坏横幅，不读特征树', async () => {
    featureRpc.listPartStudios.mockResolvedValue([HALF, STUDIO_1]);
    renderPage('/documents/itwin-1/im-1?model=half-1');
    expect(await screen.findByTestId('part-studio-scope-damaged')).toBeDefined();
    expect(screen.getByTestId('part-studio-damaged-delete')).toBeDefined();
    expect(featureRpc.createPartStudio).not.toHaveBeenCalled();
    expect(featureRpc.getFeatureTree).not.toHaveBeenCalled();
    expect(locationText()).toContain('?model=half-1');
  });

  it('页签切换只换 URL：不重建连接（connection.key 稳定，读树用同一 key + 新 scope）', async () => {
    const user = userEvent.setup();
    featureRpc.listPartStudios.mockResolvedValue([STUDIO_1, STUDIO_2]);
    await renderReadyPage();
    await waitFor(() => expect(featureRpc.getFeatureTree).toHaveBeenCalledWith('briefcase-key', 'ps-1'));
    const optionsBefore = viewerMocks.useBriefcaseConnection.mock.calls
      .map((call) => call[0])
      .filter((options) => options !== null)
      .at(-1);
    await user.click(screen.getByRole('tab', { name: 'Part Studio 2' }));
    await waitFor(() => expect(locationText()).toContain('?model=ps-2'));
    expect(navigationType()).toBe('PUSH');
    // 同一连接实例/键：切换后读树仍走 briefcase-key + 新 scope。
    await waitFor(() => expect(featureRpc.getFeatureTree).toHaveBeenCalledWith('briefcase-key', 'ps-2'));
    const optionsAfter = viewerMocks.useBriefcaseConnection.mock.calls
      .map((call) => call[0])
      .filter((options) => options !== null)
      .at(-1);
    expect(optionsAfter).toEqual(optionsBefore);
    // 视口仍接同一连接（useViewport 的 iModel 未换实例）。
    expect((viewerMocks.useViewport.mock.calls.at(-1)?.[0] as { iModel: unknown }).iModel).toBe(FAKE_CONNECTION);
  });

  it('注册表写方法与 useFeatureSystem 共用同一 sessionId + iModelKey（租约共享）', async () => {
    const user = userEvent.setup();
    featureRpc.listPartStudios.mockResolvedValue([STUDIO_1]);
    // applyOp 通道需要草图轮廓（同「拉伸闭环」用例的提交路径）。
    featureRpc.getFeatureTree.mockResolvedValueOnce([
      { id: 'sk-1', featureType: 'sketch', orderKey: 1, suppressed: false, status: 0, params: {} },
    ]);
    featureRpc.getSketch.mockResolvedValue({
      id: 'sk-1',
      entities: [],
      constraints: [],
      solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
      regions: [{ area: 0.25, outerEntityIds: [1, 2, 3, 4] }],
    });
    await renderReadyPage();
    await waitFor(() => expect(featureRpc.acquireWriteLease).toHaveBeenCalled());
    // applyOp 通道（FeatureDialog 提交）用会话 id。
    act(() => {
      usePartStudioStore.getState().openFeatureDialog({ mode: 'new', featureType: 'extrude' });
    });
    const dialog = await screen.findByTestId('part-studio-feature-dialog');
    // Onshape：最近草图自动选中（无草图下拉）；单面域自动 [0] → 提交。
    await within(dialog).findByText('草图 1 的面');
    await user.click(within(dialog).getByRole('button', { name: '确认' }));
    await waitFor(() => expect(featureRpc.applyFeatureOp).toHaveBeenCalled());
    const applySessionId = featureRpc.applyFeatureOp.mock.calls.at(-1)?.[2] as string;
    const applyScope = featureRpc.applyFeatureOp.mock.calls.at(-1)?.[3];
    expect(applyScope).toBe('ps-1');
    // 注册表写通道（create）用同一 id/key。
    const created = {
      id: 'ps-shared', name: 'Part Studio 1', order: 1, defModelId: 'd', physModelId: 'p',
    };
    featureRpc.createPartStudio.mockResolvedValueOnce(created);
    await user.click(screen.getByRole('button', { name: '插入新页签' }));
    const insertMenu = await screen.findByRole('menu');
    await user.click(within(insertMenu).getByRole('menuitem', { name: '创建 Part Studio' }));
    await waitFor(() => expect(featureRpc.createPartStudio).toHaveBeenCalled());
    const [, , createSessionId] = featureRpc.createPartStudio.mock.calls.at(-1) as [string, string, string];
    expect(createSessionId).toBe(applySessionId);
    expect(featureRpc.createPartStudio.mock.calls.at(-1)?.[0]).toBe('briefcase-key');
  });

  // ── fix round 1：F1 marker 未定/失败、F2 门源拆、F3 create 失败、F4/F5/F6 ──

  it('F1 marker 在途：分享/重命名/legacy 页签禁用，零 registry、连接不开（不猜 A）', async () => {
    const user = userEvent.setup();
    mocks.itwinsGet.mockReturnValue(new Promise(() => { /* 挂起 marker */ }));
    renderPage('/documents/itwin-1/im-1?model=ps-1');
    const share = screen.getByTestId('part-studio-share-button') as HTMLButtonElement;
    expect(share.disabled || share.getAttribute('aria-disabled') === 'true').toBe(true);
    await user.click(within(screen.getByTestId('part-studio-top-bar')).getByRole('button', { name: '文档菜单' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: '重命名文档' }).getAttribute('aria-disabled')).toBe('true');
    // Onshape 文档级页签恒在；marker 未定时不得出现任何 Part Studio legacy 页签。
    expect(within(screen.getByTestId('part-studio-tab-strip')).getByTestId('part-studio-doc-tab')).toBeDefined();
    expect(within(screen.getByTestId('part-studio-tab-strip')).queryByRole('tab', { name: 'Part Studio 1' })).toBeNull();
    expect(within(screen.getByTestId('part-studio-tab-strip')).queryByTestId('part-studio-tab-actions')).toBeNull();
    expect(featureRpc.listPartStudios).not.toHaveBeenCalled();
    expect(mocks.itwinsUpdate).not.toHaveBeenCalled();
    // marker 在途：连接 options 仍为 null（首开不猜读写）。
    expect(viewerMocks.useBriefcaseConnection.mock.calls.at(-1)?.[0]).toBeNull();
  });

  it('F1/R1 marker 失败：不打开连接（不猜读写）；错误横幅重试；分享/重命名禁用', async () => {
    const user = userEvent.setup();
    mocks.itwinsGet.mockRejectedValue(new Error('itwins down'));
    renderPage('/documents/itwin-1/im-1?model=ps-1');
    expect(await screen.findByTestId('part-studio-scope-error')).toBeDefined();
    expect(screen.getByText(/itwins down/)).toBeDefined();
    // R1：marker 未定时不开连接——首开定读写，保守只读会留下不可升级的连接。
    expect(viewerMocks.useBriefcaseConnection.mock.calls.at(-1)?.[0]).toBeNull();
    const share = screen.getByTestId('part-studio-share-button') as HTMLButtonElement;
    expect(share.disabled || share.getAttribute('aria-disabled') === 'true').toBe(true);
    await user.click(within(screen.getByTestId('part-studio-top-bar')).getByRole('button', { name: '文档菜单' }));
    const menu = await screen.findByRole('menu');
    const rename = within(menu).getByRole('menuitem', { name: '重命名文档' });
    expect(rename.getAttribute('aria-disabled')).toBe('true');
    await user.click(rename);
    expect(mocks.itwinsUpdate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('share-dialog-stub')).toBeNull();
    expect(featureRpc.listPartStudios).not.toHaveBeenCalled();
    expect(featureRpc.createPartStudio).not.toHaveBeenCalled();
    expect(screen.queryByTestId('part-studio-readonly-reopen')).toBeNull();
  });

  it('R1：marker 失败 → 重试成功(B writable) → 以 readonly:false 首开并可自动 create（不被只读卡死）', async () => {
    const user = userEvent.setup();
    mocks.itwinsGet
      .mockRejectedValueOnce(new Error('transient marker'))
      .mockResolvedValue(ITWIN_DETAIL);
    const created = {
      id: 'ps-after-retry', name: 'Part Studio 1', order: 1, defModelId: 'def-r1', physModelId: 'phys-r1',
    };
    featureRpc.listPartStudios.mockResolvedValueOnce([]).mockResolvedValue([created]);
    featureRpc.createPartStudio.mockResolvedValueOnce(created);
    renderPage('/documents/itwin-1/im-1');
    const errorBanner = await screen.findByTestId('part-studio-scope-error');
    expect(viewerMocks.useBriefcaseConnection.mock.calls.at(-1)?.[0]).toBeNull();

    await user.click(within(errorBanner).getByRole('button', { name: '重试' }));
    await waitFor(() =>
      expect(viewerMocks.useBriefcaseConnection).toHaveBeenLastCalledWith({
        iTwinId: 'itwin-1',
        iModelId: 'im-1',
        readonly: false,
      }),
    );
    // 可写连接就绪后自动 create 正常执行（而不是卡在只读拒绝）。
    await waitFor(() =>
      expect(featureRpc.createPartStudio).toHaveBeenCalledWith('briefcase-key', 'Part Studio 1', expect.any(String)),
    );
    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toContain('?model=ps-after-retry'),
    );
    expect(screen.queryByTestId('part-studio-readonly-reopen')).toBeNull();
  });

  it('R1：连接以只读首开但上下文可写 → 阻塞提示 + 全写面收口（不取租约/不自动 create）', async () => {
    const READONLY_CONNECTION = { ...FAKE_CONNECTION, isReadonly: true };
    viewerMocks.useBriefcaseConnection.mockReturnValue({
      connection: READONLY_CONNECTION,
      isLoading: false,
      error: null,
      saveChanges: vi.fn().mockResolvedValue(undefined),
      pushChanges: vi.fn().mockResolvedValue(undefined),
      pullChanges: vi.fn().mockResolvedValue(undefined),
    });
    featureRpc.listPartStudios.mockResolvedValue([]);
    renderPage('/documents/itwin-1/im-1');
    expect(await screen.findByTestId('part-studio-readonly-reopen')).toBeDefined();
    // 写面收口：保存版本/「+」/Ribbon 写工具禁用；零租约、零自动 create。
    const save = screen.getByTestId('part-studio-panel-rail-create-version') as HTMLButtonElement;
    expect(save.disabled || save.getAttribute('aria-disabled') === 'true').toBe(true);
    const newTab = screen.getByRole('button', { name: '插入新页签' }) as HTMLButtonElement;
    expect(newTab.disabled || newTab.getAttribute('aria-disabled') === 'true').toBe(true);
    const extrude = screen.getByRole('button', { name: '拉伸' }) as HTMLButtonElement;
    expect(extrude.disabled || extrude.getAttribute('aria-disabled') === 'true').toBe(true);
    expect(featureRpc.acquireWriteLease).not.toHaveBeenCalled();
    expect(featureRpc.createPartStudio).not.toHaveBeenCalled();
  });

  it('R2（StrictMode）：deferred create 拒收仍落位错误+重试（双挂载哨兵不回 false）', async () => {
    const user = userEvent.setup();
    featureRpc.listPartStudios.mockResolvedValue([]);
    let rejectCreate!: (error: Error) => void;
    const pendingCreate = new Promise<never>((_resolve, reject) => {
      rejectCreate = reject;
    });
    featureRpc.createPartStudio.mockReturnValue(pendingCreate);
    renderPageStrict('/documents/itwin-1/im-1');
    await waitFor(() => expect(featureRpc.createPartStudio).toHaveBeenCalled());
    expect(featureRpc.createPartStudio).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectCreate(new Error('strict lease busy'));
      await Promise.resolve();
    });
    const banner = await screen.findByTestId('part-studio-scope-create');
    expect(banner.textContent).toContain('strict lease busy');

    const created = {
      id: 'ps-strict', name: 'Part Studio 1', order: 1, defModelId: 'def-s', physModelId: 'phys-s',
    };
    featureRpc.createPartStudio.mockResolvedValueOnce(created);
    featureRpc.listPartStudios.mockResolvedValue([created]);
    await user.click(within(banner).getByRole('button', { name: '重试创建' }));
    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toContain('?model=ps-strict'),
    );
  });

  it('R4：resolver 自动 create 在途时「+」禁用，不产生第二个默认 scope', async () => {
    const created = {
      id: 'ps-single', name: 'Part Studio 1', order: 1, defModelId: 'def-1', physModelId: 'phys-1',
    };
    featureRpc.listPartStudios.mockResolvedValueOnce([]).mockResolvedValue([created]);
    let resolveCreate!: (info: typeof created) => void;
    const pendingCreate = new Promise<typeof created>((resolve) => {
      resolveCreate = resolve;
    });
    featureRpc.createPartStudio.mockReturnValue(pendingCreate);
    renderPage('/documents/itwin-1/im-1');
    await waitFor(() => expect(featureRpc.createPartStudio).toHaveBeenCalledTimes(1));
    const newTab = screen.getByRole('button', { name: '插入新页签' }) as HTMLButtonElement;
    expect(newTab.disabled || newTab.getAttribute('aria-disabled') === 'true').toBe(true);
    expect(featureRpc.createPartStudio).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate(created);
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toContain('?model=ps-single'),
    );
    expect(featureRpc.createPartStudio).toHaveBeenCalledTimes(1);
  });

  it('F2 门源拆：仅 iModel Manage（无 iTwin manage）→ 分享禁用、重命名可用', async () => {
    const user = userEvent.setup();
    mocks.accessControlGetMyPermissions.mockResolvedValue(['imodels_manage', 'imodels_webview']);
    mocks.accessControlGetITwinPermissions.mockResolvedValue(['imodels_webview']);
    await renderReadyPage();
    const share = screen.getByTestId('part-studio-share-button') as HTMLButtonElement;
    expect(share.disabled || share.getAttribute('aria-disabled') === 'true').toBe(true);
    await user.click(within(screen.getByTestId('part-studio-top-bar')).getByRole('button', { name: '文档菜单' }));
    const menu = await screen.findByRole('menu');
    const rename = within(menu).getByRole('menuitem', { name: '重命名文档' });
    expect(rename.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('F2 门源拆：iTwin manage → 分享可用；iModel 无 manage → 重命名禁用', async () => {
    const user = userEvent.setup();
    mocks.accessControlGetMyPermissions.mockResolvedValue(['imodels_webview', 'imodels_read']);
    mocks.accessControlGetITwinPermissions.mockResolvedValue(['imodels_manage', 'imodels_webview']);
    renderPage();
    await waitFor(() => {
      const share = screen.getByTestId('part-studio-share-button') as HTMLButtonElement;
      expect(share.disabled === false && share.getAttribute('aria-disabled') !== 'true').toBe(true);
    });
    await user.click(screen.getByTestId('part-studio-share-button'));
    const stub = await screen.findByTestId('share-dialog-stub');
    expect(stub.getAttribute('data-mode')).toBe('B');
    expect(stub.getAttribute('data-can-manage')).toBe('true');
    await user.click(within(screen.getByTestId('part-studio-top-bar')).getByRole('button', { name: '文档菜单' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: '重命名文档' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('F3：默认 scope 创建拒收不被父级重渲染取消——错误条 + 重试成功', async () => {
    const user = userEvent.setup();
    featureRpc.listPartStudios.mockResolvedValue([]);
    let rejectCreate!: (error: Error) => void;
    const pendingCreate = new Promise<never>((_resolve, reject) => {
      rejectCreate = reject;
    });
    featureRpc.createPartStudio.mockReturnValue(pendingCreate);
    const { rerender } = renderPage('/documents/itwin-1/im-1');
    await waitFor(() => expect(featureRpc.createPartStudio).toHaveBeenCalled());
    // 模拟父级重渲染（旧实现会在此 cleanup 掉在途 create，吞掉失败）。
    rerender(pageTree('/documents/itwin-1/im-1'));
    await act(async () => {
      rejectCreate(new Error('lease busy'));
      await Promise.resolve();
    });
    const banner = await screen.findByTestId('part-studio-scope-create');
    expect(banner.textContent).toContain('lease busy');
    expect(within(banner).getByRole('button', { name: '重试创建' })).toBeDefined();

    const created = {
      id: 'ps-retried', name: 'Part Studio 1', order: 1, defModelId: 'def-r', physModelId: 'phys-r',
    };
    featureRpc.createPartStudio.mockResolvedValueOnce(created);
    featureRpc.listPartStudios.mockResolvedValue([created]);
    await user.click(within(banner).getByRole('button', { name: '重试创建' }));
    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toContain('?model=ps-retried'),
    );
  });

  it('F4：注册表列表未落定时「+」禁用（防重复默认 scope）', () => {
    featureRpc.listPartStudios.mockReturnValue(new Promise(() => { /* 挂起 list */ }));
    renderPage('/documents/itwin-1/im-1?model=ps-1');
    const newTab = screen.getByRole('button', { name: '插入新页签' }) as HTMLButtonElement;
    expect(newTab.disabled || newTab.getAttribute('aria-disabled') === 'true').toBe(true);
  });

  it('F5：scope 解析前不发 getSketch；切换页签复位草图 store（跨 scope 不串身份）', async () => {
    const user = userEvent.setup();
    featureRpc.listPartStudios.mockResolvedValue([STUDIO_1, {
      id: 'ps-2', name: 'Part Studio 2', order: 2, defModelId: 'def-2', physModelId: 'phys-2',
    }]);
    renderPage('/documents/itwin-1/im-1?model=ps-1');
    await waitFor(() => expect(featureRpc.getFeatureTree).toHaveBeenCalledWith('briefcase-key', 'ps-1'));
    await act(async () => {
      usePartStudioStore.getState().enterSketch('sk-1');
      await Promise.resolve();
    });
    // 切换 scope：store 草图切片复位，且不因旧 activeSketchId 读 sketch。
    featureRpc.getSketch.mockClear();
    await user.click(screen.getByRole('tab', { name: 'Part Studio 2' }));
    await waitFor(() => expect(screen.getByTestId('location-probe').textContent).toContain('?model=ps-2'));
    await waitFor(() => expect(usePartStudioStore.getState().sketch.isActive).toBe(false));
    expect(featureRpc.getSketch).not.toHaveBeenCalled();
  });

  it('F5：B scope 解析前（list 在途）即使 store 有活动草图也不发 getSketch', async () => {
    featureRpc.listPartStudios.mockReturnValue(new Promise(() => { /* 挂起 */ }));
    renderPage('/documents/itwin-1/im-1');
    await act(async () => {
      usePartStudioStore.getState().enterSketch('sk-legacy');
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(featureRpc.getSketch).not.toHaveBeenCalled();
  });

  it('F6：A 文档 URL 带手工 ?model= 时 legacy 读面仍省略 scope 实参', async () => {
    renderAPage('/documents/itwin-1/im-1?model=ps-stray');
    await waitFor(() => expect(featureRpc.getFeatureTree).toHaveBeenCalledWith('briefcase-key'));
    expect(featureRpc.getFeatureTree).not.toHaveBeenCalledWith('briefcase-key', 'ps-stray');
    expect(featureRpc.getSketch).not.toHaveBeenCalled();
  });

  it('flag 关（VITE_B_MODEL_ENABLED=false）直连 B 文档仍按 B 解析（marker 唯一裁决源）', async () => {
    vi.stubEnv('VITE_B_MODEL_ENABLED', 'false');
    try {
      await renderReadyPage();
      expect(featureRpc.listPartStudios).toHaveBeenCalledWith('briefcase-key');
      expect(featureRpc.getFeatureTree).toHaveBeenCalledWith('briefcase-key', 'ps-1');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('页面级租约拒绝：自动 create 显示 holder 错误且不派发 createPartStudio', async () => {
    vi.useFakeTimers();
    try {
      featureRpc.listPartStudios.mockResolvedValue([]);
      featureRpc.acquireWriteLease.mockResolvedValue({ ok: false, holder: 'other-tab' });
      renderPage('/documents/itwin-1/im-1');
      // 分拍推进：每拍同时冲刷 microtask/渲染，让 list→resolver→create→租约重试
      // 链在假时钟下逐跳落定（单拍 advance 会停在 create 尚未启动的一帧）。
      // 预算对齐：REGISTRY_LEASE_ACQUIRE_BUDGET_MS 已从 10s 提升到 35s
      //（2026-11-01 public 87ee0f4，≥30s TTL + 余量）；18×2.5s=45s 覆盖预算。
      for (let i = 0; i < 18; i += 1) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(2_500);
        });
      }
      expect(featureRpc.createPartStudio).not.toHaveBeenCalled();
      const banner = screen.getByTestId('part-studio-scope-create');
      expect(banner.textContent).toContain('other-tab');
      expect(within(banner).getByRole('button', { name: '重试创建' })).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ── B-model P2.5：active-scope 视口过滤 + editorToolSettings 模型钉死 ────────
describe('B-model P2.5：active scope 视口过滤', () => {
  const STUDIO_2 = {
    id: 'ps-2', name: 'Part Studio 2', order: 2, defModelId: 'def-2', physModelId: 'phys-2',
  };
  const HALF = {
    id: 'half-1', name: 'half-1', order: 0, defModelId: 'def-half', physModelId: '',
  };

  interface ViewportOptionsProbe {
    iModel?: unknown;
    activeModelIds?: readonly string[];
  }

  const lastViewportOptions = (): ViewportOptionsProbe =>
    (viewerMocks.useViewport.mock.calls.at(-1)?.[0] ?? {}) as ViewportOptionsProbe;

  const isSpatialViewMock = FAKE_VIEWPORT.view.isSpatialView as ReturnType<typeof vi.fn>;

  afterEach(() => {
    // 空间视图开关是共享桩的持久实现——复位，防渗漏到后续文件/用例。
    isSpatialViewMock.mockReturnValue(false);
    // R3：活动工具桩复位。
    delete (IModelApp.toolAdmin as unknown as { activeTool?: unknown }).activeTool;
  });

  it('B scope ready：useViewport 收 activeModelIds=[active physModelId]；iModel 同一连接', async () => {
    featureRpc.listPartStudios.mockResolvedValue([STUDIO_1, STUDIO_2]);
    await renderReadyPage();
    await waitFor(() => expect(lastViewportOptions().activeModelIds).toEqual(['phys-1']));
    expect(lastViewportOptions().iModel).toBe(FAKE_CONNECTION);
  });

  it('切页签只换白名单：phys-1 → phys-2，视口/连接仍为同一 iModel 实例', async () => {
    const user = userEvent.setup();
    featureRpc.listPartStudios.mockResolvedValue([STUDIO_1, STUDIO_2]);
    await renderReadyPage();
    await waitFor(() => expect(lastViewportOptions().activeModelIds).toEqual(['phys-1']));

    await user.click(screen.getByRole('tab', { name: 'Part Studio 2' }));
    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toContain('?model=ps-2'),
    );
    await waitFor(() => expect(lastViewportOptions().activeModelIds).toEqual(['phys-2']));
    // F5：iModel 同一实例是 mock 层能给出的最强证据；真实连接计数（WS/MS
    // 日志不新增连接）归 P2.6 §5.3 硬门。options 深等在每次渲染天然相等，
    // 不再作为「没有第二条连接」的断言。
    expect(lastViewportOptions().iModel).toBe(FAKE_CONNECTION);
  });

  it('A 旧文档：activeModelIds 缺省（legacy 全模型行为不变）', async () => {
    renderAPage('/documents/itwin-1/im-1');
    await waitFor(() => expect(featureRpc.getFeatureTree).toHaveBeenCalledWith('briefcase-key'));
    expect(lastViewportOptions().iModel).toBe(FAKE_CONNECTION);
    expect(lastViewportOptions().activeModelIds).toBeUndefined();
  });

  it('B 无完整 scope（半图 damaged）：视口不接 iModel/不收白名单（不回落全模型）', async () => {
    featureRpc.listPartStudios.mockResolvedValue([HALF]);
    renderPage('/documents/itwin-1/im-1?model=half-1');
    expect(await screen.findByTestId('part-studio-scope-damaged')).toBeDefined();
    // 等 scope 解析落定（多拍）后，视口仍不得收到连接。
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(lastViewportOptions().iModel).toBeUndefined();
    expect(lastViewportOptions().activeModelIds ?? undefined).toBeUndefined();
  });

  it('editorToolSettings：B active scope 钉死 active physModelId（selector 内其他模型不参与）', async () => {
    const user = userEvent.setup();
    isSpatialViewMock.mockReturnValue(true);
    featureRpc.listPartStudios.mockResolvedValue([STUDIO_1, STUDIO_2]);
    renderPage();
    // 视图 selector 仅含 model-1（旧视图/未被过滤前的形态）——B 下仍须钉 phys-1。
    await waitFor(() => expect(FAKE_CONNECTION.editorToolSettings.model).toBe('phys-1'));
    expect(FAKE_CONNECTION.editorToolSettings.model).not.toBe('model-1');

    // 切页签 → 重校准到新 scope 的 physModelId。
    await user.click(screen.getByRole('tab', { name: 'Part Studio 2' }));
    await waitFor(() => expect(FAKE_CONNECTION.editorToolSettings.model).toBe('phys-2'));
  });

  it('editorToolSettings：A 旧文档不进入编辑作用域 → 不写校准值（legacy 全模型视图由 viewer 维持）', async () => {
    isSpatialViewMock.mockReturnValue(true);
    renderAPage('/documents/itwin-1/im-1');
    await waitFor(() => expect(featureRpc.getFeatureTree).toHaveBeenCalledWith('briefcase-key'));
    // A 只读（canEdit=false）→ useEditingScope enabled=false → 配置段不执行；
    // 既有行为保持（模型列表=viewer legacy 全模型 selector，不被页面改写）。
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(FAKE_CONNECTION.editorToolSettings.model).toBeUndefined();
  });

  it('F1 选择集隔离：ps-1 选中 body → 切 ps-2 → selectionSet/store 立即清空（Delete/Move 无 ps-1 目标）', async () => {
    const user = userEvent.setup();
    featureRpc.listPartStudios.mockResolvedValue([STUDIO_1, STUDIO_2]);
    await renderReadyPage();

    // 播种 ps-1 body 选择（画布 pick 的权威源 = connection.selectionSet；
    // store 选择为 UI 映射）。bodies 读面缺省空集，桥会即时重算 store——
    // 先 replace 再写 store，确保播种值不被同步抹掉。
    act(() => {
      FAKE_CONNECTION.selectionSet.replace(['body-ps1']);
      usePartStudioStore.getState().setCanvasSelection([{ kind: 'part', id: 'body-ps1', label: 'Body ps-1' }]);
      usePartStudioStore.getState().setSelectedNodeIds(['feat-ps1']);
    });
    expect(FAKE_CONNECTION.selectionSet.elements.size).toBe(1);

    await user.click(screen.getByRole('tab', { name: 'Part Studio 2' }));
    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toContain('?model=ps-2'),
    );

    // 元素集工具（DeleteElementsTool/Move）的唯一输入是 selectionSet——切换后
    // 必须为空（隐藏 ps-1 实体不得被无确认操作），store 画布/树选择同步清空。
    await waitFor(() => expect(FAKE_CONNECTION.selectionSet.elements.size).toBe(0));
    expect([...FAKE_CONNECTION.selectionSet.elements]).not.toContain('body-ps1');
    expect(usePartStudioStore.getState().canvas.selection).toEqual([]);
    expect(usePartStudioStore.getState().tree.selectedNodeIds).toEqual([]);
  });

  it('F1 lag 窗口：切 scope 后过滤落定（appliedModelKey 变化）再清一次选择集', async () => {
    const user = userEvent.setup();
    featureRpc.listPartStudios.mockResolvedValue([STUDIO_1, STUDIO_2]);
    const rendered = await renderReadyPage();
    await user.click(screen.getByRole('tab', { name: 'Part Studio 2' }));
    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toContain('?model=ps-2'),
    );

    // 模拟「切换清空之后、视口过滤落定之前」pick 到几何（旧 scope 仍渲染的
    // lag 窗口）——选择集再次被播种。
    act(() => {
      FAKE_CONNECTION.selectionSet.replace(['body-lag']);
      usePartStudioStore.getState().setCanvasSelection([{ kind: 'part', id: 'body-lag', label: 'Lag body' }]);
      usePartStudioStore.getState().setSelectedNodeIds(['node-lag']);
    });
    expect(FAKE_CONNECTION.selectionSet.elements.size).toBe(1);

    // viewer 过滤落定：appliedModelKey 从 undefined → 新签名。
    viewerMocks.useViewport.mockReturnValue({
      viewportRef: { current: null },
      phase: 'ready',
      error: null,
      viewport: FAKE_VIEWPORT,
      appliedModelKey: '["phys-2"]',
    });
    await act(async () => {
      rendered.rerender(pageTree('/documents/itwin-1/im-1?model=ps-2'));
    });

    await waitFor(() => expect(FAKE_CONNECTION.selectionSet.elements.size).toBe(0));
    expect(usePartStudioStore.getState().canvas.selection).toEqual([]);
    expect(usePartStudioStore.getState().tree.selectedNodeIds).toEqual([]);
  });

  it('R4：无关重渲染/undo 不清空选择（F1 effect 仅 scope/过滤变化触发）', async () => {
    // body 读面回同一实体：undo 刷新时 body 桥不会把 store 选择重算为空
    // （本用例只验证 F1 effect 的 deps 边界，不掺 P2.4 读面语义）。
    featureRpc.getBodies.mockResolvedValue([
      { bodyKey: 'body-ps1', name: 'Body', active: true, authored: true },
    ]);
    featureRpc.listPartStudios.mockResolvedValue([STUDIO_1]);
    const rendered = await renderReadyPage();
    act(() => {
      FAKE_CONNECTION.selectionSet.replace(['body-ps1']);
      usePartStudioStore.getState().setCanvasSelection([{ kind: 'part', id: 'body-ps1', label: 'Body' }]);
      usePartStudioStore.getState().setSelectedNodeIds(['feat-ps1']);
    });

    // 无关 store 变化 + undo 事件驱动的刷新（deps 不变）→ 不得清空。
    act(() => {
      usePartStudioStore.getState().openFeatureDialog({ mode: 'new', featureType: 'extrude' });
      FAKE_CONNECTION.txns.onAfterUndoRedo.raise();
    });
    await act(async () => {
      rendered.rerender(pageTree('/documents/itwin-1/im-1?model=ps-1'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toContain('?model=ps-1'),
    );

    expect([...FAKE_CONNECTION.selectionSet.elements]).toEqual(['body-ps1']);
    expect(usePartStudioStore.getState().canvas.selection).toHaveLength(1);
    expect(usePartStudioStore.getState().tree.selectedNodeIds).toEqual(['feat-ps1']);
  });

  it('R2：过滤失败以非阻断提示条呈现——画布错误面/状态栏连接态不误报', async () => {
    viewerMocks.useViewport.mockReturnValue({
      viewportRef: { current: null },
      phase: 'ready',
      error: null,
      viewport: FAKE_VIEWPORT,
      appliedModelKey: undefined,
      filterError: 'ECSQL 查询失败；已暂时隐藏全部模型以避免显示错误 scope。切换页签可重试。',
    });
    featureRpc.listPartStudios.mockResolvedValue([STUDIO_1]);
    renderPage();

    const banner = await screen.findByTestId('part-studio-model-filter-error');
    expect(banner.textContent).toContain('ECSQL');
    // 连接/文档状态保持正常：状态栏「已连接」，画布无连接错误面。
    expect(screen.getByTestId('part-studio-status-connection').textContent).toBe('已连接');
    expect(screen.queryByTestId('part-studio-connection-error')).toBeNull();
  });

  it('R3：scope 切换取消活动工具（Move agenda 不得跨页签提交）', async () => {
    const user = userEvent.setup();
    featureRpc.listPartStudios.mockResolvedValue([STUDIO_1, STUDIO_2]);
    await renderReadyPage();
    const toolAdmin = IModelApp.toolAdmin as unknown as {
      activeTool?: unknown;
      startDefaultTool: ReturnType<typeof vi.fn>;
    };
    toolAdmin.activeTool = { toolId: 'Move' };

    await user.click(screen.getByRole('tab', { name: 'Part Studio 2' }));
    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toContain('?model=ps-2'),
    );
    await waitFor(() => expect(toolAdmin.startDefaultTool).toHaveBeenCalled());
  });
});
