/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useBaselineUpload - Official SDK Hook
 * Uses @itwin/imodels-client-authoring for baseline file upload
 */

import { useCallback, useState } from 'react';
import {
  getAuthorization,
  iModelsManagementClient,
} from '../../../shared/services/imodels/client.js';

interface UploadProgress {
  status: 'idle' | 'uploading' | 'processing' | 'completed' | 'error';
  progress: number; // 0-100
  error?: Error;
}

/**
 * Hook for baseline file upload
 * Note: Baseline generation is handled automatically by the webhook-agent service.
 * When an empty iModel is created, webhook-agent receives a webhook event and
 * generates the baseline file automatically. This hook is kept for future
 * manual baseline upload functionality if needed.
 */
export function useBaselineUpload() {
  const [uploadState, setUploadState] = useState<UploadProgress>({
    status: 'idle',
    progress: 0,
  });

  const uploadBaseline = useCallback(async (
    _iModelId: string,
    _file: File,
    _onProgress?: (progress: number) => void
  ) => {
    setUploadState({ status: 'uploading', progress: 0 });

    try {
      // Baseline upload is handled by webhook-agent service automatically
      // See: CLAUDE.md > Webhook-Agent Service section
      throw new Error(
        'Baseline upload is handled automatically by webhook-agent service. ' +
        'Create an empty iModel and webhook-agent will generate the baseline.'
      );
    } catch (err) {
      const uploadError = err instanceof Error ? err : new Error('Upload failed');
      setUploadState({ status: 'error', progress: 0, error: uploadError });
      throw uploadError;
    }
  }, []);

  const reset = useCallback(() => {
    setUploadState({ status: 'idle', progress: 0 });
  }, []);

  return {
    uploadBaseline,
    reset,
    ...uploadState,
  };
}

/**
 * Hook for iModel creation with baseline file
 */
export function useCreateIModelWithBaseline() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createIModelWithBaseline = useCallback(async (params: {
    iTwinId: string;
    name: string;
    description?: string;
    file: File;
  }) => {
    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Create empty iModel
      const iModel = await iModelsManagementClient.iModels.createEmpty({
        authorization: getAuthorization,
        iModelProperties: {
          iTwinId: params.iTwinId,
          name: params.name,
          description: params.description,
        },
      });

      // Step 2: Baseline is generated automatically by webhook-agent service
      // No manual upload needed - webhook-agent receives iModelCreated webhook and generates baseline
      void params.file; // File will be used when webhook-agent processes the event

      return iModel;
    } catch (err) {
      const uploadError = err instanceof Error ? err : new Error('Failed to create iModel');
      setError(uploadError);
      throw uploadError;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    createIModelWithBaseline,
    isLoading,
    error,
  };
}
