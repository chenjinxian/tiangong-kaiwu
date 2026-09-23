import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { briefcaseApi, DeviceInfo } from '../../../shared/services/briefcases/client.js';

interface UseBriefcaseOptions {
  /** Auto acquire briefcase if user has edit permission and no active briefcase */
  autoAcquire?: boolean;
}

export function useBriefcase(imodelId: string, hookOptions: UseBriefcaseOptions = {}) {
  const { autoAcquire = false } = hookOptions;
  const queryClient = useQueryClient();
  const queryKey = ['briefcase', imodelId];

  // Get current briefcase
  const { data: briefcase, isLoading } = useQuery({
    queryKey,
    queryFn: async () => briefcaseApi.getByImodel(imodelId),
    staleTime: 30000,
  });

  // Acquire briefcase mutation
  const acquireMutation = useMutation({
    mutationFn: async () => {
      const deviceInfo: DeviceInfo = {
        name: navigator.userAgent,
        platform: 'web',
        version: '1.0.0',
      };
      return briefcaseApi.acquire(imodelId, { deviceInfo });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  // Auto acquire for owners/editors with canEdit permission
  useEffect(() => {
    if (
      autoAcquire &&
      !isLoading &&
      !briefcase &&
      !acquireMutation.isPending
    ) {
      acquireMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAcquire, isLoading, briefcase, acquireMutation.isPending]);

  // Release briefcase mutation
  const releaseMutation = useMutation({
    mutationFn: async (releaseOptions?: { pushChanges?: boolean; changeDescription?: string }) => {
      if (!briefcase) {
        throw new Error('No briefcase to release');
      }
      return briefcaseApi.release(briefcase.id, releaseOptions);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    briefcase,
    isLoading,
    canEdit: !!briefcase && briefcase.status === 'active',
    acquire: acquireMutation.mutate,
    release: releaseMutation.mutate,
    isAcquiring: acquireMutation.isPending,
    isReleasing: releaseMutation.isPending,
    acquireError: acquireMutation.error,
    releaseError: releaseMutation.error,
  };
}

export function useBriefcaseList(options?: { status?: string }) {
  return useQuery({
    queryKey: ['briefcases', options],
    queryFn: async () => briefcaseApi.list(options),
    staleTime: 60000,
  });
}

interface ReleaseDialogState {
  isOpen: boolean;
  hasPendingChanges: boolean;
}

export function useReleaseDialog() {
  const [state, setState] = useState<ReleaseDialogState>({
    isOpen: false,
    hasPendingChanges: false,
  });

  const open = (hasPendingChanges = false) => {
    setState({ isOpen: true, hasPendingChanges });
  };

  const close = () => {
    setState((s) => ({ ...s, isOpen: false }));
  };

  return {
    isOpen: state.isOpen,
    hasPendingChanges: state.hasPendingChanges,
    open,
    close,
  };
}
