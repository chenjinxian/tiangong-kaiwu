/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useBriefcaseConnection（M4 Task 1）：可写编辑连接 hook——语义逐行移植自
 * 旧应用查看器包的 `useBriefcaseConnection.ts`（2026-10-22；旧包已删除）：
 * - 打开流：`lubanIpc.downloadBriefcase(iTwinId, iModelId, readonly)`（后端定位/下载
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
import { IpcSession, RpcManager } from '@itwin/core-common';
import { lubanIpcChannel, type LubanIpcInterface } from '@luban-cad/shared';

export interface UseBriefcaseConnectionOptions {
  iTwinId: string;
  iModelId: string;
  /** 只读打开（不占 briefcase 写位） */
  readonly?: boolean;
}

/** IPC 存活探针上限：后端重启后旧 WebSocket 已死但 IpcApp.isValid 仍为真。 */
const IPC_LIVENESS_TIMEOUT_MS = 8_000;

/**
 * `/ipc` WebSocket 存活探针。
 *
 * 页面级 host 复用同一条 WebSocket（display-test-app 口径）；后端 MS 重启后
 * `IpcApp.isValid`/`IpcSession.active` 依旧为真，`downloadBriefcase` 会向已死
 * socket 发请求并**永久悬挂**（2026-11-10 真栈复现：页面停在“正在打开文档…”）.
 * 用轻量、与 iModel 无关的官方 IPC `queryConcurrency` 探活：存活则立即返回；
 * 8s 无响应则按连接已断开报错，让错误面出现“刷新页面”恢复入口。
 */
async function assertIpcAlive(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      IpcApp.appFunctionIpc.queryConcurrency('io'),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(
            '建模服务连接已断开（/ipc WebSocket 无响应，后端可能已重启）。请刷新页面重新连接。',
          )),
          IPC_LIVENESS_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
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

      // IpcApp 就绪门（2026-10-26 生产 bundle 实证竞态）：头注「前置：已 startup」
      // 此前只靠 useViewport 挂载效应序 + 权限查询耗时「偶然」成立——dev :5300
      // 一直绿，生产 bundle（:5301）权限解析快于 WS 握手时 downloadBriefcase 先于
      // IpcApp._ipc 就位，makeIpcProxy 代理首调即抛 "Expected value to be defined"
      // 且 error 终态不可自愈。显式轮询 isValid（60s 封顶：冷会话含 WS+原生库
      // 装载，比 30s 稳；acquireViewer 由 useViewport 并行推进，此处只等不启）。
      // P2.8 reload 实证：`IpcApp.isValid` 在 LocalhostIpcApp.startup 首句即真，
      // 但 `IpcSession.start` 要等 `IpcApp.startup` 完成才把 RPC 拦截到 IPC——
      // 两者之间打开连接会让 useEditorSession/usePartStudios 的 getClient 仍绑定
      // BentleyCloud HTTP（reload 实测 acquireWriteLease/listPartStudios/queryRows
      // POST /LubanCAD/... → SPA origin 404；空列表进而自动建第二个默认 Part Studio）。
      // 等两者都就绪再下载/开连接，所有后续 RPC 恒走 IPC。
      for (let i = 0; i < 600 && !(IpcApp.isValid && IpcSession.active); i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (!IpcApp.isValid || !IpcSession.active) {
        setError(new Error('LocalhostIpcApp/IpcSession startup 未就绪（60s）——检查 /ipc WebSocket 连通'));
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // 存活探针（2026-11-10）：isValid/IpcSession.active 不能证明 socket
        // 仍活着——后端重启后二者残留为真，downloadBriefcase 会永久悬挂。
        await assertIpcAlive();
        if (cancelled) return;

        // Step 1：后端定位（或下载）briefcase
        const lubanIpc = IpcApp.makeIpcProxy<LubanIpcInterface>(lubanIpcChannel);
        const result = await lubanIpc.downloadBriefcase(iTwinId, iModelId, readonly);

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

        // P2.8 reload 修复：为字符串键 RPC（注册表 listPartStudios 等）设置 RPC
        // 路由 fallback token。BriefcaseConnection.openFile 的 IPC 路径不像
        // CheckpointConnection 那样调用 RpcManager.setIModel；若注册表 RPC 在首个
        // fallback token 出现前发出，BentleyCloudRpcProtocol.supplyPathForOperation
        // 会抛 "Invalid iModelToken for RPC operation request"（reload 时序彩票）。
        // 必须在把 connection 暴露给 React 之前同步设置。
        RpcManager.setIModel(conn);

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
