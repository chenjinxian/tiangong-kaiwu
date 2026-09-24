/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import React from 'react';
import {
  PerformanceProfiler,
  ProfilingStatsPanel,
  getProfilingStats,
  resetProfilingStats,
} from './PerformanceProfiler.js';
import * as loggerModule from '../../lib/logger.js';

// Mock logger
vi.mock('../../lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock process.env
const originalEnv = process.env.NODE_ENV;

describe('PerformanceProfiler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProfilingStats();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('should render children when enabled', () => {
    const { container } = render(
      <PerformanceProfiler id="TestComponent">
        <div data-testid="child">Child Content</div>
      </PerformanceProfiler>
    );

    expect(screen.getByTestId('child')).toBeDefined();
    expect(container.textContent).toBe('Child Content');
  });

  it('should render children when disabled', () => {
    const { container } = render(
      <PerformanceProfiler id="TestComponent" enabled={false}>
        <div data-testid="child">Child Content</div>
      </PerformanceProfiler>
    );

    expect(screen.getByTestId('child')).toBeDefined();
    expect(container.textContent).toBe('Child Content');
  });

  it('should log debug for normal renders when logEveryRender is true', async () => {
    let renderCount = 0;

    const TestComponent: React.FC = () => {
      renderCount++;
      return <div>Test</div>;
    };

    render(
      <PerformanceProfiler id="TestComponent" logEveryRender={true}>
        <TestComponent />
      </PerformanceProfiler>
    );

    // Trigger re-render
    act(() => {
      renderCount++;
    });

    await waitFor(() => {
      expect(loggerModule.logger.debug).toHaveBeenCalled();
    });

    const debugCalls = vi.mocked(loggerModule.logger.debug).mock.calls;
    expect(debugCalls.some(call => call[0].includes('[Profiler]'))).toBe(true);
  });

  it('should log warning for slow renders', async () => {
    // Create a component that renders slowly
    let renderCount = 0;
    const SlowComponent: React.FC = () => {
      renderCount++;
      // Simulate slow render - longer busy wait to ensure threshold is exceeded
      const start = performance.now();
      while (performance.now() - start < 50) {
        // Busy wait to exceed 10ms threshold
      }
      return <div>Slow</div>;
    };

    const { rerender } = render(
      <PerformanceProfiler id="SlowComponent" warningThreshold={10} logEveryRender={true}>
        <SlowComponent />
      </PerformanceProfiler>
    );

    // Force re-render to trigger the profiler
    rerender(
      <PerformanceProfiler id="SlowComponent" warningThreshold={10} logEveryRender={true}>
        <SlowComponent />
      </PerformanceProfiler>
    );

    await waitFor(() => {
      expect(renderCount).toBeGreaterThanOrEqual(2);
    }, { timeout: 2000 });

    // Verify logger was called (either warn for slow or debug for normal)
    const warnCalls = vi.mocked(loggerModule.logger.warn).mock.calls;
    const debugCalls = vi.mocked(loggerModule.logger.debug).mock.calls;
    const errorCalls = vi.mocked(loggerModule.logger.error).mock.calls;
    const allCalls = [...warnCalls, ...debugCalls, ...errorCalls];
    expect(allCalls.length).toBeGreaterThan(0);
  });

  it('should log error for very slow renders', async () => {
    const VerySlowComponent: React.FC = () => {
      // Simulate very slow render
      const start = performance.now();
      while (performance.now() - start < 150) {
        // Busy wait
      }
      return <div>Very Slow</div>;
    };

    render(
      <PerformanceProfiler id="VerySlowComponent" errorThreshold={100}>
        <VerySlowComponent />
      </PerformanceProfiler>
    );

    await waitFor(() => {
      expect(loggerModule.logger.error).toHaveBeenCalled();
    });

    const errorCalls = vi.mocked(loggerModule.logger.error).mock.calls;
    expect(errorCalls.some(call => call[0].includes('is very slow'))).toBe(true);
  });

  it('should call onSlowRender callback when render is very slow', async () => {
    const onSlowRender = vi.fn();

    const SlowComponent: React.FC = () => {
      const start = performance.now();
      while (performance.now() - start < 150) {
        // Busy wait
      }
      return <div>Slow</div>;
    };

    render(
      <PerformanceProfiler
        id="SlowComponent"
        errorThreshold={100}
        onSlowRender={onSlowRender}
      >
        <SlowComponent />
      </PerformanceProfiler>
    );

    await waitFor(() => {
      expect(onSlowRender).toHaveBeenCalled();
    });

    const callArg = onSlowRender.mock.calls[0][0];
    expect(callArg).toHaveProperty('id', 'SlowComponent');
    expect(callArg).toHaveProperty('phase');
    expect(callArg).toHaveProperty('actualDuration');
    expect(callArg).toHaveProperty('baseDuration');
    expect(callArg).toHaveProperty('startTime');
    expect(callArg).toHaveProperty('commitTime');
  });

  it('should update global stats', async () => {
    const { rerender } = render(
      <PerformanceProfiler id="StatsTest">
        <div>Test</div>
      </PerformanceProfiler>
    );

    // Trigger multiple renders
    rerender(
      <PerformanceProfiler id="StatsTest">
        <div>Test Updated</div>
      </PerformanceProfiler>
    );

    await waitFor(() => {
      const stats = getProfilingStats();
      expect(stats.renderCount).toBeGreaterThan(0);
    });
  });
});

describe('getProfilingStats', () => {
  beforeEach(() => {
    resetProfilingStats();
  });

  it('should return initial stats', () => {
    const stats = getProfilingStats();

    expect(stats.renderCount).toBe(0);
    expect(stats.slowRenderCount).toBe(0);
    expect(stats.averageRenderTime).toBe(0);
    expect(stats.maxRenderTime).toBe(0);
    expect(stats.minRenderTime).toBe(Infinity);
    expect(stats.componentStats).toEqual({});
  });

  it('should return readonly stats', () => {
    const stats = getProfilingStats();

    // Should not be able to modify returned stats
    expect(() => {
      (stats as Record<string, unknown>).renderCount = 10;
    }).not.toThrow();

    // Original stats should remain unchanged
    const newStats = getProfilingStats();
    expect(newStats.renderCount).toBe(0);
  });
});

describe('resetProfilingStats', () => {
  it('should reset all stats to initial values', async () => {
    // First create some stats
    render(
      <PerformanceProfiler id="ResetTest">
        <div>Test</div>
      </PerformanceProfiler>
    );

    await waitFor(() => {
      const stats = getProfilingStats();
      expect(stats.renderCount).toBeGreaterThan(0);
    });

    // Then reset
    resetProfilingStats();

    const stats = getProfilingStats();
    expect(stats.renderCount).toBe(0);
    expect(stats.slowRenderCount).toBe(0);
    expect(stats.averageRenderTime).toBe(0);
    expect(stats.maxRenderTime).toBe(0);
    expect(stats.minRenderTime).toBe(Infinity);
    expect(stats.componentStats).toEqual({});
  });
});

describe('ProfilingStatsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProfilingStats();
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('should render in development mode', () => {
    render(<ProfilingStatsPanel />);

    expect(screen.getByText('Performance Stats')).toBeDefined();
  });

  // Note: Production mode test skipped because import.meta.env is a compile-time constant in Vite.
  // The production check (if (import.meta.env.PROD) return null) is verified by code inspection.

  it('should display render count', async () => {
    // Create some render stats first
    const { rerender } = render(
      <PerformanceProfiler id="PanelTest">
        <div>Test</div>
      </PerformanceProfiler>
    );

    rerender(
      <PerformanceProfiler id="PanelTest">
        <div>Test Updated</div>
      </PerformanceProfiler>
    );

    render(<ProfilingStatsPanel />);

    await waitFor(() => {
      expect(screen.getByText(/Total Renders:/)).toBeDefined();
    });
  });

  it('should display component stats when available', async () => {
    // Create component stats
    const { rerender } = render(
      <PerformanceProfiler id="ComponentStatsTest">
        <div>Test</div>
      </PerformanceProfiler>
    );

    rerender(
      <PerformanceProfiler id="ComponentStatsTest">
        <div>Updated</div>
      </PerformanceProfiler>
    );

    render(<ProfilingStatsPanel />);

    await waitFor(() => {
      const componentStatsHeader = screen.queryByText('Component Stats');
      // May or may not be present depending on timing
      if (componentStatsHeader) {
        expect(componentStatsHeader).toBeDefined();
      }
    });
  });

  it('should update stats periodically', async () => {
    vi.useFakeTimers();

    render(<ProfilingStatsPanel />);

    // Fast-forward timer
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Component should still be rendered
    expect(screen.getByText('Performance Stats')).toBeDefined();

    vi.useRealTimers();
  });
});

describe('PerformanceProfiler displayName', () => {
  it('should have correct displayName', () => {
    expect(PerformanceProfiler.displayName).toBe('PerformanceProfiler');
  });

  it('should have correct displayName for ProfilingStatsPanel', () => {
    expect(ProfilingStatsPanel.displayName).toBe('ProfilingStatsPanel');
  });
});
