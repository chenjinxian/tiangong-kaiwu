/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * usePartStudioVariables（ADR-0020 §2.3/§2.6 D4/D5，S2/S3b）：Part Studio 变量表
 * 只读面。
 *
 * - 读面 = `LubanFeatureRpcInterface.getClient().getVariables(connectionKey, ...
 *   scopeArgs)`（v1.71）；未就绪/无连接/未启用返回 `[]`，绝不发 legacy 读面。
 * - S3b：变量是 Part Studio 级树行/命令，不再只在草图激活时读取——Session
 *   （PartStudioPage）以 `enabled=scopeReady` 单点持有，树/尺寸编辑器/变量
 *   对话框共用同一实例（禁止第二读取实例/双刷新，P0-06）。
 * - 刷新时机与 useSketchSystem 同源：`connection.txns.onCommitted` /
 *   `onAfterUndoRedo`（变量变更/表达式重写/撤销重做都会触发）。
 * - 变量表自身损坏（循环/语法）时：保留**同一 scope** 的上一次 `variables`
 *   原值并暴露 `error`，不 throw、不阻塞草图编辑（本地求值会给出同一错误消息）。
 * - 代际 + scope 标签防竞态（S3b review P1-1）：连接/Part Studio scope 变化时
 *   旧表**立即不暴露**（`variables=[]`、`loading=true`），直到新 scope 的
 *   getVariables 回包落位；迟到的旧 scope 回包按 epoch 丢弃。禁止把 PS A 的
 *   变量表带进 PS B 的整表 `updateVariables`（会静默覆盖 B 的表）。
 *
 * 实例归属：PartStudioPage（Session）单点持有并下传树/画布/对话框；本 hook
 * 只是读取面，不建全局 store，也不写模型。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import { LubanFeatureRpcInterface, type VariableDto } from '@luban-cad/shared';
import { VARIABLES_READ_TIMEOUT_MS, withTimeout } from '../internal/variables.js';

export interface UsePartStudioVariablesResult {
  /** 既有变量（未就绪/未启用/scope 切换中 = []；读取失败时保留同 scope 原值）。 */
  variables: VariableDto[];
  /** 读取中，或当前 scope 的数据尚未落位（scope 切换后立即为 true）。 */
  loading: boolean;
  /** 读取失败消息（不阻塞草图；变量表损坏时与本地求值错误同源）。 */
  error?: string;
  /**
   * 当前 scope 的表已成功落位且无错误（S3b re-review P2-1）：变量写/命令
   * 入口的唯一门。false = 未连接/未启用/切换中/刷新中/读取失败——此时整表
   * `updateVariables` 一律禁止（否则会用空/旧表覆盖不可读的表）。
   */
  ready: boolean;
  /** 当前是否有可读的 scope（false=未连接/Part Studio 未就绪；P2-1 区分提示）。 */
  scopeActive: boolean;
  /** 手动刷新（写操作提交后可 await；会等到本次之后的所有读落位）。 */
  refresh: () => Promise<void>;
}

/** scope 身份键（连接 + Part Studio；null=未启用/无连接）。 */
function scopeIdentity(connectionKey: string | undefined, partStudioId: string | undefined): string | null {
  if (!connectionKey)
    return null;
  return `${connectionKey}\u0000${partStudioId ?? ''}`;
}

interface VariablesState {
  /** 该表所属 scope（null=空表/未启用）。 */
  scopeKey: string | null;
  variables: VariableDto[];
}

export function usePartStudioVariables(
  connection: BriefcaseConnection | undefined,
  partStudioId: string | undefined,
  enabled = true,
): UsePartStudioVariablesResult {
  const connectionKey = connection?.key;
  const scopeKey = enabled ? scopeIdentity(connectionKey, partStudioId) : null;
  // 表与错误都带 scope 标签：跨 scope 的旧数据永远不暴露（P1-1）。
  const [state, setState] = useState<VariablesState>({ scopeKey: null, variables: [] });
  const [loadingScope, setLoadingScope] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<{ scopeKey: string; message: string } | undefined>(undefined);
  // 身份代际：连接/scope/启用状态变化 +1——迟到的 getVariables 回包丢弃。
  const epochRef = useRef(0);
  // 最新一次读（P3-1）：每次 refresh() 立即启动（epoch 最新者落位；旧回包
  // 丢弃），并返回一个「等到所有更新于本请求的读都落位」的 promise。这样
  // 提交后 await refresh 不会被随后 onCommitted 触发的刷新提前 resolve。
  const latestRunRef = useRef<{ epoch: number; promise: Promise<void> } | null>(null);
  // 卸载守卫：在途/后续读在卸载后不再发 RPC/setState（StrictMode
  // setup→cleanup→setup 会重新置真，不破坏开发态双挂载语义）。
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback((): Promise<void> => {
    const targetScope = scopeKey;
    const epoch = ++epochRef.current;
    const run = async (): Promise<void> => {
      // 卸载后不再发读/回写（在途读在测试/路由切换后不留副作用）。
      if (!mountedRef.current)
        return;
      if (targetScope === null) {
        setState({ scopeKey: null, variables: [] });
        setErrorState(undefined);
        setLoadingScope(null);
        return;
      }
      setLoadingScope(targetScope);
      try {
        const scopeArgs: [] | [string] = partStudioId === undefined ? [] : [partStudioId];
        const list = await withTimeout(
          LubanFeatureRpcInterface.getClient().getVariables(connectionKey!, ...scopeArgs),
          VARIABLES_READ_TIMEOUT_MS,
          '变量表读取',
        );
        if (epochRef.current !== epoch || !mountedRef.current) return;
        setState({ scopeKey: targetScope, variables: Array.isArray(list) ? [...list] : [] });
        setErrorState(undefined);
      } catch (err) {
        // 同一 scope 的读取失败：保留该 scope 原值并置 error；ready=false
        // 会封死一切整表写（P2-1）。
        if (epochRef.current === epoch && mountedRef.current) {
          setErrorState({
            scopeKey: targetScope,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        if (epochRef.current === epoch && mountedRef.current) setLoadingScope(null);
      }
    };
    const promise = run();
    latestRunRef.current = { epoch, promise };
    // 等待本请求之后的全部读落位（含后来被触发的刷新）：可靠读后写。
    // 每轮记录已等待的 epoch，避免在同一 promise 上原地重等（微任务死循环）。
    return promise.then(async () => {
      let latest = latestRunRef.current;
      while (latest !== null && latest.epoch > epoch) {
        const awaitedEpoch = latest.epoch;
        await latest.promise;
        latest = latestRunRef.current;
        if (latest !== null && latest.epoch <= awaitedEpoch)
          break;
      }
    });
  }, [connectionKey, partStudioId, scopeKey]);

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

  // 跨 scope 的旧表/旧错误一律不暴露（即使新 fetch 尚未开始）：切换瞬间即空表。
  const current = scopeKey !== null && state.scopeKey === scopeKey;
  const variables = current ? state.variables : [];
  const error = scopeKey !== null && errorState?.scopeKey === scopeKey
    ? errorState.message
    : undefined;
  // loading = 当前 scope 正在读取，或当前 scope 数据尚未落位且无错误。
  const loading = scopeKey !== null
    && (loadingScope === scopeKey || (!current && error === undefined));
  // ready = 当前 scope 的表已成功落位、且不在刷新中/错误态（写门，P2-1）。
  const ready = scopeKey !== null && current && error === undefined && !loading;
  const scopeActive = scopeKey !== null;

  return { variables, loading, error, ready, scopeActive, refresh };
}
