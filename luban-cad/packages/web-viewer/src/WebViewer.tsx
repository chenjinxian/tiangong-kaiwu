/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from 'react';
import { ViewerWithUI, type ViewerWithUIProps } from '@luban-cad/viewer-core';
import { initializeWeb, shutdownWeb } from './WebInitializer.js';

export interface WebViewerProps extends ViewerWithUIProps {
  /** Backend RPC URL */
  backendUrl?: string;
  /** iModelHub URL */
  iModelHubUrl?: string;
  /** CSS style */
  style?: React.CSSProperties;
  /** Skip initialization - assume IModelApp is already initialized by parent */
  skipInitialization?: boolean;
}

/**
 * Web platform viewer component
 *
 * This component extends BaseViewer with Web-specific initialization.
 * It handles IModelApp startup and RPC configuration automatically.
 *
 * @example
 * ```tsx
 * <WebViewer
 *   iTwinId="my-itwin-id"
 *   iModelId="my-imodel-id"
 *   accessToken={token}
 *   backendUrl="http://localhost:4001"
 * />
 * ```
 */
export const WebViewer: React.FC<WebViewerProps> = (props) => {
  const { backendUrl = 'http://localhost:4001', iModelHubUrl, style, skipInitialization, accessToken, ...baseProps } = props;

  const [isInitialized, setIsInitialized] = useState(skipInitialization ?? false);
  const [initError, setInitError] = useState<Error | null>(null);
  const [initAttempt, setInitAttempt] = useState(0);

  useEffect(() => {
    // Skip initialization if parent has already initialized IModelApp
    if (skipInitialization) {
      return;
    }

    let cancelled = false;

    const init = async (): Promise<void> => {
      try {
        await initializeWeb({
          backendUrl,
          iModelHubUrl,
          accessToken,
        });
        if (!cancelled) {
          setIsInitialized(true);
          setInitError(null);
        }
      } catch (err) {
        if (!cancelled) {
          // In React StrictMode, components mount twice in development.
          // The first mount may fail due to incomplete cleanup from the second mount
          // of a previous component. We'll retry once automatically.
          if (initAttempt === 0) {
            // eslint-disable-next-line no-console
            console.warn('First initialization attempt failed, will retry...', err);
            setInitAttempt(1);
          } else {
            setInitError(err instanceof Error ? err : new Error(String(err)));
          }
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
      if (!skipInitialization) {
        void shutdownWeb();
      }
    };
  }, [backendUrl, iModelHubUrl, accessToken, initAttempt, skipInitialization]);

  // Show initialization loading state
  if (!isInitialized && !initError) {
    return (
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
          <div style={{ color: '#666', fontSize: '14px' }}>Initializing Viewer...</div>
        </div>
      </div>
    );
  }

  // Show initialization error
  if (initError) {
    return (
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
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h3 style={{ color: '#c00', margin: '0 0 8px' }}>Initialization Failed</h3>
          <p style={{ color: '#666', margin: 0, fontSize: '14px' }}>{initError.message}</p>
        </div>
      </div>
    );
  }

  // Render viewer with UI (includes navigation tools)
  return (
    <div style={{ width: '100%', height: '100%', ...style }}>
      <ViewerWithUI {...baseProps} />
    </div>
  );
};
