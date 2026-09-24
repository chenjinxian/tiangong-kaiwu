/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useChangesets - Official SDK Hook
 * Uses @itwin/imodels-client-management for changeset management
 */

import { useCallback, useEffect, useState } from 'react';
import {
  type Changeset,
  getAuthorization,
  iModelsManagementClient,
} from '../../../shared/services/imodels/client.js';

interface UseChangesetsOptions {
  iModelId: string;
  enabled?: boolean;
}

interface UseChangesetsReturn {
  changesets: Changeset[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook for fetching changesets using official SDK
 */
export function useChangesets(options: UseChangesetsOptions): UseChangesetsReturn {
  const { iModelId, enabled = true } = options;

  const [changesets, setChangesets] = useState<Changeset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchChangesets = useCallback(async () => {
    if (!iModelId) {
      setChangesets([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const iterator = iModelsManagementClient.changesets.getRepresentationList({
        authorization: getAuthorization,
        iModelId,
      });

      // Collect all items from the iterator
      const items: Changeset[] = [];
      for await (const changeset of iterator) {
        items.push(changeset);
      }
      setChangesets(items);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch changesets'));
    } finally {
      setIsLoading(false);
    }
  }, [iModelId]);

  useEffect(() => {
    if (enabled && iModelId) {
      void fetchChangesets();
    }
  }, [fetchChangesets, enabled, iModelId]);

  return {
    changesets,
    isLoading,
    error,
    refetch: fetchChangesets,
  };
}

/**
 * Hook for fetching a single changeset
 */
export function useChangeset(iModelId: string | null, changesetId: string | null) {
  const [changeset, setChangeset] = useState<Changeset | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchChangeset = useCallback(async () => {
    if (!iModelId || !changesetId) {
      setChangeset(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await iModelsManagementClient.changesets.getSingle({
        authorization: getAuthorization,
        iModelId,
        changesetId,
      });
      setChangeset(response);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch changeset'));
    } finally {
      setIsLoading(false);
    }
  }, [iModelId, changesetId]);

  useEffect(() => {
    void fetchChangeset();
  }, [fetchChangeset]);

  return {
    changeset,
    isLoading,
    error,
    refetch: fetchChangeset,
  };
}

// Re-export SDK types
export type { Changeset };
