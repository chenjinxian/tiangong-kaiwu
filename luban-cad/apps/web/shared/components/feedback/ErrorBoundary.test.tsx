/*-----------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary.js';
import * as loggerModule from '../../lib/logger.js';

// Mock logger
vi.mock('../../lib/logger.js', () => ({
  logger: {
    error: vi.fn(),
  },
}));

// Component that throws error
const ThrowError: React.FC<{ error?: Error }> = ({ error = new Error('Test error') }) => {
  throw error;
};

// Safe component
const SafeComponent: React.FC = () => <div data-testid="safe-content">Safe Content</div>;

describe('ErrorBoundary', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.error for expected errors
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  it('should render children when no error', () => {
    render(
      <ErrorBoundary>
        <SafeComponent />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('safe-content')).toBeDefined();
  });

  it('should render error fallback when error occurs', () => {
    process.env.NODE_ENV = 'production';

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    // NonIdealState 兜底：标题 + 错误 message + 重试按钮
    expect(screen.getByText('出错了')).toBeDefined();
    expect(screen.getByText('Test error')).toBeDefined();
    expect(screen.getByText('重试')).toBeDefined();
  });

  it('should log error to monitoring service', () => {
    const testError = new Error('Test error message');

    render(
      <ErrorBoundary>
        <ThrowError error={testError} />
      </ErrorBoundary>
    );

    expect(loggerModule.logger.error).toHaveBeenCalledWith(
      'React Error Boundary caught an error',
      expect.objectContaining({
        message: testError.message,
        stack: expect.any(String),
        componentStack: expect.any(String),
      })
    );
  });

  it('should show error details in development mode', () => {
    process.env.NODE_ENV = 'development';
    const testError = new Error('Development error');
    testError.stack = 'Error: Development error\n    at TestComponent';

    render(
      <ErrorBoundary>
        <ThrowError error={testError} />
      </ErrorBoundary>
    );

    // DEV 下展示错误 message 与 componentStack
    expect(screen.getByText(/Development error/)).toBeDefined();
    expect(screen.getByText(/at ThrowError/)).toBeDefined();
  });

  it('should not show error details in production mode', () => {
    process.env.NODE_ENV = 'production';
    const testError = new Error('Production error');
    testError.stack = 'Error: Production error\n    at TestComponent';

    render(
      <ErrorBoundary>
        <ThrowError error={testError} />
      </ErrorBoundary>
    );

    // 新 UI 语义：错误 message 始终展示；DEV 专属的 componentStack 详情生产态不渲染
    expect(screen.getByText('Production error')).toBeDefined();
    expect(screen.queryByText(/at TestComponent/)).toBeNull();
  });

  it('should call onError callback when error occurs', () => {
    const onErrorMock = vi.fn();
    const testError = new Error('Callback test error');

    render(
      <ErrorBoundary onError={onErrorMock}>
        <ThrowError error={testError} />
      </ErrorBoundary>
    );

    expect(onErrorMock).toHaveBeenCalledWith(
      testError,
      expect.objectContaining({
        componentStack: expect.any(String),
      })
    );
  });

  it('should render custom fallback when provided', () => {
    const customFallback = <div data-testid="custom-fallback">Custom Error UI</div>;

    render(
      <ErrorBoundary fallback={customFallback}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('custom-fallback')).toBeDefined();
    expect(screen.queryByText('出错了')).toBeNull();
  });

  it('should reload page when reload button is clicked', () => {
    process.env.NODE_ENV = 'production';
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
      configurable: true,
    });

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByText('重试'));
    expect(reloadMock).toHaveBeenCalled();
  });

  it('should prefer onReset over reload and recover after retry', () => {
    const onResetMock = vi.fn();
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
      configurable: true,
    });

    // 可切换的抛错子组件：模拟 onReset 清除致病状态后可恢复
    let shouldThrow = true;
    const ConditionalThrow: React.FC = () => {
      if (shouldThrow) {
        throw new Error('Test error');
      }
      return <div data-testid="safe-content">Safe Content</div>;
    };

    render(
      <ErrorBoundary onReset={onResetMock}>
        <ConditionalThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText('出错了')).toBeDefined();

    shouldThrow = false;
    fireEvent.click(screen.getByText('重试'));
    expect(onResetMock).toHaveBeenCalledTimes(1);
    expect(reloadMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('safe-content')).toBeDefined();
  });

  it('should handle multiple children', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child-1">Child 1</div>
        <div data-testid="child-2">Child 2</div>
      </ErrorBoundary>
    );

    expect(screen.getByTestId('child-1')).toBeDefined();
    expect(screen.getByTestId('child-2')).toBeDefined();
  });

  it('should handle errors with undefined message', () => {
    const errorWithoutMessage = new Error();
    // @ts-expect-error - Testing edge case
    errorWithoutMessage.message = undefined;

    render(
      <ErrorBoundary>
        <ThrowError error={errorWithoutMessage} />
      </ErrorBoundary>
    );

    expect(screen.getByText('出错了')).toBeDefined();
    expect(screen.getByText('应用程序发生错误')).toBeDefined();
  });

  it('should handle non-Error objects thrown', () => {
    const ThrowString: React.FC = () => {
      throw 'String error';
    };

    render(
      <ErrorBoundary>
        <ThrowString />
      </ErrorBoundary>
    );

    expect(screen.getByText('出错了')).toBeDefined();
    expect(screen.getByText('应用程序发生错误')).toBeDefined();
  });
});
