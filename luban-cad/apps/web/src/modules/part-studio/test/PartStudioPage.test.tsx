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
import type React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  itwinsGet: vi.fn(),
  imodelsGet: vi.fn(),
  imodelsList: vi.fn(),
  // M4-T7：版本历史数据源（dock 真面板的查询通道）。
  imodelsListChangesets: vi.fn(),
  // B-model P0 Task 5：Named Version 通道（顶栏保存版本 + dock 命名版本列表）。
  imodelsCreateNamedVersion: vi.fn(),
  imodelsListNamedVersions: vi.fn(),
  // M5-T3：iModel 级我的权限查询（briefcase readonly 合流的数据源）。
  accessControlGetMyPermissions: vi.fn(),
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
    update = vi.fn();
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
    getITwinPermissions = vi.fn();
  },
}));

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
    async (_key: string, _op: unknown, _sessionId: string): Promise<{ ok: boolean; featureId?: string }> =>
      ({ ok: true, featureId: 'f-new' }),
  ),
  acquireWriteLease: vi.fn(async (_key: string, _sessionId: string) => ({ ok: true, holder: 'tester' })),
  releaseWriteLease: vi.fn(async (_key: string, _sessionId: string) => undefined),
  getSketch: vi.fn(async (_key: string, _sketchId: string): Promise<unknown> => undefined),
}));

vi.mock('@luban-cad/shared', () => ({
  LUBAN_INIT_TXN_DESCRIPTION: 'partstudio init',
  LubanFeatureRpcInterface: {
    getClient: () => featureRpc,
  },
}));

// 结构测试零查看器启动：useViewport 钉 ready 相位 + 假 viewport 实例、
// useBriefcaseConnection 钉就绪连接（状态栏「已连接」与 M4-T2 接线断言依赖）。
vi.mock('@luban-cad/viewer', () => ({
  useViewport: viewerMocks.useViewport,
  useBriefcaseConnection: viewerMocks.useBriefcaseConnection,
  applyViewportBackground: viewerMocks.applyViewportBackground,
  ensureEditTools: viewerMocks.ensureEditTools,
  toggleProjectExtents: viewerMocks.toggleProjectExtents,
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

const ITWIN_DETAIL = {
  id: 'itwin-1',
  displayName: '演示文档',
  status: 'Active',
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

// B6 M-A5 T1：画布 body 选中桥（useCanvasBodySelection）的 SelectionSet 最小桩
// ——空 elements + BeEvent 兼容 onChanged（addListener 返回退订；raise 直发）。
// 本文件所有用例的 body 读面缺省空集、选择集缺省空 → 等值守卫不写 store，
// 不改变既有断言面。
function makeSelectionSetStub() {
  const listeners = new Set<() => void>();
  return {
    elements: new Set<string>(),
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
      raise: (): void => {
        for (const fn of [...listeners]) fn();
      },
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
  view: {
    displayStyle: { backgroundColor: undefined },
    viewsCategory: vi.fn<() => boolean>().mockReturnValue(true),
    viewsModel: vi.fn<() => boolean>().mockReturnValue(true),
    is2d: vi.fn<() => boolean>().mockReturnValue(false),
    isSpatialView: vi.fn<() => boolean>().mockReturnValue(false),
    categorySelector: { categories: ['cat-1', 'cat-2'] },
    modelSelector: { models: ['model-1'] },
  },
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
    canvas: { selection: [], hiddenIds: [], selectionMode: 'body' },
    dialog: { active: null },
    viewOnly: { isActive: false },
  });
}

function pageTree(): React.JSX.Element {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/documents/itwin-1/im-1']}>
        <Routes>
          <Route path="/documents/:iTwinId/:iModelId" element={<PartStudioPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderPage(): ReturnType<typeof render> {
  return render(pageTree());
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  mocks.itwinsGet.mockResolvedValue(ITWIN_DETAIL);
  mocks.imodelsGet.mockResolvedValue(IMODEL_DETAIL);
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
  // M4-T3：注册编排桩复位（mockReset 清实现，重挂成功缺省）。
  viewerMocks.ensureEditTools.mockReset().mockResolvedValue(undefined);
  // M4-T4：连接替身桩复位（作用域进入成功路径 + 干净事务态）。exit 按真实
  // 契约回 Promise（卸载退出链 .catch 依赖）。
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

  it('左栏：竖图标条 + 双段树（特征段 / 零件段；M4-T6 真数据源接线，假 Part 1 占位移除）', async () => {
    renderPage();
    const rail = screen.getByTestId('part-studio-icon-rail');
    expect(within(rail).getByRole('button', { name: '特征' })).toBeDefined();
    expect(within(rail).getByRole('button', { name: '零件' })).toBeDefined();

    const tree = screen.getByTestId('part-studio-tree');
    expect(within(tree).getByRole('button', { name: '特征' })).toBeDefined();
    expect(within(tree).getByTestId('part-studio-feature-list')).toBeDefined();
    expect(within(tree).getByRole('button', { name: '零件' })).toBeDefined();
    // 空数据落定后两段均 empty 态（壳期「假 Part 1」占位随真数据源接线移除）；
    // 读树/零件段查询异步，先过 loading 骨架。
    expect(await within(tree).findByText('暂无特征')).toBeDefined();
    expect(await within(tree).findByText('暂无零件')).toBeDefined();
  });

  it('双段树：段头点击收起列表并写 store tree.activeTab', async () => {
    const user = userEvent.setup();
    renderPage();
    const featuresHeader = within(screen.getByTestId('part-studio-tree')).getByRole('button', { name: '特征' });
    expect(featuresHeader.getAttribute('aria-expanded')).toBe('true');
    await user.click(featuresHeader);
    expect(featuresHeader.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('part-studio-feature-list')).toBeNull();
    expect(usePartStudioStore.getState().tree.activeTab).toBe('features');
    await user.click(within(screen.getByTestId('part-studio-tree')).getByRole('button', { name: '零件' }));
    expect(usePartStudioStore.getState().tree.activeTab).toBe('parts');
    expect(screen.queryByTestId('part-studio-part-list')).toBeNull();
  });

  it('画布：part-studio-canvas 锚点 + viewport 挂载点', () => {
    renderPage();
    const canvas = screen.getByTestId('part-studio-canvas');
    expect(within(canvas).getByTestId('part-studio-viewport')).toBeDefined();
  });

  it('右停靠：三页签 + 点击写 store 并展开占位内容，再点活动页签收合', async () => {
    const user = userEvent.setup();
    renderPage();
    const dock = screen.getByTestId('part-studio-dock');
    const historyTab = within(dock).getByRole('tab', { name: '版本历史' });
    expect(within(dock).getByRole('tab', { name: '工具设置' })).toBeDefined();
    expect(within(dock).getByRole('tab', { name: '显示设置' })).toBeDefined();

    // 首击：写活动页签 + 展开占位内容。
    await user.click(historyTab);
    expect(usePartStudioStore.getState().dock.activeTab).toBe('history');
    expect(usePartStudioStore.getState().dock.isOpen).toBe(true);
    expect(within(dock).getByTestId('part-studio-dock-body')).toBeDefined();
    // 换页签：内容随页签切换、保持展开。
    await user.click(within(dock).getByRole('tab', { name: '显示设置' }));
    expect(usePartStudioStore.getState().dock.activeTab).toBe('display');
    expect(within(dock).getByTestId('part-studio-dock-body')).toBeDefined();
    // 再点活动页签：收合。
    await user.click(within(dock).getByRole('tab', { name: '显示设置' }));
    expect(usePartStudioStore.getState().dock.isOpen).toBe(false);
    expect(within(dock).queryByTestId('part-studio-dock-body')).toBeNull();
  });

  it('页签条：适应视图钮 + 「+」（T7 开页签管理器）+ 活动页签 Part Studio 1', async () => {
    const user = userEvent.setup();
    renderPage();
    const strip = screen.getByTestId('part-studio-tab-strip');
    expect(within(strip).getByRole('button', { name: '适应视图' })).toBeDefined();
    const newTabButton = within(strip).getByRole('button', { name: '新建页签' });
    // T7 起「+」启用（os-33 页签管理器入口；T3 壳期禁用位收口）。
    expect(newTabButton.getAttribute('aria-disabled')).not.toBe('true');
    await user.click(newTabButton);
    // 页签管理器对话框打开（底栏快捷键标注为其结构锚点）。
    expect(await screen.findByText('页签管理器 (alt+~+t)')).toBeDefined();
    const tab = within(strip).getByRole('tab', { name: 'Part Studio 1' });
    expect(tab.getAttribute('aria-selected')).toBe('true');
  });

  it('状态栏：连接态（useViewport ready → 已连接）+ 编辑模式 + 单位 + 视图类型', () => {
    renderPage();
    const statusBar = screen.getByTestId('part-studio-status-bar');
    expect(within(statusBar).getByText('已连接')).toBeDefined();
    expect(within(statusBar).getByText('零件')).toBeDefined();
    expect(within(statusBar).getByText('mm')).toBeDefined();
    expect(within(statusBar).getByText('等轴测')).toBeDefined();
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
    const save = (await within(screen.getByTestId('part-studio-top-bar')).findByRole('button', {
      name: '保存版本',
    })) as HTMLButtonElement;
    await user.click(save);
    expect(screen.queryByRole('dialog', { name: '保存版本' })).toBeNull();
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

  it('顶栏三钮：干净事务态 undo/redo 禁用、保存版本可用（命名当前 changeset）；事件驱动可解锁', async () => {
    const user = userEvent.setup();
    renderPage();
    const topBar = screen.getByTestId('part-studio-top-bar');
    // iTwinUI v3 美观禁用口径：disabled 属性或 aria-disabled 均算禁用
    //（PartStudioTopBar.test 同款判定）。
    const isDisabled = (button: HTMLElement): boolean =>
      (button as HTMLButtonElement).disabled === true
      || button.getAttribute('aria-disabled') === 'true';
    const undo = within(topBar).getByRole('button', { name: '撤消' });
    const redo = within(topBar).getByRole('button', { name: '重做' });
    const save = within(topBar).getByRole('button', { name: '保存版本' });
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
    const topBar = screen.getByTestId('part-studio-top-bar');
    const save = (await within(topBar).findByRole('button', { name: '保存版本' })) as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    await user.click(save);

    // Named Version 对话框就位（名称必填 + 确认回传 draft）。
    const dialog = await screen.findByRole('dialog', { name: '保存版本' });
    const confirm = within(dialog).getByRole('button', { name: '保存' });
    expect(
      (confirm as HTMLButtonElement).disabled === true
        || confirm.getAttribute('aria-disabled') === 'true',
    ).toBe(true);
    await user.type(within(dialog).getByLabelText(/版本名称/), 'V1');
    await user.type(within(dialog).getByLabelText(/版本描述/), 'first');
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
    const topBar = screen.getByTestId('part-studio-top-bar');
    const save = (await within(topBar).findByRole('button', { name: '保存版本' })) as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));

    await user.click(save);
    const dialog = await screen.findByRole('dialog', { name: '保存版本' });
    await user.type(within(dialog).getByLabelText(/版本名称/), '收敛验证');
    await user.click(within(dialog).getByRole('button', { name: '保存' }));

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

    const topBar = screen.getByTestId('part-studio-top-bar');
    const undo = await within(topBar).findByRole('button', { name: '撤消' });
    const redo = within(topBar).getByRole('button', { name: '重做' });
    const save = within(topBar).getByRole('button', { name: '保存版本' });
    await waitFor(() => expect(undo.getAttribute('aria-disabled')).not.toBe('true'));
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
    expect(screen.queryByRole('dialog', { name: '保存版本' })).toBeNull();
  });

  it('editorToolSettings 配置段：viewport+connection+scope 就绪 → 类目补全（Editor.tsx:200-235 移植）', async () => {
    renderPage();
    await waitFor(() =>
      expect(FAKE_CONNECTION.editorToolSettings.category).toBe('cat-1'),
    );
    // 非空间视图（stub isSpatialView=false）不触发项目范围装饰件。
    expect(viewerMocks.toggleProjectExtents).not.toHaveBeenCalled();
  });

  it('空间视图：项目范围装饰件默认开启（toggleProjectExtents(conn, true)）', async () => {
    (FAKE_VIEWPORT.view.isSpatialView as ReturnType<typeof vi.fn>).mockReturnValue(true);
    renderPage();
    await waitFor(() =>
      expect(viewerMocks.toggleProjectExtents).toHaveBeenCalledWith(FAKE_CONNECTION, true),
    );
  });
});

describe('M4-T6 拉伸闭环接线（Session 内层特征系统 + 树/对话框消费）', () => {
  it('Session 内层挂 useFeatureSystem：RPC 读树（connection.key）+ 编辑作用域就绪后申请写租约', async () => {
    renderPage();
    await waitFor(() => expect(featureRpc.getFeatureTree).toHaveBeenCalledWith('briefcase-key'));
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
    await user.selectOptions(within(dialog).getByRole('combobox', { name: '草图' }), 'sk-1');
    await within(dialog).findByText('草图 1 的面');
    await user.click(within(dialog).getByRole('button', { name: '确认' }));
    await waitFor(() =>
      expect(featureRpc.applyFeatureOp).toHaveBeenCalledWith(
        'briefcase-key',
        {
          kind: 'insertFeature',
          featureType: 'extrude',
          params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0] },
        },
        expect.any(String),
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
    await user.click(within(dock).getByRole('tab', { name: '版本历史' }));
    expect(mocks.imodelsListChangesets).toHaveBeenCalledWith('im-1');

    const list = await within(dock).findByTestId('part-studio-changesets-list');
    const rows = within(list).getAllByTestId('part-studio-changeset-row');
    expect(rows).toHaveLength(2);
    // 当前版本标记数据源 = connection.changeset.id（'cs-2'）。
    expect(within(rows[0]!).getByText('当前版本')).toBeDefined();
    expect(within(rows[1]!).queryByText('当前版本')).toBeNull();
  });

  it('dock 推送钮：点击开共享推送对话框（与顶栏同实例），确认走 connection.pushChanges', async () => {
    const user = userEvent.setup();
    FAKE_CONNECTION.txns.hasPendingTxns.mockResolvedValue(true);
    renderPage();
    await waitFor(() =>
      expect((screen.getByTestId('part-studio-save-button') as HTMLButtonElement).disabled).toBe(false),
    );
    const dock = screen.getByTestId('part-studio-dock');
    await user.click(within(dock).getByRole('tab', { name: '版本历史' }));
    const push = await within(dock).findByTestId('part-studio-dock-push-button');
    await user.click(push);

    // B-model P0 Task 5：dock「推送」仍开 PushChangesetDialog（标题「推送变更」，
    // 与顶栏「保存版本」Named Version 对话框语义分离）。
    const dialog = await screen.findByRole('dialog', { name: '推送变更' });
    await user.type(within(dialog).getByLabelText(/版本描述/), 'dock 推送');
    await user.click(within(dialog).getByRole('button', { name: '推送' }));
    await waitFor(() => expect(FAKE_CONNECTION.pushChanges).toHaveBeenCalledWith('dock 推送'));
  });

  it('dock 保存钮：本地兜底通道（connection.saveChanges），与推送语义分离保留', async () => {
    const user = userEvent.setup();
    FAKE_CONNECTION.txns.hasPendingTxns.mockResolvedValue(true);
    renderPage();
    const dock = screen.getByTestId('part-studio-dock');
    await user.click(within(dock).getByRole('tab', { name: '版本历史' }));
    const save = await within(dock).findByTestId('part-studio-dock-save-button');
    await user.click(save);
    await waitFor(() => expect(FAKE_CONNECTION.saveChanges).toHaveBeenCalledTimes(1));
    expect(FAKE_CONNECTION.pushChanges).not.toHaveBeenCalled();
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

  it('连接失败：画布错误面（error.message 透传）+ 状态栏连接失败（briefcase 失败优先于 host ready 相位）+ 诚实重试路径无假重试钮', () => {
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
    // 无假重试钮：重开=切页签/重进的真实路径，错误面只给指引不放行不通的按钮。
    expect(within(face).queryByRole('button')).toBeNull();
    // 状态栏同步失败态——host 相位 ready 被 briefcase 失败覆盖（T2-② 缺陷本体）。
    expect(within(screen.getByTestId('part-studio-status-bar')).getByText('连接失败')).toBeDefined();
  });

  it('下载中：状态栏「正在打开文档…」+ 画布骨架覆盖层（五区在场不重排——零布局跳动）', () => {
    viewerMocks.useBriefcaseConnection.mockReturnValue(openingMock());
    renderPage();
    expect(within(screen.getByTestId('part-studio-status-bar')).getByText('正在打开文档…')).toBeDefined();
    expect(within(screen.getByTestId('part-studio-canvas')).getByTestId('part-studio-connection-loading')).toBeDefined();
    // 覆盖层为绝对定位叠加：五区结构照常在场（不因连接相位重排布局）。
    expect(screen.getByTestId('part-studio-top-bar')).toBeDefined();
    expect(screen.getByTestId('part-studio-sidebar')).toBeDefined();
    expect(screen.getByTestId('part-studio-dock')).toBeDefined();
    expect(screen.getByTestId('part-studio-status-bar')).toBeDefined();
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
    expect(within(screen.getByTestId('part-studio-status-bar')).getByText('连接失败')).toBeDefined();

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
    const save = (await within(screen.getByTestId('part-studio-top-bar')).findByRole('button', { name: '保存版本' })) as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    await user.click(save);
    expect(await screen.findByRole('dialog', { name: '保存版本' })).toBeDefined();
    // 开对话框路径本身无 toast（兜底只在「开→断」跃迁发声）。
    expect(coreFrontendMocks.outputMessage).not.toHaveBeenCalled();

    // 连接消失（页签切换重开连接的中间态——「断开后重开中」，同 openingMock
    // 相位）：mock 翻转 + rerender 驱动 hook 重查询。
    viewerMocks.useBriefcaseConnection.mockReturnValue(openingMock());
    await act(async () => {
      await rerender(pageTree());
    });

    // 对话框收合 + toast 说明（notifications 通道）——不无声消失。
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '保存版本' })).toBeNull());
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
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '保存版本' })).toBeNull());
    expect(coreFrontendMocks.outputMessage).toHaveBeenCalledTimes(1);
  });
});
