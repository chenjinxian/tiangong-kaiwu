// src/modules/documents/test/DocumentInfoPanel.test.tsx
//
// 终审 C1 回归：详情侧栏（DocumentInfoPanel）与详情页 useDocumentDetail 的
// 描述查询曾共用 queryKey ['documents','detail',id]——但两侧 queryFn 返回
// 形状不同（侧栏原始 ITwin 只要 description；详情页映射后 DocumentDetail），
// 同键即缓存形状混叠。修复：侧栏键改 ['documents','detail-raw',id]（异形
// 分离，零共享零风险，仍属 ['documents'] 前缀——页级 invalidate 照常命中）。
//
// 本文件钉死：同 id 下两键并存、两 queryFn 的缓存形状互不污染
//（detail 键不得出现 displayName 原始字段；detail-raw 键不得出现映射产物）。

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@clients/itwins/ItwinsClient.js', () => ({
  // 两侧查询都经 ItwinsClient.get——返回 hub 原始形状（displayName/description），
  // 侧栏宽类型直读，详情页 hook 内联映射。
  ItwinsClient: class {
    get = vi.fn().mockResolvedValue({
      id: 'doc-1',
      displayName: '文档 A',
      description: 'hub 原始描述',
      status: 'Active',
      createdDateTime: '2026-10-01T08:00:00.0000000+00:00',
      lastModifiedDateTime: '2026-10-20T12:30:00.0000000+00:00',
    });
  },
}));

// 跨模块走 barrel（spec 规则 4：@modules/<name> 单段入口，eslint 放行）。
import { useDocumentDetail } from '@modules/document-details';
import { DocumentInfoPanel } from '../components/DocumentInfoPanel.js';

const DOC = {
  id: 'doc-1',
  name: '文档 A',
  owner: 'user-9',
  role: 'Project',
  createdAt: '2026-10-01T08:00:00.0000000+00:00',
  modifiedAt: null,
};

/** 详情页 hook 探针：只挂查询，不渲染 UI。 */
function DetailHarness({ id }: { id: string }): null {
  useDocumentDetail(id);
  return null;
}

function renderBoth(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <DetailHarness id="doc-1" />
      <DocumentInfoPanel doc={DOC} formatDate={() => '—'} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

describe('DocumentInfoPanel queryKey 异形分离（终审 C1 回归）', () => {
  it('同 id 下 detail 键与 detail-raw 键并存（不撞键），缓存形状互不混', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderBoth(client);

    const detailKey = ['documents', 'detail', 'doc-1'];
    const rawKey = ['documents', 'detail-raw', 'doc-1'];

    // ① 两键各自注册——修复前侧栏与详情页共享 detail 键，rawKey 不存在即红。
    await waitFor(() => {
      const keys = client.getQueryCache().getAll().map((q) => q.queryKey);
      expect(keys).toEqual(expect.arrayContaining([detailKey, rawKey]));
    });

    // ② detail 键 = 映射后 DocumentDetail（displayName 已收敛为 name）。
    await waitFor(() => {
      const mapped = client.getQueryData<Record<string, unknown>>(detailKey);
      expect(mapped?.name).toBe('文档 A');
      expect(mapped?.description).toBe('hub 原始描述');
    });
    const mapped = client.getQueryData<Record<string, unknown>>(detailKey);
    expect(mapped).not.toHaveProperty('displayName');

    // ③ detail-raw 键 = 原始 ITwin（displayName 原样直透，无映射产物 name）。
    await waitFor(() => {
      const raw = client.getQueryData<Record<string, unknown>>(rawKey);
      expect(raw?.displayName).toBe('文档 A');
      expect(raw?.description).toBe('hub 原始描述');
    });
    const raw = client.getQueryData<Record<string, unknown>>(rawKey);
    expect(raw).not.toHaveProperty('name');
  });
});
