/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import './DocumentsSkeleton.css';

/**
 * Documents page skeleton loading component（RW4-P2-T2-2 双视图适配）：
 * view='tile'（默认）渲染卡片网格骨架；view='table' 渲染表格行骨架。
 * 既有类名契约（topbar/sidebar/main/section-header/card-*）保留，DocumentsSkeleton.test 覆盖。
 */
export interface DocumentsSkeletonProps {
  view?: 'tile' | 'table';
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const DocumentsSkeleton: React.FC<DocumentsSkeletonProps> = ({ view = 'tile' }) => {
  return (
    <div className="documents-skeleton">
      {/* Topbar skeleton（Header 品牌+搜索+动作三段） */}
      <header className="topbar-skeleton">
        <div className="topbar-brand">
          <div className="skeleton-logo pulse" />
          <div className="skeleton-text title pulse" />
        </div>
        <div className="topbar-search-skeleton pulse" />
        <div className="topbar-actions">
          <div className="skeleton-button pulse" />
          <div className="skeleton-avatar pulse" />
        </div>
      </header>

      {/* Content skeleton */}
      <div className="content-skeleton">
        {/* Sidebar skeleton */}
        <aside className="sidebar-skeleton">
          <nav className="sidebar-nav-skeleton">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="sidebar-item-skeleton pulse" style={{ animationDelay: `${i * 0.1}s` }} />
            ))}
          </nav>
          <div className="sidebar-divider-skeleton" />
          <div className="sidebar-footer-skeleton">
            <div className="sidebar-item-skeleton pulse" />
          </div>
        </aside>

        {/* Main skeleton */}
        <main className="main-skeleton">
          {/* Section header skeleton */}
          <div className="section-header-skeleton">
            <div className="skeleton-text section-title pulse" />
            <div className="skeleton-text count pulse" />
          </div>

          {view === 'table' ? (
            /* Table rows skeleton */
            <div className="table-skeleton">
              <div className="table-head-skeleton pulse" />
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div
                  key={i}
                  className="table-row-skeleton"
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <div className="card-thumb-skeleton pulse" />
                  <div className="skeleton-text row-title pulse" />
                  <div className="skeleton-text row-meta pulse" />
                  <div className="skeleton-text row-meta pulse" />
                  <div className="skeleton-text row-meta pulse" />
                </div>
              ))}
            </div>
          ) : (
            /* Grid skeleton */
            <div className="grid-skeleton">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div
                  key={i}
                  className="card-skeleton pulse"
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <div className="card-thumb-skeleton" />
                  <div className="card-body-skeleton">
                    <div className="skeleton-text card-title" />
                    <div className="skeleton-text card-meta" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default DocumentsSkeleton;
