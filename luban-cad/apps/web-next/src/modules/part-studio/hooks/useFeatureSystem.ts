/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * useFeatureSystem（web-next M4 Task 5）：特征系统中枢 hook——旧应用
 * `apps/web/features/editor/hooks/useFeatureSystem.ts`（M3-a 权威源）**子集
 * 忠实移植**：特征树读取 + 写租约生命周期 + op 提交 + 事务后自动刷新。
 * 消费方：PartStudioSession 内层挂载（connection prop 所在层；T6 拉伸闭环
 * 的数据中枢——FeatureTree 真数据 + FeatureDialog 提交面）。
 *
 * 移植语义（与旧实现一致）：
 * - `enabled` 默认 `!!connection && !connection.isReadonly`，调用方可用
 *   `opts.enabled` 覆盖（editability 由调用者裁决，hook 只按裁决结果动作）；
 * - 写租约：enabled 时 acquire，10s 间隔 renew，unmount/失能 release。
 *   租约被拒 → `leaseOk:false`，UI 降级只读，但读树不被阻断；
 * - 读树用 `connection.key`；`connection.txns.onCommitted` 触发 refresh
 *   （外部 changeset 亦刷新）；
 * - applyOp 租约自愈（2026-10-11）：前页/重载残留的陈旧租约要等服务端
 *   WriteLease 30s TTL 自然过期，而 op 是一次性派发——落在陈旧窗口内即被拒
 *   且无人重放。op 前显式重取（同 sessionId 幂等刷新 TTL），未得手则有限
 *   重试（2s 一跳、35s 预算封顶）直至陈旧租约自然过期；真实并发持有者
 *  （活页 10s renew 永不过期）在预算耗尽后照常拿到 holder 报错。
 *   成功后自动 refresh；失败仅返回错误结果不刷新；
 * - 树/错误/租约布尔为 hook 本地 state（服务端态禁拷贝进 zustand——spec §3）。
 *
 * **显式延后项（特征对话框增强 backlog，勿在本版补齐）**：
 * previewOp / resolveEdgeRef / resolveFaceRef / formModel——本版 extrude 走
 * `params: { profile: [], distance }` 直提交（shared opDsl 语义「空 profile=
 * 拉伸基体」）；拾取寻址与预览回 T6+ 特征对话框增强单裁。
 * 挂账（T5 评审 Minor-4）：applyOp/getFeatureTree 沿旧源无特征级超时兜底
 *（rpc-over-ipc 悬挂零反馈）；resolve* 回迁/特征对话框增强时一并裁决。
 *
 * 与旧实现的差异（诚实登记，勿静默）：
 *  - 上列延后面（旧接口五成员不随迁）；
 *  - i18n：旧源引 `shared/i18n` 的 editor ns；web-next 词桶挂默认 translation
 *    ns（`partStudio.featureSystem.*`，见 @common/i18n），经 i18next 单例直取
 *   （AppProviders 首帧 initI18n 门 + 测试 setup 兜底，回调内取词不吃闭包旧语）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import i18next from 'i18next';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import {
  type FeatureOp,
  type FeatureOpResult,
  type FeatureTreeEntry,
  LubanFeatureRpcInterface,
} from '@luban-cad/shared';

/** 写租约续期间隔（与后端 WriteLease 租期配套：10s 一跳） */
const LEASE_RENEW_INTERVAL_MS = 10_000;
/** op 派发前的租约自愈窗口：须大于服务端 WriteLease 30s TTL（陈旧租约自然过期），留余量。 */
const LEASE_OP_ACQUIRE_BUDGET_MS = 35_000;
const LEASE_OP_ACQUIRE_RETRY_MS = 2_000;

export interface UseFeatureSystem {
  tree: FeatureTreeEntry[];
  loading: boolean;
  error?: string;
  leaseOk: boolean;
  refresh(): Promise<void>;
  /** 成功后自动 refresh；失败仅返回错误结果不刷新 */
  applyOp(op: FeatureOp): Promise<FeatureOpResult>;
}

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

  // 外部 changeset / 其他编辑通道提交后刷新
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

  const applyOp = useCallback(async (op: FeatureOp): Promise<FeatureOpResult> => {
    if (!connectionKey) return { ok: false, error: i18next.t('partStudio.featureSystem.notConnected') };
    const client = LubanFeatureRpcInterface.getClient();
    const sessionId = sessionIdRef.current;
    // 租约自愈（旧源同款纪律，见文件头注）：有限重试直至陈旧租约自然过期。
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
        return {
          ok: false,
          error: holder
            ? i18next.t('partStudio.featureSystem.leaseHeldBy', { holder })
            : i18next.t('partStudio.featureSystem.leaseAcquireFailed'),
        };
      }
      await new Promise((resolve) => setTimeout(resolve, LEASE_OP_ACQUIRE_RETRY_MS));
    }
    const result = await client.applyFeatureOp(connectionKey, op, sessionId);
    if (result.ok) await refresh();
    return result;
  }, [connectionKey, refresh]);

  return {
    tree,
    loading,
    error,
    leaseOk,
    refresh,
    applyOp,
  };
}
