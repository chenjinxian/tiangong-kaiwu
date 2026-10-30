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
 * - B/A 双区（P2.1，rollback 安全）：**无论 flag 开关都先分区**——
 *   `legacyDocuments` = 非 B 子集、`projects` = flag 开时的 B 子集（关时恒空）。
 *   flag 开：`documents` 保持全量（收藏/搜索/兼容面）；flag 关：`documents`
 *   收敛为 A-only（plan Step 1「flag 关时只返回 A」，B 标记 iTwin 绝不进入
 *   legacy 列表/详情路径）。
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuthSession } from '@clients/auth/AuthSession.js';
import { ItwinsClient } from '@clients/itwins/ItwinsClient.js';
import { useBModelEnabled } from './useBModelEnabled.js';
import { toDocumentSummary } from '../internal/documents.mapper.js';
import type { DocumentFilter, DocumentSummary } from '../types.js';

/** 稳定空数组：flag 关的 projects / 查询未就绪时的 data 兜底共用（F4）。 */
const EMPTY_DOCUMENTS: DocumentSummary[] = [];

export interface UseDocumentsResult {
  /** 兼容出口：flag 开 = 全量过滤列表；flag 关 = A-only（见文件头注）。 */
  documents: DocumentSummary[];
  /** B 项目子集（flag 关恒空，稳定空数组引用）。 */
  projects: DocumentSummary[];
  /** A 旧文档子集（恒为分区结果，与 flag 无关）。 */
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
  const allDocuments = query.data ?? EMPTY_DOCUMENTS;
  // F4：分类结果按 (data, flag) memo——下游可见列表/排序 memo 不吃新引用。
  const { projects, legacyDocuments } = React.useMemo(
    () => classifyDocuments(allDocuments, bModelEnabled),
    [allDocuments, bModelEnabled],
  );
  return {
    documents: bModelEnabled ? allDocuments : legacyDocuments,
    projects,
    legacyDocuments,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
  };
}

/** B/A 分区（P2.1）：分区与 flag 无关；flag 只决定 B 子集是否暴露。 */
export function classifyDocuments(
  documents: DocumentSummary[],
  bModelEnabled: boolean,
): Pick<UseDocumentsResult, 'projects' | 'legacyDocuments'> {
  return {
    projects: bModelEnabled
      ? documents.filter((doc) => doc.mode === 'B')
      : EMPTY_DOCUMENTS,
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
