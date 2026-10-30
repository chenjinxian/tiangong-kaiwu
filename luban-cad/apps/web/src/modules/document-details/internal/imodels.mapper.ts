/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * imodels mapper（Task 6）：官方 `IModel`（数据层）→ `ImodelSummary`（UI 层）。
 * 映射规则（测试经 hooks 层 mock 官方形状覆盖，见 test/DocumentDetailsPage.test.tsx）——
 * - id 直映；name ← displayName ?? name（官方 MinimalIModel 注释：
 *   displayName 对应 name 属性，双读兜底）；
 * - description ← description ?? ''（官方可空，UI 空值回退「暂无描述」在卡片侧）；
 * - state ← normalizeImodelState(state)（大小写不敏感；官方 IModelState 枚举，
 *   本地 hub 可能直出原始串）；
 * - initialized ← state === 'initialized'（派生字段，保留兼容旧消费）；
 * - createdAt ← createdDateTime；
 * - updatedAt 裁决链：`lastChangesetPushDateTime ?? createdDateTime ?? null`。
 *
 * 缩略图裁决：官方全量表示不含缩略图（thumbnail 为独立二进制端点，
 * /imodels/{id}/thumbnail，需 Authorization 头——img 标签无法携带；
 * 旧应用 useIModelImage 走 token 换取 blob URL）。M3 编辑器波次再议，
 * 卡片缩略图槽暂以模型占位图标填充（ImodelCard）。
 */

import type { IModel } from '@itwin/imodels-client-management';
import type { ImodelState, ImodelSummary } from '../types.js';

const STATE_BY_LOWERCASE: Record<string, ImodelState> = {
  initialized: 'initialized',
  notinitialized: 'notInitialized',
  // hub iModelState 实际枚举：Failed / MissingFiles（见 imodel-state.enum.ts）。
  failed: 'initializationFailed',
  initializationfailed: 'initializationFailed',
  missingfiles: 'missingFiles',
  retryscheduled: 'retryScheduled',
};

/** 官方 IModelState 与本仓扩展状态的统一归一化；未知值不猜测。 */
export function normalizeImodelState(raw: unknown): ImodelState {
  return STATE_BY_LOWERCASE[String(raw ?? '').toLowerCase()] ?? 'unknown';
}

export function toImodelSummary(imodel: IModel): ImodelSummary {
  const state = normalizeImodelState((imodel as IModel & { state?: string }).state);
  return {
    id: imodel.id ?? '',
    name: imodel.displayName ?? imodel.name ?? '',
    description: imodel.description ?? '',
    state,
    initialized: state === 'initialized',
    createdAt: imodel.createdDateTime ?? '',
    updatedAt: imodel.lastChangesetPushDateTime ?? imodel.createdDateTime ?? null,
  };
}
