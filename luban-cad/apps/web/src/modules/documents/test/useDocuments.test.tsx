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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

/** B 项目 iTwin：data.luban.modelMode='B'（P2.1 标记；未标记一律 A）。 */
const B_PROJECT = {
  id: 'proj-b',
  displayName: 'B 项目',
  createdBy: 'user-9',
  type: 'Project',
  subClass: 'Project',
  createdDateTime: '2026-10-03T08:00:00.0000000+00:00',
  data: { luban: { modelMode: 'B', schemaVersion: 1 } },
};

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

afterEach(() => {
  vi.unstubAllEnvs();
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

describe('useDocuments B/A 读模型（P2.1）', () => {
  it('flag 关（缺省）：projects 为空，legacyDocuments === documents（旧行为）', async () => {
    mocks.itwinsList.mockResolvedValue([...ITWINS, B_PROJECT]);
    const { result } = renderHook(() => useDocuments('my'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // documents 仍是全量过滤列表（收藏/搜索/兼容消费面不变）
    expect(result.current.documents.map((doc) => doc.id)).toEqual(['doc-1', 'proj-b']);
    // flag 关：B 标记也只按旧行为混在 documents 里，不分区
    expect(result.current.projects).toEqual([]);
    expect(result.current.legacyDocuments).toBe(result.current.documents);
  });

  it('flag 开：projects = mode B 子集，legacyDocuments = mode A 子集，documents 仍全量', async () => {
    vi.stubEnv('VITE_B_MODEL_ENABLED', 'true');
    mocks.itwinsList.mockResolvedValue([...ITWINS, B_PROJECT]);
    const { result } = renderHook(() => useDocuments('my'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.documents.map((doc) => doc.id)).toEqual(['doc-1', 'proj-b']);
    expect(result.current.projects.map((doc) => doc.id)).toEqual(['proj-b']);
    expect(result.current.projects[0]).toMatchObject({
      mode: 'B',
      projectId: 'proj-b',
      projectName: 'B 项目',
    });
    expect(result.current.legacyDocuments.map((doc) => doc.id)).toEqual(['doc-1']);
    expect(result.current.legacyDocuments.every((doc) => doc.mode === 'A')).toBe(true);
  });

  it("flag 只认字符串 'true'：'1'/'TRUE'/缺省均为关", async () => {
    for (const raw of ['1', 'TRUE', 'false', '']) {
      vi.stubEnv('VITE_B_MODEL_ENABLED', raw);
      mocks.itwinsList.mockResolvedValue([...ITWINS, B_PROJECT]);
      const { result, unmount } = renderHook(() => useDocuments('my'), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.projects, `VITE_B_MODEL_ENABLED=${raw}`).toEqual([]);
      expect(result.current.legacyDocuments.length).toBe(2);
      unmount();
    }
  });

  it("favorites 档兼容：既有 useDocuments('favorites') 调用方只读 documents，flag 开也照旧", async () => {
    vi.stubEnv('VITE_B_MODEL_ENABLED', 'true');
    mocks.listFavorites.mockResolvedValue([...ITWINS, B_PROJECT]);
    const { result } = renderHook(() => useDocuments('favorites'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.documents.map((doc) => doc.id)).toEqual(['doc-1', 'doc-2', 'proj-b']);
    expect(result.current.projects.map((doc) => doc.id)).toEqual(['proj-b']);
  });
});
