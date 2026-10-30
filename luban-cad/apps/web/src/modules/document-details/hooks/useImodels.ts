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
 *
 * P2.3：useDocumentDetail 从已加载 iTwin 的 `data.luban.modelMode` 派生
 * `mode`（B/A 分支唯一事实源）；`waitForImodelInitialized` 为 B 文档创建
 * 提供有上限的 initialized 轮询（见文件尾部）。
 */

import { useQuery } from '@tanstack/react-query';
import type { ITwin } from '@itwin/itwins-client';
import type { IModel } from '@itwin/imodels-client-management';
import { ItwinsClient } from '@clients/itwins/ItwinsClient.js';
import { isBModelItwin } from '@clients/itwins/types.js';
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
    // P2.3：B/A 分支只认项目标记（绝不由 flag 决定）——直接 URL 打开 B 项目
    // 在 rollback（flag 关）下也不会回落 legacy A 语义。
    mode: isBModelItwin(itwin) ? 'B' : 'A',
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

// ---------------------------------------------------------------------------
// B 文档创建后的初始化等待（P2.3）
//
// hub 的 iModel 创建是异步的：`POST /imodels` 返回 notInitialized，baseline 由
// webhook-agent 生成后 state 才变 initialized。创建流程必须轮询
// `GET /imodels/:id` 至 initialized 才进入编辑器；失败/缺文件/超时给出重试
// 入口，文档保留（**绝不静默删除**）。轮询有上限（cap），避免永久悬挂。
// ---------------------------------------------------------------------------

/** 默认轮询间隔（1s）与上限（60 次 ≈ 60s）。 */
export const IMODEL_INIT_POLL_INTERVAL_MS = 1000;
export const IMODEL_INIT_POLL_MAX_ATTEMPTS = 60;

/** 初始化等待依赖注入面（测试注入 get/sleep，不 patch 计时器）。 */
export interface WaitForImodelInitializedOptions {
  /** 拉取单个 iModel（默认 `ImodelsClient.get`）。 */
  get?: (id: string) => Promise<IModel>;
  /** 轮询间隔睡眠（默认 setTimeout；测试注入即时实现）。 */
  sleep?: (ms: number) => Promise<void>;
  intervalMs?: number;
  maxAttempts?: number;
  /** 取消信号（对话框关闭/组件卸载时终止轮询）。 */
  signal?: AbortSignal;
}

export type ImodelInitializationResult =
  | { status: 'initialized'; imodel: ImodelSummary }
  | { status: 'failed'; imodel: ImodelSummary }
  | { status: 'timeout'; imodel: ImodelSummary | null }
  | { status: 'error'; error: unknown }
  | { status: 'cancelled' };

/**
 * 轮询至 iModel `initialized`；`initializationFailed` / `missingFiles` 立即
 * 终止为 failed（终态不可等）；其余状态（含 notInitialized/retryScheduled/
 * unknown）继续直到成功或达到上限。
 */
export async function waitForImodelInitialized(
  imodelId: string,
  options: WaitForImodelInitializedOptions = {},
): Promise<ImodelInitializationResult> {
  const intervalMs = options.intervalMs ?? IMODEL_INIT_POLL_INTERVAL_MS;
  const maxAttempts = options.maxAttempts ?? IMODEL_INIT_POLL_MAX_ATTEMPTS;
  const signal = options.signal;
  const get = options.get ?? ((id: string) => new ImodelsClient().get(id));
  const sleep =
    options.sleep ?? ((ms: number) => defaultSleep(ms, signal));

  let last: ImodelSummary | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (signal?.aborted) return { status: 'cancelled' };
    try {
      last = toImodelSummary(await get(imodelId));
    } catch (error) {
      return signal?.aborted ? { status: 'cancelled' } : { status: 'error', error };
    }
    if (last.state === 'initialized') return { status: 'initialized', imodel: last };
    if (last.state === 'initializationFailed' || last.state === 'missingFiles') {
      return { status: 'failed', imodel: last };
    }
    if (attempt + 1 < maxAttempts) await sleep(intervalMs);
  }
  return signal?.aborted ? { status: 'cancelled' } : { status: 'timeout', imodel: last };
}

/** 可中断的 setTimeout 睡眠。 */
function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
    function done(): void {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
  });
}
