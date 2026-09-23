/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useRef } from 'react';
import { useIModel, useViewport } from '../hooks/index.js';
import type { AccessToken } from '@itwin/core-bentley';
import type { ViewState } from '@itwin/core-frontend';

export interface BaseViewerProps {
  /** iTwin project ID */
  iTwinId: string;
  /** iModel ID */
  iModelId: string;
  /** Access token for authentication */
  accessToken?: AccessToken;
  /** Optional view state to use (otherwise uses default) */
  viewState?: ViewState;
  /** CSS class name */
  className?: string;
  /** Loading component */
  loadingComponent?: React.ReactNode;
  /** Error component */
  errorComponent?: React.ReactNode;
  /** Callback when viewport is ready */
  onViewportReady?: (viewport: unknown) => void;
}

/**
 * Base viewer component for displaying iModels
 *
 * This is a platform-agnostic viewer component that handles:
 * - IModelConnection lifecycle
 * - ScreenViewport creation
 * - Basic loading and error states
 *
 * @example
 * ```tsx
 * <BaseViewer
 *   iTwinId="my-itwin-id"
 *   iModelId="my-imodel-id"
 *   accessToken={token}
 * />
 * ```
 */
export const BaseViewer: React.FC<BaseViewerProps> = (props) => {
  const {
    iTwinId,
    iModelId,
    accessToken,
    viewState,
    className,
    loadingComponent,
    errorComponent,
    onViewportReady,
  } = props;

  const viewportRef = useRef<HTMLDivElement>(null);

  // Load iModel
  const { iModel, isLoading: isIModelLoading, error: iModelError } = useIModel({
    iTwinId,
    iModelId,
    accessToken,
  });

  // Create viewport
  const { viewport, isLoading: isViewportLoading, error: viewportError } = useViewport({
    iModel,
    viewState,
    viewportRef,
  });

  // Notify when viewport is ready
  React.useEffect(() => {
    if (viewport && onViewportReady) {
      onViewportReady(viewport);
    }
  }, [viewport, onViewportReady]);

  const isLoading = isIModelLoading || isViewportLoading;
  const error = iModelError || viewportError;

  // Always render the viewport div so viewportRef is always attached.
  // Overlay loading/error states on top without unmounting the div.
  return (
    <div
      className={`open-cloud-cad-viewer ${className ?? ''}`}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
    >
      {/* Viewport container – always present so useViewport can attach the canvas */}
      <div
        ref={viewportRef}
        style={{ width: '100%', height: '100%' }}
      />

      {/* Loading overlay */}
      {isLoading && !error && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
          {loadingComponent ?? <DefaultLoadingComponent />}
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
          {errorComponent ?? <DefaultErrorComponent error={error} />}
        </div>
      )}
    </div>
  );
};

/**
 * Default loading component
 */
const DefaultLoadingComponent: React.FC = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      backgroundColor: '#f5f5f5',
    }}
  >
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          width: '40px',
          height: '40px',
          border: '4px solid #e0e0e0',
          borderTop: '4px solid #0066cc',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 16px',
        }}
      />
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{ color: '#666', fontSize: '14px' }}>Loading iModel...</div>
    </div>
  </div>
);

/**
 * Default error component
 */
const DefaultErrorComponent: React.FC<{ error: Error }> = ({ error }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      backgroundColor: '#fff5f5',
      padding: '20px',
    }}
  >
    <div style={{ textAlign: 'center', maxWidth: '400px' }}>
      <div
        style={{
          fontSize: '48px',
          marginBottom: '16px',
        }}
      >
        ⚠️
      </div>
      <h3 style={{ color: '#c00', margin: '0 0 8px' }}>Failed to load iModel</h3>
      <p style={{ color: '#666', margin: 0, fontSize: '14px' }}>{error.message}</p>
    </div>
  </div>
);
