/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useITwinPermissions（ADR-0001 P0 终审修复 I3）：文档详情页的 iTwin 级权限
 * 查询——新建 iModel 动作的授权门（hub `POST /imodels` 要求调用者在目标
 * iTwin 上具备 `imodels_manage`；Viewer 仅 webview）。
 *
 * 数据通道：`AccessControlClient.getITwinPermissions`
 * （`GET /accesscontrol/itwins/:id/permissions`，官方 SDK 解包为权限字符串
 * 数组）。服务端态归 react-query（与 useImodels 同姿态），查询键
 * `['document-details','itwin-permissions', iTwinId]`；缺 iTwinId 不空转。
 *
 * 三态出口 `{ permissions, isLoading, error }`：裁决（是否含
 * `imodels_manage`）归消费方 DocumentDetailsPage——权限未落定/查询失败时
 * 必须 fail-closed（不呈现启用态创建入口），不得把「未知」当「允许」。
 */

import { useQuery } from '@tanstack/react-query';
import { AccessControlClient } from '@clients/access-control/AccessControlClient.js';

export interface UseITwinPermissionsResult {
  /** 当前身份在该 iTwin 的权限字符串数组（未落定为空数组）。 */
  permissions: string[];
  /** 首载未落定（缺 iTwinId / 有缓存的后台重查询为假）。 */
  isLoading: boolean;
  /** 查询错误（原样上抛；fail-closed 裁决归消费方）。 */
  error: unknown;
}

export function useITwinPermissions(
  iTwinId: string | undefined,
): UseITwinPermissionsResult {
  const query = useQuery({
    queryKey: ['document-details', 'itwin-permissions', iTwinId],
    queryFn: () => new AccessControlClient().getITwinPermissions(iTwinId ?? ''),
    enabled: !!iTwinId,
  });
  return {
    permissions: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
