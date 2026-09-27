/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from 'react';
import { IModelApp } from '@itwin/core-frontend';
import { initializeWeb } from '@luban-cad/web-viewer';
import { getStoredAuth } from '../../auth/services/auth/client.js';

export interface EditorInitializationState {
  isAppInitialized: boolean;
  /** Set when initialization failed (backend unreachable, etc.) — surface in UI. */
  initError: Error | null;
}

/** toolAdmin readiness poll interval and budget (T2.3: unbounded → 30s cap). */
const TOOL_ADMIN_POLL_MS = 50;
const TOOL_ADMIN_TIMEOUT_MS = 30_000;

/**
 * Hook to initialize IModelApp on mount.
 * Required for both readonly and editable modes.
 */
export function useEditorInitialization(backendUrl: string): EditorInitializationState {
  const [isAppInitialized, setIsAppInitialized] = useState(false);
  const [initError, setInitError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    const deadline = Date.now() + TOOL_ADMIN_TIMEOUT_MS;

    const init = async (): Promise<void> => {
      try {
        await initializeWeb({
          backendUrl,
          iModelHubUrl: '',
          accessToken: getStoredAuth().tokens?.accessToken,
        });
      } catch (err) {
        // "Already initialized" is expected on re-mount; anything else is real.
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes('already initialized')) {
          if (cancelled) return;
          setInitError(err instanceof Error ? err : new Error(message));
          return;
        }
      }

      // Wait for toolAdmin to be ready (created asynchronously after startup).
      const checkToolAdmin = () => {
        if (cancelled) return;
        if (IModelApp.toolAdmin) {
          setIsAppInitialized(true);
        } else if (Date.now() > deadline) {
          setInitError(new Error(
            `IModelApp.toolAdmin 未在 ${TOOL_ADMIN_TIMEOUT_MS / 1000}s 内就绪` +
            '（后端未起或 /ipc WebSocket 失联）'
          ));
        } else {
          setTimeout(checkToolAdmin, TOOL_ADMIN_POLL_MS);
        }
      };
      checkToolAdmin();
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [backendUrl]);

  return { isAppInitialized, initError };
}
