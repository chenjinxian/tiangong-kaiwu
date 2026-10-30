/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * usePartStudios（B-model P2.4）：Part Studio 注册表数据/写入口（RPC 1.18）。
 *
 * - 读：`listPartStudios(iModelKey)` 纯读（不初始化、不建分区；空文档=[]）。
 *   B 文档才启用（A 模式 enabled=false → 零 registry 调用，状态恒空）。
 * - 写：create/rename/remove 全部经共享 `EditorSession`——同一 `sessionId` +
 *   同一 `iModelKey`（`connection.key`），先 `session.acquire()` 确认持有写租约
 *   （服务端 assertHeld 先于任何 EditTxn；P2.2 审查 Important）。禁止另起会话
 *   或空 session 调 registry：租约被他人持有 → 抛服务端 holder 语义错误。
 * - `refresh` 纪元守卫：慢响应晚到按序号丢弃（useFeatureSystem 同口径）。
 * - 半图恢复（P2.2 交接）：list 的 degraded 条目由后端以 `physModelId === ''`
 *   标记（P2.4 FeatureService 扩展）——本 hook 原样透传，UI 据此显示损坏态且
 *   绝不把这类条目当可打开 scope；写入口不为其提供 rename（后端亦拒收）。
 *
 * 服务端态归 hook 本地 state（spec §3：禁拷贝进 zustand）。错误原样上抛给 UI
 * （删除最后一个完整 scope 的服务端拒绝、租约 holder 等文案不得吞掉）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import i18next from 'i18next';
import {
  type PartStudioInfo,
  LubanFeatureRpcInterface,
} from '@luban-cad/shared';
import { LEASE_OP_ACQUIRE_RETRY_MS, type EditorSession } from './useEditorSession.js';

/** 注册表写方法取租约预算：编辑器打开时生命周期已持有租约，正常即取即回；
 *  仅换连接/前页残留窗口需要等待（不占用 op 的 35s 自愈预算）。 */
export const REGISTRY_LEASE_ACQUIRE_BUDGET_MS = 10_000;

export interface UsePartStudiosOptions {
  /** B 文档才为真；false = A 模式/无 B 上下文 → 零 registry 调用。 */
  enabled?: boolean;
}

export interface UsePartStudios {
  studios: PartStudioInfo[];
  isLoading: boolean;
  /**
   * 当前 iModelKey 的首次列表已落定（成功或失败）。解析器**必须**以此判空：
   * 首帧/mode 翻转那一帧 isLoading 可能尚未来得及置真——不得把「未加载」
   * 误判成空文档而自动 create（P2.4 竞态）。
   */
  loaded: boolean;
  error?: string;
  create(name: string): Promise<PartStudioInfo>;
  rename(partStudioId: string, name: string): Promise<PartStudioInfo>;
  remove(partStudioId: string): Promise<void>;
  refresh(): Promise<void>;
}

export function usePartStudios(
  iTwinId: string | undefined,
  iModelId: string | undefined,
  session: EditorSession,
  opts?: UsePartStudiosOptions,
): UsePartStudios {
  const enabled = opts?.enabled ?? true;
  // 只依赖共享会话的稳定字段（P2.4 F3）：整个 session 对象参与依赖会让写回调
  // 在父级每次重渲染时重建，抖动 resolver 的 create effect。
  const { sessionId, iModelKey, acquire } = session;
  const active = enabled && !!iModelKey;
  const documentId = iModelId ?? iTwinId ?? '';

  const [studios, setStudios] = useState<PartStudioInfo[]>([]);
  // 有 key 时首帧即视为「列表在途」（解析器不得把首帧误判成空文档而自动 create）。
  const [isLoading, setIsLoading] = useState<boolean>(active);
  const [error, setError] = useState<string | undefined>(undefined);
  // 已落定的 iModelKey（首跳成功/失败都算）；切换连接/文档即失效 → 解析器等待。
  const [loadedKey, setLoadedKey] = useState<string | undefined>(undefined);
  // R3：列表数据的所属 key——切换 iModel（路由复用、同一 iTwin 下前后退）时，
  // 新 key 的列表未落定前**不得**把上一文档的 studios 当作当前列表（尤其新
  // list 失败时）。只有 studiosKey === 当前 iModelKey 的数据才对外可见。
  const [studiosKey, setStudiosKey] = useState<string | undefined>(undefined);
  const loaded = !!iModelKey && loadedKey === iModelKey;
  const visibleStudios = !!iModelKey && studiosKey === iModelKey ? studios : [];
  const seqRef = useRef(0);
  // 写纪元（P2.4 F4）：create/rename/remove 成功后 +1——此前发出、尚未落定的
  // list 响应一律丢弃，防 stale list 覆盖本地写结果（重复默认 scope 的根因）。
  const writeEpochRef = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    const seq = ++seqRef.current;
    const writeEpoch = writeEpochRef.current;
    if (!enabled) {
      setStudios([]);
      setStudiosKey(undefined);
      setIsLoading(false);
      setError(undefined);
      setLoadedKey(undefined);
      return;
    }
    if (!iModelKey) {
      // 连接未就绪：停在「在途」等 connection.key 落位（不得当空文档处理）。
      setIsLoading(true);
      setLoadedKey(undefined);
      setStudiosKey(undefined);
      return;
    }
    setIsLoading(true);
    try {
      const list = await LubanFeatureRpcInterface.getClient().listPartStudios(iModelKey);
      if (seq !== seqRef.current || writeEpoch !== writeEpochRef.current) return; // 晚到/stale 丢弃
      // P2.4 F7：直接采用服务端顺序（后端按 metadata.order + 分区 ECInstanceId
      // BigInt 排序）；前端不重排，避免 tie-break 口径漂移改变「第一个完整 scope」。
      setStudios(list);
      setStudiosKey(iModelKey);
      setError(undefined);
      setLoadedKey(iModelKey);
    } catch (err) {
      if (seq !== seqRef.current || writeEpoch !== writeEpochRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setLoadedKey(iModelKey);
    } finally {
      if (seq === seqRef.current) setIsLoading(false);
    }
  }, [enabled, iModelKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** 注册表写前门禁：B 上下文 + 连接 key + 持有共享会话的写租约。 */
  const requireWritable = useCallback(async (): Promise<{ iModelKey: string; sessionId: string }> => {
    if (!enabled || !iModelKey) {
      throw new Error(i18next.t('partStudio.scope.notReady', { documentId }));
    }
    const lease = await acquire({
      budgetMs: REGISTRY_LEASE_ACQUIRE_BUDGET_MS,
      retryMs: LEASE_OP_ACQUIRE_RETRY_MS,
    });
    if (!lease.ok) {
      throw new Error(
        lease.holder
          ? i18next.t('partStudio.featureSystem.leaseHeldBy', { holder: lease.holder })
          : i18next.t('partStudio.featureSystem.leaseAcquireFailed'),
      );
    }
    return { iModelKey, sessionId };
  }, [enabled, iModelKey, acquire, sessionId, documentId]);

  /** 写后收口：使在途 list 失效并重取服务端权威列表（顺序/元数据）。 */
  const invalidateAndRefresh = useCallback((): void => {
    writeEpochRef.current += 1;
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (name: string): Promise<PartStudioInfo> => {
      const target = await requireWritable();
      const created = await LubanFeatureRpcInterface.getClient().createPartStudio(
        target.iModelKey,
        name,
        target.sessionId,
      );
      // 先本地落位（解析器/导航可立即就绪），随后以服务端顺序刷新替换。
      setStudios((prev) => [...prev.filter((s) => s.id !== created.id), created]);
      setStudiosKey(target.iModelKey);
      setError(undefined);
      invalidateAndRefresh();
      return created;
    },
    [requireWritable, invalidateAndRefresh],
  );

  const rename = useCallback(
    async (partStudioId: string, name: string): Promise<PartStudioInfo> => {
      const target = await requireWritable();
      const renamed = await LubanFeatureRpcInterface.getClient().renamePartStudio(
        target.iModelKey,
        partStudioId,
        name,
        target.sessionId,
      );
      setStudios((prev) => prev.map((studio) => (studio.id === renamed.id ? renamed : studio)));
      setStudiosKey(target.iModelKey);
      invalidateAndRefresh();
      return renamed;
    },
    [requireWritable, invalidateAndRefresh],
  );

  const remove = useCallback(
    async (partStudioId: string): Promise<void> => {
      const target = await requireWritable();
      await LubanFeatureRpcInterface.getClient().deletePartStudio(
        target.iModelKey,
        partStudioId,
        target.sessionId,
      );
      setStudios((prev) => prev.filter((studio) => studio.id !== partStudioId));
      setStudiosKey(target.iModelKey);
      invalidateAndRefresh();
    },
    [requireWritable, invalidateAndRefresh],
  );

  // R3：对外只暴露「属于当前 iModelKey」的列表（切换文档瞬间即空，旧文档
  // 列表不得驱动 redirect/tabs；新 list 失败时由 error+空列表呈现错误面）。
  return { studios: visibleStudios, isLoading, loaded, error, create, rename, remove, refresh };
}
