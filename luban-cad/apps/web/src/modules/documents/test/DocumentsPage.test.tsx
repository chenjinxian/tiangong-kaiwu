// src/modules/documents/test/DocumentsPage.test.tsx
//
// Task 5 失败测试先行（brief Step 1）：DocumentsPage 结构完备性——
//  1) 侧栏五筛选（最近打开过的/收藏/我的文档/已与我共享/公开）+ 创建大钮（os-01）；
//  2) 创建菜单五项：新建文档 ✅ + 新建文件夹/导入文件/导入来源/标签 🟠（os-40）；
//  3) 顶栏：品牌 + 居中搜索框 + 用户菜单（我的帐户/深色模式/退出登录，os-03）；
//  4) 工具条：分区标题计数 + 排序菜单 + 网格/列表切换 + 刷新；
//  5) 表格视图列（名称/所有者/角色/创建时间/更新时间）与行；
//  6) 行选择 → 详情侧栏锚点（InformationPanel）；
//  7) 行菜单 → 共享对话框（成员/邀请成员/分享链接 三页签）+ 删除确认对话框；
//  8) 行菜单「打开」→ /documents/:iTwinId 路由跳转。
//
// 数据面：mock useDocuments（Task 4 出口契约 {documents,isLoading,error}），
// 网络面（ItwinsClient / share.api / AuthSession.logout）全部模块级 mock，
// 结构测试零真实请求。

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseDocuments = vi.fn();
vi.mock('../hooks/useDocuments.js', () => ({
  useDocuments: (...args: unknown[]) => mockUseDocuments(...args),
}));

// hoisted：vi.mock 工厂提升执行，工厂内引用顶层 const 会撞 TDZ——
// 共享 delete mock 须经 vi.hoisted 声明（删除失败反馈用例要驱动它 reject）。
const { itwinsDeleteMock } = vi.hoisted(() => ({ itwinsDeleteMock: vi.fn() }));

vi.mock('@clients/itwins/ItwinsClient.js', () => ({
  // 类字段箭头函数：每实例一份 vi.fn，互不影响（get 供详情侧栏描述查询）；
  // delete 例外—— hoist 共享，供用例注入 reject。
  ItwinsClient: class {
    get = vi.fn().mockResolvedValue({ id: 'doc-1', displayName: '文档 A', description: '' });
    create = vi.fn();
    update = vi.fn();
    delete = itwinsDeleteMock;
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

vi.mock('../internal/share.api.js', () => ({
  listUserMembers: vi.fn().mockResolvedValue([]),
  listRoles: vi.fn().mockResolvedValue([]),
  addUserMember: vi.fn(),
  updateUserMember: vi.fn(),
  removeUserMember: vi.fn(),
}));

import { AuthSession } from '@clients/auth/AuthSession.js';
import { DocumentsPage } from '../DocumentsPage.js';

const DOCS = [
  {
    id: 'doc-1', name: '文档 A', owner: 'user-9', role: 'Project',
    createdAt: '2026-10-01T08:00:00.0000000+00:00', modifiedAt: '2026-10-20T12:30:00.0000000+00:00',
  },
  {
    id: 'doc-2', name: '文档 B', owner: 'user-8', role: 'Project',
    createdAt: '2026-10-02T08:00:00.0000000+00:00', modifiedAt: null,
  },
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/documents?filter=my']}>
        <DocumentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockUseDocuments.mockReturnValue({ documents: DOCS, isLoading: false, error: null });
  // 默认 resolved（undefined）；个别用例注入 reject。
  itwinsDeleteMock.mockReset();
});

describe('DocumentsPage 结构（/documents 中心页）', () => {
  it('侧栏五筛选 + 创建大钮（os-01 左栏）', () => {
    renderPage();
    const sidebar = screen.getByTestId('document-sidebar');
    for (const label of ['最近打开过的', '收藏', '我的文档', '已与我共享', '公开']) {
      expect(within(sidebar).getByRole('button', { name: label })).toBeDefined();
    }
    expect(within(sidebar).getByRole('button', { name: '创建' })).toBeDefined();
  });

  it('创建菜单五项：文档✅ + 文件夹/导入文件/导入来源/标签 🟠（os-40）', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: '创建' }));
    const menu = await screen.findByRole('menu');
    for (const label of ['新建文档', '新建文件夹', '导入文件', '导入来源', '标签']) {
      expect(within(menu).getByRole('menuitem', { name: label })).toBeDefined();
    }
  });

  it('创建菜单「新建文档」→ 创建对话框（名称必填 + 编号可选）', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: '创建' }));
    await user.click(await screen.findByRole('menuitem', { name: '新建文档' }));
    // LabeledInput 的 label↔input 关联（InputGrid 自动 htmlFor）——getByLabelText 可直取。
    expect(await screen.findByLabelText(/文档名称/)).toBeDefined();
    expect(screen.getByLabelText(/文档编号/)).toBeDefined();
  });

  it('创建菜单 🟠 项 → 能力引导对话框（完整 UI 面，照常可点）', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: '创建' }));
    await user.click(await screen.findByRole('menuitem', { name: '新建文件夹' }));
    expect(await screen.findByText('功能即将推出')).toBeDefined();
    expect(screen.getByRole('button', { name: '知道了' })).toBeDefined();
    // Escape dismissal 可达前提（review-8 I-1 P2 补齐）：打开即焦点入对话框。
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('顶栏：品牌 + 居中搜索框 + 用户菜单（我的帐户/深色模式/退出登录，os-03）', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByText('鲁班CAD')).toBeDefined();
    expect(screen.getByRole('searchbox')).toBeDefined();
    await user.click(screen.getByRole('button', { name: '用户菜单' }));
    const menu = await screen.findByRole('menu');
    for (const label of ['我的帐户', '深色模式', '退出登录']) {
      expect(within(menu).getByRole('menuitem', { name: label })).toBeDefined();
    }
  });

  it('用户菜单「退出登录」→ AuthSession.logout()', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: '用户菜单' }));
    await user.click(await screen.findByRole('menuitem', { name: '退出登录' }));
    expect(AuthSession.logout).toHaveBeenCalled();
  });

  it('工具条：分区标题+计数 / 排序菜单 / 网格·列表切换 / 刷新', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: '我的文档' })).toBeDefined();
    expect(screen.getByText('2 个文档')).toBeDefined();
    expect(screen.getByRole('button', { name: '排序' })).toBeDefined();
    expect(screen.getByRole('button', { name: '网格视图' })).toBeDefined();
    expect(screen.getByRole('button', { name: '列表视图' })).toBeDefined();
    expect(screen.getByRole('button', { name: '刷新' })).toBeDefined();
  });

  it('刷新接线（终审 I3）：isFetching=true 且 isLoading=false → 刷新钮禁用 + 旋转', () => {
    // isLoading(isPending) 仅首载为真——只给 isFetching 才能覆盖「有缓存数据的
    // refetch 期间」；isRefreshing 改接 isFetching 前，本用例刷新钮即不禁用不转圈。
    mockUseDocuments.mockReturnValue({
      documents: DOCS, isLoading: false, isFetching: true, error: null,
    });
    renderPage();
    const refreshBtn = screen.getByRole('button', { name: '刷新' });
    // iTwinUI v3 ButtonBase 禁用态渲染 data-iui-disabled/aria-disabled，不写 disabled
    // 属性（保 tooltip/focus）——「禁用」断言走稳定 data-iui-disabled。
    expect(refreshBtn.getAttribute('data-iui-disabled')).toBe('true');
    // SVG 元素的 className 是 SVGAnimatedString——断言必须走 getAttribute('class')。
    expect(refreshBtn.querySelector('svg')?.getAttribute('class')).toContain('documents-spin');
  });

  it('排序菜单项渲染本地化标签（非原始键串，键与 DocumentSortId 对齐）', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: '排序' }));
    const menu = await screen.findByRole('menu');
    for (const label of ['名称', '修改时间', '创建时间']) {
      expect(within(menu).getByRole('menuitem', { name: label })).toBeDefined();
    }
    // 反例钉死：不得渲染原始 i18n 键串（documents.sort.* 裸键回归）。
    expect(within(menu).queryByText(/documents\.sort\./)).toBeNull();
  });

  it('表格视图：名称/所有者/角色/创建时间/更新时间 列 + 行内容', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: '列表视图' }));
    // iTwinUI Table 的主体在 shadow root 内（role="table" 不可达），
    // 表头/行在 light DOM——列断言走 columnheader，行内容走文本。
    for (const col of ['名称', '所有者', '角色', '创建时间', '更新时间']) {
      expect(screen.getByRole('columnheader', { name: col })).toBeDefined();
    }
    expect(screen.getByText('文档 A')).toBeDefined();
    expect(screen.getByText('文档 B')).toBeDefined();
  });

  it('行选择 → 详情侧栏锚点（所有者/角色/时间/描述）', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: '列表视图' }));
    await user.click(screen.getByText('文档 A'));
    expect(await screen.findByText('详情')).toBeDefined();
    expect(screen.getAllByText('user-9').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('暂无描述')).toBeDefined();
  });

  it('行菜单 → 共享对话框（成员/邀请成员/分享链接 三页签）', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByRole('button', { name: '更多操作' })[0]!);
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: '分享' }));
    expect(await screen.findByText('分享文档')).toBeDefined();
    expect(screen.getByRole('tab', { name: '成员 (0)' })).toBeDefined();
    expect(screen.getByRole('tab', { name: '邀请成员' })).toBeDefined();
    expect(screen.getByRole('tab', { name: '分享链接' })).toBeDefined();
  });

  it('行菜单 → 删除确认对话框（HITL 危险操作）', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByRole('button', { name: '更多操作' })[0]!);
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: '删除' }));
    expect(await screen.findByText(/确定要删除文档「文档 A」吗/)).toBeDefined();
    expect(screen.getByRole('button', { name: '取消' })).toBeDefined();
    expect(screen.getByRole('button', { name: '删除' })).toBeDefined();
    // Escape dismissal 可达前提（review-8 I-1 P2 补齐）：打开即焦点入对话框。
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('删除失败 → 内联错误呈现（不静默），对话框保持在场', async () => {
    const user = userEvent.setup();
    itwinsDeleteMock.mockRejectedValue(new Error('hub boom'));
    renderPage();
    await user.click(screen.getAllByRole('button', { name: '更多操作' })[0]!);
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: '删除' }));
    await user.click(await screen.findByRole('button', { name: '删除' }));
    expect(await screen.findByText('hub boom')).toBeDefined();
    // 保持在场：确认消息与操作钮仍在（可重试）。
    expect(screen.getByText(/确定要删除文档「文档 A」吗/)).toBeDefined();
    expect(screen.getByRole('button', { name: '删除' })).toBeDefined();
  });

  it('表格排序受控：工具条排序菜单改序后表头 sorted 态跟随（无假状态）', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: '列表视图' }));
    // 初始排序 modifiedAt desc → 更新时间表头带 sorted 态。
    const modifiedHeader = await screen.findByRole('columnheader', { name: '更新时间' });
    expect(modifiedHeader.className).toMatch(/sorted/);
    // owner/role 列不参与排序（disableSortBy）——无 actionable 态。
    expect(screen.getByRole('columnheader', { name: '所有者' }).className).not.toMatch(/actionable/);
    expect(screen.getByRole('columnheader', { name: '角色' }).className).not.toMatch(/actionable/);
    // 工具条改排序 → 名称列头 sorted 态回灌，原列头卸下。
    await user.click(screen.getByRole('button', { name: '排序' }));
    await user.click(await screen.findByRole('menuitem', { name: '名称' }));
    expect((await screen.findByRole('columnheader', { name: '名称' })).className).toMatch(/sorted/);
    expect(screen.getByRole('columnheader', { name: '更新时间' }).className).not.toMatch(/sorted/);
  });

  it('行菜单「打开」→ 跳转 /documents/:iTwinId', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/documents?filter=my']}>
          <Routes>
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/documents/:iTwinId" element={<div data-testid="doc-detail" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await user.click(screen.getAllByRole('button', { name: '更多操作' })[0]!);
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: '打开' }));
    expect(await screen.findByTestId('doc-detail')).toBeDefined();
  });

  it('空态：当前筛选无文档 → 引导文案', () => {
    mockUseDocuments.mockReturnValue({ documents: [], isLoading: false, error: null });
    renderPage();
    expect(screen.getByText('暂无文档')).toBeDefined();
    expect(screen.getByText('创建您的第一个文档')).toBeDefined();
  });

  it('加载态：加载中文案', () => {
    mockUseDocuments.mockReturnValue({ documents: [], isLoading: true, error: null });
    renderPage();
    expect(screen.getByText('加载文档中…')).toBeDefined();
  });
});
