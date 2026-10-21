/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * documents 模块 barrel（spec 规则 4：跨模块只准 import 模块入口
 * `@modules/<name>`）——对外出口查询 hooks、契约类型与 DocumentsPage
 * （Task 5；routes 层 DocumentsRoute 经本 barrel 消费页面）；
 * internal/ 下 mapper/constants/api 属模块私产，不经 barrel 透出。
 */

export { useDocuments } from './hooks/useDocuments.js';
export { useDocumentFilters } from './hooks/useDocumentFilters.js';
export type {
  DocumentFilter,
  DocumentSort,
  DocumentSortId,
  DocumentSummary,
  DocumentsView,
  GatedCreateAction,
} from './types.js';
export { DocumentsPage } from './DocumentsPage.js';
