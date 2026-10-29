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

/** 主区视图档位（网格/列表双视图，Onshape 文档中心 IA）。 */
export type DocumentsView = 'tile' | 'table';

/** 排序键（名称/创建时间/修改时间）。 */
export type DocumentSortId = 'name' | 'createdAt' | 'modifiedAt';

/** 排序状态：排序键 + 方向（受控态统一驱动 Table 表头与工具条排序菜单）。 */
export interface DocumentSort {
  id: DocumentSortId;
  desc: boolean;
}

/** 创建菜单的 gated（🟠 能力门）项键——照常可点，打开能力引导对话框
 * （spec §0 铁律 1 完整 UI 面：gated 是运行时数据，不是视觉残缺）。 */
export type GatedCreateAction = 'folder' | 'importFile' | 'importFrom' | 'labelTag';
