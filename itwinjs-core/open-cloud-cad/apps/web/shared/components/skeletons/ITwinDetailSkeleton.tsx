/*-----------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import './ITwinDetailSkeleton.css';

/**
 * iTwin Detail page skeleton loading component
 * Shows staged loading: project info first, then iModels list
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ITwinDetailSkeleton: React.FC = () => {
  return (
    <div className="itwin-detail-skeleton">
      {/* Topbar skeleton */}
      <header className="topbar-skeleton">
        <div className="topbar-left">
          <div className="skeleton-logo pulse" />
          <div className="skeleton-breadcrumb pulse" />
        </div>
        <div className="skeleton-avatar pulse" />
      </header>

      {/* Hero section skeleton */}
      <div className="hero-skeleton">
        <div className="hero-content-skeleton">
          <div className="hero-left-skeleton">
            <div className="skeleton-icon pulse" />
            <div className="hero-info-skeleton">
              <div className="skeleton-text title pulse" />
              <div className="skeleton-text meta pulse" />
            </div>
          </div>
          <div className="skeleton-button pulse" />
        </div>
      </div>

      {/* Toolbar skeleton */}
      <div className="toolbar-skeleton">
        <div className="skeleton-badge pulse" />
      </div>

      {/* iModels grid skeleton */}
      <div className="grid-skeleton">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="imodel-card-skeleton pulse"
            style={{ animationDelay: `${i * 0.08}s` }}
          >
            <div className="imodel-thumb-skeleton">
              <div className="skeleton-status" />
            </div>
            <div className="imodel-body-skeleton">
              <div className="skeleton-text name pulse" />
              <div className="skeleton-text desc pulse" />
              <div className="skeleton-text meta pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Partial skeleton for when only iModels are loading
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const IModelsListSkeleton: React.FC = () => {
  return (
    <div className="imodels-list-skeleton">
      {/* Toolbar skeleton */}
      <div className="toolbar-skeleton">
        <div className="skeleton-badge pulse" />
      </div>

      {/* iModels grid skeleton */}
      <div className="grid-skeleton">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="imodel-card-skeleton pulse"
            style={{ animationDelay: `${i * 0.08}s` }}
          >
            <div className="imodel-thumb-skeleton">
              <div className="skeleton-status" />
            </div>
            <div className="imodel-body-skeleton">
              <div className="skeleton-text name pulse" />
              <div className="skeleton-text desc pulse" />
              <div className="skeleton-text meta pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ITwinDetailSkeleton;
