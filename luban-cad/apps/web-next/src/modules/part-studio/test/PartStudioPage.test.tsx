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
//
// 定位：五区结构存在性 + store 接线验收层；mock 口径与 document-details 结构
// 测试一致——真实 store/hooks 参与，客户端（ItwinsClient / ImodelsClient /
// AuthSession）与 viewer-next（useViewport/useBriefcaseConnection/
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
}));

const viewerMocks = vi.hoisted(() => ({
  useViewport: vi.fn(),
  useBriefcaseConnection: vi.fn(),
  applyViewportBackground: vi.fn(),
}));

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
    create = vi.fn();
    delete = vi.fn();
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

// 结构测试零查看器启动：useViewport 钉 ready 相位 + 假 viewport 实例、
// useBriefcaseConnection 钉就绪连接（状态栏「已连接」与 M4-T2 接线断言依赖）。
vi.mock('@luban-cad/viewer-next', () => ({
  useViewport: viewerMocks.useViewport,
  useBriefcaseConnection: viewerMocks.useBriefcaseConnection,
  applyViewportBackground: viewerMocks.applyViewportBackground,
  acquireViewer: vi.fn().mockResolvedValue(undefined),
  releaseViewer: vi.fn().mockResolvedValue(undefined),
  ensureAccuSnap: vi.fn().mockResolvedValue(undefined),
}));

import { usePartStudioStore } from '../index.js';
import { PartStudioPage } from '../PartStudioPage.js';

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

const FAKE_CONNECTION = { key: 'briefcase-key', isBriefcaseConnection: () => true };
const FAKE_VIEWPORT = { view: { displayStyle: { backgroundColor: undefined } }, invalidateScene: vi.fn() };

/** store 复位：八切片回缺省（结构用例间互不渗漏）。 */
function resetStore(): void {
  usePartStudioStore.setState({
    tree: { activeTab: 'features', selectedNodeIds: [], expandedNodeIds: [] },
    dock: { activeTab: 'toolSettings', isOpen: false },
    tool: { activeToolId: null },
    sketch: { isActive: false, activeSketchId: null },
    commandPalette: { isOpen: false, query: '', highlightEnabled: true },
    canvas: { selection: [], hiddenIds: [] },
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
  // viewer-next mock 桩：连接就绪 + viewport 就位（M4-T2 接线断言的数据面）。
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
    expect(await screen.findByRole('button', { name: '文档' })).toBeDefined();
    expect(await screen.findByRole('button', { name: '演示文档' })).toBeDefined();
    expect(await screen.findByRole('button', { name: '楼层模型' })).toBeDefined();
    expect(within(topBar).getByText('Main')).toBeDefined();
    expect(within(topBar).getByRole('button', { name: '分享' })).toBeDefined();
    expect(within(topBar).getByRole('button', { name: '用户菜单' })).toBeDefined();
    expect(within(topBar).getByRole('button', { name: '帮助' })).toBeDefined();
  });

  it('左栏：竖图标条 + 双段树（特征段 / 零件段 + 默认 Part 1）', () => {
    renderPage();
    const rail = screen.getByTestId('part-studio-icon-rail');
    expect(within(rail).getByRole('button', { name: '特征' })).toBeDefined();
    expect(within(rail).getByRole('button', { name: '零件' })).toBeDefined();

    const tree = screen.getByTestId('part-studio-tree');
    expect(within(tree).getByRole('button', { name: '特征' })).toBeDefined();
    expect(within(tree).getByTestId('part-studio-feature-list')).toBeDefined();
    expect(within(tree).getByRole('button', { name: '零件' })).toBeDefined();
    const partList = within(tree).getByTestId('part-studio-part-list');
    expect(within(partList).getByText('Part 1')).toBeDefined();
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
  it('useBriefcaseConnection 以路由 ids + viewOnly 调用；connection 下传 useViewport.iModel', () => {
    renderPage();
    expect(viewerMocks.useBriefcaseConnection).toHaveBeenCalledWith({
      iTwinId: 'itwin-1',
      iModelId: 'im-1',
      readonly: false,
    });
    const lastViewportCall = viewerMocks.useViewport.mock.calls.at(-1);
    expect(lastViewportCall).toBeDefined();
    const viewportOptions = (lastViewportCall ?? [])[0] as { iModel: unknown; backendUrl: string };
    expect(viewportOptions.iModel).toBe(FAKE_CONNECTION);
    expect(viewportOptions.backendUrl).toBe(window.location.origin);
  });

  it('viewOnly 激活 → readonly 透传连接钩子（权限门：可编辑 = !viewOnly）', () => {
    renderPage();
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
