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

    expect(screen.getByText('页面出现错误')).toBeDefined();
    expect(screen.getByText('抱歉，该页面出现了问题。请刷新页面重试。')).toBeDefined();
    expect(screen.getByText('刷新页面')).toBeDefined();
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

    // Error message should be in the document (in the pre element)
    expect(screen.getByText(/Development error/)).toBeDefined();
  });

  it('should not show error details in production mode', () => {
    process.env.NODE_ENV = 'production';
    const testError = new Error('Production error');

    render(
      <ErrorBoundary>
        <ThrowError error={testError} />
      </ErrorBoundary>
    );

    // The error message should not be visible in production
    expect(screen.queryByText('Production error')).toBeNull();
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
    expect(screen.queryByText('页面出现错误')).toBeNull();
  });

  it('should reload page when reload button is clicked', () => {
    process.env.NODE_ENV = 'production';
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
    });

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByText('刷新页面'));
    expect(reloadMock).toHaveBeenCalled();
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

    expect(screen.getByText('页面出现错误')).toBeDefined();
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

    expect(screen.getByText('页面出现错误')).toBeDefined();
  });
});
