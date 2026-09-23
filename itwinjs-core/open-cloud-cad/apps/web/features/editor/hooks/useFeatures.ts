/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useState } from 'react';
import { type BriefcaseConnection, IpcApp } from '@itwin/core-frontend';
import { type CadFeatureRecord, openCloudIpcChannel, type OpenCloudIpcInterface } from '@open-cloud-cad/shared';

export interface UseFeaturesResult {
  features: CadFeatureRecord[];
  isLoading: boolean;
  error: string | null;
  ensureSchema: () => Promise<void>;
  createFeature: (featureType: string, params?: Record<string, unknown>) => Promise<void>;
  deleteFeature: (featureId: string) => Promise<void>;
  updateFeature: (featureId: string, updates: { featureType?: string; params?: Record<string, unknown> }) => Promise<void>;
  suppressFeature: (featureId: string, suppressed: boolean) => Promise<void>;
  reorderFeature: (featureId: string, newOrder: number) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Hook for managing CAD feature history via IPC.
 * Requires an open BriefcaseConnection.
 */
export function useFeatures(connection: BriefcaseConnection | null): UseFeaturesResult {
  const [features, setFeatures] = useState<CadFeatureRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getProxy = (): ReturnType<typeof IpcApp.makeIpcProxy<OpenCloudIpcInterface>> =>
    IpcApp.makeIpcProxy<OpenCloudIpcInterface>(openCloudIpcChannel);

  // Get the fileName from the connection's key
  // Note: BriefcaseConnection is opened with key: fileName in useBriefcaseConnection
  const getFileName = useCallback((): string => {
    if (!connection) throw new Error('No briefcase connection');
    return connection.key;
  }, [connection]);

  const ensureSchema = useCallback(async () => {
    if (!connection) return;
    const proxy = getProxy();
    await proxy.ensureCadSchema(getFileName());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]);

  const refresh = useCallback(async () => {
    if (!connection) { setFeatures([]); return; }
    setIsLoading(true);
    setError(null);
    try {
      const proxy = getProxy();
      const list = await proxy.listFeatures(getFileName());
      setFeatures(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]);

  const createFeature = useCallback(async (featureType: string, params: Record<string, unknown> = {}) => {
    if (!connection) return;
    setError(null);
    try {
      const proxy = getProxy();
      await proxy.ensureCadSchema(getFileName());
      await proxy.createFeature(getFileName(), featureType, JSON.stringify(params));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, refresh]);

  const deleteFeature = useCallback(async (featureId: string) => {
    if (!connection) return;
    setError(null);
    try {
      const proxy = getProxy();
      await proxy.deleteFeature(getFileName(), featureId);
      setFeatures((prev) => prev.filter((f) => f.id !== featureId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]);

  const updateFeature = useCallback(async (featureId: string, updates: { featureType?: string; params?: Record<string, unknown> }) => {
    if (!connection) return;
    setError(null);
    try {
      const proxy = getProxy();
      await proxy.updateFeature(getFileName(), featureId, {
        featureType: updates.featureType,
        params: updates.params ? JSON.stringify(updates.params) : undefined,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, refresh]);

  const suppressFeature = useCallback(async (featureId: string, suppressed: boolean) => {
    if (!connection) return;
    setError(null);
    try {
      const proxy = getProxy();
      await proxy.setFeatureSuppressed(getFileName(), featureId, suppressed);
      setFeatures((prev) => prev.map((f) =>
        f.id === featureId ? { ...f, suppressed } : f
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]);

  const reorderFeature = useCallback(async (featureId: string, newOrder: number) => {
    if (!connection) return;
    setError(null);
    try {
      const proxy = getProxy();
      await proxy.reorderFeature(getFileName(), featureId, newOrder);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, refresh]);

  // Auto-refresh when connection changes
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { features, isLoading, error, ensureSchema, createFeature, deleteFeature, updateFeature, suppressFeature, reorderFeature, refresh };
}
