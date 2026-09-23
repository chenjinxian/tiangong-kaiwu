/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import './AuthPageSkeleton.css';

/**
 * Auth page skeleton loading component
 * Displays a skeleton placeholder for the login/register pages during loading
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const AuthPageSkeleton: React.FC = () => {
  return (
    <div className="auth-page-skeleton">
      {/* Left: Brand side skeleton */}
      <div className="brand-side-skeleton">
        <div className="skeleton-logo pulse" />
        <div className="skeleton-title pulse" />
        <div className="skeleton-subtitle pulse" />
        <div className="skeleton-features">
          <div className="skeleton-feature">
            <div className="skeleton-icon pulse" />
            <div className="skeleton-text pulse" />
          </div>
          <div className="skeleton-feature">
            <div className="skeleton-icon pulse" />
            <div className="skeleton-text pulse" />
          </div>
          <div className="skeleton-feature">
            <div className="skeleton-icon pulse" />
            <div className="skeleton-text pulse" />
          </div>
          <div className="skeleton-feature">
            <div className="skeleton-icon pulse" />
            <div className="skeleton-text pulse" />
          </div>
        </div>
      </div>

      {/* Right: Form side skeleton */}
      <div className="form-side-skeleton">
        <div className="form-container-skeleton">
          <div className="skeleton-form-header">
            <div className="skeleton-form-title pulse" />
            <div className="skeleton-form-subtitle pulse" />
          </div>

          <div className="skeleton-form-fields">
            <div className="skeleton-field">
              <div className="skeleton-label pulse" />
              <div className="skeleton-input pulse" />
            </div>
            <div className="skeleton-field">
              <div className="skeleton-label pulse" />
              <div className="skeleton-input pulse" />
            </div>
            <div className="skeleton-options">
              <div className="skeleton-checkbox pulse" />
              <div className="skeleton-link pulse" />
            </div>
            <div className="skeleton-button pulse" />
          </div>

          <div className="skeleton-footer pulse" />
        </div>
      </div>
    </div>
  );
};

export default AuthPageSkeleton;
