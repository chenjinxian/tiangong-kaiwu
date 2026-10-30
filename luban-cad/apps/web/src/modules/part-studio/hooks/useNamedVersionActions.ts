/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useNamedVersionActions（B-model P0 Task 5）：保存版本动作 hook——把「给当前
 * 设计状态命名」收敛为一条可复用通道（顶栏保存版本对话框消费）：
 * - 有未保存变更：`connection.pushChanges(draft.name)` 先把本地 Txns 打包为
 *   changeset 推上 hub（描述取版本名——changeset 与 Named Version 同名可追溯），
 *   再用返回的 changeset id 创建 Named Version；
 * - 干净态（无未保存变更）：不 push，`listChangesets` 取 index 最大者作为命名
 *   目标（hub 的 Named Version 是「元数据命名」——不生成 checkpoint/缩略图，
 *   P1 才补发布快照；前端不得宣称已生成可离线打开的 checkpoint）；
 * - 成功后失效 changesets / named-versions 两条查询（服务端态归 react-query，
 *   dock 版本历史面板与命名版本列表随查询刷新）；
 * - connection 缺席诚实拒绝（「连接未就绪」），不静默忽略。
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import { ImodelsClient } from '@clients/imodels/ImodelsClient.js';

export interface NamedVersionDraft {
  name: string;
  description?: string;
}

export interface NamedVersionActions {
  createNamedVersion: (draft: NamedVersionDraft) => Promise<void>;
}

export function useNamedVersionActions(
  iModelId: string,
  connection: BriefcaseConnection | undefined,
  hasUnsavedChanges: boolean,
): NamedVersionActions {
  const queryClient = useQueryClient();

  const createNamedVersion = useCallback(
    async (draft: NamedVersionDraft): Promise<void> => {
      if (!connection) throw new Error('连接未就绪');
      const client = new ImodelsClient();
      let changesetId: string;
      if (hasUnsavedChanges) {
        const pushed = await connection.pushChanges(draft.name);
        changesetId = pushed.id;
      } else {
        const changesets = await client.listChangesets(iModelId);
        const latest = changesets.reduce<{ id: string; index: number } | null>(
          (best, current) => (best === null || current.index > best.index ? current : best),
          null,
        );
        if (!latest) throw new Error('没有可命名的 changeset');
        changesetId = latest.id;
      }
      await client.createNamedVersion(iModelId, {
        name: draft.name,
        ...(draft.description ? { description: draft.description } : {}),
        changesetId,
      });
      await queryClient.invalidateQueries({ queryKey: ['part-studio', 'changesets', iModelId] });
      await queryClient.invalidateQueries({ queryKey: ['part-studio', 'named-versions', iModelId] });
    },
    [connection, hasUnsavedChanges, iModelId, queryClient],
  );

  return { createNamedVersion };
}
