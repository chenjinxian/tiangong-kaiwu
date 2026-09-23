/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Text, NonIdealState } from '@itwin/itwinui-react';
import { SvgStatusError, SvgRefresh } from '@itwin/itwinui-icons-react';
import { logger } from '../../shared/lib/logger.js';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Global Error Boundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing.
 *
 * @example
 * ```tsx
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error('ErrorBoundary caught an error:', error);
    this.setState({ errorInfo });
  }

  private handleReset = (): void => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <NonIdealState
          svg={<SvgStatusError />}
          title="出错了"
          description={
            <div style={{ textAlign: 'center', maxWidth: 500 }}>
              <Text color="subtext">
                {this.state.error?.message || '应用程序发生错误'}
              </Text>
              {import.meta.env.DEV && this.state.errorInfo && (
                <pre
                  style={{
                    marginTop: 16,
                    padding: 16,
                    background: 'var(--iui-color-background-muted)',
                    borderRadius: 4,
                    fontSize: 12,
                    overflow: 'auto',
                    maxHeight: 200,
                    textAlign: 'left',
                  }}
                >
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
              <div style={{ marginTop: 24 }}>
                <Button
                  styleType="high-visibility"
                  startIcon={<SvgRefresh />}
                  onClick={this.handleReset}
                >
                  重试
                </Button>
              </div>
            </div>
          }
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Hook for handling async errors
 *
 * @example
 * ```tsx
 * const { handleError, error, clearError } = useErrorHandler();
 *
 * try {
 *   await someAsyncOperation();
 * } catch (err) {
 *   handleError(err);
 * }
 * ```
 */
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  const handleError = React.useCallback((err: unknown) => {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Error handled:', error);
    setError(error);
  }, []);

  const clearError = React.useCallback(() => {
    setError(null);
  }, []);

  return { error, handleError, clearError };
}

export default ErrorBoundary;
