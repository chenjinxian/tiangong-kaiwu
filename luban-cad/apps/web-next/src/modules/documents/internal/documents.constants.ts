/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * documents 模块常量（Task 4）：筛选档位集合 + URL 默认值 + 合法值收窄。
 */

import type { DocumentFilter } from '../types.js';

/** URL `?filter=` 缺席/非法时的默认档位。 */
export const DEFAULT_DOCUMENT_FILTER: DocumentFilter = 'my';

/** 合法档位全集（isDocumentFilter 的裁决基准）。 */
export const DOCUMENT_FILTERS: readonly string[] = [
  'recent',
  'favorites',
  'my',
  'shared',
  'public',
];

/** 收窄任意字符串为 DocumentFilter（坏值不透传，交 DEFAULT 裁决）。 */
export function isDocumentFilter(value: string | null | undefined): value is DocumentFilter {
  return typeof value === 'string' && DOCUMENT_FILTERS.includes(value);
}
