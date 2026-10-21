/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useDocumentFilters（Task 4）：侧栏筛选状态——读写 URL search param `?filter=`。
 * - 读：合法档位直读；缺席/非法值收敛为 DEFAULT_DOCUMENT_FILTER（不透传坏值）；
 * - 写：setFilter 只动 filter 键，其余 search params 原样保留；
 * - URL 为唯一事实源：刷新/分享链接可还原筛选态。
 */

import { useSearchParams } from 'react-router-dom';
import { DEFAULT_DOCUMENT_FILTER, isDocumentFilter } from '../internal/documents.constants.js';
import type { DocumentFilter } from '../types.js';

export interface UseDocumentFiltersResult {
  filter: DocumentFilter;
  setFilter: (filter: DocumentFilter) => void;
}

export function useDocumentFilters(): UseDocumentFiltersResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('filter');
  const filter: DocumentFilter = isDocumentFilter(raw) ? raw : DEFAULT_DOCUMENT_FILTER;

  const setFilter = (next: DocumentFilter) => {
    setSearchParams((prev) => {
      const merged = new URLSearchParams(prev);
      merged.set('filter', next);
      return merged;
    });
  };

  return { filter, setFilter };
}
