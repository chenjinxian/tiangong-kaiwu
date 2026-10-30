/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * usePartStudioScope（B-model P2.4）：编辑器 scope 解析状态机（纯规划 + 副作用）。
 *
 * 裁决（控制器 P2.4 第 3 条）：
 * - B/A 由 iTwin 标记（`isBModelItwin`）决定，**不看 VITE_B_MODEL_ENABLED 旗标**
 *   ——直接 URL 进 B 文档、旗标关，仍是 B；A = 无 `?model=`、零 registry 调用。
 * - B 文档：
 *   - `?model=` 命中**完整** scope（physModelId !== ''）→ ready（编辑器/视口放行）；
 *   - `?model=` 命中 **degraded** scope（physModelId === ''，P2.4 后端半图扩展）
 *     → damaged：显示「损坏的 Part Studio」恢复/删除入口，视口/特征 hook 保持门禁；
 *   - `?model=` 缺席/不在列表：有完整 scope → 第一个完整 scope（replace 导航；
 *     不新建 BriefcaseConnection，仅换 URL）；无完整但有 degraded → recovery
 *     （列出损坏项，**绝不自动 create**）；列表为空 → create 默认 `Part Studio 1`
 *     （同一共享会话/租约）后 replace 导航。
 * - 列表加载中/连接未就绪 → waiting（不得把首帧空数组当「空文档」自动 create）。
 *
 * 副作用保护：
 * - redirect 以目标 id 去重（URL 尚未回写时多次渲染不重复导航，防循环）；
 * - create 以「规划签名 + 重试令牌」去重（失败后停在错误态，仅显式 retry 重试，
 *   绝不因重渲染反复 create）；成功后本地列表已含新条目 → 规划转为 redirect，
 *   即便显式导航尚未落位也由 redirect 兜底收敛。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PartStudioInfo } from '@luban-cad/shared';
import type { DocumentMode } from '@modules/documents';

export type PartStudioScopePlan =
  /** iTwin 标记查询未落定（不读 registry、不开编辑面）。 */
  | { kind: 'detecting' }
  /** A 旧文档：legacy 单工作室，只读。 */
  | { kind: 'a' }
  /** B：列表/连接加载中。 */
  | { kind: 'waiting' }
  /** B：标记/列表错误（诚实呈现 + 重试）。 */
  | { kind: 'error'; error: string }
  /** B：活动 scope 完整可开。 */
  | { kind: 'ready'; studio: PartStudioInfo }
  /** B：活动 scope 为半图 degraded（不可打开，仅恢复/删除）。 */
  | { kind: 'damaged'; studio: PartStudioInfo }
  /** B：缺省/非法 model 需切到第一个完整 scope。 */
  | { kind: 'redirect'; target: PartStudioInfo }
  /** B：只有半图条目（或无完整 scope）——恢复面，不自动 create。 */
  | { kind: 'recovery'; damaged: PartStudioInfo[] }
  /** B：空文档且会话不可写（viewOnly/只读权限）——不创建，诚实空态。 */
  | { kind: 'empty' }
  /** B：空文档且可写——创建默认 scope。 */
  | { kind: 'create' };

export interface PlanPartStudioScopeArgs {
  mode: DocumentMode | undefined;
  /** iTwin 标记查询失败消息（mode 未定时不得吞）。 */
  modeError?: string;
  requestedId?: string;
  studios: readonly PartStudioInfo[];
  isLoading: boolean;
  /** 当前连接/文档的首次列表已落定（usePartStudios.loaded）——判空的唯一依据。 */
  loaded: boolean;
  error?: string;
  /** 会话可写（B ∧ !viewOnly ∧ 权限 editable）：空文档自动创建默认 scope 的前提。 */
  canWrite: boolean;
}

/** 纯规划（可直测）：把标记/列表/URL 映射为解析状态机的一跳。 */
export function planPartStudioScope(args: PlanPartStudioScopeArgs): PartStudioScopePlan {
  if (args.mode === undefined) {
    return args.modeError ? { kind: 'error', error: args.modeError } : { kind: 'detecting' };
  }
  if (args.mode === 'A') return { kind: 'a' };
  // 有已知 scope 时列表刷新失败不推翻当前解析（写后刷新/post-write refresh 的
  // 短暂失败不得把已打开 scope 打成错误页）；仅「无任何数据」才呈现 list 错误。
  if (args.error && args.studios.length === 0) return { kind: 'error', error: args.error };
  // 首载未落定（含 mode 翻转后列表 effect 尚未置 loading 的那一帧、连接未就绪）
  // 绝不是「空文档」——判空只认 loaded。
  if (!args.loaded) return { kind: 'waiting' };
  if (args.isLoading && args.studios.length === 0) return { kind: 'waiting' };

  const requested = args.requestedId
    ? args.studios.find((studio) => studio.id === args.requestedId)
    : undefined;
  if (requested) {
    return requested.physModelId === ''
      ? { kind: 'damaged', studio: requested }
      : { kind: 'ready', studio: requested };
  }
  const complete = args.studios.filter((studio) => studio.physModelId !== '');
  const firstComplete = complete[0];
  if (firstComplete) return { kind: 'redirect', target: firstComplete };
  const damaged = args.studios.filter((studio) => studio.physModelId === '');
  if (damaged.length > 0) return { kind: 'recovery', damaged };
  // 空文档：只有可写会话才自动创建；只读/viewOnly 诚实空态（不得借租约越权）。
  return args.canWrite ? { kind: 'create' } : { kind: 'empty' };
}

/** 默认 scope 名称（控制器钉死字面值）。 */
export const DEFAULT_PART_STUDIO_NAME = 'Part Studio 1';

export interface UsePartStudioScopeArgs extends PlanPartStudioScopeArgs {
  create(name: string): Promise<PartStudioInfo>;
  /** 仅换 URL（workspaceRefPath），不重建 BriefcaseConnection。 */
  navigateToModel(modelId: string | undefined, replace: boolean): void;
}

export interface PartStudioScopeState {
  plan: PartStudioScopePlan;
  /** 默认 scope 创建在途（plan 仍是 create）。 */
  isCreating: boolean;
  /** 默认 scope 创建失败（诚实呈现；不自动重试）。 */
  createError?: string;
  /** 显式重试默认 scope 创建。 */
  retryCreate(): void;
}

export function usePartStudioScope(args: UsePartStudioScopeArgs): PartStudioScopeState {
  const plan = planPartStudioScope(args);
  const {
    create,
    isLoading,
    navigateToModel,
    requestedId,
    studios,
  } = args;

  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>(undefined);
  const [createNonce, setCreateNonce] = useState(0);
  const createAttemptRef = useRef<string | null>(null);

  // redirect：以目标 id 去重（防重复导航循环）。目标切走时清空。
  const redirectTargetRef = useRef<string | null>(null);
  useEffect(() => {
    if (plan.kind !== 'redirect') {
      redirectTargetRef.current = null;
      return;
    }
    if (redirectTargetRef.current === plan.target.id) return;
    redirectTargetRef.current = plan.target.id;
    navigateToModel(plan.target.id, true);
  }, [plan, navigateToModel]);

  // ── create attempt（P2.4 F3：取消只归 unmount/离开 create，不随渲染抖动）──
  // create/navigate 以 ref 持有最新身份；effect deps 只含「何时尝试」——
  // 父级重渲染不再 cleanup 在途 RPC，真实拒收才能落进 setCreateError。
  const createRef = useRef(create);
  const navigateRef = useRef(navigateToModel);
  useEffect(() => {
    createRef.current = create;
  }, [create]);
  useEffect(() => {
    navigateRef.current = navigateToModel;
  }, [navigateToModel]);

  const planKindRef = useRef(plan.kind);
  useEffect(() => {
    planKindRef.current = plan.kind;
  }, [plan.kind]);

  // R2：StrictMode 双挂载哨兵必须 **setup 置真、cleanup 置假**（仓库既有形态：
  // DevViewerRoute.tsx / SketchDialog.tsx）。若用 useRef(true)+仅 cleanup，dev
  // StrictMode 的 setup→cleanup→setup 会让哨兵恒 false，create 拒收被静默吞掉。
  // 在途 attempt 的 runId 不在此失效：StrictMode 的第二轮 setup 靠 inFlight 门
  // 直接复用第一轮 attempt（ref 跨双挂载保留），结果仍可落位。
  const mountedRef = useRef(false);
  const runIdRef = useRef(0);
  /** 在途 create（防同一拍叠加第二次；写成功后的 list 抖动不得重开）。 */
  const inFlightRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // create：同一「规划签名 + 重试令牌」只尝试一次；成功/失败都不自动重放。
  const createSignature = [
    args.mode ?? '',
    requestedId ?? '',
    isLoading ? '1' : '0',
    studiesSignature(studios),
    createNonce,
  ].join('|');
  useEffect(() => {
    if (plan.kind !== 'create') {
      // 离开 create 态：作废在途 attempt 的结果落位；重新进入空文档仍可再建。
      runIdRef.current += 1;
      inFlightRef.current = false;
      createAttemptRef.current = null;
      setCreateError(undefined);
      setIsCreating(false);
      return;
    }
    if (inFlightRef.current || createAttemptRef.current === createSignature) return;
    createAttemptRef.current = createSignature;
    inFlightRef.current = true;
    const runId = ++runIdRef.current;
    setIsCreating(true);
    setCreateError(undefined);
    void (async () => {
      try {
        const created = await createRef.current(DEFAULT_PART_STUDIO_NAME);
        if (!mountedRef.current || runIdRef.current !== runId) return;
        // 本地列表已更新 → 下一跳规划为 redirect/ready；显式导航仍给出（replace）。
        navigateRef.current(created.id, true);
      } catch (err) {
        // 真实拒收必须落位（即使规划因列表刷新短暂离开 create——写失败才是
        // 用户需要看见的事实；只有 unmount 才丢弃）。
        if (mountedRef.current && runIdRef.current === runId) {
          setCreateError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (mountedRef.current && runIdRef.current === runId) {
          inFlightRef.current = false;
          setIsCreating(false);
        }
      }
    })();
    // 无 cleanup：允许父级重渲染/依赖抖动，取消只由上面两支与 unmount 处理。
  }, [plan.kind, createSignature, createNonce, isLoading, studios]);

  const retryCreate = useCallback(() => {
    if (inFlightRef.current) return;
    createAttemptRef.current = null;
    setCreateNonce((nonce) => nonce + 1);
  }, []);

  return { plan, isCreating, createError, retryCreate };
}

/** 列表内容签名（id:phys 有序）——判断规划输入是否实质变化。 */
function studiesSignature(studios: readonly PartStudioInfo[]): string {
  return studios.map((studio) => `${studio.id}:${studio.physModelId}`).join(',');
}
