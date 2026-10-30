import { useQuery } from '@tanstack/react-query';
import type { NamedVersion } from '@clients/imodels/ImodelsClient.js';
import { ImodelsClient } from '@clients/imodels/ImodelsClient.js';

export interface UseNamedVersionsResult {
  namedVersions: NamedVersion[];
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

export function useNamedVersions(iModelId: string | null): UseNamedVersionsResult {
  const query = useQuery({
    queryKey: ['part-studio', 'named-versions', iModelId],
    queryFn: () => new ImodelsClient().listNamedVersions(iModelId ?? ''),
    enabled: !!iModelId,
  });
  return {
    namedVersions: query.data ?? [],
    isLoading: query.isPending,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
