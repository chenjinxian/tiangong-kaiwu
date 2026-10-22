// src/modules/document-details/test/DocumentDetailsPage.test.tsx
//
// Task 6 失败测试先行（brief Step 1）：DocumentDetailsPage 结构完备性——
//  1) 面包屑：文档 → 当前文档名（点击「文档」回 /documents，os-01 详情区）；
//  2) hero：名称 + 状态 Tag + 创建/更新时间 + iModel 计数 + 同步指示 +
//     操作（新建 iModel / 分享 / 删除）；
//  3) iModel 卡片网格：缩略图/名称/描述/初始化徽标/创建时间/打开工作空间；
//  4) 「打开工作空间」→ /documents/:iTwinId/:iModelId 编辑器路由（M3 占位）；
//  5) 「新建 iModel」→ 创建对话框（名称必填 + 描述可选）→ ImodelsClient.create；
//  6) hero「删除」→ 删除文档确认对话框 → ItwinsClient.delete → 返回 /documents；
//  7) 卡片更多菜单「删除」→ ImodelsClient.delete（HITL 确认）；
//  8) 用户菜单（我的帐户/深色模式/退出登录）+ 顶栏刷新；
//  9) 三态：加载 / 错误（重试）/ iModel 空（引导创建）。
//
// 数据面：mock ImodelsClient / ItwinsClient / AuthSession / share.api——
// 真实 hooks + mapper 参与测试（react-query retry:false），
// 结构断言全部走异步 findBy*（数据经一轮微任务到位）。

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// hoisted：vi.mock 工厂提升执行，工厂内引用顶层 const 会撞 TDZ——
// 客户端方法 mock 统一经 vi.hoisted 声明（用例要驱动 reject/resolve 注入）。
const mocks = vi.hoisted(() => ({
  imodelsList: vi.fn(),
  imodelsCreate: vi.fn(),
  imodelsDelete: vi.fn(),
  itwinsGet: vi.fn(),
  itwinsDelete: vi.fn(),
}));

vi.mock('@clients/imodels/ImodelsClient.js', () => ({
  ImodelsClient: class {
    list = mocks.imodelsList;
    get = vi.fn();
    create = mocks.imodelsCreate;
    delete = mocks.imodelsDelete;
  },
}));

vi.mock('@clients/itwins/ItwinsClient.js', () => ({
  ItwinsClient: class {
    get = mocks.itwinsGet;
    delete = mocks.itwinsDelete;
    create = vi.fn();
    update = vi.fn();
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

// ShareDocumentDialog（@modules/documents barrel 复用）的私有 REST 面——
// 结构测试零真实请求（与 documents 模块测试同口径 mock）。
vi.mock('../../documents/internal/share.api.js', () => ({
  listUserMembers: vi.fn().mockResolvedValue([]),
  listRoles: vi.fn().mockResolvedValue([]),
  addUserMember: vi.fn(),
  updateUserMember: vi.fn(),
  removeUserMember: vi.fn(),
}));

import { AuthSession } from '@clients/auth/AuthSession.js';
import { DocumentDetailsPage } from '../DocumentDetailsPage.js';

/** 官方 IModel 全量表示的测试最小形状（mapper 只读子集，其余字段不参与）。 */
const IMODELS = [
  {
    id: 'im-1',
    displayName: '楼层模型',
    name: '楼层模型',
    description: '一层平面布局',
    state: 'initialized',
    createdDateTime: '2026-10-02T08:00:00.0000000+00:00',
    lastChangesetPushDateTime: '2026-10-19T09:00:00.0000000+00:00',
    iTwinId: 'itwin-1',
  },
  {
    id: 'im-2',
    displayName: '结构模型',
    name: '结构模型',
    description: null,
    state: 'notInitialized',
    createdDateTime: '2026-10-03T08:00:00.0000000+00:00',
    lastChangesetPushDateTime: null,
    iTwinId: 'itwin-1',
  },
];

/** 本地 hub iTwin 详情（createdAt/updatedAt/lastModifiedDateTime 为 hub 超集字段）。 */
const ITWIN_DETAIL = {
  id: 'itwin-1',
  displayName: '演示文档',
  status: 'Active',
  description: '演示项目描述',
  createdDateTime: '2026-10-01T08:00:00.0000000+00:00',
  lastModifiedDateTime: '2026-10-20T12:30:00.0000000+00:00',
};

/** 手动闸门：promise 的 resolve 由用例掌控（模拟 refetch 在途，I3 旋转断言用）。 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/documents/itwin-1']}>
        <Routes>
          <Route path="/documents" element={<div data-testid="documents-home" />} />
          <Route path="/documents/:iTwinId" element={<DocumentDetailsPage />} />
          <Route path="/documents/:iTwinId/:iModelId" element={<div data-testid="editor-route" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // 清上次调用历史（DocumentsPage 测试的 deleteMock.mockReset 同理由——
  // 前端断言「未调用」依赖干净起点）；mockResolvedValue 实现不受 clear 影响。
  vi.clearAllMocks();
  mocks.itwinsGet.mockResolvedValue(ITWIN_DETAIL);
  mocks.imodelsList.mockResolvedValue(IMODELS);
  mocks.imodelsCreate.mockResolvedValue({ id: 'im-3' });
  mocks.itwinsDelete.mockResolvedValue(undefined);
  mocks.imodelsDelete.mockResolvedValue(undefined);
});

describe('DocumentDetailsPage 结构（/documents/:iTwinId 详情页）', () => {
  it('面包屑：文档 → 当前文档名；「文档」回 /documents（os-01 详情区）', async () => {
    const user = userEvent.setup();
    renderPage();
    const breadcrumb = await screen.findByRole('button', { name: '文档' });
    // 面包屑当前项 + hero 标题同现文档名（两处渲染，旧应用同口径）。
    expect((await screen.findAllByText('演示文档')).length).toBeGreaterThanOrEqual(2);
    await user.click(breadcrumb);
    expect(await screen.findByTestId('documents-home')).toBeDefined();
  });

  it('hero：名称 + 状态 Tag + 创建/更新时间 + iModel 计数 + 描述 + 操作区', async () => {
    renderPage();
    // 名称（headline）
    expect(await screen.findByRole('heading', { name: '演示文档' })).toBeDefined();
    // 状态 Tag（fixture status='Active' 原样直透，旧应用同口径；缺席才回退本地化「活跃」）
    expect(screen.getByText('Active')).toBeDefined();
    expect(screen.getByText('演示项目描述')).toBeDefined();
    // 创建/更新时间与计数（hero 与工具条计数两处呈现）
    expect(screen.getAllByText(/创建于/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/更新于/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('2 个 iModel').length).toBeGreaterThanOrEqual(2);
    // 操作区
    expect(screen.getByRole('button', { name: '新建 iModel' })).toBeDefined();
    expect(screen.getByRole('button', { name: '分享' })).toBeDefined();
    expect(screen.getByRole('button', { name: '删除' })).toBeDefined();
  });

  it('存在未初始化 iModel → hero 同步指示', async () => {
    renderPage();
    expect(await screen.findByText('同步中')).toBeDefined();
  });

  it('iModel 卡片网格：名称/描述/初始化徽标/创建时间/打开工作空间', async () => {
    renderPage();
    // 两张卡片名称/描述
    expect(await screen.findByText('楼层模型')).toBeDefined();
    expect(screen.getByText('结构模型')).toBeDefined();
    expect(screen.getByText('一层平面布局')).toBeDefined();
    expect(screen.getByText('暂无描述')).toBeDefined();
    // 初始化徽标：已初始化 ×1 + 初始化中 ×1
    expect(screen.getByText('已初始化')).toBeDefined();
    expect(screen.getByText('初始化中')).toBeDefined();
    // 每张卡一个「打开工作空间」
    expect(screen.getAllByRole('button', { name: '打开工作空间' })).toHaveLength(2);
    // 卡片创建时间（metadata）
    expect(screen.getAllByText(/创建于/).length).toBeGreaterThanOrEqual(3);
  });

  it('「打开工作空间」→ 跳转 /documents/:iTwinId/:iModelId（编辑器路由占位）', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click((await screen.findAllByRole('button', { name: '打开工作空间' }))[0]!);
    expect(await screen.findByTestId('editor-route')).toBeDefined();
  });

  it('「新建 iModel」→ 创建对话框（名称必填 + 描述可选）→ ImodelsClient.create', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '新建 iModel' }));
    // LabeledInput label↔input 关联——getByLabelText 直取
    const nameInput = await screen.findByLabelText(/iModel 名称/);
    await user.type(nameInput, '新模型');
    await user.type(screen.getByLabelText(/描述/), '新模型描述');
    await user.click(screen.getByRole('button', { name: '创建' }));
    await waitFor(() =>
      expect(mocks.imodelsCreate).toHaveBeenCalledWith('itwin-1', {
        name: '新模型',
        description: '新模型描述',
      }),
    );
  });

  it('创建对话框：名称必填校验（空名不提交）', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '新建 iModel' }));
    await user.click(await screen.findByRole('button', { name: '创建' }));
    expect(await screen.findByText('请输入 iModel 名称')).toBeDefined();
    expect(mocks.imodelsCreate).not.toHaveBeenCalled();
  });

  it('hero「删除」→ 确认对话框 → ItwinsClient.delete → 返回 /documents', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '删除' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/确定要删除文档「演示文档」吗/)).toBeDefined();
    // Escape dismissal 可达前提（review-8 I-1 P2 补齐）：打开即焦点入对话框。
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.click(within(dialog).getByRole('button', { name: '删除' }));
    await waitFor(() => expect(mocks.itwinsDelete).toHaveBeenCalledWith('itwin-1'));
    expect(await screen.findByTestId('documents-home')).toBeDefined();
  });

  it('卡片更多菜单「删除」→ 确认对话框 → ImodelsClient.delete', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click((await screen.findAllByRole('button', { name: '更多操作' }))[0]!);
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: '删除' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/确定要删除 iModel「楼层模型」吗/)).toBeDefined();
    // Escape dismissal 可达前提（review-8 I-1 P2 补齐）：打开即焦点入对话框。
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.click(within(dialog).getByRole('button', { name: '删除' }));
    await waitFor(() => expect(mocks.imodelsDelete).toHaveBeenCalledWith('im-1'));
  });

  it('hero「分享」→ 分享对话框（复用 documents 模块三页签）', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '分享' }));
    expect(await screen.findByText('分享文档')).toBeDefined();
    expect(screen.getByRole('tab', { name: '成员 (0)' })).toBeDefined();
    expect(screen.getByRole('tab', { name: '邀请成员' })).toBeDefined();
    expect(screen.getByRole('tab', { name: '分享链接' })).toBeDefined();
  });

  it('顶栏：用户菜单（我的帐户/深色模式/退出登录）', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '用户菜单' }));
    const menu = await screen.findByRole('menu');
    for (const label of ['我的帐户', '深色模式', '退出登录']) {
      expect(within(menu).getByRole('menuitem', { name: label })).toBeDefined();
    }
    await user.click(within(menu).getByRole('menuitem', { name: '退出登录' }));
    expect(AuthSession.logout).toHaveBeenCalled();
  });

  it('iModel 空态：引导文案 + 新建入口', async () => {
    mocks.imodelsList.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('暂无 iModel')).toBeDefined();
    expect(screen.getByText('创建您的第一个 iModel 开始建模')).toBeDefined();
    expect(screen.getAllByRole('button', { name: '新建 iModel' }).length).toBeGreaterThanOrEqual(2);
  });

  it('iModel 网格初载门（终审 I4）：详情先到、网格加载中 → ProgressRadial 占位，空态文案缺席', async () => {
    // 网格查询永续悬挂——详情（hero）先行到位，网格区必须停在加载占位，
    // 不得先闪「暂无 iModel」再跳网格（零布局跳动违例）。
    mocks.imodelsList.mockReturnValue(new Promise(() => { /* 悬挂 */ }));
    const { container } = renderPage();
    // 详情查询不受影响——hero 正常渲染（页面级 loading 门未被误触发）。
    expect(await screen.findByRole('heading', { name: '演示文档' })).toBeDefined();
    // 网格区：加载占位在场（iTwinUI 运行时给 ProgressRadial 根节点哈希类名
    // _iui3xxx-progress-indicator-radial——不断哈希类，断言走稳定 data-iui-* 属性）。
    const loading = container.querySelector('.document-details-grid-loading');
    expect(loading).not.toBeNull();
    expect(loading?.querySelector('[data-iui-indeterminate="true"]')).not.toBeNull();
    expect(screen.queryByText('暂无 iModel')).toBeNull();
  });

  it('刷新接线（终审 I3）：refetch 期间刷新图标旋转（isFetching 驱动，非 isLoading）', async () => {
    const user = userEvent.setup();
    // 首载立即成功（isLoading 随之转假）；点刷新后第二次调用悬挂——
    // 此时 isPending 恒假、isFetching 真：SvgRefresh.spin 只能由 isFetching 驱动。
    const second = deferred<typeof IMODELS>();
    let call = 0;
    mocks.imodelsList.mockImplementation(() => {
      call += 1;
      return call === 1 ? Promise.resolve(IMODELS) : second.promise;
    });
    renderPage();
    await screen.findByText('楼层模型'); // 首载落定
    const refreshBtn = screen.getByRole('button', { name: '刷新' });
    const svg = refreshBtn.querySelector('svg')!;
    // SVG 的 className 是 SVGAnimatedString——断言必须走 getAttribute('class')。
    const svgClass = () => svg.getAttribute('class') ?? '';
    expect(svgClass()).not.toContain('spin');
    await user.click(refreshBtn);
    await waitFor(() => expect(svgClass()).toContain('spin'));
    // refetch 落定：旋转卸除。
    second.resolve([]);
    await waitFor(() => expect(svgClass()).not.toContain('spin'));
  });

  it('加载态：hero 数据未到 → 加载中文案', () => {
    mocks.itwinsGet.mockReturnValue(new Promise(() => { /* 悬挂 */ }));
    renderPage();
    expect(screen.getByText('加载中…')).toBeDefined();
  });

  it('错误态：详情加载失败 → 错误文案 + 重试', async () => {
    mocks.itwinsGet.mockRejectedValue(new Error('hub boom'));
    renderPage();
    expect(await screen.findByText('hub boom')).toBeDefined();
    expect(screen.getByRole('button', { name: '重试' })).toBeDefined();
    expect(screen.getByRole('button', { name: '返回文档列表' })).toBeDefined();
  });
});
