/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useImodels / useDocumentDetail（Task 6）：文档详情页双查询 hook（react-query）——
 * - `useDocumentDetail(iTwinId)`：hero 数据源（ItwinsClient.get），出口收敛为
 *   `{ document, isLoading, error, refetch }`；ITwin → DocumentDetail 映射在
 *   本文件内联（hub 详情超集字段的宽类型读取，与 documents.mapper 的
 *   ITwinRaw 同姿态）；
 * - `useImodels(iTwinId)`：iModel 卡片网格数据源（ImodelsClient.list 收拢
 *   为数组后逐条走 toImodelSummary），出口 `{ imodels, isLoading, isFetching,
 *   error, refetch }`（imodels 恒为数组，避免调用方对 undefined 分支防御；
 *   isFetching 首载与 refetch 期间恒真——刷新钮旋转信号，isLoading 仅首载
 *   为真、刷新期间恒假，终审 I3 改由 isFetching 驱动 SvgRefresh.spin）。
 *
 * queryKey 与 documents 模块同族（['documents', ...] 前缀）——
 * 创建/删除 iModel 后按 ['documents','imodels'] 前缀失效即可刷新网格与计数。
 */

import { useQuery } from '@tanstack/react-query';
import type { ITwin } from '@itwin/itwins-client';
import { ItwinsClient } from '@clients/itwins/ItwinsClient.js';
import { ImodelsClient } from '@clients/imodels/ImodelsClient.js';
import { toImodelSummary } from '../internal/imodels.mapper.js';
import type { DocumentDetail, ImodelSummary } from '../types.js';

export interface UseDocumentDetailResult {
  document: DocumentDetail | null;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

export interface UseImodelsResult {
  imodels: ImodelSummary[];
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => void;
}

export function useDocumentDetail(iTwinId: string | undefined): UseDocumentDetailResult {
  const query = useQuery({
    queryKey: ['documents', 'detail', iTwinId],
    queryFn: () => fetchDocumentDetail(iTwinId ?? ''),
    enabled: !!iTwinId,
  });
  return {
    document: query.data ?? null,
    isLoading: query.isPending,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}

export function useImodels(iTwinId: string | undefined): UseImodelsResult {
  const query = useQuery({
    queryKey: ['documents', 'imodels', iTwinId],
    queryFn: () => fetchImodels(iTwinId ?? ''),
    enabled: !!iTwinId,
  });
  return {
    imodels: query.data ?? [],
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}

/** 官方 ITwin 类型未声明、本地 hub 详情实际输出的超集字段（防御性宽类型）。 */
type DetailITwinRaw = ITwin & {
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  modifiedAt?: string;
  lastModifiedDateTime?: string;
};

async function fetchDocumentDetail(iTwinId: string): Promise<DocumentDetail> {
  const itwin = (await new ItwinsClient().get(iTwinId)) as DetailITwinRaw;
  const createdAt = itwin.createdDateTime ?? itwin.createdAt ?? '';
  const updatedRaw = itwin.lastModifiedDateTime ?? itwin.updatedAt ?? itwin.modifiedAt;
  const updatedAt = updatedRaw ?? itwin.createdDateTime ?? null;
  const thumbnailUrl = itwin.image ?? undefined;
  return {
    id: itwin.id ?? '',
    name: itwin.displayName ?? '',
    description: itwin.description ?? '',
    status: itwin.status ?? '',
    createdAt,
    updatedAt,
    ...(thumbnailUrl !== undefined ? { thumbnailUrl } : {}),
  };
}

async function fetchImodels(iTwinId: string): Promise<ImodelSummary[]> {
  const imodels = await new ImodelsClient().list(iTwinId);
  return imodels.map(toImodelSummary);
}
