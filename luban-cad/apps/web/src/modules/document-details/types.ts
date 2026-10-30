/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * document-details 模块对外契约类型（Task 6）：UI 层命名，与官方
 * `IModel` / `ITwin`（数据层）解耦——iModel 映射规则见
 * internal/imodels.mapper.ts；iTwin 详情映射见 hooks/useImodels.ts。
 */

/** iModel 初始化状态（官方两态 + 本地 hub 恢复状态；未知值归 unknown）。 */
export type ImodelState =
  | 'initialized'
  | 'notInitialized'
  | 'initializationFailed'
  | 'missingFiles'
  | 'retryScheduled'
  | 'unknown';

/** iModel 卡片条目（UI 层形状，映射自官方 IModel 全量表示）。 */
export interface ImodelSummary {
  id: string;
  /** displayName 缺席回退 name（与官方 MinimalIModel 注释同口径）。 */
  name: string;
  /** 官方 description 可空——UI 空值回退「暂无描述」。 */
  description: string;
  /** 归一化状态（大小写不敏感；未知值 unknown）。 */
  state: ImodelState;
  /** 派生字段：state==='initialized'（保留兼容旧消费）。 */
  initialized: boolean;
  /** ISO 时间串直透（IModel.createdDateTime，缺席为空串）。 */
  createdAt: string;
  /** 裁决链：`lastChangesetPushDateTime ?? createdDateTime`，双缺席为 null。 */
  updatedAt: string | null;
}

/** 文档详情（UI 层形状，映射自官方 ITwin + 本地 hub 超集字段）。 */
export interface DocumentDetail {
  id: string;
  name: string;
  /** hub 详情超集字段，缺席为空串。 */
  description: string;
  /** ITwin.status 缺席回退「活跃」（页面侧裁决，见 DocumentDetailsPage）。 */
  status: string;
  /** ISO 时间串直透。 */
  createdAt: string;
  /**
   * 裁决链：`lastModifiedDateTime ?? updatedAt ?? modifiedAt ?? createdAt`，
   * 全缺席为 null（hub DTO 输出 lastModifiedDateTime，防御性宽类型读取——
   * 与 documents.mapper 的 ITwinRaw 同姿态）。
   */
  updatedAt: string | null;
  /** 项目大图（ITwin.image；hub 详情未输出时键不产出，hero 走占位图标）。 */
  thumbnailUrl?: string;
}
