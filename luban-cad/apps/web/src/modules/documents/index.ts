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
// M2 Task 6：ShareDocumentDialog 经 barrel 透出——document-details 模块
// hero「分享」复用三页签对话框（跨模块只准 import 模块入口，spec 规则 4）。
export { ShareDocumentDialog } from './components/ShareDocumentDialog.js';
// M3 Task 7：RenameDocumentDialog 经 barrel 透出——part-studio 模块汉堡
// 文档菜单「重命名文档」复用（编辑器内重命名当前文档，同跨模块 barrel 口径）。
export { RenameDocumentDialog } from './components/RenameDocumentDialog.js';
