/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useState } from 'react';
import {
  type ConflictDetectionResult,
  type ConflictResolution,
  type DetectConflictsRequest,
  OpenCloudRpcInterface,
  type ResolveConflictsRequest,
  type ResolveConflictsResult,
} from '@luban-cad/shared';

export interface UseConflictDetectionOptions {
  iModelId: string;
  briefcaseId: number;
}

export interface UseConflictDetectionReturn {
  detectionResult: ConflictDetectionResult | null;
  isDetecting: boolean;
  isResolving: boolean;
  error: Error | null;
  detectConflicts: (targetChangesetId: string) => Promise<ConflictDetectionResult | null>;
  resolveConflicts: (resolutions: Record<string, ConflictResolution>) => Promise<ResolveConflictsResult | null>;
  hasLocalChanges: () => Promise<boolean>;
  clearDetection: () => void;
}

export function useConflictDetection(options: UseConflictDetectionOptions): UseConflictDetectionReturn {
  const { iModelId, briefcaseId } = options;

  const [detectionResult, setDetectionResult] = useState<ConflictDetectionResult | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const detectConflicts = useCallback(async (targetChangesetId: string): Promise<ConflictDetectionResult | null> => {
    setIsDetecting(true);
    setError(null);

    try {
      const rpc = OpenCloudRpcInterface.getClient();
      const request: DetectConflictsRequest = {
        iModelId,
        briefcaseId,
        targetChangesetId,
      };

      const result = await rpc.detectConflicts(request);
      setDetectionResult(result);
      return result;
    } catch (err) {
      const detectionError = err instanceof Error ? err : new Error('Failed to detect conflicts');
      setError(detectionError);
      return null;
    } finally {
      setIsDetecting(false);
    }
  }, [iModelId, briefcaseId]);

  const resolveConflicts = useCallback(async (
    resolutions: Record<string, ConflictResolution>
  ): Promise<ResolveConflictsResult | null> => {
    setIsResolving(true);
    setError(null);

    try {
      const rpc = OpenCloudRpcInterface.getClient();
      const request: ResolveConflictsRequest = {
        iModelId,
        briefcaseId,
        resolutions,
      };

      const result = await rpc.resolveConflicts(request);
      return result;
    } catch (err) {
      const resolveError = err instanceof Error ? err : new Error('Failed to resolve conflicts');
      setError(resolveError);
      return null;
    } finally {
      setIsResolving(false);
    }
  }, [iModelId, briefcaseId]);

  const hasLocalChanges = useCallback(async (): Promise<boolean> => {
    try {
      const rpc = OpenCloudRpcInterface.getClient();
      return await rpc.hasLocalChanges(iModelId, briefcaseId);
    } catch {
      return false;
    }
  }, [iModelId, briefcaseId]);

  const clearDetection = useCallback(() => {
    setDetectionResult(null);
    setError(null);
  }, []);

  return {
    detectionResult,
    isDetecting,
    isResolving,
    error,
    detectConflicts,
    resolveConflicts,
    hasLocalChanges,
    clearDetection,
  };
}

export default useConflictDetection;
