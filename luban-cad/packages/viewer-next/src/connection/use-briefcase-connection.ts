/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useBriefcaseConnection（web-next M4 Task 1）：可写编辑连接 hook——语义逐行移植自
 * 旧应用 `packages/viewer-core/src/hooks/useBriefcaseConnection.ts`（2026-10-22）：
 * - 打开流：`openCloud.downloadBriefcase(iTwinId, iModelId, readonly)`（后端定位/下载
 *   .bim）→ `BriefcaseConnection.openFile({ fileName, readonly, key: fileName })`
 *   （key=fileName 供后端 findByFilename 兼容；openFile 自身触发 openBriefcase IPC）；
 * - options=null 短路：零 IPC，并关既有连接（权限未载前防竞态的调用姿态与旧应用一致）；
 * - 关闭纪律：isClosing 重入保护（连卸两次只关一次，重入方 50ms 轮询等首次关完）；
 *   卸载 cleanup + beforeunload 同步置空引用后 fire-and-forget close（防「key in use」）；
 * - 出口代理 saveChanges/pushChanges/pullChanges（connection 未就绪时 no-op 不抛）。
 * 前置：LocalhostIpcApp 已 startup（host/web-initializer 的 acquireViewer 负责）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { BriefcaseConnection, IpcApp } from '@itwin/core-frontend';
import { openCloudIpcChannel, type OpenCloudIpcInterface } from '@luban-cad/shared';

export interface UseBriefcaseConnectionOptions {
  iTwinId: string;
  iModelId: string;
  /** 只读打开（不占 briefcase 写位） */
  readonly?: boolean;
}

export interface UseBriefcaseConnectionResult {
  /** 已打开的可写连接；未就绪为 null */
  connection: BriefcaseConnection | null;
  isLoading: boolean;
  error: Error | null;
  /** 本地保存未提交变更；connection 未就绪时 no-op */
  saveChanges: (description?: string) => Promise<void>;
  /** 推送本地 changeset 到 iModelHub（需要时先 pull） */
  pushChanges: (description: string) => Promise<void>;
  /** 从 iModelHub 拉取最新 changeset */
  pullChanges: () => Promise<void>;
}

export function useBriefcaseConnection(
  options: UseBriefcaseConnectionOptions | null
): UseBriefcaseConnectionResult {
  const [connection, setConnection] = useState<BriefcaseConnection | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // 清理用的连接引用与关团重入哨兵（ref 持有，避开 effect 依赖）
  const connectionRef = useRef<BriefcaseConnection | null>(null);
  const isClosingRef = useRef(false);

  // 提到外层作用域，effect 依赖数组才能引用
  const iTwinId = options?.iTwinId;
  const iModelId = options?.iModelId;
  const readonly = options?.readonly;

  // 清理：同步置关团哨兵防重入，再异步关连接
  const cleanup = useCallback(async (): Promise<void> => {
    if (isClosingRef.current) {
      // 已在关闭中，等它完成
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
      // 关闭失败忽略（文件可能已关）
      // eslint-disable-next-line no-console
      console.warn('[useBriefcaseConnection] Error closing connection:', err);
    } finally {
      isClosingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // options 为 null（禁用）时关既有连接并短路——不做任何 IPC
    if (!iTwinId || !iModelId) {
      void cleanup();
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const open = async (): Promise<void> => {
      // 等既有清理完成再开
      if (isClosingRef.current) {
        while (isClosingRef.current) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      setIsLoading(true);
      setError(null);

      try {
        // Step 1：后端定位（或下载）briefcase
        const openCloud = IpcApp.makeIpcProxy<OpenCloudIpcInterface>(openCloudIpcChannel);
        const result = await openCloud.downloadBriefcase(iTwinId, iModelId, readonly);

        if (cancelled) return;

        // Step 2：开连接（内部自动触发 openBriefcase IPC）；
        // key 用 fileName，供后端按文件名查找
        const conn = await BriefcaseConnection.openFile({
          fileName: result.fileName,
          readonly: readonly ?? false,
          key: result.fileName,
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
          setError(err instanceof Error ? err : new Error(String(err)));
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

  // 页面卸载：同步置空引用 + fire-and-forget close（beforeunload 里无法 await），
  // 防「key in use」——与旧应用同款处理
  useEffect(() => {
    const handleBeforeUnload = (): void => {
      const conn = connectionRef.current;
      if (conn) {
        connectionRef.current = null;
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
      // 上游 5.9 对 saveChanges 标记 deprecated（指向 EditCommand 方法）；本仓编辑管道
      // 硬约束事务仍走 BriefcaseTxns/saveChanges（luban-cad/CLAUDE.md 铁律 1），保持移植语义。
      // eslint-disable-next-line @typescript-eslint/no-deprecated
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
