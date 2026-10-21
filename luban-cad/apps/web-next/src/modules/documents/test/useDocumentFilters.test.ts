// src/modules/documents/test/useDocumentFilters.test.ts
//
// Task 4 失败测试先行（brief Step 1）：useDocumentFilters 的 URL search
// param `?filter=` 读写契约——
//  1) 读：无参数 / 非法值 → 默认 'my'；合法值直读；
//  2) 写：setFilter 更新参数且不扰动其余 search params；
//  3) 挂 MemoryRouter + <Route path="/documents">（与生产路由同形）。

import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useDocumentFilters } from '../hooks/useDocumentFilters.js';

// ---- 路由探针：每次渲染记录当前 location.search ----
let lastSearch = '';
function SearchProbe(): null {
  lastSearch = useLocation().search;
  return null;
}

function createWrapper(initialEntry: string) {
  // brief 钉死测试文件名为 .ts（非 .tsx）——wrapper 用 createElement 组合，
  // 避开 esbuild 对 .ts 的 JSX 拒绝。
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: '/documents',
          element: React.createElement(React.Fragment, null,
            React.createElement(SearchProbe),
            children),
        }),
      ),
    );
  };
}

describe('useDocumentFilters（?filter= URL 读写）', () => {
  it('无 ?filter 参数 → 默认 my', () => {
    const { result } = renderHook(() => useDocumentFilters(), {
      wrapper: createWrapper('/documents'),
    });
    expect(result.current.filter).toBe('my');
  });

  it('非法值 → 默认 my（不透传坏值）', () => {
    const { result } = renderHook(() => useDocumentFilters(), {
      wrapper: createWrapper('/documents?filter=bogus'),
    });
    expect(result.current.filter).toBe('my');
  });

  it('合法值直读：?filter=recent', () => {
    const { result } = renderHook(() => useDocumentFilters(), {
      wrapper: createWrapper('/documents?filter=recent'),
    });
    expect(result.current.filter).toBe('recent');
  });

  it('setFilter 写入 URL（rerender 后新值可读）', () => {
    const { result } = renderHook(() => useDocumentFilters(), {
      wrapper: createWrapper('/documents?filter=my'),
    });
    act(() => result.current.setFilter('shared'));
    expect(result.current.filter).toBe('shared');
    expect(lastSearch).toBe('?filter=shared');
  });

  it('setFilter 不扰动其余 search params', () => {
    const { result } = renderHook(() => useDocumentFilters(), {
      wrapper: createWrapper('/documents?tab=grid&filter=my'),
    });
    act(() => result.current.setFilter('favorites'));
    const search = new URLSearchParams(lastSearch);
    expect(search.get('tab')).toBe('grid');
    expect(search.get('filter')).toBe('favorites');
  });
});
