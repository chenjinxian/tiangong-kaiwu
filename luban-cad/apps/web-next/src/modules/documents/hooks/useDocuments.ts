/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useDocuments（Task 4）：文档列表查询 hook（react-query）。
 * - queryKey `['documents', filter]`——筛选即缓存键，切换侧栏自动命中/取新；
 * - 内部按 filter 分流取数（recent/favorites 走官方专用端点；my/shared 走
 *   list() 后按 createdBy 与当前用户比对；public 见下方裁决）；
 * - 出口收敛为 `{ documents, isLoading, error }`（documents 恒为数组，
 *   避免调用方对 undefined 分支防御）。
 */

import { useQuery } from '@tanstack/react-query';
import { AuthSession } from '@clients/auth/AuthSession.js';
import { ItwinsClient } from '@clients/itwins/ItwinsClient.js';
import { toDocumentSummary } from '../internal/documents.mapper.js';
import type { DocumentFilter, DocumentSummary } from '../types.js';

export interface UseDocumentsResult {
  documents: DocumentSummary[];
  isLoading: boolean;
  error: unknown;
}

export function useDocuments(filter: DocumentFilter): UseDocumentsResult {
  const query = useQuery({
    queryKey: ['documents', filter],
    queryFn: () => fetchDocuments(filter),
  });
  return {
    documents: query.data ?? [],
    isLoading: query.isPending,
    error: query.error,
  };
}

/** 按筛选分流取数（内部，测试经 hook 覆盖）。 */
async function fetchDocuments(filter: DocumentFilter): Promise<DocumentSummary[]> {
  const client = new ItwinsClient();
  switch (filter) {
    case 'recent':
      return (await client.listRecents()).map(toDocumentSummary);
    case 'favorites':
      return (await client.listFavorites()).map(toDocumentSummary);
    case 'my':
    case 'shared': {
      const me = AuthSession.getStoredAuth()?.user.id;
      const all = await client.list();
      // my：createdBy 命中当前用户；shared：createdBy 在场且非我
      // （createdBy 缺席的文档两边都不进——归属不明不猜）。
      const picked = filter === 'my'
        ? all.filter((itwin) => itwin.createdBy === me)
        : all.filter((itwin) => itwin.createdBy !== undefined && itwin.createdBy !== me);
      return picked.map(toDocumentSummary);
    }
    case 'public':
      // 公开标记裁决（2026-10-21）：官方 ITwin 类型与本地 hub iTwin 实体
      // （imodelhub-services src/itwins/domain/itwin.ts）均无公开字段，
      // hub 补字段前 public 档恒为空列表。
      return [];
  }
}
