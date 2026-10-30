/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useViewport（M3 Task 3 接线；M4 Task 2 扩 ScreenViewport 创建主链）：
 * React 侧 viewport 宿主 hook——
 * - 返回 `viewportRef`（div ref）：ScreenViewport 的挂载点；挂载即 acquireViewer
 *   （幂等 startViewer + 模块级引用计数——StrictMode 双挂载/多页签切换均安全），
 *   卸载 releaseViewer（计数 1→0 才真正 shutdown）；backendUrl 同源姿态由消费方
 *   决定（apps/web 经 vite 代理直连 modeling-server 会被 CORS 拦，传
 *   window.location.origin，见 apps/web/vite.config.ts 注记）；
 * - `iModel` 就位后创建 ScreenViewport（移植自旧查看器包 useViewport.ts 全链（旧包已删除），
 *   2026-10-22；该文件为本实现的权威参照）：getDefaultViewState（views.queryProps
 *   →load，Default 命名视图优先，缺省 ViewCreator3d.createDefaultView）→
 *   ensureViewHasCategoriesAndModels → ScreenViewport.create → viewManager.addViewport
 *   → setupViewCategoriesAndModels（**ModelState 显式 load + drop/add 触发 refs 重建**
 *   ——BRep 不渲染两断点，见该函数内 CRITICAL 注释）→ queryModelRanges 内容感知取景；
 * - 相位出口：`idle → starting → ready | error`——`ready` 表示
 *   LocalhostIpcApp.startup 已完成（IpcApp.isValid，RPC 客户端已配），
 *   供宿主页状态栏等做连接态呈现；
 * - `error` 出口语义：视口创建链的可读失败消息（含 acquireViewer 拒绝与创建链
 *   异常两个子类；后者 phase 可仍为 ready——消费方须按「error 在场即失败」
 *   呈现，不得只看相位）。错误随链生灭：iModel 切换/卸载即清空（cleanup），
 *   不跨链残留；
 * - 取消纪律：StrictMode 卸载后 async 创建链以 cancelled 哨兵短路，一律不 setState；
 *   清理纪律：dropViewport + dispose（上游 5.9 将 dispose 标记 deprecated，但视口
 *   销毁仍以 dispose+dropViewport 为正道，调用处 eslint-disable 并注记）。
 *
 * **B-model P2.5（active-scope 过滤）**：`activeModelIds` 可选白名单——
 * - `undefined`（缺省）= A 旧文档 legacy 全模型行为（选择器只增不减，取景取全模型联合）；
 * - 数组 = 只显示白名单内的 PhysicalModel（B 文档 active Part Studio 的 physModelId）：
 *   视图既有 selector 中白名单外的模型会被移除（隐藏 scope 的几何不可见/不可拾取），
 *   只加载 active 模型并按它重新取景；
 * - 空数组 = 无活动模型（damaged/未解析 scope）——**绝不回落全模型**。
 * 白名单内容变化时**原地**重建模型选择（drop+add 触发 refs 重建）并重取景，
 * 不重建 ScreenViewport、不重开 BriefcaseConnection；以内容签名（而非数组身份）
 * 为依赖，父级无关重渲染不触发重复 fit。
 * - R1（fix round 2）：在途 apply 以 pending key 记账——切回「已应用」key 时若
 *   存在其它 key 的在途 apply，必须 ++seq 作废它并重放当前 key（否则旧 apply
 *   晚到会把视口落成错误 scope 且 deps 不再变化）；失败/catch 一律作废已应用
 *   签名与 appliedModelKey。
 * - R2（fix round 2）：过滤失败走独立 `filterError` 结果通道（不计入连接/打开
 *   失败的 `error`），消费方以非阻断提示呈现，连接态不误报。
 */

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import {
  IModelApp,
  type IModelConnection,
  type NotificationManager,
  ScreenViewport,
  SpatialViewState,
  ViewCreator3d,
  type ViewState,
} from '@itwin/core-frontend';
import { Range3d } from '@itwin/core-geometry';
import { acquireViewer, releaseViewer } from '../host/web-initializer.js';
import { applyRenderProfile } from './render-profile.js';

/** 运行时相位：idle（未起）→ starting → ready（IPC 就绪）| error。 */
export type ViewportPhase = 'idle' | 'starting' | 'ready' | 'error';

/** F3：B 物理模型查询失败（ECSQL/IPC）的用户可见消息——fail-closed 清空选择器
 *  但不冒充「空 Part Studio」，也不把失败标记为已应用（不静默到刷新为止）。
 *  R2：走独立的 `filterError` 通道（非连接/打开失败的 error），由消费方以非阻断
 *  提示呈现；连接与文档状态仍正常。 */
const MODEL_FILTER_FAILURE_MESSAGE =
  'ECSQL 查询失败；已暂时隐藏全部模型以避免显示错误 scope。切换页签可重试。';

export interface UseViewportOptions {
  /** Backend RPC URL（modeling-server；apps/web 传同源代理地址） */
  backendUrl: string;
  /** iModelHub URL（imodelhub-services） */
  hubUrl: string;
  /** Access token for WebSocket authentication */
  accessToken?: string;
  /** 已就位的 iModel 连接（BriefcaseConnection extends IModelConnection）；就位且挂载点在 DOM 后创建 ScreenViewport */
  iModel?: IModelConnection;
  /**
   * 自定义 NotificationManager（review-8 I-2：notifications 呈现桥）——原样
   * 透传 acquireViewer → IModelApp.startup 官方注入点；缺省不注入（core 哑
   * 通道兜底）。消费方须传稳定实例（app 生命期单例）——本选项在 acquire effect
   * 依赖面内，实例换新会触发重 acquire。
   */
  notifications?: NotificationManager;
  /**
   * 活动物理模型白名单（B-model P2.5）：B 文档 active Part Studio 的
   * `physModelId`。`undefined` = legacy 全模型（A 旧文档）；空数组 = 无活动模型
   * （damaged/未解析 scope，绝不回落全模型）。内容变化时视口原地切换模型选择
   * 并重新取景——不重建 viewport/连接。
   */
  activeModelIds?: readonly string[];
}

export interface UseViewportResult {
  /** viewport 挂载点（宿主 div ref）。 */
  viewportRef: RefObject<HTMLDivElement>;
  /** 运行时相位（连接态呈现的数据源）。 */
  phase: ViewportPhase;
  /** phase=error 时的可读消息（其余相位为 null）。 */
  error: string | null;
  /** ScreenViewport 实例（iModel 就位且创建链完成后；卸载/取消即 undefined）。 */
  viewport: ScreenViewport | undefined;
  /**
   * 已落定的 active-scope 过滤签名（P2.5 F1 承接）：`undefined` = 尚未应用
   * （如模型查询失败、创建链未完成）；`null` = A legacy 全模型；`string` = B
   * 白名单内容签名。消费方在它变化时再清一次选择集——覆盖「切 scope 后、
   * 过滤落定前」的 lag 窗口（期间旧 scope 几何仍可被 pick）。
   */
  appliedModelKey: string | null | undefined;
  /**
   * active-scope 物理模型查询失败的可读消息（P2.5 R2 独立通道）：
   * - 连接/文档本身正常（不在 `error` / 状态栏「连接失败」里），由消费方以
   *   非阻断提示条呈现；
   * - 失败期间视口 fail-closed（不显示任何模型），成功应用后自动清空。
   */
  filterError: string | null;
}

export function useViewport(options: UseViewportOptions): UseViewportResult {
  const { backendUrl, hubUrl, accessToken, iModel, notifications, activeModelIds } = options;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<ViewportPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ScreenViewport | undefined>(undefined);
  // 已落定过滤签名（P2.5 F1：消费方据此在过滤落定后再清一次选择集）。
  const [appliedModelKey, setAppliedModelKey] = useState<string | null | undefined>(undefined);
  // R2：过滤失败独立错误通道（连接/打开错误仍走 error）。
  const [filterError, setFilterError] = useState<string | null>(null);
  // 活跃 viewport 引用（state 之外）：清理路径需同步 drop+dispose
  const activeViewportRef = useRef<ScreenViewport | undefined>(undefined);
  // P2.5：白名单以内容签名参与依赖；最新数组存 ref（父级新数组身份不触发重取景）。
  const activeModelKey = modelIdsKey(activeModelIds);
  const activeModelIdsRef = useRef<readonly string[] | undefined>(activeModelIds);
  activeModelIdsRef.current = activeModelIds;
  // 已应用过滤的 (viewport, key)：创建链与切 scope effect 共用，避免重复 fit。
  const appliedFilterRef = useRef<{ viewport: ScreenViewport; key: string | null } | null>(null);
  // R1：在途 apply 的 (viewport, key)——用于识别「切回已应用 key 但有另一个
  // key 的在途 apply」并作废它（否则旧 apply 晚到会把视口落成错误 scope）。
  const pendingFilterRef = useRef<{ viewport: ScreenViewport; key: string | null } | null>(null);
  // 过滤代际：切 scope 快速连发时只让最新一次落定最终状态；iModel 切换/卸载
  // 同样递增（F4），晚到的 apply 不再操作已 dispose 的 viewport。
  const filterSeqRef = useRef(0);
  const reportFilterFailure = useCallback((): void => {
    setFilterError(MODEL_FILTER_FAILURE_MESSAGE);
  }, []);
  const clearFilterFailure = useCallback((): void => {
    setFilterError(null);
  }, []);

  useEffect(() => {
    let mounted = true;
    setPhase('starting');
    acquireViewer({ backendUrl, hubUrl, accessToken, notifications })
      .then(() => {
        if (mounted) setPhase('ready');
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setPhase('error');
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      mounted = false;
      void releaseViewer();
    };
    // notifications 在依赖面内但要求消费方传稳定实例（app 生命期单例）——身份
    // 恒定即不构成重 acquire 触发面；undefined 缺省路径同理。
  }, [backendUrl, hubUrl, accessToken, notifications]);

  useEffect(() => {
    // 挂载点尚未进 DOM / iModel 未就位：暂不创建（iModel 就位后 effect 重跑）
    const parentDiv = viewportRef.current;
    if (!iModel || !parentDiv) {
      return;
    }

    // Cancellation flag for React Strict Mode double-invocation
    let cancelled = false;

    const setupViewport = async (): Promise<void> => {
      try {
        // 创建链用当下最新白名单（ref 读取；渲染期同步，见上）。
        const view = await getDefaultViewState(iModel, activeModelIdsRef.current);
        if (cancelled) return;

        if (!view) {
          throw new Error('No view state available');
        }

        // Remove any existing viewport（iModel 快速切换时的重建路径）
        if (activeViewportRef.current) {
          IModelApp.viewManager.dropViewport(activeViewportRef.current);
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          activeViewportRef.current.dispose();
          activeViewportRef.current = undefined;
        }

        const newViewport = ScreenViewport.create(parentDiv, view);
        activeViewportRef.current = newViewport;

        // Add to ViewManager
        IModelApp.viewManager.addViewport(newViewport);

        // IMPORTANT: Ensure all available categories and models are displayed
        // This is required for editing tools to work properly（P2.5：B 只显示
        // active scope 的物理模型，A 保持全模型）。
        // F4：链内每跳后校验 viewport 仍存活（iModel 切换/卸载即放弃后续副作用）。
        const isAlive = (): boolean =>
          !cancelled && activeViewportRef.current === newViewport;
        const appliedModelIds = activeModelIdsRef.current;
        const modelsApplied = await setupViewCategoriesAndModels(
          newViewport,
          appliedModelIds,
          isAlive,
        );
        if (!isAlive()) return;

        // Onshape 视觉基线（2026-10-26 渲染对齐阶段 1）：可见深灰边线 + 灯光
        // 重配 + 全类别中灰哑光覆盖 + MSAA——存量库/新库一致生效（详见 render-profile.ts）。
        try {
          const subCategoryIds = await queryAllSubCategoryIds(iModel);
          if (isAlive()) applyRenderProfile(newViewport, subCategoryIds);
        } catch {
          // 画像应用失败不阻断视口（基线观感缺位，功能链不受影响）
        }

        if (!isAlive()) return;
        if (modelsApplied) {
          // 记录已应用的过滤签名（链内用的就是这一份白名单；中途切 scope 由
          // 下方 filter effect 依据签名差异补应用）。
          appliedFilterRef.current = { viewport: newViewport, key: modelIdsKey(appliedModelIds) };
          clearFilterFailure();
          setAppliedModelKey(modelIdsKey(appliedModelIds));
        } else {
          // F3：B 物理模型查询失败——fail-closed（setup 已清空 selector）且
          // 不标记已应用；错误经视口 error 通道呈现（画布错误面）。
          // appliedFilterRef 置空：selector 已被清空，旧「已应用」签名不再成立
          //（否则切回旧 scope 会命中陈旧签名而跳过重建）。
          appliedFilterRef.current = null;
          setAppliedModelKey(undefined);
          reportFilterFailure();
        }

        // 补齐链在卸载后落定：清理已 drop+dispose 并复位 state——不得再写 state
        if (cancelled) return;
        setViewport(newViewport);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    void setupViewport();

    return () => {
      cancelled = true;
      // F4：生命周期失效——作废在途过滤（代际 +1），清已应用签名；晚到的
      // apply 不再对已 dispose 的 viewport 取景/失效场景，也不回写 appliedFilterRef。
      filterSeqRef.current += 1;
      appliedFilterRef.current = null;
      pendingFilterRef.current = null;
      setFilterError(null);
      setAppliedModelKey(undefined);
      if (activeViewportRef.current) {
        IModelApp.viewManager.dropViewport(activeViewportRef.current);
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        activeViewportRef.current.dispose();
        activeViewportRef.current = undefined;
        setViewport(undefined);
      }
      // 错误随链生灭（M5-T2 评审 Important 承接）：创建链的 error 出口
      // 归其所属链——tab 切换重开 iModel 时上一链的失败不得残留（消费方按
      // error 呈现错误面/状态栏，陈旧错误会把健康的新链误报成失败）。
      setError(null);
    };
  }, [iModel, viewportRef, clearFilterFailure, reportFilterFailure]);

  // P2.5：active scope 切换（B 页签）——同一 iModel/连接下原地切换模型选择并
  // 重取景。依赖面 = viewport 实例 + 白名单内容签名：无关重渲染不触发；A
  // （签名 null）在创建链已按全模型配置，首跑即命中「已应用」直接返回。
  // 创建链在途时切 scope：链落定 setViewport 会再触发本 effect，按签名差异补应用。
  useEffect(() => {
    const activeViewport = activeViewportRef.current;
    if (!activeViewport) return;

    const applied = appliedFilterRef.current;
    const pending = pendingFilterRef.current;
    // R1：已应用 key 命中时仍需检查在途 apply——K1（已应用）→ K2（apply 在途）
    // →快速切回 K1 时，若直接 early-return，K2 的 apply 仍是「最新代际」，
    // 落定后会把 selector/相机置为 K2 且 deps 不再变化（视口长期停在错误
    // scope）。有冲突在途 apply 时必须 ++seq 作废它并重放当前 key。
    const appliedIsCurrent =
      applied?.viewport === activeViewport && applied.key === activeModelKey;
    const pendingConflicts =
      !!pending && pending.viewport === activeViewport && pending.key !== activeModelKey;
    if (appliedIsCurrent && !pendingConflicts) return;

    const seq = ++filterSeqRef.current;
    // F4：代际 + viewport 存活双守卫——iModel 切换/卸载后晚到的 apply 一律作废。
    const isCurrent = (): boolean =>
      seq === filterSeqRef.current && activeViewportRef.current === activeViewport;
    const ids = activeModelIdsRef.current;
    const key = modelIdsKey(ids);
    pendingFilterRef.current = { viewport: activeViewport, key };
    void applyActiveModelFilter(activeViewport, ids, isCurrent)
      .then((appliedOk) => {
        if (!isCurrent()) return;
        pendingFilterRef.current = null;
        if (!appliedOk) {
          // F3：查询失败——fail-closed 已清空选择器，但不标记已应用（错误可见，
          // 下次切 scope 重试）。旧签名必须作废：否则切回原 scope 会命中陈旧
          // 「已应用」而跳过重建。
          appliedFilterRef.current = null;
          setAppliedModelKey(undefined);
          reportFilterFailure();
          return;
        }
        appliedFilterRef.current = { viewport: activeViewport, key };
        clearFilterFailure();
        setAppliedModelKey(key);
      })
      .catch(() => {
        // R1：apply 内 model load 等拒绝的 catch 路径同样必须作废陈旧签名，
        // 否则切回旧 scope 会命中「已应用」而跳过重建（selector 停在新 scope）。
        if (!isCurrent()) return;
        pendingFilterRef.current = null;
        appliedFilterRef.current = null;
        setAppliedModelKey(undefined);
        reportFilterFailure();
      });
  }, [viewport, activeModelKey, reportFilterFailure, clearFilterFailure]);

  return { viewportRef, phase, error, viewport, appliedModelKey, filterError };
}

/** 白名单内容签名：undefined（A 全模型）与空数组（无活动模型）严格区分。 */
function modelIdsKey(activeModelIds: readonly string[] | undefined): string | null {
  return activeModelIds === undefined ? null : JSON.stringify(activeModelIds);
}

/**
 * 解析视图应显示的物理模型集合（P2.5）：
 * - `undefined` = 不过滤（A legacy 全模型）；
 * - 数组 = 与 iModel 实际 PhysicalModel 求交（注册表 physModelId 不在库中时
 *   结果为空——绝不回落全模型）。
 */
function resolveVisibleModelIds(
  allModelIds: readonly string[],
  activeModelIds: readonly string[] | undefined,
): string[] {
  if (activeModelIds === undefined) return [...allModelIds];
  const active = new Set(activeModelIds);
  return allModelIds.filter((id) => active.has(id));
}

/**
 * 同步 ModelSelector：`dropOthers=true`（B）先移除白名单外既有条目——保存的
 * 视图可能含全部模型，active scope 切换/首次打开都必须清掉隐藏 scope 的几何；
 * A（false）依赖 legacy 行为，只增不减。
 */
interface ModelSelectorDiff {
  added: string[];
  dropped: string[];
}

function syncModelSelector(
  view: SpatialViewState,
  visibleModelIds: readonly string[],
  dropOthers: boolean,
): ModelSelectorDiff {
  const dropped: string[] = [];
  if (dropOthers) {
    const visible = new Set(visibleModelIds);
    const stale = [...view.modelSelector.models].filter((id) => !visible.has(id));
    if (stale.length > 0) {
      view.modelSelector.dropModels(stale);
      dropped.push(...stale);
    }
  }
  const added = visibleModelIds.filter((id) => !view.modelSelector.has(id));
  if (added.length > 0) view.modelSelector.addModels(added);
  return { added, dropped };
}

/**
 * 内容感知取景：按给定模型的联合范围（后端 ECSQL 查询，不依赖 tile 时序）。
 * F2：`isCurrent` 在范围查询返回后、相机写入前复查——快速连切时旧 scope 的
 * 晚到结果不得覆盖新 scope 的取景。
 */
async function fitViewToModelRanges(
  viewport: ScreenViewport,
  modelIds: readonly string[],
  isCurrent: () => boolean,
): Promise<void> {
  // 无可见模型（damaged/未解析 scope）：不取景，保留空视图——避免回退 projectExtents。
  if (modelIds.length === 0) return;
  try {
    const ranges = await viewport.iModel.models.queryModelRanges([...modelIds]);
    if (!isCurrent()) return;
    const union = new Range3d();
    for (const r of ranges) union.extendRange(Range3d.fromJSON(r));
    if (!union.isNull) {
      viewport.view.lookAtViewAlignedVolume(union, viewport.viewRect.aspect);
      viewport.synchWithView({});
      // eslint-disable-next-line no-console
      console.log('[useViewport] Content-aware fit:', JSON.stringify(union.toJSON()));
    }
  } catch {
    // 后端查询不可用——维持既有取景（projectExtents 兜底）
  }
}

/**
 * 原地应用 active-scope 模型白名单（P2.5）：清白名单外模型 → 补入/加载 active
 * 模型（drop+add 触发 SpatialTileTreeReferences 重建）→ 按 active 模型联合范围
 * 重取景 → invalidateScene。不重建 viewport、不重开连接。
 * `isCurrent` 代际 + viewport 存活守卫：切 scope 连发/换库/卸载后被取代的
 * apply 不再落定中间态。
 * @returns true = 已应用；false = 被取代或物理模型查询失败（B fail-closed 时
 *   已清空 selector，调用方不得记 appliedFilterRef）。
 */
async function applyActiveModelFilter(
  viewport: ScreenViewport,
  activeModelIds: readonly string[] | undefined,
  isCurrent: () => boolean,
): Promise<boolean> {
  const view = viewport.view;
  if (!(view instanceof SpatialViewState)) return true;

  const iModel = viewport.iModel;
  const allModelIds = await queryAllPhysicalModelIds(iModel);
  if (!isCurrent()) return false;

  if (allModelIds === undefined) {
    // F3：查询失败 ≠ 空 scope。A legacy 视同空（旧行为，不动选择器）；
    // B fail-closed：清空选择器以免残留/显示错误 scope，但不标记已应用。
    if (activeModelIds === undefined) return true;
    syncModelSelector(view, [], true);
    viewport.synchWithView();
    viewport.invalidateScene();
    return false;
  }

  const visibleModelIds = resolveVisibleModelIds(allModelIds, activeModelIds);
  syncModelSelector(view, visibleModelIds, activeModelIds !== undefined);

  const unloaded = visibleModelIds.filter((id) => !iModel.models.getLoaded(id));
  if (unloaded.length > 0) {
    await iModel.models.load(unloaded);
    if (!isCurrent()) return false;
    // load 完成（渲染循环可能已跑过）→ drop+add 触发 refs 重建（BRep 断点②）
    view.modelSelector.dropModels(unloaded);
    view.modelSelector.addModels(unloaded);
    // eslint-disable-next-line no-console
    console.log('[useViewport] Loaded', unloaded.length, 'active-scope models + rebuilt refs');
  }

  // F2/F4：load 是最后一跳 await；写相机/同步前复查代际与 viewport 存活。
  if (!isCurrent()) return false;
  viewport.synchWithView();
  // 范围查询在同步选择后（不依赖 tile 加载时序）；无模型时不取景。
  await fitViewToModelRanges(viewport, visibleModelIds, isCurrent);
  if (!isCurrent()) return false;
  viewport.invalidateScene();
  // eslint-disable-next-line no-console
  console.log(
    '[useViewport] Active scope models:',
    visibleModelIds.length,
    'of',
    allModelIds.length,
  );
  return true;
}

/**
 * Get default view state from iModel（移植自旧查看器包 useViewport.ts）
 * P2.5：按 activeModelIds 只把 active scope 的物理模型放进视图（undefined=全模型）。
 */
async function getDefaultViewState(
  iModel: IModelConnection,
  activeModelIds: readonly string[] | undefined,
): Promise<ViewState | undefined> {
  // Get view definitions from iModel
  const viewSpecs = await iModel.views.queryProps({});
  if (viewSpecs.length > 0) {
    // Use first view or find a default named view（id 缺省的坏 spec 视同无可用视图）
    const defaultViewSpec = viewSpecs.find((v) => v.code.value === 'Default') ?? viewSpecs[0];
    if (!defaultViewSpec?.id) {
      return undefined;
    }
    const view = await iModel.views.load(defaultViewSpec.id);

    // For spatial views, ensure we have all categories and models
    // This is critical for editing tools to work properly
    if (view instanceof SpatialViewState) {
      await ensureViewHasCategoriesAndModels(view, iModel, activeModelIds);
    }

    return view;
  }

  // No view definitions found - create a default 3D view (e.g. empty iModel)
  try {
    const creator = new ViewCreator3d(iModel);
    const view = await creator.createDefaultView();

    // Ensure view has categories and models for editing tools
    if (view instanceof SpatialViewState) {
      await ensureViewHasCategoriesAndModels(view, iModel, activeModelIds);
    }

    return view;
  } catch {
    return undefined;
  }
}

/**
 * Ensure the view has all available categories and models displayed.
 * This is critical for editing tools to work properly.
 * Following display-test-app's pattern (IdPicker.ts)
 */
async function ensureViewHasCategoriesAndModels(
  view: SpatialViewState,
  iModel: IModelConnection,
  activeModelIds: readonly string[] | undefined,
): Promise<void> {
  // Query for available categories and add them to the view
  const categoryIds = await queryAllSpatialCategoryIds(iModel);
  if (categoryIds.length > 0) {
    for (const catId of categoryIds) {
      if (!view.categorySelector.has(catId)) {
        view.categorySelector.addCategories([catId]);
      }
    }
    // eslint-disable-next-line no-console
    console.log('[useViewport] Added', categoryIds.length, 'categories to view');
  }

  // Query for available models and add only the active scope's ones (P2.5).
  const allModelIds = await queryAllPhysicalModelIds(iModel);
  // F3：查询失败（undefined）≠ 空 scope。A legacy 视同空；B 不在此处动视图
  // （视口尚未创建），交给 setupViewCategoriesAndModels 做 fail-closed + 报错。
  if (allModelIds === undefined) return;
  const modelIds = resolveVisibleModelIds(allModelIds, activeModelIds);
  if (allModelIds.length > 0) {
    // B：保存的视图可能已含全部模型——先清掉白名单外条目（隐藏 scope 不可见）。
    syncModelSelector(view, modelIds, activeModelIds !== undefined);
    // ModelState 必须显式加载（addModels 不会触发加载；未加载的 model 不建 tile tree——见 setupViewCategoriesAndModels 同款注释）
    const unloaded = modelIds.filter((id) => !iModel.models.getLoaded(id));
    if (unloaded.length > 0) await iModel.models.load(unloaded);
    // eslint-disable-next-line no-console
    console.log('[useViewport] Added', modelIds.length, 'of', allModelIds.length, 'models to view');
  }
}

/**
 * Query for all SpatialCategory IDs in the iModel.
 * Based on display-test-app's IdPicker.ts pattern.
 */
async function queryAllSpatialCategoryIds(iModel: IModelConnection): Promise<string[]> {
  try {
    // Query all SpatialCategories (not just used ones, to ensure we have them for new elements)
    const query = `SELECT ECInstanceId FROM BisCore.SpatialCategory`;
    const rows: string[] = [];
    for await (const row of iModel.createQueryReader(query)) {
      rows.push(row[0] as string);
    }
    return rows;
  } catch {
    return [];
  }
}

/**
 * Query for all SubCategory IDs（渲染画像的面覆盖键——含各类别缺省子类别）。
 */
async function queryAllSubCategoryIds(iModel: IModelConnection): Promise<string[]> {
  try {
    const query = `SELECT ECInstanceId FROM BisCore.SubCategory`;
    const rows: string[] = [];
    for await (const row of iModel.createQueryReader(query)) {
      rows.push(row[0] as string);
    }
    return rows;
  } catch {
    return [];
  }
}

/**
 * Query for all PhysicalModel IDs in the iModel.
 * F3：查询失败返回 `undefined`（与「确实没有 PhysicalModel」= `[]` 区分）——
 * B 路径据此 fail-closed（不显示任何模型、不标记已应用、错误可见）。
 */
async function queryAllPhysicalModelIds(iModel: IModelConnection): Promise<string[] | undefined> {
  try {
    const query = `SELECT ECInstanceId FROM BisCore.PhysicalModel`;
    const rows: string[] = [];
    for await (const row of iModel.createQueryReader(query)) {
      rows.push(row[0] as string);
    }
    return rows;
  } catch {
    return undefined;
  }
}

/**
 * Setup viewport with all categories and models for editing.
 * Called after viewport is created to ensure editing tools work.
 * P2.5：B（activeModelIds 有值）只把 active scope 的物理模型放进选择器并取景；
 * A（undefined）保持 legacy 全模型行为。
 */
async function setupViewCategoriesAndModels(
  viewport: ScreenViewport,
  activeModelIds: readonly string[] | undefined,
  isAlive: () => boolean,
): Promise<boolean> {
  const view = viewport.view;
  if (!(view instanceof SpatialViewState)) {
    return true;
  }

  // Query and add all categories/models (they may have been added to iModel after view was saved)
  const iModel = viewport.iModel;

  // Get all categories and ensure they're in the view
  const categoryIds = await queryAllSpatialCategoryIds(iModel);
  if (!isAlive()) return false;
  let categoriesChanged = false;
  for (const catId of categoryIds) {
    if (!view.categorySelector.has(catId)) {
      view.categorySelector.addCategories([catId]);
      categoriesChanged = true;
    }
  }

  // Get all physical models, keep only the active scope's ones (P2.5)。
  // 保存的视图可能已含全部模型：B 下白名单外条目必须移除（隐藏 scope 的几何
  // 不可见/不可拾取）；A 保持 legacy 只增不减。
  const allModelIds = await queryAllPhysicalModelIds(iModel);
  if (!isAlive()) return false;

  if (allModelIds === undefined) {
    if (activeModelIds === undefined) {
      // A legacy：查询失败视同空（旧行为）——不动视图、不取景。
      return true;
    }
    // F3：B fail-closed——清空选择器（绝不显示错误 scope），错误由调用方呈现。
    syncModelSelector(view, [], true);
    viewport.synchWithView();
    return false;
  }

  const modelIds = resolveVisibleModelIds(allModelIds, activeModelIds);
  const diff = syncModelSelector(view, modelIds, activeModelIds !== undefined);

  // CRITICAL（BRep 显示 bug 主断点修复，2026-10-09）：
  // 1) ModelState 必须显式加载——viewport 的 SpatialTileTreeReferences.updateModels 只为
  //    首帧迭代时已加载的 model 建 TileTreeReference，未加载的 model 即使进了 modelSelector
  //    也不会请求 tile（症状：服务端后建的物理 model 几何永不显示）。
  // 2) SpatialRefs 的 _allLoaded 缓存——首帧后新加载的 model 不再自动进 refs，须
  //    drop+add 触发 markModelSelectorChanged → refs 重建（Playwright 双探针实证）。
  const unloadedModels = modelIds.filter((id) => !iModel.models.getLoaded(id));
  if (unloadedModels.length > 0) {
    await iModel.models.load(unloadedModels);
    if (!isAlive()) return false;
    // load 完成（此刻渲染循环可能已跑过首帧）→ drop+add 已加载的 model 触发 refs 重建
    view.modelSelector.dropModels(unloadedModels);
    view.modelSelector.addModels(unloadedModels);
    // eslint-disable-next-line no-console
    console.log('[useViewport] Loaded', unloadedModels.length, 'unloaded models + rebuilt refs');
  }

  if (categoriesChanged || diff.added.length > 0 || diff.dropped.length > 0) {
    // eslint-disable-next-line no-console
    console.log(
      '[useViewport] View updated with',
      categoryIds.length,
      'categories and',
      modelIds.length,
      'of',
      allModelIds.length,
      'models',
    );
    // Sync the viewport with the updated view state
    viewport.synchWithView();
  }

  // 内容感知初始取景（2026-10-10 重开空屏末段根因）：种子库 projectExtents（±500）远大于
  // 米级特征内容——初始视图/「适应」在 tile 树加载前取景时 computeFitRange 回退
  // projectExtents → 相机落在一公里外，几何小到不可见。模型进 selector 后按模型范围
  // 联合集（后端 ECSQL 查询，不依赖 tile 加载时序）取景；查询失败/空范围维持原行为。
  // P2.5：B 只按 active 模型取景；无模型（damaged/空）不取景。
  await fitViewToModelRanges(viewport, modelIds, isAlive);
  return true;
}
