/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * usePermissions（M5 Task 3）：iModel 权限判定 hook（react-query）——旧
 * `apps/web/features/imodel/hooks/useIModelPermission.ts`（语义权威源）
 * 的 web-next 移植，接口形态按 brief 重写为 `{ mode, isLoading }`：
 * - 数据通道：`AccessControlClient.getMyIModelPermissions`（官方 imodels SDK
 *   `userPermissions.get` = imodels-v2 `GET /imodels/{id}/permissions`）。旧
 *   hook 手写 fetch 打的 `/itwins/:t/imodels/:m/permission` 路由 hub **已实现**
 *  （imodelhub itwins.controller `GET :iTwinId/imodels/:iModelId/permission`，
 *   2026-04-07 5728d36 起，返回形状与旧 hook 消费逐字段一致）——迁移动因是
 *   官方客户端通道铁律（禁手写 fetch 直调 REST，authorization/错误映射统一
 *   治理），而非旧路由缺失（T3 评审 I-1 勘误）。回落语义：Bentley 云官方
 *   含「iModel 级未配置时回落 iTwin 级配置」，hub 实现暂无回落（非 creator
 *   且无显式授权者恒 `[imodels_webview]`，hub backlog 挂账，见 task-3-report
 *   勘误段）；服务端态归 react-query，不入 zustand（useChangesets 同口径）；
 * - 裁决（determinePermissionMode，旧 determineEditorMode 语义移植）：
 *   权限组含 `imodels_write`/`imodels_manage` → editable，否则（webview/
 *   read/空集/缺席）→ readonly；
 * - 错误裁决（旧 hook 兜底语义移植 + 403 细分）：
 *   - 403（hub 明确拒绝，ApiClientError）→ readonly（fail-closed：只读打开
 *     仍可看文档，不把拒绝升格为打不开）；
 *   - 其余错误（网络抖动等）→ editable（旧 hook「本地部署错误兜底
 *     editable」忠实移植，可用性优先；兜底依据有限：hub REST 面有写权限闸，
 *     MS 宿主链 per-user 绑定未追证——前端判定只是入口收口，T3 评审 M-1）；
 * - 三态契约：isLoading 真时 mode 为不可信占位（readonly）——消费方必须以
 *   isLoading 为门禁（PartStudioPage 权限未载不开 briefcase，旧应用竞态
 *   教训：首开定读写，权限未落定早开=恒只读）。
 */

import { useQuery } from '@tanstack/react-query';
import { AccessControlClient } from '@clients/access-control/AccessControlClient.js';
import type { PermissionMode } from '@clients/access-control/AccessControlClient.js';
import { ApiClientError } from '@clients/http/ApiClientError.js';

export type { PermissionMode };

/** iModel 权限组 → 编辑模式裁决（旧 determineEditorMode 语义移植；可导出直测）。 */
export function determinePermissionMode(
  permissions: string[] | null | undefined,
): PermissionMode {
  if (!permissions || permissions.length === 0) return 'readonly';
  if (permissions.includes('imodels_write') || permissions.includes('imodels_manage')) {
    return 'editable';
  }
  return 'readonly';
}

export interface UsePermissionsOptions {
  iTwinId: string | null;
  iModelId: string | null;
}

export interface UsePermissionsResult {
  /** 编辑模式（加载中为不可信占位 readonly——以 isLoading 为门禁）。 */
  mode: PermissionMode;
  /** 查询在途（首载未落定；iModelId 缺席/后台重查询为假）。 */
  isLoading: boolean;
  /** 查询错误（原样上抛，403/其余的错误裁决见 mode；呈现归消费方裁量）。 */
  error: unknown;
  /** 手动刷新（权限态重查入口）。 */
  refetch: () => void;
}

export function usePermissions(options: UsePermissionsOptions): UsePermissionsResult {
  const { iTwinId, iModelId } = options;

  const query = useQuery({
    // 旧 hook 调用面双 id 入键（M2 documentsKeys 同族前缀风格）。
    queryKey: ['part-studio', 'permissions', iTwinId, iModelId],
    queryFn: () => new AccessControlClient().getMyIModelPermissions(iModelId ?? ''),
    // 官方路由 iModel 级作用域——路由缺参（连接未就绪）不空转。
    enabled: iModelId !== null,
  });

  // 三态裁决（顺序即优先级）：落定数据 → 错误兜底 → 加载占位。
  let mode: PermissionMode;
  if (query.data) {
    mode = determinePermissionMode(query.data);
  } else if (query.error) {
    // fail-closed 仅限明确拒绝（403）；其余旧 hook 兜底 editable（可用性优先）。
    mode = query.error instanceof ApiClientError && query.error.status === 403
      ? 'readonly'
      : 'editable';
  } else {
    mode = 'readonly';
  }

  return {
    mode,
    // v5 isLoading = isPending && isFetching：首载未落定为真；禁用（缺参）与
    // 有缓存的后台重查询为假——门禁只在「从未落定」期间关连接。
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
