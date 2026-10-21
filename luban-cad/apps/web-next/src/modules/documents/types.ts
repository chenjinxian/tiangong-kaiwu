/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * documents 模块对外契约类型（Task 4）：UI 层命名，
 * 与官方 `ITwin`（数据层）解耦——映射规则见 internal/documents.mapper.ts。
 */

/** 侧栏筛选档位（URL `?filter=` 的合法值集合，见 internal/documents.constants.ts）。 */
export type DocumentFilter = 'recent' | 'favorites' | 'my' | 'shared' | 'public';

/** 文档列表条目（UI 层形状，映射自官方 ITwin）。 */
export interface DocumentSummary {
  id: string;
  name: string;
  /** 创建者（ITwin.createdBy）。 */
  owner: string;
  /** 业务角色（ITwin.subClass，缺席回退 type）。 */
  role: string;
  /** ISO 时间串直透（ITwin.createdDateTime，缺席为空串）。 */
  createdAt: string;
  /**
   * 裁决链：`lastModifiedDateTime ?? createdDateTime`，双缺席为 null
   * （UI 显示「—」）。注意：官方 ITwin 类型未声明 lastModifiedDateTime，
   * 本地 hub 响应 DTO 已输出——mapper 防御性宽类型读取。
   */
  modifiedAt: string | null;
  /** 缩略图（ITwin.image）；缺席时本键不产出。 */
  thumbnailUrl?: string;
}
