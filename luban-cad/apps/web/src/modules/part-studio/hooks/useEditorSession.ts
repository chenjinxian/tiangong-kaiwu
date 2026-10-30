/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useEditorSession（B-model P2.4；P2.2 审查 Important 承接）：
 * **编辑会话共享单点**——把 `useFeatureSystem` 原先私有持有的 sessionId（写
 * 租约身份）与 iModelKey（`connection.key`）上提为共享 hook，并统一租约生命
 * 周期（acquire → 10s renew → unmount/失能 release）：
 *
 * - `useFeatureSystem`（树/bodies 读面 + applyOp 提交）只消费本 hook 给出的
 *   sessionId/iModelKey/leaseOk，不再自建会话；
 * - `usePartStudios`（注册表 list/create/rename/delete）的写方法一律用同一
 *   sessionId + iModelKey（1.18 写方法服务端 assertHeld）；
 * - B 文档默认 scope 解析的 pre-editor create 也经 `acquire()` 取同一 id 的
 *   租约——禁止另起会话或空 session 调 registry。
 *
 * 语义（与旧 useFeatureSystem 内部实现逐条对齐，勿漂移）：
 * - `sessionId` 每次挂载生成一次（StrictMode 下同一挂载对的两轮 effect 共用，
 *   acquire→release→acquire 幂等）；换连接只换 iModelKey，不换身份；
 * - `enabled` 缺省 `!!connection && !connection.isReadonly`；调用方可用
 *   `opts.enabled` 覆盖（editability 由调用者裁决，hook 只按裁决结果动作）；
 * - 生命周期 effect：enabled 时立即 acquire，10s 续租，unmount/失能 release；
 *   租约被拒 → `leaseOk:false`，UI 降级只读，但读面不被阻断（读面归
 *   useFeatureSystem）；
 * - `acquire({budgetMs,retryMs})`：有限重试自愈陈旧租约（前页/重载残留租约要
 *   等服务端 WriteLease 30s TTL 自然过期；op 一次性派发落在陈旧窗口会永久被
 *   拒且无人重放）。预算耗尽返回 `{ok:false, holder}`，由调用方给 holder 报错；
 * - 并发调用同一 sessionId 的 acquire 是服务端幂等刷新 TTL（旧 applyOp 自愈
 *   同款），不产生第二个租约。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import { LubanFeatureRpcInterface } from '@luban-cad/shared';
import { withOpTimeout } from './feature-rpc.js';

/** 写租约续期间隔（与后端 WriteLease 租期配套：10s 一跳）。 */
export const LEASE_RENEW_INTERVAL_MS = 10_000;
/** op 派发前的租约自愈窗口：须大于服务端 WriteLease 30s TTL（陈旧租约自然过期），留余量。 */
export const LEASE_OP_ACQUIRE_BUDGET_MS = 35_000;
export const LEASE_OP_ACQUIRE_RETRY_MS = 2_000;

/** 单次/有限重试 acquire 结果（holder 为服务端当前持有者，可用于诚实报错）。 */
export interface LeaseAcquireResult {
  ok: boolean;
  holder?: string;
}

export interface AcquireOptions {
  /** 有限重试总预算（毫秒）；缺省=单次尝试。 */
  budgetMs?: number;
  /** 重试间隔（毫秒）；缺省 LEASE_OP_ACQUIRE_RETRY_MS。 */
  retryMs?: number;
}

export interface EditorSession {
  /** 写租约身份（同页唯一；registry 写方法与 applyOp 共用）。 */
  sessionId: string;
  /** `connection.key`（未连接=undefined）——特征 RPC 与注册表 RPC 的库键。 */
  iModelKey: string | undefined;
  /** 生命周期租约态（被拒/未持 → false；UI 只读降级提示）。 */
  leaseOk: boolean;
  /** 取租约（幂等刷新 TTL）；可选有限重试自愈陈旧租约。 */
  acquire(options?: AcquireOptions): Promise<LeaseAcquireResult>;
  /** 释放本会话租约（生命周期 cleanup 同款；调用方显式释放面）。 */
  release(): Promise<void>;
}

export function useEditorSession(
  connection: BriefcaseConnection | undefined,
  opts?: { enabled?: boolean },
): EditorSession {
  const enabled = opts?.enabled ?? (!!connection && !connection.isReadonly);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const iModelKey = connection?.key;
  const sessionId = sessionIdRef.current;

  const [leaseOk, setLeaseOk] = useState(false);

  const acquire = useCallback(
    async (options?: AcquireOptions): Promise<LeaseAcquireResult> => {
      // 失能会话（A/viewOnly/权限只读）不得取租约——防御纵深：解析器/未来调用点
      // 即使误调 registry 写路径，也不会借租约越权（写门在 session 层收口）。
      if (!iModelKey || !enabled) return { ok: false };
      const client = LubanFeatureRpcInterface.getClient();
      const retryMs = options?.retryMs ?? LEASE_OP_ACQUIRE_RETRY_MS;
      const deadline = options?.budgetMs === undefined ? undefined : Date.now() + options.budgetMs;
      let holder: string | undefined;
      for (;;) {
        try {
          // 超时套接（M5-T1）：预取悬挂=自愈预算永不兑现的同款死态，一并兜底；
          // 超时按网络抖动语义窗口内重试，预算耗尽照常报错（不永久 busy）。
          const lease = await withOpTimeout(client.acquireWriteLease(iModelKey, sessionId));
          if (lease.ok) return { ok: true };
          holder = lease.holder;
        } catch {
          holder = undefined; // 网络抖动：窗口内照常重试
        }
        if (deadline === undefined || Date.now() >= deadline) return { ok: false, holder };
        await new Promise((resolve) => setTimeout(resolve, retryMs));
      }
    },
    [iModelKey, sessionId, enabled],
  );

  const release = useCallback(async (): Promise<void> => {
    if (!iModelKey) return;
    setLeaseOk(false);
    await LubanFeatureRpcInterface.getClient().releaseWriteLease(iModelKey, sessionId).catch(() => undefined);
  }, [iModelKey, sessionId]);

  // 写租约生命周期：acquire → 10s renew → release（unmount/失能）
  useEffect(() => {
    if (!iModelKey || !enabled) {
      setLeaseOk(false);
      return;
    }
    const client = LubanFeatureRpcInterface.getClient();
    let disposed = false;

    const renew = async (): Promise<void> => {
      const result = await acquire();
      if (!disposed) setLeaseOk(result.ok);
    };

    void renew();
    const renewTimer = setInterval(() => {
      void renew();
    }, LEASE_RENEW_INTERVAL_MS);

    return () => {
      disposed = true;
      clearInterval(renewTimer);
      setLeaseOk(false);
      void client.releaseWriteLease(iModelKey, sessionId).catch(() => undefined);
    };
  }, [iModelKey, enabled, acquire, sessionId]);

  return { sessionId, iModelKey, leaseOk, acquire, release };
}
