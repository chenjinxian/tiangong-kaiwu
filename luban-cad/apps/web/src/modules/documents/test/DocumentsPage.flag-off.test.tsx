// src/modules/documents/test/DocumentsPage.flag-off.test.tsx
//
// F2 页面级集成回归（rollback 安全）：flag 关（VITE_B_MODEL_ENABLED 未设）+
// hub 中已存在 B 标记 iTwin 时——真实 useDocuments/useBModelEnabled 必须把
// B 项目排除出 A/legacy 列表，页面不渲染 B 项目区，B 名称不得出现在 DOM。
// 修复前（flag 关回退消费全量 documents）本用例红；修复后绿。
//
// 与 DocumentsPage.test.tsx 的区别：本文件**不 mock** useDocuments /
// useBModelEnabled，只 mock 数据层（ItwinsClient）——让真实分区逻辑上场。

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  listFavorites: vi.fn(),
}));

vi.mock('@clients/itwins/ItwinsClient.js', () => ({
  ItwinsClient: class {
    list = mocks.list;
    listFavorites = mocks.listFavorites;
    listRecents = vi.fn().mockResolvedValue([]);
    get = vi.fn().mockResolvedValue({});
    create = vi.fn();
    update = vi.fn();
    delete = vi.fn();
  },
}));

vi.mock('@clients/auth/AuthSession.js', () => ({
  AuthSession: {
    getStoredAuth: vi.fn().mockReturnValue({
      accessToken: 'tok',
      refreshToken: 'r',
      expiresAt: Date.now() + 999_999,
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

const A_DOC = {
  id: 'doc-a',
  displayName: '旧文档 A',
  createdBy: 'user-9',
  type: 'Project',
  createdDateTime: '2026-10-01T08:00:00.0000000+00:00',
};

/** B 项目 iTwin（P2.3 创建后的真实数据形态）。 */
const B_ITWIN = {
  id: 'proj-b',
  displayName: 'B 项目泄漏',
  createdBy: 'user-9',
  type: 'Project',
  createdDateTime: '2026-10-02T08:00:00.0000000+00:00',
  data: { luban: { modelMode: 'B', schemaVersion: 1 } },
};

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
  // flag 缺省关：确保没有残留的 env stub（useBModelEnabled 读真实 env）。
  vi.unstubAllEnvs();
  mocks.list.mockReset();
  mocks.listFavorites.mockReset();
  mocks.listFavorites.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('DocumentsPage flag 关 + B 标记数据（F1 rollback 安全）', () => {
  it('B 标记 iTwin 不进入 A 列表：无 B 项目区、B 名称不在 DOM、计数只算 A', async () => {
    mocks.list.mockResolvedValue([A_DOC, B_ITWIN]);
    renderPage();

    // 真实 hook 取数 + mapper + 分区完成
    expect(await screen.findByText('旧文档 A')).toBeDefined();

    // flag 关：B 区不渲染
    expect(screen.queryByTestId('projects-section')).toBeNull();
    // 关键回归：B 项目绝不能以 A 旧文档身份泄漏进列表（修复前此处红）
    expect(screen.queryByText('B 项目泄漏')).toBeNull();
    // A 区计数/分区只含 A 旧文档
    expect(screen.getByText('1 个文档')).toBeDefined();
  });
});
