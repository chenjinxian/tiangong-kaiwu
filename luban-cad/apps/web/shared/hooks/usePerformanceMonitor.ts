/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useRef } from 'react';
import { logger } from '../lib/logger.js';

/**
 * Performance measurement options
 */
interface PerformanceOptions {
  /** Component or operation name */
  name: string;
  /** Threshold in ms for warning (default: 16ms for 60fps) */
  warningThreshold?: number;
  /** Threshold in ms for error (default: 100ms) */
  errorThreshold?: number;
  /** Log level for measurements */
  logLevel?: 'debug' | 'info' | 'warn';
  /** Whether to log on every measurement or only when threshold exceeded */
  logEveryRender?: boolean;
}

/**
 * Performance metrics for a single measurement
 */
interface PerformanceMetrics {
  /** Component/operation name */
  name: string;
  /** Duration in milliseconds */
  duration: number;
  /** Whether the duration exceeded warning threshold */
  isSlow: boolean;
  /** Whether the duration exceeded error threshold */
  isVerySlow: boolean;
  /** Additional context data */
  metadata?: Record<string, unknown>;
}

/**
 * Hook for monitoring component render performance
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   const { measure, markStart, markEnd } = usePerformanceMonitor({
 *     name: 'MyComponent',
 *     warningThreshold: 16,
 *     errorThreshold: 100,
 *   });
 *
 *   // Automatic measurement on every render
 *   useEffect(() => {
 *     const end = measure();
 *     return end;
 *   });
 *
 *   // Or manual measurement
 *   const handleClick = () => {
 *     const end = markStart();
 *     // ... do work
 *     markEnd(end);
 *   };
 *
 *   return <div>...</div>;
 * }
 * ```
 */
export function usePerformanceMonitor(options: PerformanceOptions) {
  const {
    name,
    warningThreshold = 16, // 60fps budget
    errorThreshold = 100,
    logLevel = 'debug',
    logEveryRender = false,
  } = options;

  const startTimeRef = useRef<number>(0);
  const hasWarnedRef = useRef(false);

  /**
   * Mark the start of a measurement
   * Returns a function that should be called at the end to complete measurement
   */
  const markStart = useCallback((): (() => void) => {
    startTimeRef.current = performance.now();

    // Return end function for convenience
    return () => {
      const duration = performance.now() - startTimeRef.current;
      logMeasurement(duration);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Mark the end of a measurement
   */
  const markEnd = useCallback((startTime?: number, metadata?: Record<string, unknown>): void => {
    const start = startTime ?? startTimeRef.current;
    const duration = performance.now() - start;
    logMeasurement(duration, metadata);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Measure a function execution time
   */
  const measure = useCallback(
    <T extends (...args: unknown[]) => unknown>(fn: T, ...args: Parameters<T>): ReturnType<T> => {
      const start = performance.now();
      const result = fn(...args) as ReturnType<T>;

      // Handle promises
      if (result instanceof Promise) {
        return result.finally(() => {
          markEnd(start);
        }) as ReturnType<T>;
      }

      markEnd(start);
      return result;
    },
    [markEnd]
  );

  /**
   * Log a performance measurement
   */
  const logMeasurement = useCallback(
    (duration: number, metadata?: Record<string, unknown>) => {
      const metrics: PerformanceMetrics = {
        name,
        duration,
        isSlow: duration > warningThreshold,
        isVerySlow: duration > errorThreshold,
        metadata,
      };

      // Only log warnings/errors once per threshold breach to avoid spam
      if (metrics.isVerySlow) {
        if (!hasWarnedRef.current) {
          logger.error(`[Performance] ${name} is very slow: ${duration.toFixed(2)}ms`, metrics as unknown as Record<string, unknown>);
          hasWarnedRef.current = true;
        }
      } else if (metrics.isSlow) {
        if (logLevel === 'warn' || logLevel === 'info' || logLevel === 'debug') {
          logger.warn(`[Performance] ${name} exceeded 60fps budget: ${duration.toFixed(2)}ms`, metrics as unknown as Record<string, unknown>);
        }
      } else if (logEveryRender) {
        switch (logLevel) {
          case 'debug':
            logger.debug(`[Performance] ${name} render: ${duration.toFixed(2)}ms`, metrics as unknown as Record<string, unknown>);
            break;
          case 'info':
            logger.info(`[Performance] ${name} render: ${duration.toFixed(2)}ms`, metrics as unknown as Record<string, unknown>);
            break;
          case 'warn':
            logger.warn(`[Performance] ${name} render: ${duration.toFixed(2)}ms`, metrics as unknown as Record<string, unknown>);
            break;
        }
      }

      // Reset warning flag on fast renders
      if (!metrics.isVerySlow) {
        hasWarnedRef.current = false;
      }

      // Report to performance observer if available
      if (typeof window !== 'undefined' && 'performance' in window) {
        try {
          performance.mark(`${name}-end`);
          performance.measure(name, `${name}-start`, `${name}-end`);
        } catch {
          // Ignore errors from performance API
        }
      }
    },
    [name, warningThreshold, errorThreshold, logLevel, logEveryRender]
  );

  /**
   * Measure component render time
   * Call this at the start of the component, returns cleanup function
   */
  useEffect(() => {
    performance.mark(`${name}-start`);

    return () => {
      markEnd(startTimeRef.current);
    };
  });

  return {
    /** Start a measurement, returns end function */
    markStart,
    /** End a measurement */
    markEnd,
    /** Measure a function execution */
    measure,
    /** Log a custom measurement */
    logMeasurement,
  };
}

/**
 * Hook for monitoring expensive operations
 * Similar to usePerformanceMonitor but for one-off operations
 */
export function useOperationTimer() {
  const timersRef = useRef<Map<string, number>>(new Map());

  const start = useCallback((operationName: string) => {
    timersRef.current.set(operationName, performance.now());
  }, []);

  const end = useCallback((operationName: string, metadata?: Record<string, unknown>) => {
    const startTime = timersRef.current.get(operationName);
    if (startTime === undefined) {
      logger.warn(`[Performance] No timer found for operation: ${operationName}`);
      return;
    }

    const duration = performance.now() - startTime;
    timersRef.current.delete(operationName);

    logger.info(`[Performance] ${operationName} completed in ${duration.toFixed(2)}ms`, {
      operation: operationName,
      duration,
      ...metadata,
    });

    return duration;
  }, []);

  const cancel = useCallback((operationName: string) => {
    timersRef.current.delete(operationName);
  }, []);

  return { start, end, cancel };
}

/**
 * Higher-order component for performance monitoring
 * Wraps a component with performance measurement
 */
export function withPerformanceMonitoring<P extends object>(
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Component: React.ComponentType<P>,
  options: Omit<PerformanceOptions, 'name'> & { name?: string }
): React.FC<P> {
  const displayName = options.name ?? Component.displayName ?? Component.name ?? 'Component';

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const WrappedComponent: React.FC<P> = (props) => {
    const { markStart } = usePerformanceMonitor({
      ...options,
      name: displayName,
    });

    // Start measurement before render
    const end = markStart();

    // Schedule end measurement after render
    useEffect(() => {
      end();
    });

    return React.createElement(Component, props);
  };

  WrappedComponent.displayName = `withPerformanceMonitoring(${displayName})`;

  return WrappedComponent;
}

export default usePerformanceMonitor;
