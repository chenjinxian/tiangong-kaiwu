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
  imodelsGet: vi.fn(),
  imodelsCreate: vi.fn(),
  imodelsCreatePending: vi.fn(),
  imodelsDelete: vi.fn(),
  imodelsUpdate: vi.fn(),
  imodelsSetSecured: vi.fn(),
  imodelsListFavorites: vi.fn(),
  imodelsAddFavorite: vi.fn(),
  imodelsRemoveFavorite: vi.fn(),
  imodelsListUserPermissions: vi.fn(),
  imodelsGrantPermission: vi.fn(),
  imodelsRevokePermission: vi.fn(),
  itwinsGet: vi.fn(),
  itwinsDelete: vi.fn(),
  getITwinPermissions: vi.fn(),
  // P2.4 F2：rename 门=iModel 权限（与 iTwin 分享门分离）。
  getIModelPermissions: vi.fn(),
}));

vi.mock('@clients/imodels/ImodelsClient.js', () => ({
  ImodelsClient: class {
    list = mocks.imodelsList;
    get = mocks.imodelsGet;
    create = mocks.imodelsCreate;
    createPending = mocks.imodelsCreatePending;
    delete = mocks.imodelsDelete;
    update = mocks.imodelsUpdate;
    setSecured = mocks.imodelsSetSecured;
    listFavorites = mocks.imodelsListFavorites;
    addFavorite = mocks.imodelsAddFavorite;
    removeFavorite = mocks.imodelsRemoveFavorite;
    listUserPermissions = mocks.imodelsListUserPermissions;
    grantPermission = mocks.imodelsGrantPermission;
    revokePermission = mocks.imodelsRevokePermission;
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

// 终审 I3：新建 iModel 权限门——iTwin 级权限查询模块级 mock（默认授予
// imodels_manage，既有创建用例不变；Viewer/加载中/查询失败用例按需覆盖）。
vi.mock('@clients/access-control/AccessControlClient.js', () => ({
  AccessControlClient: class {
    getITwinPermissions = mocks.getITwinPermissions;
    getMyIModelPermissions = mocks.getIModelPermissions;
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
import { ApiClientError } from '@clients/http/ApiClientError.js';
import { B_MODEL_DATA } from '@clients/itwins/types.js';
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
    // P0 Task 2：失败态不得伪装「初始化中」（四态徽标验收基线）。
    state: 'initializationFailed',
    createdDateTime: '2026-10-03T08:00:00.0000000+00:00',
    lastChangesetPushDateTime: null,
    iTwinId: 'itwin-1',
  },
];

/** 本地 hub iTwin 详情（createdAt/updatedAt/lastModifiedDateTime 为 hub 超集字段）。
 *  P2.3：B 项目标记决定详情页分支（与 feature flag 无关）。 */
const ITWIN_DETAIL = {
  id: 'itwin-1',
  displayName: '演示文档',
  status: 'Active',
  description: '演示项目描述',
  createdDateTime: '2026-10-01T08:00:00.0000000+00:00',
  lastModifiedDateTime: '2026-10-20T12:30:00.0000000+00:00',
  data: B_MODEL_DATA,
};

/** A 旧文档（未标记）——只读语义。 */
const LEGACY_ITWIN_DETAIL = {
  id: 'itwin-1',
  displayName: '旧文档',
  status: 'Active',
  description: '旧版文档描述',
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
  // P2.4 F2：rename 门走 iModel 权限；缺省无 manage（Viewer 用例 fail-closed）。
  mocks.getIModelPermissions.mockResolvedValue([]);
  // 初始化等待的默认终态：created 即 initialized（成功路径零 sleep）。
  mocks.imodelsGet.mockResolvedValue({
    ...IMODELS[0],
    id: 'im-3',
    isSecured: true,
  });
  mocks.imodelsCreate.mockResolvedValue({ id: 'im-3' });
  mocks.imodelsCreatePending.mockResolvedValue({ id: 'im-3' });
  mocks.itwinsDelete.mockResolvedValue(undefined);
  mocks.imodelsDelete.mockResolvedValue(undefined);
  mocks.imodelsUpdate.mockResolvedValue({ id: 'im-1' });
  mocks.imodelsSetSecured.mockResolvedValue(undefined);
  mocks.imodelsListFavorites.mockResolvedValue([]);
  mocks.imodelsAddFavorite.mockResolvedValue(undefined);
  mocks.imodelsRemoveFavorite.mockResolvedValue(undefined);
  mocks.imodelsListUserPermissions.mockResolvedValue([]);
  mocks.imodelsGrantPermission.mockResolvedValue(undefined);
  mocks.imodelsRevokePermission.mockResolvedValue(undefined);
  // 默认 Admin/Editor 语义：具备 imodels_manage（新建入口可见）。
  mocks.getITwinPermissions.mockResolvedValue(['imodels_manage', 'imodels_webview']);
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
    // 操作区（B 项目：新建 iModel + 删除项目；分享按文档粒度在卡片菜单，
    // 不提供项目级分享——避免回落 iTwin 分享通道）
    expect(screen.getByRole('button', { name: '新建 iModel' })).toBeDefined();
    expect(screen.queryByRole('button', { name: '分享' })).toBeNull();
    expect(screen.getByRole('button', { name: '删除' })).toBeDefined();
  });

  // P0 Task 2（四态徽标 + 同步口径）：失败/缺文件不呈现「同步中」，
  // 仅 notInitialized / retryScheduled 驱动 hero 同步指示。
  it('初始化失败显示失败徽标，且不显示同步中', async () => {
    renderPage();
    expect(await screen.findByText('初始化失败')).toBeDefined();
    expect(screen.queryByText('同步中')).toBeNull();
  });

  it('缺文件（missingFiles）显示「文件缺失」徽标，且不显示「初始化中」', async () => {
    mocks.imodelsList.mockResolvedValue([
      { ...IMODELS[0], state: 'missingFiles' },
    ]);
    renderPage();
    expect(await screen.findByText('文件缺失')).toBeDefined();
    expect(screen.queryByText('初始化中')).toBeNull();
  });

  it('初始化中显示初始化中徽标，并显示同步中', async () => {
    mocks.imodelsList.mockResolvedValue([
      IMODELS[0],
      { ...IMODELS[1], state: 'notInitialized' },
    ]);
    renderPage();
    expect(await screen.findByText('初始化中')).toBeDefined();
    expect(screen.getByText('同步中')).toBeDefined();
  });

  it('iModel 卡片网格：名称/描述/初始化徽标/创建时间/打开工作空间', async () => {
    renderPage();
    // 两张卡片名称/描述
    expect(await screen.findByText('楼层模型')).toBeDefined();
    expect(screen.getByText('结构模型')).toBeDefined();
    expect(screen.getByText('一层平面布局')).toBeDefined();
    expect(screen.getByText('暂无描述')).toBeDefined();
    // 初始化徽标：已初始化 ×1 + 初始化失败 ×1（失败态不得显示「初始化中」）。
    expect(screen.getByText('已初始化')).toBeDefined();
    expect(screen.getByText('初始化失败')).toBeDefined();
    expect(screen.queryByText('初始化中')).toBeNull();
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

  it('「新建 iModel」→ 创建对话框（名称必填 + 描述可选）→ ImodelsClient.createPending', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '新建 iModel' }));
    // LabeledInput label↔input 关联——getByLabelText 直取
    const nameInput = await screen.findByLabelText(/iModel 名称/);
    await user.type(nameInput, '新模型');
    await user.type(screen.getByLabelText(/描述/), '新模型描述');
    await user.click(screen.getByRole('button', { name: '创建' }));
    await waitFor(() =>
      expect(mocks.imodelsCreatePending).toHaveBeenCalledWith('itwin-1', {
        name: '新模型',
        description: '新模型描述',
      }),
    );
    expect(mocks.imodelsCreate).not.toHaveBeenCalled();
  });

  // 终审 I3：新建 iModel 权限门（iTwin imodels_manage）——Viewer 无创建动作；
  // 权限未落定/查询失败 fail-closed；403 映射专属 i18n 文案。
  it('Viewer（无 imodels_manage）：hero 与空态均不渲染新建入口', async () => {
    mocks.getITwinPermissions.mockResolvedValue(['imodels_webview']);
    mocks.imodelsList.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('暂无 iModel')).toBeDefined();
    expect(screen.queryByRole('button', { name: '新建 iModel' })).toBeNull();
  });

  it('Viewer（无 imodels_manage）：有 iModel 时 hero 仍无新建入口', async () => {
    mocks.getITwinPermissions.mockResolvedValue(['imodels_webview']);
    renderPage();

    expect(await screen.findByRole('heading', { name: '演示文档' })).toBeDefined();
    await screen.findByText('楼层模型');
    expect(screen.queryByRole('button', { name: '新建 iModel' })).toBeNull();
  });

  it('Editor/Admin（含 imodels_manage）：新建入口可见', async () => {
    mocks.getITwinPermissions.mockResolvedValue(['imodels_manage', 'imodels_webview']);
    renderPage();

    expect(await screen.findByRole('button', { name: '新建 iModel' })).toBeDefined();
  });

  it('权限未落定（loading）：不渲染启用态新建入口', async () => {
    mocks.getITwinPermissions.mockReturnValue(new Promise(() => { /* 悬挂 */ }));
    renderPage();

    expect(await screen.findByRole('heading', { name: '演示文档' })).toBeDefined();
    expect(screen.queryByRole('button', { name: '新建 iModel' })).toBeNull();
  });

  it('权限查询失败：fail-closed（不渲染新建入口）', async () => {
    mocks.getITwinPermissions.mockRejectedValue(new Error('permission boom'));
    renderPage();

    expect(await screen.findByRole('heading', { name: '演示文档' })).toBeDefined();
    expect(screen.queryByRole('button', { name: '新建 iModel' })).toBeNull();
  });

  it('创建 403 → 专属 i18n 文案（不是服务端英文权限串）', async () => {
    const user = userEvent.setup();
    mocks.imodelsCreatePending.mockRejectedValue(
      new ApiClientError({
        status: 403,
        code: 'IMODELS_REQUEST_FAILED',
        message: 'You do not have permission to access this resource (requires imodels_manage)',
      }),
    );
    renderPage();
    await user.click(await screen.findByRole('button', { name: '新建 iModel' }));
    await user.type(await screen.findByLabelText(/iModel 名称/), '新模型');
    await user.click(screen.getByRole('button', { name: '创建' }));

    expect(
      await screen.findByText('没有权限在此文档中创建 iModel（需要 imodels_manage 权限）'),
    ).toBeDefined();
  });

  it('创建对话框：名称必填校验（空名不提交）', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '新建 iModel' }));
    await user.click(await screen.findByRole('button', { name: '创建' }));
    expect(await screen.findByText('请输入 iModel 名称')).toBeDefined();
    expect(mocks.imodelsCreatePending).not.toHaveBeenCalled();
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

  it('B 文档卡片「分享」→ iModel 权限对话框（读 isSecured + 权限用户；无链接页签）', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click((await screen.findAllByRole('button', { name: '更多操作' }))[0]!);
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: '分享' }));

    expect(await screen.findByText('分享文档')).toBeDefined();
    // B 分支：isSecured 已读（im-1 默认 isSecured=true）且权限用户查询已发。
    expect(
      await screen.findByText(
        '此文档已启用访问控制：仅下列授权用户可访问（iTwin owner/Admin/Editor 仍可绕过）。',
      ),
    ).toBeDefined();
    await waitFor(() => expect(mocks.imodelsListUserPermissions).toHaveBeenCalledWith('im-1'));
    // 不声称链接分享（hub 无 iModel 链接分享通道）。
    expect(screen.queryByRole('tab', { name: '分享链接' })).toBeNull();
    expect(screen.getByRole('tab', { name: '成员 (0)' })).toBeDefined();
    expect(screen.getByRole('tab', { name: '邀请成员' })).toBeDefined();
  });

  it('Viewer（无 imodels_manage）：B 卡片菜单只有收藏（无 rename/share/delete）', async () => {
    mocks.getITwinPermissions.mockResolvedValue(['imodels_webview']);
    const user = userEvent.setup();
    renderPage();
    await user.click((await screen.findAllByRole('button', { name: '更多操作' }))[0]!);
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: '收藏' })).toBeDefined();
    expect(within(menu).queryByRole('menuitem', { name: '重命名' })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: '分享' })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: '删除' })).toBeNull();
  });

  it('F2 拆源：仅 iModel Manage（无 iTwin manage）→ 重命名可见，分享/删除不可见', async () => {
    mocks.getITwinPermissions.mockResolvedValue(['imodels_webview']);
    mocks.getIModelPermissions.mockResolvedValue(['imodels_manage', 'imodels_webview']);
    const user = userEvent.setup();
    renderPage();
    // 逐卡片 iModel 权限查询异步落定 → 重命名项出现。
    await user.click((await screen.findAllByRole('button', { name: '更多操作' }))[0]!);
    const menu = await screen.findByRole('menu');
    expect(await within(menu).findByRole('menuitem', { name: '重命名' })).toBeDefined();
    expect(within(menu).queryByRole('menuitem', { name: '分享' })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: '删除' })).toBeNull();
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

  // -------------------------------------------------------------------------
  // P2.3：B 标记分支（与 flag 无关——直接 URL 也绝不回落 A 语义）
  // -------------------------------------------------------------------------
  it('B 标记详情：即使未读取 feature flag 也按 B 项目语义渲染（可写）', async () => {
    // 本文件不 mock useBModelEnabled；页面分支必须只由 itwin.data.luban.modelMode 派生。
    renderPage();
    expect(await screen.findByRole('heading', { name: '演示文档' })).toBeDefined();
    expect(screen.getByRole('button', { name: '新建 iModel' })).toBeDefined();
    expect(screen.queryByTestId('legacy-readonly-banner')).toBeNull();
  });

  it('A 旧文档（未标记）：只读横幅 + 无新建/删除/分享/重命名写操作；仍可打开模型', async () => {
    mocks.itwinsGet.mockResolvedValue(LEGACY_ITWIN_DETAIL);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByTestId('legacy-readonly-banner')).toBeDefined();
    expect(screen.getByText('旧版文档（只读）')).toBeDefined();
    // 无任何写入口（hero + 空态/卡片菜单）
    expect(screen.queryByRole('button', { name: '新建 iModel' })).toBeNull();
    expect(screen.queryByRole('button', { name: '分享' })).toBeNull();
    expect(screen.queryByRole('button', { name: '删除' })).toBeNull();
    expect(screen.queryByRole('button', { name: '更多操作' })).toBeNull();
    // 只读仍可打开模型（A 旧文档读路径不变）
    const openButtons = await screen.findAllByRole('button', { name: '打开工作空间' });
    expect(openButtons).toHaveLength(2);
    await user.click(openButtons[0]!);
    expect(await screen.findByTestId('editor-route')).toBeDefined();
  });

  it('A 旧文档空态：不渲染创建入口（只读）', async () => {
    mocks.itwinsGet.mockResolvedValue(LEGACY_ITWIN_DETAIL);
    mocks.imodelsList.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('暂无 iModel')).toBeDefined();
    expect(screen.queryByRole('button', { name: '新建 iModel' })).toBeNull();
  });

  it('B 文档创建成功：createPending（不等待）→ 轮询至 initialized → 才进入编辑器', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '新建 iModel' }));
    await user.type(await screen.findByLabelText(/iModel 名称/), '新文档');
    await user.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() =>
      expect(mocks.imodelsCreatePending).toHaveBeenCalledWith('itwin-1', { name: '新文档' }),
    );
    // 不得依赖官方 createEmpty 的内部 5 分钟等待。
    expect(mocks.imodelsCreate).not.toHaveBeenCalled();
    // 只有 initialized 才导航（GET /imodels/im-3 默认返回 initialized）。
    await waitFor(() => expect(mocks.imodelsGet).toHaveBeenCalledWith('im-3'));
    expect(await screen.findByTestId('editor-route')).toBeDefined();
  });

  it('B 文档创建初始化失败：显示「再次检查」、不删除、不导航且重试不重复 POST', async () => {
    mocks.imodelsGet.mockResolvedValueOnce({
      ...IMODELS[0],
      id: 'im-3',
      state: 'initializationFailed',
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '新建 iModel' }));
    await user.type(await screen.findByLabelText(/iModel 名称/), '坏文档');
    await user.click(screen.getByRole('button', { name: '创建' }));

    expect(await screen.findByText('文档初始化失败')).toBeDefined();
    expect(screen.getByText(/不会自动删除/)).toBeDefined();
    expect(screen.getByText(/不会重建文档/)).toBeDefined();
    expect(screen.queryByTestId('editor-route')).toBeNull(); // 仍在详情页
    expect(mocks.imodelsDelete).not.toHaveBeenCalled();

    // 重试：第二次 GET 返回 initialized → 导航；仍只有一次 POST。
    mocks.imodelsGet.mockResolvedValue({
      ...IMODELS[0],
      id: 'im-3',
      state: 'initialized',
    });
    await user.click(screen.getByRole('button', { name: '再次检查' }));
    expect(await screen.findByTestId('editor-route')).toBeDefined();
    expect(mocks.imodelsDelete).not.toHaveBeenCalled();
    expect(mocks.imodelsCreatePending).toHaveBeenCalledTimes(1);
    expect(mocks.imodelsCreate).not.toHaveBeenCalled();
  });

  it('创建 POST 在途时关闭：不导航/不轮询/不写幽灵失败态；列表仍刷新', async () => {
    const pending = deferred<{ id: string }>();
    mocks.imodelsCreatePending.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '新建 iModel' }));
    await user.type(await screen.findByLabelText(/iModel 名称/), '慢文档');
    await user.click(screen.getByRole('button', { name: '创建' }));

    // 创建在途：Escape 关闭（允许取消）。
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    pending.resolve({ id: 'im-3' });
    await waitFor(() => expect(mocks.imodelsCreatePending).toHaveBeenCalledTimes(1));
    // 关闭后不轮询、不导航；列表仍被失效刷新（POST 已成功建库）。
    await waitFor(() => expect(mocks.imodelsList.mock.calls.length).toBeGreaterThan(1));
    expect(mocks.imodelsGet).not.toHaveBeenCalled();
    expect(screen.queryByTestId('editor-route')).toBeNull();

    // 重开不显示上一轮幽灵失败态。
    await user.click(await screen.findByRole('button', { name: '新建 iModel' }));
    expect(screen.queryByText('文档初始化失败')).toBeNull();
  });

  it('轮询期间关闭：abort 后迟到的 initialized 不导航、不写失败态', async () => {
    mocks.imodelsCreatePending.mockResolvedValue({ id: 'im-3' });
    const pendingGet = deferred<Record<string, unknown>>();
    mocks.imodelsGet.mockReturnValue(pendingGet.promise);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '新建 iModel' }));
    await user.type(await screen.findByLabelText(/iModel 名称/), '等待文档');
    await user.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => expect(mocks.imodelsGet).toHaveBeenCalledWith('im-3'));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    pendingGet.resolve({ ...IMODELS[0], id: 'im-3', state: 'initialized' });
    await waitFor(() => expect(mocks.imodelsGet).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('editor-route')).toBeNull();

    // 重开不显示上一轮的 waiting/failed 幽灵态。
    await user.click(await screen.findByRole('button', { name: '新建 iModel' }));
    expect(screen.queryByText('文档已创建，正在初始化…')).toBeNull();
    expect(screen.queryByText('文档初始化失败')).toBeNull();
  });

  it('B 文档重命名：卡片菜单 → ImodelsClient.update({name})（不是 iTwin update）', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click((await screen.findAllByRole('button', { name: '更多操作' }))[0]!);
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: '重命名' }));

    const input = await screen.findByLabelText(/文档名称/);
    await user.clear(input);
    await user.type(input, '改名文档');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(mocks.imodelsUpdate).toHaveBeenCalledWith('im-1', { name: '改名文档' }));
  });

  it('B 文档收藏/取消收藏：走官方 favoriteIModels 封装（不是 iTwin 收藏）', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click((await screen.findAllByRole('button', { name: '更多操作' }))[0]!);
    let menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: '收藏' }));
    await waitFor(() => expect(mocks.imodelsAddFavorite).toHaveBeenCalledWith('im-1'));

    // 收藏列表命中后菜单显示「取消收藏」→ remove。
    mocks.imodelsListFavorites.mockResolvedValue([IMODELS[0]]);
    await user.click(screen.getByRole('button', { name: '刷新' }));
    await waitFor(() => expect(mocks.imodelsListFavorites).toHaveBeenCalled());
    await user.click((await screen.findAllByRole('button', { name: '更多操作' }))[0]!);
    menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: '取消收藏' }));
    await waitFor(() => expect(mocks.imodelsRemoveFavorite).toHaveBeenCalledWith('im-1'));
  });

  it('B 文档未初始化：禁止打开编辑器（只有 initialized 可打开）', async () => {
    mocks.imodelsList.mockResolvedValue([
      { ...IMODELS[0], state: 'notInitialized' },
    ]);
    renderPage();
    const open = await screen.findByRole('button', { name: '打开工作空间' });
    expect(open.hasAttribute('disabled') || open.getAttribute('aria-disabled') === 'true').toBe(true);
  });
});
