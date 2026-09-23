/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * React Query Provider and Client Configuration
 *
 * Solves React StrictMode double-request issues through:
 * - Request deduplication (same query key = single request)
 * - Stale-while-revalidate caching strategy
 * - Automatic retries with exponential backoff
 * - Optimistic updates for mutations
 * - Performance optimizations
 */

import {
  QueryClient,
  QueryClientProvider,
  type DefaultOptions,
} from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import React, { type ReactNode } from 'react';

// ============================================================================
// Query Client Default Options
// ============================================================================

const defaultQueryOptions: DefaultOptions['queries'] = {
  // Data is considered fresh for 5 minutes
  staleTime: 5 * 60 * 1000,
  // Keep cached data for 10 minutes after last use
  gcTime: 10 * 60 * 1000,
  // Retry failed requests 3 times with exponential backoff
  retry: 3,
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  // Refetch on window focus (user returns to app)
  refetchOnWindowFocus: true,
  // Refetch when network reconnects
  refetchOnReconnect: true,
  // Don't refetch on mount if data is fresh
  refetchOnMount: false,
  // Enable suspense for better loading states (optional)
  // suspense: false,
};

const defaultMutationOptions: DefaultOptions['mutations'] = {
  // Retry mutations once (for transient network issues)
  retry: 1,
  retryDelay: 1000,
};

// ============================================================================
// Query Client Configuration
// ============================================================================

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: defaultQueryOptions,
      mutations: defaultMutationOptions,
    },
  });
}

// Singleton instance for the app
let queryClientInstance: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (!queryClientInstance) {
    queryClientInstance = createQueryClient();
  }
  return queryClientInstance;
}

// ============================================================================
// Query Keys - Centralized key management for cache invalidation
// ============================================================================

/**
 * Query Keys - Centralized key management for cache invalidation
 *
 * Follows hierarchical pattern: [entity, identifier, sub-identifier]
 * Example: ['projects', 'list', { search: 'foo' }]
 *
 * Benefits:
 * - Type-safe query keys
 * - Easy cache invalidation
 * - Consistent key structure across the app
 */
export const queryKeys = {
  // iTwins / Projects
  itwins: {
    all: ['itwins'] as const,
    list: (subClass?: string) => [...queryKeys.itwins.all, 'list', subClass] as const,
    detail: (id: string | null) => [...queryKeys.itwins.all, 'detail', id] as const,
    favorites: () => [...queryKeys.itwins.all, 'favorites'] as const,
    recents: () => [...queryKeys.itwins.all, 'recents'] as const,
  },

  // Projects (REST API)
  projects: {
    all: ['projects'] as const,
    list: (filter?: object) => [...queryKeys.projects.all, 'list', filter] as const,
    detail: (id: string | null) => [...queryKeys.projects.all, 'detail', id] as const,
    favorites: () => [...queryKeys.projects.all, 'favorites'] as const,
    recents: () => [...queryKeys.projects.all, 'recents'] as const,
  },

  // iModels
  iModels: {
    all: ['iModels'] as const,
    list: (projectId: string) => [...queryKeys.iModels.all, 'list', projectId] as const,
    detail: (iModelId: string) =>
      [...queryKeys.iModels.all, 'detail', iModelId] as const,
  },

  // Briefcases
  briefcases: {
    all: ['briefcases'] as const,
    list: (iModelId: string) => [...queryKeys.briefcases.all, 'list', iModelId] as const,
  },

  // Changesets
  changesets: {
    all: ['changesets'] as const,
    list: (iModelId: string) => [...queryKeys.changesets.all, 'list', iModelId] as const,
  },

  // Named Versions
  namedVersions: {
    all: ['namedVersions'] as const,
    list: (iModelId: string) => [...queryKeys.namedVersions.all, 'list', iModelId] as const,
  },

  // User
  user: {
    all: ['user'] as const,
    current: () => [...queryKeys.user.all, 'current'] as const,
    permissions: (iModelId: string) => [...queryKeys.user.all, 'permissions', iModelId] as const,
  },

  // Conflict Detection
  conflicts: {
    all: ['conflicts'] as const,
    check: (iModelId: string, source: string, target: string) =>
      [...queryKeys.conflicts.all, 'check', iModelId, source, target] as const,
  },
};

// ============================================================================
// Query Provider Component
// ============================================================================

interface QueryProviderProps {
  children: ReactNode;
}

/**
 * Query Provider wrapper component
 *
 * Usage: Wrap your app with this provider in main.tsx
 *
 * <QueryProvider>
 *   <App />
 * </QueryProvider>
 */
export function QueryProvider({ children }: QueryProviderProps): React.ReactElement {
  // Use useState to ensure QueryClient is created once per app instance
  const [queryClient] = React.useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* DevTools only in development */}
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}

// Export query client for advanced use cases (prefetching, invalidation)
export { queryClientInstance as queryClient };

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Invalidate all queries for a specific entity
 * Useful after mutations that affect multiple queries
 */
export function invalidateEntity(
  queryClient: QueryClient,
  entity: keyof typeof queryKeys
): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: queryKeys[entity].all,
  });
}

/**
 * Prefetch a query
 * Useful for route preloading
 */
export function prefetchQuery<T>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  queryFn: () => Promise<T>
): Promise<void> {
  return queryClient.prefetchQuery({
    queryKey,
    queryFn,
    staleTime: (defaultQueryOptions?.staleTime ?? 5 * 60 * 1000) as number,
  });
}
