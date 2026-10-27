// src/modules/part-studio/test/part-studio-structure.test.tsx
//
// M3 Task 8（brief Step 1）+ M4 Task 9（结构断言扩展）：编辑器结构断言总账——
// /documents/:iTwinId/:iModelId Part Studio 页全量结构锚点钉死（对齐
// os-11/12/15/20/23/24/30/31/33）：
//  1) 五区存在性：顶栏（part-studio-top-bar）/ 左栏（part-studio-sidebar =
//     竖图标条 + 双段树）/ 画布（part-studio-canvas + viewport 挂载点）/
//     右停靠（part-studio-dock 三页签）/ 底部页签条（part-studio-tab-strip
//     + part-studio-status-bar）；
//  2) ribbon：27 工具主钮全渲染（os-11 顺序 + 中文可访问名）+ 8 下拉锚点
//     （data-testid=part-studio-ribbon-dropdown-*，箭头钮 aria-haspopup=menu）
//     + 11 分组（特征工具 toolbar）；full 工具点击投 IModelApp.tools.run，
//     gated 工具点击开能力引导对话框；命令搜索触发钮（搜索工具… alt+/）；
//  3) 命令搜索（os-23）：alt+/ 开 → 输入过滤 → Escape 闭；
//  4) 画布右键（os-12）：空白态菜单（适应视图/四标准视图/显示设置）；
//     选中态（part）重构（隐藏/缩放/垂直于/材料·外观·工程图/删除）；
//  5) 双段树（os-11 左栏）：特征段 + 零件段 + 段头计数 + 语法筛选框；
//  6) 对话框锚点：FeatureDialog（os-31 非模态 aria-modal=false + 布尔作用域
//     页签）/ SketchDialog（os-30 四开关 + ✓进草图模式 ribbon 变身）/
//     TabManagerDialog（os-33 「+」打开）/ DocumentMenuBar（os-24 汉堡 11 项
//     + 工作区单位对话框）；
//  7) M4 收官锚点总账（T9 扩展）：顶栏 undo/redo/saveVersion 三钮
//     （part-studio-{undo,redo,save}-button）、连接相位（状态栏
//     part-studio-status-connection 三相位映射）、视口挂载点接线
//     （useViewport.viewportRef 即 part-studio-viewport DOM 节点 +
//     data-viewport-ready）、特征树真数据钩子（useFeatureSystem.tree 条目
//     落树 + 零件段物理元素查询）、PushChangesetDialog 挂载（描述/确认锚点
//     + pushChanges 通道）。
//
// 定位：结构层总账（与各任务单测互补——单测钉行为，本文件钉「整页装配后
// 所有锚点同时在场」）。mock 口径同 PartStudioPage.test.tsx M4 基线（客户端/
// viewer-next 模块级 mock + 连接/视口替身 FAKE_CONNECTION/FAKE_VIEWPORT +
// 特征 RPC 钉形——真实 store/hooks/i18n 参与，零真实请求/零查看器）；
// @itwin/core-frontend 用 importOriginal 摊平（真实类/常量保留，IModelApp 钉
// 就绪态 + tools.run/notifications 可观测）。
//
// 另见：PartStudioPage.test.tsx（五区+store 接线+M4 行为链）、
// ribbon-registry.test.ts（注册表纯枚举）、CommandPalette.test.tsx（面板
// 行为）、CanvasContextMenu.test.tsx（菜单模型）、FeatureDialog/SketchDialog/
// TabManagerDialog/DocumentMenuBar/PushChangesetDialog.test.tsx（各对话框
// 行为）、useUndoRedo/useFeatureSystem/useEditingScope/useChangesets.test
// （各 hook 行为）。

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider as IuiThemeProvider } from '@itwin/itwinui-react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  itwinsGet: vi.fn(),
  imodelsGet: vi.fn(),
  imodelsList: vi.fn(),
  // M4-T9：版本历史数据源（PushChangesetDialog 挂载锚点的面板查询通道）。
  imodelsListChangesets: vi.fn(),
  // M5-T3：iModel 级我的权限查询（briefcase readonly 合流的数据源）。
  accessControlGetMyPermissions: vi.fn(),
  toolsRun: vi.fn(),
  // M6-a T5：草图绘制工具注册面（registerSketchTools 经 initTools 懒引注册）。
  toolsRegister: vi.fn(),
  // M4-T9：IModelApp.notifications 呈现面捕获（toast 行为归对话框/页面测试，
  // 此处只需通道在场不抛）。
  outputMessage: vi.fn(),
}));

// M4-T9：viewer-next 桩从 M3 壳口径（null 连接/无视口）升级为可控钉形——
// M4 真连接组合（PartStudioSession 双层 + 编辑三钮 + 特征系统）整页参与。
const viewerMocks = vi.hoisted(() => ({
  useViewport: vi.fn(),
  useBriefcaseConnection: vi.fn(),
  applyViewportBackground: vi.fn(),
  ensureEditTools: vi.fn().mockResolvedValue(undefined),
  toggleProjectExtents: vi.fn(),
}));

// M4-T9：特征系统 RPC 替身（真实 useFeatureSystem 参与下的树真数据源——
// 读树/写租约/op 提交全部可观测，隔离 LubanFeatureRpcInterface 注册态依赖）。
const featureRpc = vi.hoisted(() => {
  // FeatureTreeEntry 结构面（hoisted 工厂先于 import，钉局部结构型）。
  type TreeEntry = {
    id: string; featureType: string; orderKey: number;
    suppressed: boolean; status: number; params: unknown;
  };
  return {
  getFeatureTree: vi.fn(async (_key: string): Promise<TreeEntry[]> => []),
  applyFeatureOp: vi.fn(
    async (_key: string, _op: unknown, _sessionId: string): Promise<{ ok: boolean; featureId?: string }> =>
      ({ ok: true, featureId: 'f-new' }),
  ),
  acquireWriteLease: vi.fn(async (_key: string, _sessionId: string) => ({ ok: true, holder: 'tester' })),
  releaseWriteLease: vi.fn(async (_key: string, _sessionId: string) => undefined),
  // M6-b T5：useSketchSystem 活动草图读面（SketchPanel 数据源；无活动草图 → undefined）。
  getSketch: vi.fn(async (_key: string, _sketchId: string): Promise<unknown> => undefined),
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
    create = vi.fn();
    delete = vi.fn();
  },
}));

// M5-T3：权限判定数据层替身（缺省=创建者权限组，editable——本文件「三钮
// 解锁即投通道」的锚点前提；门禁/合流行为细节归 PartStudioPage.test.tsx）。
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

// core-frontend 钉形（M4-T9 升级为 importOriginal 摊平）：真实类/常量保留
//（ViewerNotifications 的 NotificationManager 基类链在模块加载期即需要），
// IModelApp 钉就绪态（initialized/toolAdmin——防 waitForToolAdmin 白等 5s）
// + tools.run / notifications.outputMessage 可观测；viewManager 无视口 →
// useCanvasSelection emphasize effect 静默跳过。
vi.mock('@itwin/core-frontend', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    IModelApp: {
      ...(actual.IModelApp as object),
      initialized: true,
      toolAdmin: { startDefaultTool: vi.fn() },
      viewManager: { selectedView: undefined },
      notifications: { outputMessage: mocks.outputMessage },
      tools: { run: mocks.toolsRun, register: mocks.toolsRegister },
    },
  };
});

// viewer-next 钉形：连接/视口相位由 beforeEach 按用例钉（缺省 ready +
// FAKE_VIEWPORT，见下方 M4 基线段）。
vi.mock('@luban-cad/viewer-next', () => ({
  useViewport: viewerMocks.useViewport,
  useBriefcaseConnection: viewerMocks.useBriefcaseConnection,
  applyViewportBackground: viewerMocks.applyViewportBackground,
  ensureEditTools: viewerMocks.ensureEditTools,
  toggleProjectExtents: viewerMocks.toggleProjectExtents,
  acquireViewer: vi.fn().mockResolvedValue(undefined),
  releaseViewer: vi.fn().mockResolvedValue(undefined),
  ensureAccuSnap: vi.fn().mockResolvedValue(undefined),
}));

// M4-T9：特征 RPC 接口钉形（真实 useFeatureSystem 消费 getClient）。
vi.mock('@luban-cad/shared', () => ({
  LUBAN_INIT_TXN_DESCRIPTION: 'partstudio init',
  LubanFeatureRpcInterface: {
    getClient: () => featureRpc,
  },
}));

import { usePartStudioStore } from '../index.js';
import { PartStudioPage } from '../PartStudioPage.js';

const ITWIN_DETAIL = { id: 'itwin-1', displayName: '演示文档', status: 'Active' };
const IMODEL_DETAIL = { id: 'im-1', displayName: '楼层模型', name: '楼层模型', iTwinId: 'itwin-1' };

// ── M4-T9 连接/视口替身（PartStudioPage.test 同构；真实 hooks 参与下的最小
//    连接桩：txns 事件 BeEvent 兼容双面 + 物理元素查询游标 + 推送/保存代理）──
function makeTxnsStub() {
  const makeEvent = () => {
    const listeners = new Set<() => void>();
    return {
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

const FAKE_CONNECTION = {
  key: 'briefcase-key',
  isReadonly: false,
  isBriefcaseConnection: () => true,
  txns: makeTxnsStub(),
  editingScope: undefined as unknown,
  supportsGraphicalEditing: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
  enterEditingScope: vi.fn(),
  saveChanges: vi.fn<(description?: string) => Promise<void>>().mockResolvedValue(undefined),
  pushChanges: vi.fn<(description: string) => Promise<{ id: string; index: number }>>()
    .mockResolvedValue({ id: 'cs-new', index: 3 }),
  changeset: { id: 'cs-2', index: 2 },
  editorToolSettings: { category: undefined, model: undefined },
  // M5-T1（D-T9-4 层2）：useFeatureDisplaySync 的 undo/redo 全量失效扫
  // connection.tiles（可迭代；空集=零 extant tree）。
  tiles: [],
  // 零件段物理元素查询替身：缺省空集（异步可迭代）；真数据用例 mockImplementation 换真集。
  createQueryReader: vi.fn((): AsyncGenerator<string[], void, unknown> => (async function* () { /* 空集 */ })()),
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
};

// 视口挂载点接线断言的数据面：useViewport 出口 ref（渲染后应指向
// part-studio-viewport DOM 节点）。
const VIEWPORT_REF: { current: HTMLDivElement | null } = { current: null };

/** os-11 工具顺序的 27 主钮可访问名（zh-CN 基线；▾=携带下拉飞菜单）。 */
const EXPECTED_TOOL_LABELS = [
  '草图', '拉伸', '旋转', '扫掠', '放样',
  '加厚', '圆角', '倒角', '拔模', '抽壳', '孔', '外部螺纹',
  '线性阵列', '镜像',
  '布尔运算', '分割', '变换', '删除零件',
  '修改圆角', '删除面', '移动面', '替换面',
  '平面', '框架', '钣金模型', '添加自定义特征', '曲面/曲线',
] as const;

/** os-20 的 8 个下拉飞菜单宿主 toolId（data-testid 锚点）。 */
const EXPECTED_DROPDOWN_IDS = [
  'thicken', 'RoundEdges', 'DraftFaces', 'LinearPattern',
  'transform', 'frame', 'sheetMetalStart', 'surfaceCurve',
] as const;

/** os-11 分组可访问名（特征工具 toolbar 的 11 个 role=group）。 */
const EXPECTED_GROUP_LABELS = [
  '草图', '创建', '工程特征', '阵列', '组合', '直接编辑',
  '参考几何', '框架', '钣金', '自定义特征', '曲面/曲线',
] as const;

/** store 全切片复位（八切片回缺省，用例间互不渗漏）。 */
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
  });
}

function renderPage(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // IuiThemeProvider：与生产装配（AppProviders）一致——DropdownMenu 的 portal
  // 容器由 ThemeProvider 提供（body 下 div[data-iui-portal]）；缺它则 iTwinUI
  // Portal 无容器回退原地渲染，portal 逃逸断言（C2/D1）测不出真实行为。
  return render(
    <QueryClientProvider client={queryClient}>
      <IuiThemeProvider>
        <MemoryRouter initialEntries={['/documents/itwin-1/im-1']}>
          <Routes>
            <Route path="/documents/:iTwinId/:iModelId" element={<PartStudioPage />} />
          </Routes>
        </MemoryRouter>
      </IuiThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  mocks.itwinsGet.mockResolvedValue(ITWIN_DETAIL);
  mocks.imodelsGet.mockResolvedValue(IMODEL_DETAIL);
  mocks.imodelsList.mockResolvedValue([IMODEL_DETAIL]);
  // M4-T9：dock 版本历史查询零真实请求（默认空集）。
  mocks.imodelsListChangesets.mockResolvedValue([]);
  // M5-T3：权限查询缺省=创建者权限组（editable）——canEdit 门全开，本文件的
  // 锚点断言不因权限查询相位漂移。
  mocks.accessControlGetMyPermissions.mockResolvedValue([
    'imodels_webview',
    'imodels_read',
    'imodels_write',
  ]);
  mocks.toolsRun.mockResolvedValue(true);
  // M4-T3：注册编排桩复位（mockReset 清实现，重挂成功缺省）。
  viewerMocks.ensureEditTools.mockReset().mockResolvedValue(undefined);
  // M4-T4：连接替身桩复位（作用域进入成功路径 + 干净事务态）。
  FAKE_CONNECTION.supportsGraphicalEditing.mockResolvedValue(true);
  FAKE_CONNECTION.enterEditingScope.mockResolvedValue({
    isDisposed: false,
    exit: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  });
  FAKE_CONNECTION.saveChanges.mockResolvedValue(undefined);
  FAKE_CONNECTION.pushChanges.mockResolvedValue({ id: 'cs-new', index: 3 });
  FAKE_CONNECTION.txns.isUndoPossible.mockResolvedValue(false);
  FAKE_CONNECTION.txns.isRedoPossible.mockResolvedValue(false);
  FAKE_CONNECTION.txns.hasPendingTxns.mockResolvedValue(false);
  // M4-T9 viewer-next 桩：连接就绪（真实 useUndoRedo/useEditingScope/
  // useFeatureSystem 参与的 M4 基线）+ viewport 就位 + ready 相位。
  viewerMocks.useBriefcaseConnection.mockReturnValue({
    connection: FAKE_CONNECTION as unknown as never,
    isLoading: false,
    error: null,
    saveChanges: vi.fn().mockResolvedValue(undefined),
    pushChanges: vi.fn().mockResolvedValue(undefined),
    pullChanges: vi.fn().mockResolvedValue(undefined),
  });
  viewerMocks.useViewport.mockReturnValue({
    viewportRef: VIEWPORT_REF,
    phase: 'ready',
    error: null,
    viewport: FAKE_VIEWPORT,
  });
  VIEWPORT_REF.current = null;
});

describe('五区存在性（os-11 布局壳）', () => {
  it('顶栏/左栏/画布/右停靠/底部页签条五区锚点同时在场', () => {
    renderPage();
    expect(screen.getByTestId('part-studio-top-bar')).toBeDefined();
    expect(screen.getByTestId('part-studio-sidebar')).toBeDefined();
    expect(screen.getByTestId('part-studio-icon-rail')).toBeDefined();
    expect(screen.getByTestId('part-studio-tree')).toBeDefined();
    const canvas = screen.getByTestId('part-studio-canvas');
    expect(within(canvas).getByTestId('part-studio-viewport')).toBeDefined();
    expect(screen.getByTestId('part-studio-dock')).toBeDefined();
    expect(screen.getByTestId('part-studio-tab-strip')).toBeDefined();
    expect(screen.getByTestId('part-studio-status-bar')).toBeDefined();
  });
});

describe('工具 ribbon（27 工具 + 8 下拉 + 命令搜索触发钮，os-11/os-20）', () => {
  it('27 工具主钮全渲染（特征工具 toolbar + 11 分组）', () => {
    renderPage();
    const ribbon = screen.getByTestId('part-studio-ribbon');
    const toolbar = within(ribbon).getByRole('toolbar', { name: '特征工具' });
    for (const groupLabel of EXPECTED_GROUP_LABELS) {
      expect(within(toolbar).getByRole('group', { name: groupLabel })).toBeDefined();
    }
    for (const label of EXPECTED_TOOL_LABELS) {
      expect(
        within(toolbar).getByRole('button', { name: label }),
        `ribbon 缺少工具 ${label}`,
      ).toBeDefined();
    }
  });

  it('8 下拉锚点在场（data-testid + 箭头钮 aria-haspopup=menu），变换飞菜单展开子项（portal 逃逸到 body 外）', async () => {
    const user = userEvent.setup();
    renderPage();
    const ribbon = screen.getByTestId('part-studio-ribbon');
    for (const id of EXPECTED_DROPDOWN_IDS) {
      expect(
        within(ribbon).getByTestId(`part-studio-ribbon-dropdown-${id}`),
        `ribbon 缺少下拉锚点 ${id}`,
      ).toBeDefined();
    }
    // 箭头钮开合飞菜单（os-20 交互基线；aria 语义由 DropdownMenu 落在触发钮）。
    const arrow = within(ribbon).getByRole('button', { name: '变换 ▾' });
    expect(arrow.getAttribute('aria-haspopup')).toBe('menu');
    expect(arrow.getAttribute('aria-expanded')).toBe('false');
    await user.click(arrow);
    expect(arrow.getAttribute('aria-expanded')).toBe('true');
    // C2/D1：飞菜单 portal 到 document.body（ribbon overflow-x 滚动容器外，
    // 不再被裁剪）——查询必须挂 body 根，防「容器内假绿」。
    const menu = within(document.body).getByRole('menu', { name: '变换' });
    expect(ribbon.contains(menu)).toBe(false);
    expect(within(menu).getByRole('menuitem', { name: '包覆' })).toBeDefined();
    expect(within(menu).getByRole('menuitem', { name: '印花' })).toBeDefined();
    // 子项点击 → 激活（wrap 在册 full → tools.run）+ 菜单收合（closeOnItemClick 缺省）。
    await user.click(within(menu).getByRole('menuitem', { name: '包覆' }));
    expect(mocks.toolsRun).toHaveBeenCalledWith('wrap');
    expect(usePartStudioStore.getState().tool.activeToolId).toBe('wrap');
    expect(within(document.body).queryByRole('menu', { name: '变换' })).toBeNull();
  });

  it('飞菜单键盘导航：ArrowDown 聚焦子项 + Escape 收合并还焦点（DropdownMenu，终审 T4-③）', async () => {
    const user = userEvent.setup();
    renderPage();
    const ribbon = screen.getByTestId('part-studio-ribbon');
    const arrow = within(ribbon).getByRole('button', { name: '变换 ▾' });
    await user.click(arrow);
    const menu = within(document.body).getByRole('menu', { name: '变换' });
    const firstItem = within(menu).getByRole('menuitem', { name: '包覆' });
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(firstItem);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: '印花' }));
    await user.keyboard('{Escape}');
    expect(within(document.body).queryByRole('menu', { name: '变换' })).toBeNull();
    // 焦点管理：收合后焦点还到触发钮。
    expect(document.activeElement).toBe(arrow);
  });

  it('拉伸/扫掠改道特征对话框（M4-T6/B3）；full 工具投 tools.run；gated 工具开能力引导对话框', async () => {
    const user = userEvent.setup();
    renderPage();
    const ribbon = screen.getByTestId('part-studio-ribbon');
    // 拉伸特例路由（M4-T6）：开 FeatureDialog（new/extrude），不投 tools.run。
    await user.click(within(ribbon).getByRole('button', { name: '拉伸' }));
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'extrude',
    });
    await user.click(
      within(within(document.body).getByTestId('part-studio-feature-dialog')).getByRole('button', { name: '取消' }),
    );
    // B3：扫掠（SweepFaces 真实 toolId）改道 new/sweep 特征对话框（参数化特征链
    // 入口——旋转/放样/圆角同姿态）。
    await user.click(within(ribbon).getByRole('button', { name: '扫掠' }));
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'sweep',
    });
    await user.click(
      within(within(document.body).getByTestId('part-studio-feature-dialog')).getByRole('button', { name: '取消' }),
    );
    // full：倒角（ChamferEdges 在册 full，无对话框特例）→ tools.run + 激活态。
    await user.click(within(ribbon).getByRole('button', { name: '倒角' }));
    expect(mocks.toolsRun).toHaveBeenCalledWith('ChamferEdges');
    expect(usePartStudioStore.getState().tool.activeToolId).toBe('ChamferEdges');
    // gated：拔模 → 能力引导对话框（不投 tools.run）。
    mocks.toolsRun.mockClear();
    await user.click(within(ribbon).getByRole('button', { name: '拔模' }));
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(await screen.findByRole('dialog', { name: '拔模（规划中）' })).toBeDefined();
  });

  it('命令搜索触发钮在场（搜索工具… alt+/）', () => {
    renderPage();
    const ribbon = screen.getByTestId('part-studio-ribbon');
    expect(within(ribbon).getByRole('button', { name: /搜索工具/ })).toBeDefined();
  });
});

describe('命令搜索（alt+/ 开闭，os-23）', () => {
  it('alt+/ 开 → 输入过滤 → alt+/ 闭；再开 → Escape 闭', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByRole('dialog', { name: '搜索工具' })).toBeNull();
    // 开（热键走 window keydown）。
    fireEvent.keyDown(window, { key: '/', altKey: true });
    const dialog = await screen.findByRole('dialog', { name: '搜索工具' });
    // 输入过滤：圆角 → 圆角 + 修改圆角命中。
    await user.type(within(dialog).getByRole('textbox'), '圆角');
    const list = within(dialog).getByRole('list');
    expect(within(list).getByRole('button', { name: '圆角' })).toBeDefined();
    expect(within(list).getByRole('button', { name: '修改圆角' })).toBeDefined();
    // alt+/ 再击收合。
    fireEvent.keyDown(window, { key: '/', altKey: true });
    expect(screen.queryByRole('dialog', { name: '搜索工具' })).toBeNull();
    // 再开后 Escape 收合。
    fireEvent.keyDown(window, { key: '/', altKey: true });
    expect(await screen.findByRole('dialog', { name: '搜索工具' })).toBeDefined();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '搜索工具' })).toBeNull();
  });
});

describe('画布右键菜单（os-12 选择驱动）', () => {
  it('空白态：适应视图/四标准视图/显示设置；Escape 收合', () => {
    renderPage();
    fireEvent.contextMenu(screen.getByTestId('part-studio-canvas'));
    const menu = screen.getByRole('menu', { name: '画布菜单' });
    for (const label of ['适应视图', '顶视图', '前视图', '右视图', '等轴测视图', '显示设置']) {
      expect(within(menu).getByRole('menuitem', { name: label })).toBeDefined();
    }
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: '画布菜单' })).toBeNull();
  });

  it('选中态（part）：隐藏/缩放到合适大小/视图垂直于/材料·外观·工程图/删除重构', () => {
    renderPage();
    act(() => {
      usePartStudioStore.getState().setCanvasSelection([{ kind: 'part', id: 'p1', label: 'Part 1' }]);
    });
    fireEvent.contextMenu(screen.getByTestId('part-studio-canvas'));
    const menu = screen.getByRole('menu', { name: '画布菜单' });
    for (const label of [
      '隐藏 Part 1',
      '缩放到合适大小',
      '视图垂直于',
      '将材料指定用于 Part 1…',
      '编辑 Part 1 的外观…',
      '创建 Part 1 的工程图…',
      '删除 Part 1',
    ]) {
      expect(within(menu).getByRole('menuitem', { name: label }), `画布菜单缺少 ${label}`).toBeDefined();
    }
  });
});

describe('双段树（os-11 左栏）', () => {
  it('特征段 + 零件段 + 段头计数 + 语法筛选框', () => {
    renderPage();
    const tree = screen.getByTestId('part-studio-tree');
    expect(within(tree).getByRole('button', { name: '特征' })).toBeDefined();
    expect(within(tree).getByRole('button', { name: '零件' })).toBeDefined();
    expect(within(tree).getByTestId('part-studio-feature-count').textContent).toBe('(0)');
    expect(within(tree).getByTestId('part-studio-part-count')).toBeDefined();
    expect(within(tree).getByTestId('part-studio-feature-list')).toBeDefined();
    expect(within(tree).getByTestId('part-studio-part-list')).toBeDefined();
    expect(within(tree).getByPlaceholderText('按名称或类型筛选')).toBeDefined();
  });
});

describe('对话框锚点（os-31/os-30/os-33/os-24）', () => {
  it('FeatureDialog：非模态（aria-modal=false）+ 布尔作用域页签 + ✓/✗', async () => {
    const user = userEvent.setup();
    renderPage();
    act(() => {
      usePartStudioStore.getState().openFeatureDialog({
        mode: 'edit', featureId: 'f1', featureName: '拉伸 1', featureType: 'extrude',
      });
    });
    const dialog = await screen.findByTestId('part-studio-feature-dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    const scopeTabs = within(dialog).getByRole('tablist', { name: '布尔作用域' });
    for (const label of ['新建', '加入', '移除', '相交']) {
      expect(within(scopeTabs).getByRole('tab', { name: label })).toBeDefined();
    }
    // M6-a T6：实体选择框标签对齐 Onshape 采集规格（「要拉伸的面和草图面域」）。
    expect(within(dialog).getByText('要拉伸的面和草图面域')).toBeDefined();
    // ✗ 取消收合（非模态——画布锚点仍在场）。
    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(screen.queryByTestId('part-studio-feature-dialog')).toBeNull();
    expect(screen.getByTestId('part-studio-canvas')).toBeDefined();
  });

  it('SketchDialog：四开关在场，✓ 确认进草图模式（ribbon 变身 + 栅格/约束覆盖层）', async () => {
    const user = userEvent.setup();
    renderPage();
    // ribbon「草图」主钮 → SketchDialog（os-30 创建草图流程）。
    await user.click(
      within(screen.getByTestId('part-studio-ribbon')).getByRole('button', { name: '草图' }),
    );
    const dialog = await screen.findByTestId('part-studio-sketch-dialog');
    for (const label of ['禁用压印', '显示约束', '显示表达式', '显示错误']) {
      expect(within(dialog).getByRole('checkbox', { name: label })).toBeDefined();
    }
    await user.click(within(dialog).getByRole('button', { name: '确认' }));
    // 草图模式变身：草图工具组 ribbon + 退出草图钮 + 栅格/约束覆盖层 + 搜索禁用。
    const ribbon = screen.getByTestId('part-studio-ribbon');
    expect(within(ribbon).getByRole('toolbar', { name: '草图工具' })).toBeDefined();
    expect(within(ribbon).getByRole('button', { name: '退出草图' })).toBeDefined();
    expect(
      (within(ribbon).getByRole('button', { name: /搜索工具/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByTestId('sketch-grid-overlay')).toBeDefined();
    expect(screen.getByTestId('sketch-constraints-overlay')).toBeDefined();
    // 退出草图：特征 ribbon 还原。
    await user.click(within(ribbon).getByRole('button', { name: '退出草图' }));
    expect(within(screen.getByTestId('part-studio-ribbon')).getByRole('toolbar', { name: '特征工具' })).toBeDefined();
    expect(screen.queryByTestId('sketch-grid-overlay')).toBeNull();
  });

  it('TabManagerDialog：「+」打开（列表承载当前 iTwin 的 iModel）', async () => {
    const user = userEvent.setup();
    renderPage();
    const strip = screen.getByTestId('part-studio-tab-strip');
    await user.click(within(strip).getByRole('button', { name: '新建页签' }));
    const dialog = await screen.findByRole('dialog', { name: '页签管理器' });
    const list = await within(dialog).findByRole('list', { name: '页签列表' });
    expect(await within(list).findByText('楼层模型')).toBeDefined();
    await user.click(within(dialog).getByRole('button', { name: '关闭' }));
    expect(screen.queryByRole('dialog', { name: '页签管理器' })).toBeNull();
  });

  it('DocumentMenuBar：汉堡 11 项 + 工作区单位对话框', async () => {
    const user = userEvent.setup();
    renderPage();
    const topBar = screen.getByTestId('part-studio-top-bar');
    await user.click(within(topBar).getByRole('button', { name: '文档菜单' }));
    const menu = await screen.findByRole('menu');
    for (const label of [
      '重命名文档', '移至…', '文档详细信息…', '还原已删除的工作区…', '复制工作区…',
      '更新工作区…', '工作区单位…', '工作区属性…', '切换到仅查看模式', '打印…', '关闭文档',
    ]) {
      expect(within(menu).getByRole('menuitem', { name: label }), `文档菜单缺少 ${label}`).toBeDefined();
    }
    // full 项锚点：工作区单位… → 单位对话框（毫米唯一可用）。
    await user.click(within(menu).getByRole('menuitem', { name: '工作区单位…' }));
    expect(await screen.findByRole('dialog', { name: '工作区单位' })).toBeDefined();
  });
});

// ── M4 收官锚点总账（T9 结构断言扩展）────────────────────────────────────
// PartStudioPage.test.tsx 钉 M4 行为链；本文件以「整页装配后锚点同时在场」
// 的总账口径补钉 M4 五组新锚点：undo/redo/saveVersion 三钮、连接相位、
// 视口挂载点、特征树真数据钩子、PushChangesetDialog 挂载。
describe('M4 收官锚点总账（T9）', () => {
  // iTwinUI v3 美观禁用口径：disabled 属性或 aria-disabled 均算禁用
  //（PartStudioPage.test 同款判定）。
  const isDisabled = (button: HTMLElement): boolean =>
    (button as HTMLButtonElement).disabled === true
    || button.getAttribute('aria-disabled') === 'true';

  it('顶栏 undo/redo/saveVersion 三钮锚点在场；干净事务态诚实禁用，txns 解锁后撤销投标准工具 Undo', async () => {
    const user = userEvent.setup();
    renderPage();
    const topBar = screen.getByTestId('part-studio-top-bar');
    // testid 钉形（结构不变式）+ 可访问名钉形（os-11 操作簇：撤消/重做/保存版本）。
    expect(within(topBar).getByTestId('part-studio-undo-button')).toBeDefined();
    expect(within(topBar).getByTestId('part-studio-redo-button')).toBeDefined();
    expect(within(topBar).getByTestId('part-studio-save-button')).toBeDefined();
    expect(within(topBar).getByRole('button', { name: '撤消' })).toBeDefined();
    expect(within(topBar).getByRole('button', { name: '重做' })).toBeDefined();
    expect(within(topBar).getByRole('button', { name: '保存版本' })).toBeDefined();
    const undo = within(topBar).getByTestId('part-studio-undo-button');
    const save = within(topBar).getByTestId('part-studio-save-button');
    expect(isDisabled(undo)).toBe(true);
    expect(isDisabled(save)).toBe(true);

    // 事件驱动解锁（BriefcaseTxns 标准通道）：txns 查询桩翻真 + 重查询事件。
    FAKE_CONNECTION.txns.isUndoPossible.mockResolvedValue(true);
    FAKE_CONNECTION.txns.hasPendingTxns.mockResolvedValue(true);
    act(() => {
      FAKE_CONNECTION.txns.onAfterUndoRedo.raise();
    });
    await waitFor(() => expect(isDisabled(undo)).toBe(false));
    await waitFor(() => expect(isDisabled(save)).toBe(false));
    // 撤销点击 = 标准工具通道（useUndoRedo → IModelApp.tools.run('Undo')）。
    await user.click(undo);
    expect(mocks.toolsRun).toHaveBeenCalledWith('Undo');
  });

  it('连接相位驱动状态栏连接态：ready→已连接 / connecting→连接中 / error→连接失败', () => {
    // 缺省 ready 相位（beforeEach 钉形）。
    let page = renderPage();
    expect(screen.getByTestId('part-studio-status-connection').textContent).toBe('已连接');
    page.unmount();
    // 相位映射钉形（PartStudioTabs.connectionKey 全三分支）。
    for (const [phase, expected] of [
      ['connecting', '连接中'],
      ['error', '连接失败'],
    ] as const) {
      viewerMocks.useViewport.mockReturnValue({
        viewportRef: VIEWPORT_REF,
        phase,
        error: null,
        viewport: undefined,
      });
      page = renderPage();
      expect(screen.getByTestId('part-studio-status-connection').textContent).toBe(expected);
      page.unmount();
    }
  });

  it('视口挂载点接线：useViewport.viewportRef 即 part-studio-viewport DOM 节点 + viewport 就位 data-viewport-ready=true', () => {
    renderPage();
    // ref 身份断言：画布挂载点 div 就是 useViewport 出口 ref 的宿主（viewer-next
    // ScreenViewport 创建的挂载目标——jsdom 下可钉 DOM 接线事实）。
    const mount = screen.getByTestId('part-studio-viewport');
    expect(VIEWPORT_REF.current).toBe(mount);
    // viewport 实例下传画布（M4-T2 锚点）。
    expect(screen.getByTestId('part-studio-canvas').getAttribute('data-viewport-ready')).toBe('true');
  });

  it('特征树真数据钩子：useFeatureSystem.tree 条目落树（类型序号命名 + 段头计数）+ 零件段物理元素查询', async () => {
    featureRpc.getFeatureTree.mockResolvedValue([
      { id: 'f-1', featureType: 'extrude', orderKey: 1, suppressed: false, status: 0, params: {} },
      { id: 'f-2', featureType: 'fillet', orderKey: 2, suppressed: true, status: 0, params: {} },
    ]);
    FAKE_CONNECTION.createQueryReader.mockImplementation(() =>
      (async function* () {
        yield ['256', 'Part 1'];
      })(),
    );
    renderPage();
    const tree = screen.getByTestId('part-studio-tree');
    // 特征段：RPC 读树条目按类型序号命名（拉伸 1/圆角 1）+ 行锚点 + 段头计数。
    expect(await within(tree).findByTestId('tree-row-f-1')).toBeDefined();
    expect(await within(tree).findByText('拉伸 1')).toBeDefined();
    expect(await within(tree).findByText('圆角 1')).toBeDefined();
    expect(within(tree).getByTestId('part-studio-feature-count').textContent).toBe('(2)');
    // 零件段：connection 物理元素查询产物（CodeValue 命名）+ 计数。
    expect(await within(tree).findByText('Part 1')).toBeDefined();
    expect(within(tree).getByTestId('part-studio-part-count').textContent).toBe('(1)');
  });

  it('PushChangesetDialog 挂载：未推送变更解锁「保存版本」钮 → 点击挂载推送对话框（描述/确认锚点 + pushChanges 通道）', async () => {
    const user = userEvent.setup();
    FAKE_CONNECTION.txns.hasPendingTxns.mockResolvedValue(true);
    renderPage();
    const save = screen.getByTestId('part-studio-save-button');
    await waitFor(() => expect(isDisabled(save)).toBe(false));
    await user.click(save);

    // 对话框挂载锚点：保存版本对话框 + 描述输入 + 确认钮 testid 在场。
    const dialog = await screen.findByRole('dialog', { name: '保存版本' });
    expect(within(dialog).getByTestId('part-studio-push-description-input')).toBeDefined();
    const confirm = within(dialog).getByTestId('part-studio-push-confirm-button');
    // 描述必填：空描述诚实禁用（推送不发起；iTwinUI 美观禁用同口径）。
    expect(isDisabled(confirm)).toBe(true);
    await user.type(within(dialog).getByTestId('part-studio-push-description-input'), 'M4 冒烟锚点');
    await user.click(confirm);
    // 确认走 connection.pushChanges 标准通道（M4-T7 裁定的收敛入口）。
    await waitFor(() => expect(FAKE_CONNECTION.pushChanges).toHaveBeenCalledWith('M4 冒烟锚点'));
  });
});
