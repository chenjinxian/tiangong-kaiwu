/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckpointConnection, IModelApp, IModelConnection } from '@itwin/core-frontend';
import type { AccessToken, GuidString } from '@itwin/core-bentley';
import { IModelVersion } from '@itwin/core-common';

export interface UseIModelOptions {
  iTwinId: string;
  iModelId: string;
  accessToken?: AccessToken;
  changesetId?: string;
}

export interface UseIModelResult {
  iModel: IModelConnection | undefined;
  isLoading: boolean;
  error: Error | null;
  reload: () => void;
}

/**
 * Hook to manage IModelConnection lifecycle
 *
 * This hook opens a checkpoint connection to an iModel from iModelHub.
 * It supports opening a specific changeset or the latest version.
 *
 * Note: Requires IModelApp.hubAccess to be configured with FrontendIModelsAccess
 *
 * @example
 * ```tsx
 * const { iModel, isLoading, error } = useIModel({
 *   iTwinId: 'my-itwin-id',
 *   iModelId: 'my-imodel-id',
 *   accessToken: authToken
 * });
 * ```
 */
export function useIModel(options: UseIModelOptions): UseIModelResult {
  const { iTwinId, iModelId, accessToken, changesetId } = options;
  const [iModel, setIModel] = useState<IModelConnection | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const tokenRef = useRef(accessToken);

  // Keep authorizationClient in sync with the latest accessToken
  useEffect(() => {
    tokenRef.current = accessToken;
    if (accessToken) {
      const bearer = accessToken.startsWith('Bearer ') ? accessToken : `Bearer ${accessToken}`;
      IModelApp.authorizationClient = { getAccessToken: async () => bearer };
    }
  }, [accessToken]);

  const reload = useCallback(() => {
    if (iModel) {
      void iModel.close();
      setIModel(undefined);
    }
  }, [iModel]);

  useEffect(() => {
    if (!iTwinId || !iModelId) return;

    let cancelled = false;
    let conn: IModelConnection | undefined;

    const open = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const version = changesetId
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
          ? IModelVersion.asOfChangeSet(changesetId as GuidString)
          : IModelVersion.latest();

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        let connection = await CheckpointConnection.openRemote(iTwinId as GuidString, iModelId as GuidString, version).catch(async (err: unknown) => {
          // React StrictMode causes two concurrent opens before the first close propagates.
          // Retry once after a brief delay to let the backend process the pending close.
          if (!cancelled && String(err).includes('already in use')) {
            await new Promise<void>((r) => setTimeout(r, 400));
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
            return CheckpointConnection.openRemote(iTwinId as GuidString, iModelId as GuidString, version);
          }
          throw err;
        });

        if (cancelled) {
          // Cleanup already ran while we were awaiting — close immediately
          void connection.close();
          return;
        }

        conn = connection;
        setIModel(connection);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void open();

    return () => {
      cancelled = true;
      if (conn) {
        void conn.close();
        conn = undefined;
      }
      setIModel(undefined);
      setError(null);
    };
  }, [iTwinId, iModelId, changesetId]);

  return {
    iModel,
    isLoading,
    error,
    reload,
  };
}
