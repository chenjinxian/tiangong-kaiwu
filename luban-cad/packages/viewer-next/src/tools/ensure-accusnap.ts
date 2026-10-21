/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 */

import { IModelApp } from '@itwin/core-frontend';

/** Polling interval (ms), same as the original WebInitializer inline loop. */
const POLL_INTERVAL_MS = 500;
/** Try cap, same as the original WebInitializer inline loop (60 × 500ms = 30s). */
const MAX_TRIES = 60;

/**
 * Enable AccuSnap for geometry-aware cursor snapping (snap + locate).
 *
 * React StrictMode 双跑竞态下 IModelApp.accuSnap 可能尚未就绪（实测 2026-10-09：
 * 跳过后工具 locate 失效——选边/拾取点击永远落空）——未就绪则轮询补启而非放弃。
 *
 * @param timeoutMs polling budget in milliseconds; default 30000（500ms × 60 tries 封顶）
 * @returns true if AccuSnap was enabled (immediately or within the budget), false if it never became available
 */
export async function ensureAccuSnap(timeoutMs: number = MAX_TRIES * POLL_INTERVAL_MS): Promise<boolean> {
  const enableAccuSnap = (): boolean => {
    if (IModelApp.accuSnap) {
      IModelApp.accuSnap.enableSnap(true);
      IModelApp.accuSnap.enableLocate(true);
      // eslint-disable-next-line no-console
      console.log('AccuSnap enabled (snap + locate)');
      return true;
    }
    return false;
  };
  if (enableAccuSnap()) {
    return true;
  }

  const maxTries = Math.min(MAX_TRIES, Math.max(1, Math.floor(timeoutMs / POLL_INTERVAL_MS)));
  for (let tries = 1; tries <= maxTries; tries++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    if (enableAccuSnap()) {
      return true;
    }
  }
  // eslint-disable-next-line no-console
  console.warn(
    `AccuSnap not available after retries (${Math.round((maxTries * POLL_INTERVAL_MS) / 1000)}s) — locate-dependent tools may fail`,
  );
  return false;
}
