/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import './DocumentsSkeleton.css';

/**
 * Documents page skeleton loading component
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const DocumentsSkeleton: React.FC = () => {
  return (
    <div className="documents-skeleton">
      {/* Topbar skeleton */}
      <header className="topbar-skeleton">
        <div className="topbar-brand">
          <div className="skeleton-logo pulse" />
          <div className="skeleton-text title pulse" />
        </div>
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

          {/* Grid skeleton */}
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
        </main>
      </div>
    </div>
  );
};

export default DocumentsSkeleton;
