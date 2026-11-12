/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useAutoPush（ADR-0017 Stage F）：Onshape 式自动保存/静默同步。
 *
 * 语义（用户裁决 2026-11-12「完全 Onshape 化」）：
 * - 每次成功提交（hasPendingTxns=true）后防抖合并一次 `connection.pushChanges`
 *   （标准通道：内部先落盘本地 changeset 再上传；成功后 onChangesPushed 事件
 *   会让 useUndoRedo 重查 pending→false）；
 * - single-flight：推送中又有新提交 → 完成后重查 pending，若仍有变更再排一次；
 * - 失败可见（onError 回调由页面走 notifications），并按 retryMs 重试；下一次
 *   提交也会重新排程；
 * - `flush()` 供「创建版本…」前强制落库（宿主可 await）；
 * - 只读/降级 scope 由页面传 enabled=false（hook 不猜权限）。
 *
 * 环境开关：`VITE_EDITOR_AUTOSAVE=0|false` 关闭（回滚一个周期用）；
 * `VITE_EDITOR_AUTOSAVE_DEBOUNCE_MS` 调整防抖（默认 20s——与计划 20–30s 对齐：
 * push 会开启新 changeset 会话并清空原生 undo/redo 栈，2.5s 窗口使常规撤销几乎不可用）。
 */

import React from 'react';
import type { BriefcaseConnection } from '@itwin/core-frontend';

export type AutoPushState = 'idle' | 'pending' | 'pushing' | 'error';

export interface UseAutoPushOptions {
  enabled?: boolean;
  /** 防抖窗口（ms）。 */
  debounceMs?: number;
  /** 失败重试间隔（ms）。 */
  retryMs?: number;
  /** 推送描述（hub changeset 描述）。 */
  description?: string;
  /** 推送成功（宿主失效 changesets 查询/刷新历史）。 */
  onPushed?: () => void;
  /** 推送失败（宿主走 notifications；不静默）。 */
  onError?: (message: string) => void;
}

export interface UseAutoPushResult {
  state: AutoPushState;
  error?: string;
  /** 立即落库（有 pending 才推送）；无连接/关闭/推送中 → false。 */
  flush: () => Promise<boolean>;
}

export const AUTO_SAVE_DESCRIPTION = '自动保存';

const DEFAULT_DEBOUNCE_MS = 20_000;
const DEFAULT_RETRY_MS = 15_000;

/** 环境开关（'0'/'false' 关闭；缺省开启——用户裁决自动保存为默认行为）。 */
export function isAutoPushEnabled(raw: string | undefined = import.meta.env.VITE_EDITOR_AUTOSAVE): boolean {
  return raw !== '0' && raw !== 'false';
}

function resolveDebounce(raw: string | undefined = import.meta.env.VITE_EDITOR_AUTOSAVE_DEBOUNCE_MS): number {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_DEBOUNCE_MS;
}

export function useAutoPush(
  connection: BriefcaseConnection | undefined,
  hasPendingChanges: boolean,
  options: UseAutoPushOptions = {},
): UseAutoPushResult {
  const {
    enabled = isAutoPushEnabled(),
    debounceMs = resolveDebounce(),
    retryMs = DEFAULT_RETRY_MS,
    description = AUTO_SAVE_DESCRIPTION,
    onPushed,
    onError,
  } = options;

  const [state, setState] = React.useState<AutoPushState>('idle');
  const [error, setError] = React.useState<string | undefined>(undefined);

  const connectionRef = React.useRef(connection);
  connectionRef.current = connection;
  const pendingRef = React.useRef(hasPendingChanges);
  pendingRef.current = hasPendingChanges;
  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;
  const onPushedRef = React.useRef(onPushed);
  onPushedRef.current = onPushed;
  const onErrorRef = React.useRef(onError);
  onErrorRef.current = onError;
  const pushingRef = React.useRef(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retryTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mountedRef = React.useRef(false);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);
  const clearRetry = React.useCallback(() => {
    if (retryTimerRef.current !== undefined) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = undefined;
    }
  }, []);

  const flush = React.useCallback(async (): Promise<boolean> => {
    const conn = connectionRef.current;
    if (!conn || !enabledRef.current || pushingRef.current) return false;
    let pending = false;
    try {
      pending = await conn.txns.hasPendingTxns();
    } catch {
      return false;
    }
    if (!pending) {
      if (mountedRef.current) setState('idle');
      return false;
    }
    pushingRef.current = true;
    clearTimer();
    clearRetry();
    if (mountedRef.current) setState('pushing');
    try {
      // 标准通道：pushChanges 内部先保存本地 changeset 再上传（PushChangesetDialog
      // 同通道）。服务端态刷新由 onChangesPushed 事件驱动。
      await conn.pushChanges(description);
      if (mountedRef.current) {
        setState('idle');
        setError(undefined);
      }
      onPushedRef.current?.();
      // 推送期间又有新提交：重查后补一次。
      const stillPending = await conn.txns.hasPendingTxns().catch(() => false);
      if (stillPending && mountedRef.current && enabledRef.current) {
        timerRef.current = setTimeout(() => void flush(), debounceMs);
        if (mountedRef.current) setState('pending');
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) {
        setState('error');
        setError(message);
      }
      onErrorRef.current?.(message);
      // 下一次提交/下一个 retry 窗口重试（不静默丢弃）。
      if (mountedRef.current && enabledRef.current) {
        retryTimerRef.current = setTimeout(() => void flush(), retryMs);
      }
      return false;
    } finally {
      pushingRef.current = false;
    }
  }, [clearRetry, clearTimer, debounceMs, description, retryMs]);

  // 提交 → 防抖排程；无 pending 立即收口。
  React.useEffect(() => {
    if (!connection || !enabled || !hasPendingChanges) {
      clearTimer();
      clearRetry();
      if (!hasPendingChanges && !pushingRef.current) setState('idle');
      return;
    }
    if (pushingRef.current) return;
    setState('pending');
    clearTimer();
    timerRef.current = setTimeout(() => void flush(), debounceMs);
    return clearTimer;
  }, [connection, enabled, hasPendingChanges, debounceMs, clearTimer, clearRetry, flush]);

  React.useEffect(() => () => {
    clearTimer();
    clearRetry();
  }, [clearTimer, clearRetry]);

  return { state, error, flush };
}
