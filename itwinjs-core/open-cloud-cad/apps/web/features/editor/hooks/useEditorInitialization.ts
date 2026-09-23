/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from 'react';
import { IModelApp } from '@itwin/core-frontend';
import { initializeWeb } from '@open-cloud-cad/web-viewer';
import { getStoredAuth } from '../../auth/services/auth/client.js';

export interface EditorInitializationState {
  isAppInitialized: boolean;
}

/**
 * Hook to initialize IModelApp on mount.
 * Required for both readonly and editable modes.
 */
export function useEditorInitialization(backendUrl: string): EditorInitializationState {
  const [isAppInitialized, setIsAppInitialized] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const init = async (): Promise<void> => {
      try {
        await initializeWeb({
          backendUrl,
          iModelHubUrl: '',
          accessToken: getStoredAuth().tokens?.accessToken,
        });
      } catch (err) {
        // Already initialized is okay
      }

      // Wait for toolAdmin to be ready (may be created asynchronously)
      const checkToolAdmin = () => {
        if (cancelled) return;
        if (IModelApp.toolAdmin) {
          setIsAppInitialized(true);
        } else {
          setTimeout(checkToolAdmin, 50);
        }
      };
      checkToolAdmin();
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [backendUrl]);

  return { isAppInitialized };
}
