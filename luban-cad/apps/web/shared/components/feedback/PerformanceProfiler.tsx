/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { Profiler, type ReactNode, useCallback, useState } from 'react';
import { logger } from '../../lib/logger.js';

/**
 * Performance profiler callback data
 */
interface ProfilerData {
  /** Component id */
  id: string;
  /** Phase of the render (mount or update) */
  phase: 'mount' | 'update' | 'nested-update';
  /** Actual time spent rendering */
  actualDuration: number;
  /** Estimated time without memoization */
  baseDuration: number;
  /** Timestamp when React began rendering */
  startTime: number;
  /** Timestamp when React committed the update */
  commitTime: number;
}

/**
 * Performance threshold configuration
 */
interface ThresholdConfig {
  /** Warning threshold in ms */
  warning: number;
  /** Error threshold in ms */
  error: number;
}

/** @internal */
export type { ThresholdConfig };

/**
 * Props for PerformanceProfiler
 */
interface PerformanceProfilerProps {
  /** Unique identifier for the profiled component tree */
  id: string;
  /** Child components to profile */
  children: ReactNode;
  /** Warning threshold in ms (default: 16ms for 60fps) */
  warningThreshold?: number;
  /** Error threshold in ms (default: 100ms) */
  errorThreshold?: number;
  /** Whether profiling is enabled */
  enabled?: boolean;
  /** Custom callback when render exceeds threshold */
  onSlowRender?: (data: ProfilerData) => void;
  /** Log every render (not just slow ones) */
  logEveryRender?: boolean;
}

/**
 * Global profiling stats
 */
interface ProfilingStats {
  /** Total render count */
  renderCount: number;
  /** Number of slow renders */
  slowRenderCount: number;
  /** Average render time */
  averageRenderTime: number;
  /** Maximum render time */
  maxRenderTime: number;
  /** Minimum render time */
  minRenderTime: number;
  /** Render times by component id */
  componentStats: Record<
    string,
    {
      count: number;
      slowCount: number;
      totalTime: number;
      avgTime: number;
      maxTime: number;
    }
  >;
}

// Global stats storage
const globalStats: ProfilingStats = {
  renderCount: 0,
  slowRenderCount: 0,
  averageRenderTime: 0,
  maxRenderTime: 0,
  minRenderTime: Infinity,
  componentStats: {},
};

/**
 * Get current profiling statistics
 */
export function getProfilingStats(): Readonly<ProfilingStats> {
  return { ...globalStats };
}

/**
 * Reset profiling statistics
 */
export function resetProfilingStats(): void {
  globalStats.renderCount = 0;
  globalStats.slowRenderCount = 0;
  globalStats.averageRenderTime = 0;
  globalStats.maxRenderTime = 0;
  globalStats.minRenderTime = Infinity;
  globalStats.componentStats = {};
}

/**
 * Performance Profiler component
 *
 * Wraps children in React Profiler to monitor render performance.
 * Logs warnings when renders exceed thresholds.
 *
 * Usage:
 * ```tsx
 * <PerformanceProfiler id="Editor" warningThreshold={16} errorThreshold={100}>
 *   <Editor />
 * </PerformanceProfiler>
 * ```
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const PerformanceProfiler: React.FC<PerformanceProfilerProps> = React.memo(({
  id,
  children,
  warningThreshold = 16,
  errorThreshold = 100,
  enabled = !import.meta.env.PROD,
  onSlowRender,
  logEveryRender = false,
}) => {
  const [hasWarned, setHasWarned] = useState(false);

  const handleRender = useCallback(
    (
      profilerId: string,
      phase: 'mount' | 'update' | 'nested-update',
      actualDuration: number,
      baseDuration: number,
      startTime: number,
      commitTime: number
    ) => {
      const data: ProfilerData = {
        id: profilerId,
        phase,
        actualDuration,
        baseDuration,
        startTime,
        commitTime,
      };

      // Update global stats
      updateGlobalStats(profilerId, actualDuration, warningThreshold);

      // Check thresholds
      const isSlow = actualDuration > warningThreshold;
      const isVerySlow = actualDuration > errorThreshold;

      // Log based on severity
      if (isVerySlow) {
        if (!hasWarned) {
          logger.error(
            `[Profiler] ${profilerId} is very slow: ${actualDuration.toFixed(2)}ms ` +
              `(phase: ${phase}, base: ${baseDuration.toFixed(2)}ms)`,
            data as unknown as Record<string, unknown>
          );
          setHasWarned(true);

          if (onSlowRender) {
            onSlowRender(data);
          }
        }
      } else if (isSlow) {
        logger.warn(
          `[Profiler] ${profilerId} exceeded 60fps budget: ${actualDuration.toFixed(2)}ms ` +
            `(phase: ${phase})`,
          data as unknown as Record<string, unknown>
        );
      } else if (logEveryRender) {
        logger.debug(
          `[Profiler] ${profilerId} render: ${actualDuration.toFixed(2)}ms (phase: ${phase})`,
          data as unknown as Record<string, unknown>
        );
      }

      // Reset warning flag on fast renders
      if (!isVerySlow && hasWarned) {
        setHasWarned(false);
      }
    },
    [warningThreshold, errorThreshold, hasWarned, onSlowRender, logEveryRender]
  );

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <Profiler id={id} onRender={handleRender}>
      {children}
    </Profiler>
  );
});

PerformanceProfiler.displayName = 'PerformanceProfiler';

/**
 * Update global profiling statistics
 */
function updateGlobalStats(
  id: string,
  duration: number,
  warningThreshold: number
): void {
  globalStats.renderCount++;

  if (duration > warningThreshold) {
    globalStats.slowRenderCount++;
  }

  // Update global timing stats
  const prevTotal = globalStats.averageRenderTime * (globalStats.renderCount - 1);
  globalStats.averageRenderTime = (prevTotal + duration) / globalStats.renderCount;
  globalStats.maxRenderTime = Math.max(globalStats.maxRenderTime, duration);
  globalStats.minRenderTime = Math.min(globalStats.minRenderTime, duration);

  // Update component-specific stats
  if (!globalStats.componentStats[id]) {
    globalStats.componentStats[id] = {
      count: 0,
      slowCount: 0,
      totalTime: 0,
      avgTime: 0,
      maxTime: 0,
    };
  }

  const compStats = globalStats.componentStats[id];
  compStats.count++;
  if (duration > warningThreshold) {
    compStats.slowCount++;
  }
  compStats.totalTime += duration;
  compStats.avgTime = compStats.totalTime / compStats.count;
  compStats.maxTime = Math.max(compStats.maxTime, duration);
}

/**
 * Hook to get profiling statistics
 */
export function useProfilingStats(): ProfilingStats {
  const [stats, setStats] = useState<ProfilingStats>(() => ({ ...globalStats }));

  // Update stats periodically
  React.useEffect(() => {
    const interval = setInterval(() => {
      setStats({ ...globalStats });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return stats;
}

/**
 * Component to display profiling statistics (for development)
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ProfilingStatsPanel: React.FC = React.memo(() => {
  const stats = useProfilingStats();

  if (import.meta.env.PROD) {
    return null;
  }

  const slowRenderPercentage =
    stats.renderCount > 0
      ? ((stats.slowRenderCount / stats.renderCount) * 100).toFixed(1)
      : '0';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 10,
        right: 10,
        background: 'rgba(0, 0, 0, 0.8)',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: 8,
        fontFamily: 'monospace',
        fontSize: 12,
        zIndex: 9999,
        maxWidth: 300,
        maxHeight: 400,
        overflow: 'auto',
      }}
    >
      <h4 style={{ margin: '0 0 8px 0', color: '#0c0' }}>Performance Stats</h4>
      <div>Total Renders: {stats.renderCount}</div>
      <div style={{ color: stats.slowRenderCount > 0 ? '#f90' : '#0c0' }}>
        Slow Renders: {stats.slowRenderCount} ({slowRenderPercentage}%)
      </div>
      <div>Avg Time: {stats.averageRenderTime.toFixed(2)}ms</div>
      <div>Max Time: {stats.maxRenderTime.toFixed(2)}ms</div>

      {Object.entries(stats.componentStats).length > 0 && (
        <>
          <hr style={{ borderColor: '#444', margin: '12px 0' }} />
          <h5 style={{ margin: '8px 0' }}>Component Stats</h5>
          {Object.entries(stats.componentStats).map(([id, compStats]) => (
            <div key={id} style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 'bold', color: '#6cf' }}>{id}</div>
              <div>Renders: {compStats.count}</div>
              <div style={{ color: compStats.slowCount > 0 ? '#f90' : '#0c0' }}>
                Slow: {compStats.slowCount}
              </div>
              <div>Avg: {compStats.avgTime.toFixed(2)}ms</div>
              <div>Max: {compStats.maxTime.toFixed(2)}ms</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
});

ProfilingStatsPanel.displayName = 'ProfilingStatsPanel';

export default PerformanceProfiler;
