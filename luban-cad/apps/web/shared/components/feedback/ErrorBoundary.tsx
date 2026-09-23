/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '../../lib/logger.js';

interface Props {
  /** Child components to render */
  children: ReactNode;
  /** Optional fallback component to render on error */
  fallback?: ReactNode;
  /** Optional callback when error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component for catching React rendering errors
 * Logs errors to monitoring service and displays fallback UI
 */
export class ErrorBoundary extends Component<Props, State> {
  public constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to monitoring service
    logger.error('React Error Boundary caught an error', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });

    // Call optional error handler
    this.props.onError?.(error, errorInfo);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      // Return custom fallback or default error UI
      return (
        this.props.fallback ?? (
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              border: '1px solid #ff6b6b',
              borderRadius: '8px',
              backgroundColor: '#fff5f5',
              margin: '16px',
            }}
          >
            <h2 style={{ color: '#c92a2a', marginBottom: '12px' }}>
              页面出现错误
            </h2>
            <p style={{ color: '#666', marginBottom: '16px' }}>
              抱歉，该页面出现了问题。请刷新页面重试。
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 16px',
                backgroundColor: '#228be6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              刷新页面
            </button>
            {import.meta.env.DEV && this.state.error && (
              <pre
                style={{
                  marginTop: '16px',
                  padding: '12px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '4px',
                  textAlign: 'left',
                  fontSize: '12px',
                  overflow: 'auto',
                }}
              >
                {this.state.error.message}
                {'\n'}
                {this.state.error.stack}
              </pre>
            )}
          </div>
        )
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
