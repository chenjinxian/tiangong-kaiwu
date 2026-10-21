/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * documents 模块 barrel（spec 规则 4：跨模块只准 import 模块入口
 * `@modules/<name>`）——对外只出口查询 hooks 与契约类型；
 * internal/ 下 mapper/constants 属模块私产，不经 barrel 透出。
 */

export { useDocuments } from './hooks/useDocuments.js';
export { useDocumentFilters } from './hooks/useDocumentFilters.js';
export type { DocumentSummary, DocumentFilter } from './types.js';
