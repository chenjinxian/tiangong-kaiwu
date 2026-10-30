/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useITwinPermissions（P2.4 从 document-details 上提为跨模块共享）：iTwin 级
 * 我的权限查询——服务端 **iTwin RBAC** 门禁的唯一前端读源：
 * - 分享管理（grant/revoke/update/setSecured）= hub `checkITwinManageForIModel`
 *   → 只认 iTwin manage/owner（显式 iModel Manage 行不满足）；
 * - 新建/删除 iModel 等 iTwin 级写动作（P2.3 详情页既有口径）。
 *
 * 数据通道：`AccessControlClient.getITwinPermissions`
 * （`GET /accesscontrol/itwins/:id/permissions`，官方 SDK 解包为权限字符串
 * 数组）。服务端态归 react-query；缺 iTwinId 不空转。
 *
 * 三态出口 `{ permissions, isLoading, error }`：裁决归消费方——权限未落定/
 * 查询失败必须 fail-closed（不得把「未知」当「允许」）。**与 iModel 权限
 * （`getMyIModelPermissions`，含显式授权与创建者回退）是两个不同的服务端
 * 门源，禁止互相替代**：分享用本 hook，重命名/iModel 写用 iModel 权限。
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
    // 键保持 P2.3 详情页原前缀（同页多消费者去重；跨模块共享同一缓存条目）。
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
