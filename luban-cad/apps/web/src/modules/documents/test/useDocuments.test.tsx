// src/modules/documents/test/useDocuments.test.tsx
//
// M5-T7 perf 探针实测回归：my/shared 档取数必须带 top:200（hub clampTop
// 缺省页 = 10 行——裸 list() 时文档中心静默只显示 10 个文档且无分页 UI，
// perf 门禁「Documents 百行滚动」场景无法成立）。本文件钉死 $top 透传契约
// 与 my 档 createdBy 过滤、mapper 出口形状。
//
// 形态对齐 document-details/test/useImodels.test.tsx（hoisted mock + renderHook）。

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  itwinsList: vi.fn(),
  listFavorites: vi.fn(),
  listRecents: vi.fn(),
}));

vi.mock('@clients/itwins/ItwinsClient.js', () => ({
  ItwinsClient: class {
    list = mocks.itwinsList;
    listFavorites = mocks.listFavorites;
    listRecents = mocks.listRecents;
  },
}));

vi.mock('@clients/auth/AuthSession.js', () => ({
  AuthSession: {
    getStoredAuth: vi.fn().mockReturnValue({
      accessToken: 'tok',
      refreshToken: 'r',
      expiresAt: Date.now() + 999_999,
      user: { id: 'user-9', email: 'a@example.com', name: 'Alan' },
    }),
  },
}));

import { useDocuments } from '../hooks/useDocuments.js';

/** 官方 ITwin 测试最小形状（mapper 只读子集；Hub 实测 ISO 8601 带尾零）。 */
const ITWINS = [
  {
    id: 'doc-1',
    displayName: '我的文档 A',
    createdBy: 'user-9',
    type: 'Project',
    subClass: 'ProjectAnalytics',
    createdDateTime: '2026-10-01T08:00:00.0000000+00:00',
    lastModifiedDateTime: '2026-10-20T12:30:00.0000000+00:00',
  },
  {
    id: 'doc-2',
    displayName: '别人的文档 B',
    createdBy: 'user-8',
    type: 'Project',
    createdDateTime: '2026-10-02T08:00:00.0000000+00:00',
  },
];

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.itwinsList.mockResolvedValue(ITWINS);
});

describe('useDocuments 取数契约（M5-T7 perf 实测修正）', () => {
  it('my 档：list 带 top:200（hub 缺省页 10 行的解封），createdBy 过滤 + mapper 出口', async () => {
    const { result } = renderHook(() => useDocuments('my'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // $top 透传契约：hub clampTop def=10 → 裸 list() 静默截 10 行，必须显式拉满
    expect(mocks.itwinsList).toHaveBeenCalledTimes(1);
    expect(mocks.itwinsList).toHaveBeenCalledWith({ top: 200 });

    // createdBy === 我 → 只进 doc-1；mapper：name←displayName / owner←createdBy
    expect(result.current.documents).toHaveLength(1);
    expect(result.current.documents[0]).toMatchObject({
      id: 'doc-1',
      name: '我的文档 A',
      owner: 'user-9',
      role: 'ProjectAnalytics',
    });
  });

  it('shared 档：同 top:200 契约，createdBy 非我 → 只进他人文档', async () => {
    const { result } = renderHook(() => useDocuments('shared'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.itwinsList).toHaveBeenCalledWith({ top: 200 });
    expect(result.current.documents.map((doc) => doc.id)).toEqual(['doc-2']);
  });
});
