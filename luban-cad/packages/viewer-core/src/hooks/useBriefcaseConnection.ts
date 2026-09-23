/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useBriefcaseConnection — React hook for read-write iModel editing
 *
 * Opens a BriefcaseConnection (writable) via WebSocket IPC.
 * Requires LocalhostIpcApp to have been started (handled by WebInitializer).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { BriefcaseConnection, IpcApp } from '@itwin/core-frontend';
import { openCloudIpcChannel, type OpenCloudIpcInterface } from '@open-cloud-cad/shared';

export interface UseBriefcaseConnectionOptions {
  iTwinId: string;
  iModelId: string;
  /** Open in read-only mode (no briefcase acquisition) */
  readonly?: boolean;
}

export interface UseBriefcaseConnectionResult {
  /** The open writable connection, or null if not yet ready */
  connection: BriefcaseConnection | null;
  isLoading: boolean;
  error: Error | null;
  /** Save pending changes locally. No-op if connection is null. */
  saveChanges: (description?: string) => Promise<void>;
  /** Push local changesets to iModelHub (pulls first if needed). */
  pushChanges: (description: string) => Promise<void>;
  /** Pull latest changesets from iModelHub. */
  pullChanges: () => Promise<void>;
}

/**
 * Opens an iModel in read-write (briefcase) mode via WebSocket IPC.
 *
 * Flow:
 *   1. openCloud.downloadBriefcase(iTwinId, iModelId) — backend locates/downloads .bim
 *   2. BriefcaseConnection.openFile({ fileName }) — opens the writable connection
 *      3. Returns save/push/pull helpers
 *
 * The connection is closed automatically on unmount or page unload.
 *
 * Pass `null` to disable (e.g., when not in edit mode).
 * No IPC calls are made when options is null.
 */
export function useBriefcaseConnection(
  options: UseBriefcaseConnectionOptions | null
): UseBriefcaseConnectionResult {
  const [connection, setConnection] = useState<BriefcaseConnection | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Keep ref to connection for cleanup
  const connectionRef = useRef<BriefcaseConnection | null>(null);
  // Track closing state to prevent race conditions
  const isClosingRef = useRef(false);

  // Extract to outer scope so useEffect dependency array can reference them
  const iTwinId = options?.iTwinId;
  const iModelId = options?.iModelId;
  const readonly = options?.readonly;

  // Cleanup function - synchronously marks closing, then async closes
  const cleanup = useCallback(async (): Promise<void> => {
    if (isClosingRef.current) {
      // Already closing, wait for it
      while (isClosingRef.current) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return;
    }

    const conn = connectionRef.current;
    if (!conn) return;

    isClosingRef.current = true;
    connectionRef.current = null;
    setConnection(null);

    try {
      await conn.close();
      // eslint-disable-next-line no-console
      console.log('[useBriefcaseConnection] Connection closed successfully');
    } catch (err) {
      // Ignore close errors (file may already be closed)
      // eslint-disable-next-line no-console
      console.warn('[useBriefcaseConnection] Error closing connection:', err);
    } finally {
      isClosingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // If options is null (disabled), close any open connection and return
    if (!iTwinId || !iModelId) {
      void cleanup();
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const open = async (): Promise<void> => {
      // Wait for any existing cleanup to complete
      if (isClosingRef.current) {
        while (isClosingRef.current) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      setIsLoading(true);
      setError(null);

      try {
        // Step 1: Download (or locate cached) briefcase on backend
        const openCloud = IpcApp.makeIpcProxy<OpenCloudIpcInterface>(openCloudIpcChannel);
        const result = await openCloud.downloadBriefcase(iTwinId, iModelId, readonly);

        if (cancelled) return;

        // Step 2: Open connection (triggers openBriefcase IPC automatically)
        // Use fileName as key so backend can find it by filename
        const conn = await BriefcaseConnection.openFile({
          fileName: result.fileName,
          readonly: readonly ?? false,
          key: result.fileName, // Use fileName as key for findByFilename compatibility
        });

        if (cancelled) {
          void conn.close();
          return;
        }

        connectionRef.current = conn;
        setConnection(conn);
        // eslint-disable-next-line no-console
        console.log('[useBriefcaseConnection] Connection opened:', result.fileName);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[useBriefcaseConnection] Failed to open connection:', err);
        if (!cancelled) {
          const error = err instanceof Error ? err : new Error(String(err));
          setError(error);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void open();

    return () => {
      cancelled = true;
      void cleanup();
    };
  }, [iTwinId, iModelId, cleanup]);

  // Handle page unload - close connection synchronously to prevent "key in use" errors
  useEffect(() => {
    const handleBeforeUnload = (): void => {
      const conn = connectionRef.current;
      if (conn) {
        // Synchronously mark as closing to prevent re-entry
        connectionRef.current = null;
        // Fire and forget close - we can't await in beforeunload
        void conn.close().catch(() => undefined);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const saveChanges = useCallback(async (description?: string): Promise<void> => {
    if (connectionRef.current) {
      await connectionRef.current.saveChanges(description);
    }
  }, []);

  const pushChanges = useCallback(async (description: string): Promise<void> => {
    if (connectionRef.current) {
      await connectionRef.current.pushChanges(description);
    }
  }, []);

  const pullChanges = useCallback(async (): Promise<void> => {
    if (connectionRef.current) {
      await connectionRef.current.pullChanges();
    }
  }, []);

  return { connection, isLoading, error, saveChanges, pushChanges, pullChanges };
}
