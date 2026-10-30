/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useDocuments（Task 4）：文档列表查询 hook（react-query）。
 * - queryKey `['documents', filter]`——筛选即缓存键，切换侧栏自动命中/取新；
 * - 内部按 filter 分流取数（recent/favorites 走官方专用端点；my/shared 走
 *   list({top:200}) 后按 createdBy 与当前用户比对；public 见下方裁决）；
 * - 出口收敛为 `{ documents, projects, legacyDocuments, isLoading, isFetching,
 *   error }`（documents 恒为数组，避免调用方对 undefined 分支防御；
 *   isFetching 首载与 refetch 期间恒真——刷新钮禁用/旋转信号；isLoading
 *   仅首载为真，刷新期间恒假，终审 I3 改由 isFetching 驱动，否则刷新钮永不
 *   转圈）；
 * - B/A 双区（P2.1，加法式，不破坏既有消费方）：`documents` 仍为全量过滤
 *   列表（收藏/搜索/兼容面照旧）；`projects` = mode B 子集、`legacyDocuments`
 *   = mode A 子集。flag 关时 `projects=[]`、`legacyDocuments===documents`
 *   （旧行为逐字保持）。
 */

import { useQuery } from '@tanstack/react-query';
import { AuthSession } from '@clients/auth/AuthSession.js';
import { ItwinsClient } from '@clients/itwins/ItwinsClient.js';
import { useBModelEnabled } from './useBModelEnabled.js';
import { toDocumentSummary } from '../internal/documents.mapper.js';
import type { DocumentFilter, DocumentSummary } from '../types.js';

export interface UseDocumentsResult {
  /** 全量过滤列表（既有消费方兼容面：收藏集合/搜索/详情联动）。 */
  documents: DocumentSummary[];
  /** B 项目子集（flag 关恒空）。 */
  projects: DocumentSummary[];
  /** A 旧文档子集（flag 关 === documents）。 */
  legacyDocuments: DocumentSummary[];
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
}

export function useDocuments(filter: DocumentFilter): UseDocumentsResult {
  const bModelEnabled = useBModelEnabled();
  const query = useQuery({
    queryKey: ['documents', filter],
    queryFn: () => fetchDocuments(filter),
  });
  const documents = query.data ?? [];
  const { projects, legacyDocuments } = classifyDocuments(documents, bModelEnabled);
  return {
    documents,
    projects,
    legacyDocuments,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
  };
}

/** B/A 分区（P2.1）：flag 关 = 旧行为（全量归 A、B 区空）。 */
export function classifyDocuments(
  documents: DocumentSummary[],
  bModelEnabled: boolean,
): Pick<UseDocumentsResult, 'projects' | 'legacyDocuments'> {
  if (!bModelEnabled) {
    return { projects: [], legacyDocuments: documents };
  }
  return {
    projects: documents.filter((doc) => doc.mode === 'B'),
    legacyDocuments: documents.filter((doc) => doc.mode !== 'B'),
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
      // top: 200（M5-T7 perf 探针实测修正）：裸 list() 不带 $top 时 hub 端
      // clampTop 缺省页 = 10 行（imodelhub-services common/utils/clamp-top.util
      // def=10/max=200）——文档中心静默只显示 10 个文档且无分页 UI，超出部分
      // 对用户不可见（perf 门禁「百行滚动」因此无法成立）。拉满 hub 上限一页
      // （200），搜索/排序/计数在更大数据集上保持正确；分页 UI 归后续波次。
      const all = await client.list({ top: 200 });
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
