/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useChangesets（web M4 Task 7）：版本历史数据源 hook（react-query）——
 * - 数据通道：`ImodelsClient.listChangesets`（官方
 *   `@itwin/imodels-client-management` changesets.getRepresentationList，
 *   迭代器自动翻页收拢为数组——旧应用 useChangesets.ts:48 同通道，仅状态
 *   管理从手写 useState 收敛为 react-query，服务端态不入 zustand，spec §3）；
 * - queryKey `['part-studio', 'changesets', iModelId]`（M2 documentsKeys
 *   同族前缀风格）——推送成功后宿主按该 key 失效即刷新面板；
 * - 启用门控：iModelId=null（连接未就绪/路由缺参）不发起查询，changesets
 *   恒为数组（调用方免 undefined 分支防御，useImodels 同口径）。
 */

import { useQuery } from '@tanstack/react-query';
import type { Changeset } from '@clients/imodels/ImodelsClient.js';
import { ImodelsClient } from '@clients/imodels/ImodelsClient.js';

export interface UseChangesetsResult {
  /** changeset 列表（官方 Changeset 全量表示；loading 期为空数组）。 */
  changesets: Changeset[];
  /** 首载在途（isPending 语义；有缓存数据的 refetch 期间为假）。 */
  isLoading: boolean;
  /** 查询错误（原样上抛，错误面渲染归消费面板）。 */
  error: unknown;
  /** 手动刷新（error 态「重试」入口）。 */
  refetch: () => void;
}

export function useChangesets(iModelId: string | null): UseChangesetsResult {
  const query = useQuery({
    queryKey: ['part-studio', 'changesets', iModelId],
    queryFn: () => new ImodelsClient().listChangesets(iModelId ?? ''),
    enabled: !!iModelId,
  });
  return {
    changesets: query.data ?? [],
    isLoading: query.isPending,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
