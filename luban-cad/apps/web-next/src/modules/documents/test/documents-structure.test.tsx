// src/modules/documents/test/documents-structure.test.tsx
//
// M2 Task 8 结构断言（brief Step 1）：/documents 关键区域存在性验收——
//  1) 侧栏（document-sidebar 锚点）：五筛选（最近打开过的/收藏/我的文档/
//     已与我共享/公开，os-01/os-06）+ 创建大钮（os-40）；
//  2) 创建菜单五项：新建文档 ✅ + 新建文件夹/导入文件/导入来源/标签 🟠（os-40）；
//  3) 顶栏：品牌（鲁班CAD）+ 居中搜索框（os-01 顶栏 / os-03）；
//  4) 工具条：分区标题+计数 / 排序菜单 / 网格·列表切换 / 刷新；
//  5) 表格视图（列表切换后）：名称/所有者/角色/创建时间/更新时间 五列 + 行；
//  6) 网格视图（默认态）：文档卡片渲染（Onshape 卡片密度）；
//  7) 行选择 → 详情侧栏（InformationPanel，os-01 右栏详情）；
//  8) 行菜单 → 共享对话框（成员/邀请成员/分享链接 三页签）。
//
// 定位：Task 5 DocumentsPage.test.tsx 行为深测之外的「关键区域存在性」
// 验收层（M2 DoD 6 结构断言落档）；mock 口径与其一致——useDocuments 出口
// 契约 {documents,isLoading,error}，网络面（ItwinsClient / share.api /
// AuthSession）模块级 mock，结构测试零真实请求。

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseDocuments = vi.fn();
vi.mock('../hooks/useDocuments.js', () => ({
  useDocuments: (...args: unknown[]) => mockUseDocuments(...args),
}));

vi.mock('@clients/itwins/ItwinsClient.js', () => ({
  ItwinsClient: class {
    // 详情侧栏描述查询面（getByText 详情断言的取数源）。
    get = vi.fn().mockResolvedValue({ id: 'doc-1', displayName: '文档 A', description: '' });
    create = vi.fn();
    update = vi.fn();
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

vi.mock('../internal/share.api.js', () => ({
  listUserMembers: vi.fn().mockResolvedValue([]),
  listRoles: vi.fn().mockResolvedValue([]),
  addUserMember: vi.fn(),
  updateUserMember: vi.fn(),
  removeUserMember: vi.fn(),
}));

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
});

describe('DocumentsPage 结构断言（M2 Task 8，关键区域存在性）', () => {
  it('侧栏：document-sidebar 锚点 + 五筛选 + 创建大钮（os-01 左栏）', () => {
    renderPage();
    const sidebar = screen.getByTestId('document-sidebar');
    for (const label of ['最近打开过的', '收藏', '我的文档', '已与我共享', '公开']) {
      expect(within(sidebar).getByRole('button', { name: label })).toBeDefined();
    }
    expect(within(sidebar).getByRole('button', { name: '创建' })).toBeDefined();
  });

  it('创建按钮 → 菜单五项：文档✅ + 文件夹/导入文件/导入来源/标签 🟠（os-40）', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: '创建' }));
    const menu = await screen.findByRole('menu');
    for (const label of ['新建文档', '新建文件夹', '导入文件', '导入来源', '标签']) {
      expect(within(menu).getByRole('menuitem', { name: label })).toBeDefined();
    }
  });

  it('顶栏：品牌 + 居中搜索框（os-01 顶栏 / os-03）', () => {
    renderPage();
    expect(screen.getByText('鲁班CAD')).toBeDefined();
    expect(screen.getByRole('searchbox')).toBeDefined();
  });

  it('工具条：分区标题+计数 / 排序 / 网格·列表切换 / 刷新', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: '我的文档' })).toBeDefined();
    expect(screen.getByText('2 个文档')).toBeDefined();
    expect(screen.getByRole('button', { name: '排序' })).toBeDefined();
    expect(screen.getByRole('button', { name: '网格视图' })).toBeDefined();
    expect(screen.getByRole('button', { name: '列表视图' })).toBeDefined();
    expect(screen.getByRole('button', { name: '刷新' })).toBeDefined();
  });

  it('表格视图（列表切换后）：五列在场 + 行内容', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: '列表视图' }));
    for (const col of ['名称', '所有者', '角色', '创建时间', '更新时间']) {
      expect(await screen.findByRole('columnheader', { name: col })).toBeDefined();
    }
    expect(screen.getByText('文档 A')).toBeDefined();
    expect(screen.getByText('文档 B')).toBeDefined();
  });

  it('网格视图（默认态）：文档卡片渲染（名称 + 行操作入口）', () => {
    renderPage();
    // 默认 tile 视图（localStorage 无记忆值）——两卡名称在场。
    expect(screen.getByText('文档 A')).toBeDefined();
    expect(screen.getByText('文档 B')).toBeDefined();
    // 每卡的更多菜单（行操作入口，分享/删除等经此抵达）。
    expect(screen.getAllByRole('button', { name: '更多操作' })).toHaveLength(2);
  });

  it('行选择 → 详情侧栏（InformationPanel，os-01 右栏）', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: '列表视图' }));
    await user.click(screen.getByText('文档 A'));
    expect(await screen.findByText('详情')).toBeDefined();
    expect(screen.getAllByText('user-9').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('暂无描述')).toBeDefined();
  });

  it('行菜单 → 共享对话框三页签（成员/邀请成员/分享链接）', async () => {
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
});
