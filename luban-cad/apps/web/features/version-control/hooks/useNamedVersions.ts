/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useNamedVersions - Official SDK Hook
 * Uses @itwin/imodels-client-management for named version management
 */

import { useCallback, useEffect, useState } from 'react';
import {
  getAuthorization,
  iModelsManagementClient,
  type NamedVersion as SdkNamedVersion,
} from '../../../shared/services/imodels/client.js';

// Extended NamedVersion with optional createdBy field
interface NamedVersion extends SdkNamedVersion {
  createdBy?: string;
}

interface UseNamedVersionsOptions {
  iModelId: string;
  enabled?: boolean;
}

interface UseNamedVersionsReturn {
  namedVersions: NamedVersion[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook for fetching named versions using official SDK
 */
export function useNamedVersions(options: UseNamedVersionsOptions): UseNamedVersionsReturn {
  const { iModelId, enabled = true } = options;

  const [namedVersions, setNamedVersions] = useState<NamedVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchNamedVersions = useCallback(async () => {
    if (!iModelId) {
      setNamedVersions([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const iterator = iModelsManagementClient.namedVersions.getRepresentationList({
        authorization: getAuthorization,
        iModelId,
      });

      // Collect all items from the iterator
      const items: NamedVersion[] = [];
      for await (const namedVersion of iterator) {
        items.push(namedVersion);
      }
      setNamedVersions(items);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch named versions'));
    } finally {
      setIsLoading(false);
    }
  }, [iModelId]);

  useEffect(() => {
    if (enabled && iModelId) {
      void fetchNamedVersions();
    }
  }, [fetchNamedVersions, enabled, iModelId]);

  return {
    namedVersions,
    isLoading,
    error,
    refetch: fetchNamedVersions,
  };
}

/**
 * Hook for named version mutations
 */
export function useNamedVersionMutations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createNamedVersion = useCallback(async (params: {
    iModelId: string;
    name: string;
    description?: string;
    changesetId: string;
  }) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await iModelsManagementClient.namedVersions.create({
        authorization: getAuthorization,
        iModelId: params.iModelId,
        namedVersionProperties: {
          name: params.name,
          description: params.description,
          changesetId: params.changesetId,
        },
      });
      return response;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to create named version'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    createNamedVersion,
    isLoading,
    error,
  };
}

// Re-export extended type
export type { NamedVersion };
