/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, NonIdealState, Text } from '@itwin/itwinui-react';
import { SvgRefresh, SvgStatusError } from '@itwin/itwinui-icons-react';
import { logger } from '../../lib/logger.js';

interface Props {
  /** Child components to render */
  children: ReactNode;
  /** Optional fallback component to render on error */
  fallback?: ReactNode;
  /** Optional callback when error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Optional reset callback — preferred by the retry action over a full page reload */
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary component for catching React rendering errors.
 * Logs errors to monitoring service, notifies the optional onError
 * callback, and displays a fallback UI instead of crashing.
 *
 * 默认 fallback 采用 itwinui NonIdealState：DEV 下附带 componentStack 便于定位。
 * 文案暂中文硬编码，i18n 化随 P 系列页面波次统一处理。
 *
 * @example
 * ```tsx
 * <ErrorBoundary onError={reportToMonitoring} onReset={clearLocalState}>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<Props, State> {
  public constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
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

    this.setState({ errorInfo });
  }

  private handleReset = (): void => {
    if (this.props.onReset) {
      this.props.onReset();
      this.setState({ hasError: false, error: null, errorInfo: null });
    } else {
      window.location.reload();
    }
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <NonIdealState
          svg={<SvgStatusError />}
          heading="出错了"
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
                    background: 'var(--iui-color-background-backdrop)',
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

export default ErrorBoundary;
