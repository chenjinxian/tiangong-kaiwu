// src/modules/part-studio/test/part-studio-structure.test.tsx
//
// M3 Task 8（brief Step 1）：编辑器结构断言总账——/documents/:iTwinId/:iModelId
// Part Studio 页全量结构锚点钉死（对齐 os-11/12/15/20/23/24/30/31/33）：
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
//     + 工作区单位对话框）。
//
// 定位：M3 终审结构层总账（与各任务单测互补——单测钉行为，本文件钉「整页
// 装配后所有锚点同时在场」）。mock 口径同 PartStudioPage.test.tsx（客户端/
// viewer-next 模块级 mock，真实 store/i18n 参与）+ @itwin/core-frontend 钉形
// （IModelApp.tools.run 可观测、viewManager 无视口）。
//
// 另见：PartStudioPage.test.tsx（五区+store 接线）、ribbon-registry.test.ts
// （注册表纯枚举）、CommandPalette.test.tsx（面板行为）、CanvasContextMenu
// .test.tsx（菜单模型）、FeatureDialog/SketchDialog/TabManagerDialog/
// DocumentMenuBar.test.tsx（各对话框行为）。

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider as IuiThemeProvider } from '@itwin/itwinui-react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  itwinsGet: vi.fn(),
  imodelsGet: vi.fn(),
  imodelsList: vi.fn(),
  toolsRun: vi.fn(),
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

// 结构断言零查看器启动：useViewport 钉 ready 相位（状态栏「已连接」断言依赖）；
// M4-T2：useBriefcaseConnection 钉 null 连接、applyViewportBackground 钉 no-op
//（PartStudioPage 的连接/视口/底色组合接线在本文件全 no-op 化）。
vi.mock('@luban-cad/viewer-next', () => ({
  useViewport: vi.fn().mockReturnValue({
    viewportRef: { current: null },
    phase: 'ready',
    error: null,
    viewport: undefined,
  }),
  useBriefcaseConnection: vi.fn().mockReturnValue({
    connection: null,
    isLoading: false,
    error: null,
    saveChanges: vi.fn().mockResolvedValue(undefined),
    pushChanges: vi.fn().mockResolvedValue(undefined),
    pullChanges: vi.fn().mockResolvedValue(undefined),
  }),
  applyViewportBackground: vi.fn(),
  acquireViewer: vi.fn().mockResolvedValue(undefined),
  releaseViewer: vi.fn().mockResolvedValue(undefined),
  ensureAccuSnap: vi.fn().mockResolvedValue(undefined),
}));

// core-frontend 钉形：tools.run 可观测（full 工具激活断言）；viewManager 无
// 视口 → useCanvasSelection emphasize effect 静默跳过（壳期口径）。
vi.mock('@itwin/core-frontend', () => ({
  IModelApp: {
    tools: { run: mocks.toolsRun },
    viewManager: { selectedView: null },
  },
}));

import { usePartStudioStore } from '../index.js';
import { PartStudioPage } from '../PartStudioPage.js';

const ITWIN_DETAIL = { id: 'itwin-1', displayName: '演示文档', status: 'Active' };
const IMODEL_DETAIL = { id: 'im-1', displayName: '楼层模型', name: '楼层模型', iTwinId: 'itwin-1' };

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
    sketch: { isActive: false, activeSketchId: null },
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
  mocks.toolsRun.mockResolvedValue(true);
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

  it('full 工具点击投 IModelApp.tools.run 并写 store；拉伸改道特征对话框（M4-T6）；gated 工具开能力引导对话框', async () => {
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
    // full：旋转（revolve 在册 full）→ tools.run + 激活态。
    await user.click(within(ribbon).getByRole('button', { name: '旋转' }));
    expect(mocks.toolsRun).toHaveBeenCalledWith('revolve');
    expect(usePartStudioStore.getState().tool.activeToolId).toBe('revolve');
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
    expect(within(dialog).getByText('面和草图区域')).toBeDefined();
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
