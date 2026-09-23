/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, render } from '@testing-library/react';
import React from 'react';
import {
  usePerformanceMonitor,
  useOperationTimer,
  withPerformanceMonitoring,
} from './usePerformanceMonitor.js';
import * as loggerModule from '../lib/logger.js';

// Mock logger
vi.mock('../lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('usePerformanceMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should provide markStart and markEnd functions', () => {
    const { result } = renderHook(() =>
      usePerformanceMonitor({ name: 'TestComponent' })
    );

    expect(typeof result.current.markStart).toBe('function');
    expect(typeof result.current.markEnd).toBe('function');
    expect(typeof result.current.measure).toBe('function');
  });

  it('should measure function execution', () => {
    const { result } = renderHook(() =>
      usePerformanceMonitor({
        name: 'TestComponent',
        logEveryRender: true,
      })
    );

    const testFn = vi.fn(() => 'result');

    act(() => {
      result.current.measure(testFn);
    });

    expect(testFn).toHaveBeenCalled();
  });

  it('should handle promise measurements', async () => {
    vi.useRealTimers();

    const { result } = renderHook(() =>
      usePerformanceMonitor({
        name: 'TestComponent',
        logLevel: 'info',
        logEveryRender: true,
      })
    );

    const asyncFn = vi.fn().mockResolvedValue('result');

    await act(async () => {
      await result.current.measure(asyncFn);
    });

    expect(asyncFn).toHaveBeenCalled();
  });

  it('should log measurement via markEnd', () => {
    const { result } = renderHook(() =>
      usePerformanceMonitor({
        name: 'TestComponent',
        logEveryRender: true,
      })
    );

    act(() => {
      const end = result.current.markStart();
      end();
    });

    expect(loggerModule.logger.debug).toHaveBeenCalled();
  });

  it('should warn when duration exceeds warning threshold', () => {
    // Mock Date.now for predictable timing
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    vi.spyOn(performance, 'now').mockReturnValue(now);

    const { result } = renderHook(() =>
      usePerformanceMonitor({
        name: 'SlowComponent',
        warningThreshold: 1, // Very low threshold
        logLevel: 'warn',
      })
    );

    // Simulate a slow operation - pass a start time from the past
    act(() => {
      result.current.markEnd(now - 100); // 100ms ago
    });

    expect(loggerModule.logger.warn).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('should log error when duration exceeds error threshold', () => {
    const { result } = renderHook(() =>
      usePerformanceMonitor({
        name: 'VerySlowComponent',
        errorThreshold: 1, // Very low threshold
      })
    );

    // Simulate a very slow operation
    act(() => {
      result.current.markEnd(performance.now() - 200); // 200ms ago
    });

    expect(loggerModule.logger.error).toHaveBeenCalled();
  });
});

describe('useOperationTimer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should time operations', () => {
    const { result } = renderHook(() => useOperationTimer());

    act(() => {
      result.current.start('operation1');
    });

    act(() => {
      result.current.end('operation1');
    });

    expect(loggerModule.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('operation1'),
      expect.any(Object)
    );
  });

  it('should warn when ending non-existent timer', () => {
    const { result } = renderHook(() => useOperationTimer());

    act(() => {
      result.current.end('nonExistent');
    });

    expect(loggerModule.logger.warn).toHaveBeenCalledWith(
      '[Performance] No timer found for operation: nonExistent'
    );
  });

  it('should cancel timer without logging', () => {
    const { result } = renderHook(() => useOperationTimer());

    act(() => {
      result.current.start('operation1');
      result.current.cancel('operation1');
    });

    // Try to end cancelled timer
    act(() => {
      result.current.end('operation1');
    });

    // Should warn, not info
    expect(loggerModule.logger.warn).toHaveBeenCalled();
  });
});

describe('withPerformanceMonitoring', () => {
  it('should wrap component with performance monitoring', () => {
    const TestComponent: React.FC<{ text: string }> = ({ text }) => <div>{text}</div>;
    TestComponent.displayName = 'TestComponent';

    const WrappedComponent = withPerformanceMonitoring(TestComponent, {
      logEveryRender: true,
    });

    const { container } = render(<WrappedComponent text="Hello" />);

    expect(container.textContent).toBe('Hello');
  });

  it('should use component name as default', () => {
    const AnonymousComponent: React.FC = () => <div>Anonymous</div>;

    const WrappedComponent = withPerformanceMonitoring(AnonymousComponent, {});

    expect(WrappedComponent.displayName).toBe('withPerformanceMonitoring(AnonymousComponent)');
  });

  it('should use provided name option', () => {
    const TestComponent: React.FC = () => <div>Test</div>;

    const WrappedComponent = withPerformanceMonitoring(TestComponent, {
      name: 'CustomName',
    });

    expect(WrappedComponent.displayName).toBe('withPerformanceMonitoring(CustomName)');
  });
});
