/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * iModels React Query Hooks
 *
 * Replaces useIModels.ts and useIModelsSdk.ts with production-grade data fetching:
 * - Uses official @itwin/imodels-client-management SDK for queries
 * - Uses REST API for mutations (create, delete)
 * - Automatic caching and background refetching
 * - Request deduplication
 * - Optimistic updates for mutations
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  getAuthorization,
  type IModel,
  iModelsManagementClient,
} from '../../../shared/services/imodels/client.js';
import { deleteIModel, renameIModel, copyIModel, moveIModel } from '../services/client.js';
import { queryKeys } from '../../../app/providers/QueryProvider.js';

// ============================================================================
// Types
// ============================================================================

interface UseIModelsOptions {
  iTwinId: string;
  enabled?: boolean;
}

interface CreateIModelData {
  iTwinId: string;
  name: string;
  description?: string;
}

interface CreateIModelWithBaselineData extends CreateIModelData {
  fileSize: number;
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook for fetching iModels using official SDK
 *
 * Replaces useIModels.ts and useIModelsSdk.ts
 */
export function useIModels(options: UseIModelsOptions): UseQueryResult<IModel[], Error> {
  const { iTwinId, enabled = true } = options;

  return useQuery({
    queryKey: queryKeys.iModels.list(iTwinId),
    queryFn: async () => {
      const iterator = iModelsManagementClient.iModels.getRepresentationList({
        authorization: getAuthorization,
        urlParams: { iTwinId },
      });

      const items: IModel[] = [];
      for await (const iModel of iterator) {
        // Debug: log actual fields from SDK
        if (items.length === 0) {
          console.log('SDK IModel fields:', Object.keys(iModel));
          console.log('SDK IModel object:', iModel);
        }
        items.push(iModel);
      }

      // Deduplicate by id to avoid duplicate keys in React
      return Array.from(new Map(items.map((item) => [item.id, item])).values());
    },
    enabled: !!iTwinId && enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5000, // Poll every 5 seconds to check for initialization status updates
    refetchIntervalInBackground: false, // Don't poll when tab is not active
  });
}

/**
 * Hook for fetching a single iModel
 */
export function useIModel(iModelId: string | null): UseQueryResult<IModel, Error> {
  return useQuery({
    queryKey: queryKeys.iModels.detail(iModelId || ''),
    queryFn: async () => {
      if (!iModelId) throw new Error('iModelId is required');
      const response = await iModelsManagementClient.iModels.getSingle({
        authorization: getAuthorization,
        iModelId,
      });
      return response;
    },
    enabled: !!iModelId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// ============================================================================
// Mutation Hooks - Using REST API
// ============================================================================

const BACKEND_URL = import.meta.env.VITE_IMODELHUB_URL || '';

/**
 * Hook for creating an iModel
 * Uses REST API since SDK doesn't expose create method directly
 */
export function useCreateIModelMutation(): UseMutationResult<
  IModel,
  Error,
  CreateIModelData
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateIModelData) => {
      const auth = await getAuthorization();
      const response = await fetch(`${BACKEND_URL}/imodels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `${auth.scheme} ${auth.token}`,
        },
        body: JSON.stringify({
          iTwinId: data.iTwinId,
          name: data.name,
          description: data.description,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to create iModel: ${response.statusText}`);
      }

      const result = await response.json() as { iModel: IModel };
      return result.iModel;
    },
    onSuccess: (_, variables) => {
      // Invalidate iModels list for the project
      void queryClient.invalidateQueries({
        queryKey: queryKeys.iModels.list(variables.iTwinId),
      });
    },
  });
}

/**
 * Hook for creating an iModel with baseline file
 */
export function useCreateIModelWithBaselineMutation(): UseMutationResult<
  IModel,
  Error,
  CreateIModelWithBaselineData
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateIModelWithBaselineData) => {
      const auth = await getAuthorization();
      const response = await fetch(`${BACKEND_URL}/imodels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `${auth.scheme} ${auth.token}`,
        },
        body: JSON.stringify({
          iTwinId: data.iTwinId,
          name: data.name,
          description: data.description,
          baselineFile: { size: data.fileSize },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to create iModel: ${response.statusText}`);
      }

      const result = await response.json() as { iModel: IModel };
      return result.iModel;
    },
    onSuccess: (_, variables) => {
      // Invalidate iModels list for the project
      void queryClient.invalidateQueries({
        queryKey: queryKeys.iModels.list(variables.iTwinId),
      });
    },
  });
}

/**
 * Hook for deleting an iModel
 */
export function useDeleteIModelMutation(): UseMutationResult<
  void,
  Error,
  { iModelId: string; iTwinId: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ iModelId }: { iModelId: string; iTwinId: string }) => {
      await deleteIModel(iModelId);
    },
    onSuccess: (_, variables) => {
      // Invalidate iModels list for the project and remove detail cache
      void queryClient.invalidateQueries({
        queryKey: queryKeys.iModels.list(variables.iTwinId),
      });
      void queryClient.removeQueries({
        queryKey: queryKeys.iModels.detail(variables.iModelId),
      });
    },
  });
}

interface RenameIModelData {
  iModelId: string;
  iTwinId: string;
  newName: string;
  newDescription?: string;
}

/**
 * Hook for renaming an iModel
 */
export function useRenameIModelMutation(): UseMutationResult<
  void,
  Error,
  RenameIModelData
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ iModelId, newName, newDescription }: RenameIModelData) => {
      await renameIModel(iModelId, newName, newDescription);
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.iModels.list(variables.iTwinId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.iModels.detail(variables.iModelId),
      });
    },
  });
}

interface CopyIModelData {
  sourceIModelId: string;
  sourceITwinId: string;
  targetITwinId: string;
  newName: string;
}

/**
 * Hook for copying an iModel
 */
export function useCopyIModelMutation(): UseMutationResult<
  { iModelId: string },
  Error,
  CopyIModelData
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sourceIModelId, targetITwinId, newName }: CopyIModelData) => {
      return copyIModel(sourceIModelId, targetITwinId, newName);
    },
    onSuccess: (_, variables) => {
      // Invalidate both source and target project iModel lists
      void queryClient.invalidateQueries({
        queryKey: queryKeys.iModels.list(variables.sourceITwinId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.iModels.list(variables.targetITwinId),
      });
    },
  });
}

interface MoveIModelData {
  iModelId: string;
  sourceITwinId: string;
  targetITwinId: string;
}

/**
 * Hook for moving an iModel to a different project
 */
export function useMoveIModelMutation(): UseMutationResult<
  void,
  Error,
  MoveIModelData
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ iModelId, sourceITwinId, targetITwinId }: MoveIModelData) => {
      await moveIModel(iModelId, sourceITwinId, targetITwinId);
    },
    onSuccess: (_, variables) => {
      // Invalidate both source and target project iModel lists
      void queryClient.invalidateQueries({
        queryKey: queryKeys.iModels.list(variables.sourceITwinId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.iModels.list(variables.targetITwinId),
      });
      // Remove the moved iModel from cache
      void queryClient.removeQueries({
        queryKey: queryKeys.iModels.detail(variables.iModelId),
      });
    },
  });
}

// Re-export types
export type { IModel };
