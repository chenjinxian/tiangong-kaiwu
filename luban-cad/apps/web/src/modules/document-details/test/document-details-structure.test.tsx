// src/modules/document-details/test/document-details-structure.test.tsx
//
// M2 Task 8 结构断言（brief Step 1）：/documents/:iTwinId 关键区域存在性验收——
//  1) 面包屑：文档 → 当前文档名（os-01 详情区面包屑）；
//  2) hero：名称 headline + 状态 Tag + 创建/更新时间 + iModel 计数 +
//     操作区（新建 iModel / 分享 / 删除）；
//  3) iModel 卡片网格（imodel-card-grid 锚点）：名称/描述/初始化徽标/
//     「打开工作空间」；
//  4) 创建按钮 → 创建对话框（iModel 名称必填 + 描述可选）。
//
// 定位：Task 6 DocumentDetailsPage.test.tsx 行为深测之外的关键区域存在性
// 验收层（M2 DoD 4/6）；mock 口径与其一致——真实 hooks + mapper 参与，
// 客户端（ImodelsClient / ItwinsClient / AuthSession / share.api）模块级
// mock，结构断言全部走异步 findBy*（数据经一轮微任务到位）。

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  imodelsList: vi.fn(),
  imodelsCreate: vi.fn(),
  itwinsGet: vi.fn(),
  getITwinPermissions: vi.fn(),
}));

vi.mock('@clients/imodels/ImodelsClient.js', () => ({
  ImodelsClient: class {
    list = mocks.imodelsList;
    get = vi.fn();
    create = mocks.imodelsCreate;
    delete = vi.fn();
  },
}));

vi.mock('@clients/itwins/ItwinsClient.js', () => ({
  ItwinsClient: class {
    get = mocks.itwinsGet;
    delete = vi.fn();
    create = vi.fn();
    update = vi.fn();
  },
}));

// 终审 I3：新建 iModel 权限门——iTwin 级权限查询 mock（默认具备 manage，
// 本文件只做结构存在性断言；Viewer/加载中/失败分支由 DocumentDetailsPage.test
// 覆盖）。
vi.mock('@clients/access-control/AccessControlClient.js', () => ({
  AccessControlClient: class {
    getITwinPermissions = mocks.getITwinPermissions;
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
    // P0 Task 2：失败态徽标锚点（四态徽标结构验收）。
    state: 'initializationFailed',
    createdDateTime: '2026-10-03T08:00:00.0000000+00:00',
    lastChangesetPushDateTime: null,
    iTwinId: 'itwin-1',
  },
];

const ITWIN_DETAIL = {
  id: 'itwin-1',
  displayName: '演示文档',
  status: 'Active',
  description: '演示项目描述',
  createdDateTime: '2026-10-01T08:00:00.0000000+00:00',
  lastModifiedDateTime: '2026-10-20T12:30:00.0000000+00:00',
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/documents/itwin-1']}>
        <Routes>
          <Route path="/documents" element={<div data-testid="documents-home" />} />
          <Route path="/documents/:iTwinId" element={<DocumentDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.itwinsGet.mockResolvedValue(ITWIN_DETAIL);
  mocks.imodelsList.mockResolvedValue(IMODELS);
  mocks.imodelsCreate.mockResolvedValue({ id: 'im-3' });
  mocks.getITwinPermissions.mockResolvedValue(['imodels_manage', 'imodels_webview']);
});

describe('DocumentDetailsPage 结构断言（M2 Task 8，关键区域存在性）', () => {
  it('面包屑：文档 → 当前文档名（os-01 详情区）', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: '文档' })).toBeDefined();
    expect((await screen.findAllByText('演示文档')).length).toBeGreaterThanOrEqual(2);
  });

  it('hero：名称/状态/时间/计数 + 操作区（新建 iModel/分享/删除）', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: '演示文档' })).toBeDefined();
    expect(screen.getByText('Active')).toBeDefined();
    expect(screen.getAllByText(/创建于/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/更新于/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('2 个 iModel').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: '新建 iModel' })).toBeDefined();
    expect(screen.getByRole('button', { name: '分享' })).toBeDefined();
    expect(screen.getByRole('button', { name: '删除' })).toBeDefined();
  });

  it('iModel 卡片网格：imodel-card-grid 锚点 + 卡片要素', async () => {
    renderPage();
    const grid = await screen.findByTestId('imodel-card-grid');
    expect(within(grid).getByText('楼层模型')).toBeDefined();
    expect(within(grid).getByText('结构模型')).toBeDefined();
    expect(within(grid).getByText('一层平面布局')).toBeDefined();
    // 初始化徽标：已初始化 ×1 + 初始化失败 ×1；每卡一个「打开工作空间」。
    expect(within(grid).getByText('已初始化')).toBeDefined();
    expect(within(grid).getByText('初始化失败')).toBeDefined();
    expect(within(grid).getAllByRole('button', { name: '打开工作空间' })).toHaveLength(2);
  });

  it('创建按钮 → 创建对话框（iModel 名称必填 + 描述可选）', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: '新建 iModel' }));
    // LabeledInput label↔input 关联——getByLabelText 直取两字段。
    expect(await screen.findByLabelText(/iModel 名称/)).toBeDefined();
    expect(screen.getByLabelText(/描述/)).toBeDefined();
  });
});
