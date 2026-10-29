/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * document-details 模块 barrel（spec 规则 4：跨模块只准 import 模块入口
 * `@modules/<name>`）——对外出口查询 hooks、契约类型与 DocumentDetailsPage
 * （Task 6；routes 层 DocumentDetailsRoute 经本 barrel 消费页面）；
 * internal/ 下 mapper 属模块私产，不经 barrel 透出。
 */

export { useDocumentDetail, useImodels } from './hooks/useImodels.js';
export type { DocumentDetail, ImodelSummary } from './types.js';
export { DocumentDetailsPage } from './DocumentDetailsPage.js';
