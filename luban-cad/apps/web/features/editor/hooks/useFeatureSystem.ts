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
  type LubanTopologyId,
  type PreviewResult,
} from '@luban-cad/shared';

/** 写租约续期间隔（与后端 WriteLease 租期配套：10s 一跳） */
const LEASE_RENEW_INTERVAL_MS = 10_000;
/** op 派发前的租约自愈窗口：须大于服务端 WriteLease 30s TTL（陈旧租约自然过期），留余量。 */
const LEASE_OP_ACQUIRE_BUDGET_MS = 35_000;
const LEASE_OP_ACQUIRE_RETRY_MS = 2_000;
/** 边引用解析超时（⑩ 残留加固）：rpc-over-ipc 无传输级超时，特征级兜底窗口。 */
const RESOLVE_EDGE_REF_TIMEOUT_MS = 15_000;
/** 面引用解析超时（RW2-T7）：同边引用兜底口径。 */
const RESOLVE_FACE_REF_TIMEOUT_MS = 15_000;

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
  /** RW2-T7：拾取面 → 持久拓扑 id（shell faces 表单值寻址端点） */
  resolveFaceRef(elementId: string, subEntityId: number): Promise<{ ok: boolean; ref?: LubanTopologyId; error?: string }>;
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
    const client = LubanFeatureRpcInterface.getClient();
    const sessionId = sessionIdRef.current;
    // 租约自愈（2026-10-11）：前页/重载残留的陈旧租约要等服务端 30s TTL 自然过期，而 op
    // 是一次性派发——落在陈旧窗口内即被拒且无人重放（renew 定时器只续租约，不重放 op；
    // e2e sketch「暂无实体」同位两轮失败即此：features 前页租约未过期，sketch 首个
    // insertSketch 被一次性拒绝）。op 前显式重取（同 sessionId 幂等刷新 TTL），未得手则
    // 有限重试直至陈旧租约自然过期；真实并发持有者（活页 10s renew 永不过期）在重试
    // 上限后照常拿到 holder 报错。
    const deadline = Date.now() + LEASE_OP_ACQUIRE_BUDGET_MS;
    let holder: string | undefined;
    for (;;) {
      try {
        const lease = await client.acquireWriteLease(connectionKey, sessionId);
        if (lease.ok) break;
        holder = lease.holder;
      } catch {
        holder = undefined; // 网络抖动：窗口内照常重试
      }
      if (Date.now() >= deadline) {
        return { ok: false, error: holder ? `写租约被 ${holder} 持有` : '写租约获取失败' };
      }
      await new Promise((resolve) => setTimeout(resolve, LEASE_OP_ACQUIRE_RETRY_MS));
    }
    const result = await client.applyFeatureOp(connectionKey, op, sessionId);
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
      // ⑩ 残留加固（2026-10-11）：rpc-over-ipc 无传输级超时——悬挂形态（backlog ⑩，如
      // 陈旧产物×新 native 的 req=1/resp=0）下前端 promise 永悬零反馈。特征级兜底：与
      // 超时竞速，超时转 ok:false + 可重拾取文案（拾取会话已自然完成，重开「从视图选边」
      // 即可重试）。迟到回包的拒绝挂 no-op catch 防 unhandledrejection。
      const raw = LubanFeatureRpcInterface
        .getClient()
        .resolveEdgeRef(connectionKey, elementId, subEntityId);
      void raw.catch(() => undefined);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          raw,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`边引用解析超时（>${RESOLVE_EDGE_REF_TIMEOUT_MS / 1000}s）——服务端无应答，可重新拾取该边`)),
              RESOLVE_EDGE_REF_TIMEOUT_MS,
            );
          }),
        ]);
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      } finally {
        clearTimeout(timer);
      }
    },
    [connectionKey],
  );

  /** RW2-T7：面引用寻址——同 resolveEdgeRef 的兜底纪律（超时竞速 + 迟到 no-op catch）。 */
  const resolveFaceRef = useCallback(
    async (elementId: string, subEntityId: number): Promise<{ ok: boolean; ref?: LubanTopologyId; error?: string }> => {
      if (!connectionKey) return { ok: false, error: '未连接 iModel' };
      const raw = LubanFeatureRpcInterface
        .getClient()
        .resolveFaceRef(connectionKey, elementId, subEntityId);
      void raw.catch(() => undefined);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          raw,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`面引用解析超时（>${RESOLVE_FACE_REF_TIMEOUT_MS / 1000}s）——服务端无应答，可重新拾取该面`)),
              RESOLVE_FACE_REF_TIMEOUT_MS,
            );
          }),
        ]);
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      } finally {
        clearTimeout(timer);
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
    resolveFaceRef,
  };
}
