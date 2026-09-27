/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Performance monitoring bootstrap. Minimal placeholder in T2.3 — the
 * real implementation lands with the DanQing rendering integration
 * (T3.1) where frame metrics become meaningful.
 */

interface MonitorState {
  initialized: boolean;
  startedAt: number;
}

const state: MonitorState = { initialized: false, startedAt: 0 };

/** Idempotent. Installs baseline web-vitals style timing hooks. */
export function initMonitoring(): void {
  if (state.initialized) return;
  state.initialized = true;
  state.startedAt = performance.now();

  // Baseline: record the app's time-to-interactive bucket once.
  window.addEventListener('load', () => {
    const loadMs = Math.round(performance.now() - state.startedAt);
    // eslint-disable-next-line no-console
    console.debug(`[monitoring] window load in ${loadMs}ms`);
  }, { once: true });
}

export function isMonitoringInitialized(): boolean {
  return state.initialized;
}
