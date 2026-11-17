/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * usePartStudioVariables（ADR-0020 §2.3/§2.6 D4，S2）：Part Studio 变量表只读面。
 *
 * - 读面 = `LubanFeatureRpcInterface.getClient().getVariables(connectionKey, ...
 *   scopeArgs)`（v1.71）；未就绪/无连接/未启用（草图未激活）返回 `[]`，绝不发
 *   legacy 读面。
 * - 刷新时机与 useSketchSystem 同源：`connection.txns.onCommitted` /
 *   `onAfterUndoRedo`（变量变更/表达式重写/撤销重做都会触发）。
 * - 变量表自身损坏（循环/语法）时：保留上一次 `variables` 原值并暴露 `error`，
 *   不 throw、不阻塞草图编辑（本地求值会给出同一错误消息）。
 * - 代际防竞态：连接/scope/启用状态变化时推进代数，迟到的回包丢弃（同
 *   useSketchSystem 的 stale-clobber 防护）。
 *
 * 不新建全局 store：由 PartStudioCanvas 持有实例并下传（brief §2）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import { LubanFeatureRpcInterface, type VariableDto } from '@luban-cad/shared';

export interface UsePartStudioVariablesResult {
  /** 既有变量（未就绪/未启用 = []）；读取失败时保留原值。 */
  variables: VariableDto[];
  loading: boolean;
  /** 读取失败消息（不阻塞草图；变量表损坏时与本地求值错误同源）。 */
  error?: string;
  refresh: () => Promise<void>;
}

export function usePartStudioVariables(
  connection: BriefcaseConnection | undefined,
  partStudioId: string | undefined,
  enabled = true,
): UsePartStudioVariablesResult {
  const connectionKey = connection?.key;
  const [variables, setVariables] = useState<VariableDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  // 身份代际：连接/scope/启用状态变化 +1——迟到的 getVariables 回包丢弃。
  const epochRef = useRef(0);

  const refresh = useCallback(async () => {
    const epoch = ++epochRef.current;
    if (!enabled || !connectionKey) {
      setVariables([]);
      setError(undefined);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const scopeArgs: [] | [string] = partStudioId === undefined ? [] : [partStudioId];
      const list = await LubanFeatureRpcInterface.getClient().getVariables(connectionKey, ...scopeArgs);
      if (epochRef.current !== epoch) return;
      setVariables(Array.isArray(list) ? [...list] : []);
      setError(undefined);
    } catch (err) {
      // 变量表损坏/读取失败：保留原值（不把草图编辑阻塞在读面上）。
      if (epochRef.current === epoch)
        setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (epochRef.current === epoch) setLoading(false);
    }
  }, [connectionKey, enabled, partStudioId]);

  // 启用/连接/scope 变化 → 读取（禁用时上方分支清空）。
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 外部提交（变量更新/草图表达式写）与撤销/重做 → 刷新变量表。
  // 单测假连接可能只实现 key（无 txns）——可选链守卫，避免宿主测试崩死。
  useEffect(() => {
    if (!connection || !enabled) return;
    const txns = connection.txns;
    if (!txns) return;
    const listener = () => {
      void refresh();
    };
    txns.onCommitted.addListener(listener);
    txns.onAfterUndoRedo?.addListener(listener);
    return () => {
      txns.onCommitted.removeListener(listener);
      txns.onAfterUndoRedo?.removeListener(listener);
    };
  }, [connection, enabled, refresh]);

  return { variables, loading, error, refresh };
}
