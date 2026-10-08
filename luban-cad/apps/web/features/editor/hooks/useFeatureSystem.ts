/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import {
  type FeatureFormModel,
  type FeatureOp,
  type FeatureOpResult,
  type FeatureTreeEntry,
  type FilletEdgeRef,
  LubanFeatureRpcInterface,
  type PreviewResult,
} from '@luban-cad/shared';

/** 写租约续期间隔（与后端 WriteLease 租期配套：10s 一跳） */
const LEASE_RENEW_INTERVAL_MS = 10_000;

export interface UseFeatureSystem {
  tree: FeatureTreeEntry[];
  loading: boolean;
  error?: string;
  formModel?: FeatureFormModel;
  leaseOk: boolean;
  refresh(): Promise<void>;
  /** 成功后自动 refresh；失败仅返回错误结果不刷新 */
  applyOp(op: FeatureOp): Promise<FeatureOpResult>;
  previewOp(op: FeatureOp): Promise<PreviewResult | undefined>;
  resolveEdgeRef(elementId: string, subEntityId: number): Promise<{ ok: boolean; ref?: FilletEdgeRef; error?: string }>;
}

/**
 * 特征系统中枢 hook（M3-a）：特征树 + 写租约 + 操作/预览/边引用寻址 + 表单模型。
 *
 * - `enabled` 默认 `!!connection && !connection.isReadonly`，调用方可用 `opts.enabled` 覆盖
 *   （editability 由调用者裁决，hook 只按裁决结果动作）。
 * - 写租约：enabled 时 acquire，10s 间隔 renew，unmount/失能 release。
 *   租约被拒 → `leaseOk:false`，UI 降级只读，但读树不被阻断。
 * - 读树用 `connection.key`；`connection.txns.onCommitted` 触发 refresh
 *   （外部 changeset 亦刷新，为 T5.5 留口）。
 * - `formModel` 惰性取一次（每 connection 缓存，refresh 不重复取）。
 */
export function useFeatureSystem(
  connection: BriefcaseConnection | undefined,
  opts?: { enabled?: boolean },
): UseFeatureSystem {
  const enabled = opts?.enabled ?? (!!connection && !connection.isReadonly);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const connectionKey = connection?.key;

  const [tree, setTree] = useState<FeatureTreeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [formModel, setFormModel] = useState<FeatureFormModel | undefined>(undefined);
  const [leaseOk, setLeaseOk] = useState(false);

  const refresh = useCallback(async () => {
    if (!connectionKey) {
      setTree([]);
      return;
    }
    setLoading(true);
    try {
      const entries = await LubanFeatureRpcInterface.getClient().getFeatureTree(connectionKey);
      setTree(entries);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [connectionKey]);

  // 初始/换连接加载特征树
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 外部 changeset / 其他编辑通道提交后刷新（为 T5.5 留口）
  useEffect(() => {
    if (!connection) return;
    const listener = () => {
      void refresh();
    };
    connection.txns.onCommitted.addListener(listener);
    return () => {
      connection.txns.onCommitted.removeListener(listener);
    };
  }, [connection, refresh]);

  // 写租约生命周期：acquire → 10s renew → release（unmount/失能）
  useEffect(() => {
    if (!connectionKey || !enabled) return;
    const client = LubanFeatureRpcInterface.getClient();
    const sessionId = sessionIdRef.current;
    let disposed = false;

    const acquire = async () => {
      try {
        const result = await client.acquireWriteLease(connectionKey, sessionId);
        if (!disposed) setLeaseOk(result.ok);
      } catch {
        if (!disposed) setLeaseOk(false);
      }
    };

    void acquire();
    const renewTimer = setInterval(() => {
      void acquire();
    }, LEASE_RENEW_INTERVAL_MS);

    return () => {
      disposed = true;
      clearInterval(renewTimer);
      setLeaseOk(false);
      void client.releaseWriteLease(connectionKey, sessionId).catch(() => undefined);
    };
  }, [connectionKey, enabled]);

  // 表单模型：每 connection 惰性取一次（不阻塞首屏，refresh 不重复取）
  const formModelFetchedForRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!connectionKey) return;
    if (formModelFetchedForRef.current === connectionKey) return;
    formModelFetchedForRef.current = connectionKey;
    let cancelled = false;
    LubanFeatureRpcInterface.getClient()
      .getFeatureFormModel(connectionKey)
      .then((model) => {
        if (!cancelled) setFormModel(model);
      })
      .catch(() => {
        formModelFetchedForRef.current = undefined; // 失败允许下次 effect 重试
      });
    return () => {
      cancelled = true;
    };
  }, [connectionKey]);

  const applyOp = useCallback(async (op: FeatureOp): Promise<FeatureOpResult> => {
    if (!connectionKey) return { ok: false, error: '未连接 iModel' };
    const result = await LubanFeatureRpcInterface
      .getClient()
      .applyFeatureOp(connectionKey, op, sessionIdRef.current);
    if (result.ok) await refresh();
    return result;
  }, [connectionKey, refresh]);

  const previewOp = useCallback(async (op: FeatureOp): Promise<PreviewResult | undefined> => {
    if (!connectionKey) return undefined;
    try {
      return await LubanFeatureRpcInterface
        .getClient()
        .previewFeatureOp(connectionKey, op, sessionIdRef.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return undefined;
    }
  }, [connectionKey]);

  const resolveEdgeRef = useCallback(
    async (elementId: string, subEntityId: number): Promise<{ ok: boolean; ref?: FilletEdgeRef; error?: string }> => {
      if (!connectionKey) return { ok: false, error: '未连接 iModel' };
      try {
        return await LubanFeatureRpcInterface
          .getClient()
          .resolveEdgeRef(connectionKey, elementId, subEntityId);
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    [connectionKey],
  );

  return {
    tree,
    loading,
    error,
    formModel,
    leaseOk,
    refresh,
    applyOp,
    previewOp,
    resolveEdgeRef,
  };
}
