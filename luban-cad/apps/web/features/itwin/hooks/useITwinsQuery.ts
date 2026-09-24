/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * React Query Hooks for iTwins
 *
 * Replaces useITwins with production-grade data fetching:
 * - Request deduplication (solves StrictMode 429 issues)
 * - Automatic caching and background refresh
 * - Optimistic updates for mutations
 * - Proper 404 error handling
 */

import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  addToFavorites,
  addToRecents,
  createITwin,
  deleteITwin,
  getITwin,
  type ITwin,
  ITwinsApiError,
  ITwinSubClass,
  queryFavoriteITwins,
  queryITwins,
  queryRecentITwins,
  removeFromFavorites,
  updateITwin,
} from '../../../shared/services/itwins/client.js';
import { queryKeys } from '../../../app/providers/QueryProvider.js';

// ============================================================================
// Types
// ============================================================================

interface UseITwinsOptions {
  subClass?: ITwinSubClass;
  enabled?: boolean;
}

interface CreateITwinData {
  displayName: string;
  subClass?: ITwinSubClass;
  projectNumber?: string;
}

interface UpdateITwinData {
  displayName?: string;
  description?: string;
  status?: string;
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook for fetching iTwins list with React Query
 *
 * Benefits over vanilla useITwins:
 * - Automatic request deduplication (no more 429 errors in StrictMode)
 * - Caching with 5-minute stale time
 * - Background refetching when window regains focus
 * - Automatic retry on failure
 */
export function useITwinsQuery(
  options: UseITwinsOptions = {}
): UseQueryResult<ITwin[], Error> {
  const { subClass = ITwinSubClass.Project, enabled = true } = options;

  return useQuery({
    queryKey: queryKeys.itwins.list(subClass),
    queryFn: async () => {
      const response = await queryITwins(subClass);
      return response || [];
    },
    enabled,
    // iTwins don't change frequently, cache for longer
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook for fetching a single iTwin with proper 404 handling
 */
export function useITwinQuery(
  iTwinId: string | null
): UseQueryResult<ITwin, Error> & { isNotFound: boolean } {
  const query = useQuery({
    queryKey: queryKeys.itwins.detail(iTwinId),
    queryFn: async () => {
      if (!iTwinId) throw new Error('iTwinId is required');
      const response = await getITwin(iTwinId);
      return response;
    },
    enabled: !!iTwinId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    // Don't retry on 404 errors - the iTwin truly doesn't exist
    retry: (failureCount, error) => {
      if (error instanceof ITwinsApiError && error.statusCode === 404) {
        return false;
      }
      return failureCount < 3;
    },
  });

  const isNotFound =
    query.error instanceof ITwinsApiError && query.error.statusCode === 404;

  return {
    ...query,
    isNotFound,
  };
}

/**
 * Hook for fetching favorite iTwins
 */
export function useFavoriteITwinsQuery(
  enabled = true
): UseQueryResult<ITwin[], Error> {
  return useQuery({
    queryKey: queryKeys.itwins.favorites(),
    queryFn: async () => {
      const response = await queryFavoriteITwins();
      return response || [];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Hook for fetching recent iTwins
 */
export function useRecentITwinsQuery(
  enabled = true
): UseQueryResult<ITwin[], Error> {
  return useQuery({
    queryKey: queryKeys.itwins.recents(),
    queryFn: async () => {
      const response = await queryRecentITwins();
      return response || [];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Hook for iTwin mutations with optimistic updates
 */
export function useCreateITwinMutation(): UseMutationResult<
  ITwin,
  Error,
  CreateITwinData
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateITwinData) => {
      const response = await createITwin({
        displayName: data.displayName,
        subClass: data.subClass || ITwinSubClass.Project,
        description: data.projectNumber,
      });
      if (!response) throw new Error('Failed to create iTwin');
      return response;
    },
    onSuccess: () => {
      // Invalidate all iTwin lists to refetch
      void queryClient.invalidateQueries({ queryKey: queryKeys.itwins.all });
    },
    onError: (error) => {
      console.error('Failed to create iTwin:', error);
    },
  });
}

/**
 * Hook for updating an iTwin
 */
export function useUpdateITwinMutation(): UseMutationResult<
  ITwin,
  Error,
  { iTwinId: string; data: UpdateITwinData }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ iTwinId, data }) => {
      const response = await updateITwin(iTwinId, data);
      if (!response) throw new Error('Failed to update iTwin');
      return response;
    },
    onSuccess: (_, variables) => {
      // Invalidate specific iTwin detail and all lists
      void queryClient.invalidateQueries({
        queryKey: queryKeys.itwins.detail(variables.iTwinId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.itwins.all });
    },
    onError: (error) => {
      console.error('Failed to update iTwin:', error);
    },
  });
}

/**
 * Hook for deleting an iTwin
 */
export function useDeleteITwinMutation(): UseMutationResult<
  void,
  Error,
  string
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (iTwinId: string) => {
      await deleteITwin(iTwinId);
    },
    onSuccess: () => {
      // Invalidate all iTwin queries
      void queryClient.invalidateQueries({ queryKey: queryKeys.itwins.all });
    },
    onError: (error) => {
      console.error('Failed to delete iTwin:', error);
    },
  });
}

/**
 * Hook for adding iTwin to favorites
 */
export function useAddToFavoritesMutation(): UseMutationResult<
  void,
  Error,
  string
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (iTwinId: string) => {
      await addToFavorites(iTwinId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.itwins.favorites(),
      });
    },
    onError: (error) => {
      console.error('Failed to add favorite:', error);
    },
  });
}

/**
 * Hook for removing iTwin from favorites
 */
export function useRemoveFromFavoritesMutation(): UseMutationResult<
  void,
  Error,
  string
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (iTwinId: string) => {
      await removeFromFavorites(iTwinId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.itwins.favorites(),
      });
    },
    onError: (error) => {
      console.error('Failed to remove favorite:', error);
    },
  });
}

/**
 * Hook for tracking iTwin access (adds to recents)
 */
export function useTrackITwinAccessMutation(): UseMutationResult<
  void,
  Error,
  string
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (iTwinId: string) => {
      await addToRecents(iTwinId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.itwins.recents() });
    },
    onError: (error) => {
      console.error('Failed to track iTwin access:', error);
    },
  });
}

// Re-export types
export { ITwinSubClass, ITwinsApiError };
export type { ITwin };

// Backward compatibility alias
export { useCreateITwinMutation as useITwinMutations };
