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
 */

import { type RefObject, useEffect, useRef, useState } from 'react';
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
}

export function useViewport(options: UseViewportOptions): UseViewportResult {
  const { backendUrl, hubUrl, accessToken, iModel, notifications } = options;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<ViewportPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ScreenViewport | undefined>(undefined);
  // 活跃 viewport 引用（state 之外）：清理路径需同步 drop+dispose
  const activeViewportRef = useRef<ScreenViewport | undefined>(undefined);

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
        const view = await getDefaultViewState(iModel);
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
        // This is required for editing tools to work properly
        await setupViewCategoriesAndModels(newViewport);

        // Onshape 视觉基线（2026-10-26 渲染对齐阶段 1）：可见深灰边线 + 灯光
        // 重配 + 全类别中灰哑光覆盖 + MSAA——存量库/新库一致生效（详见 render-profile.ts）。
        try {
          const subCategoryIds = await queryAllSubCategoryIds(iModel);
          applyRenderProfile(newViewport, subCategoryIds);
        } catch {
          // 画像应用失败不阻断视口（基线观感缺位，功能链不受影响）
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
  }, [iModel, viewportRef]);

  return { viewportRef, phase, error, viewport };
}

/**
 * Get default view state from iModel（移植自旧查看器包 useViewport.ts）
 */
async function getDefaultViewState(iModel: IModelConnection): Promise<ViewState | undefined> {
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
      await ensureViewHasCategoriesAndModels(view, iModel);
    }

    return view;
  }

  // No view definitions found - create a default 3D view (e.g. empty iModel)
  try {
    const creator = new ViewCreator3d(iModel);
    const view = await creator.createDefaultView();

    // Ensure view has categories and models for editing tools
    if (view instanceof SpatialViewState) {
      await ensureViewHasCategoriesAndModels(view, iModel);
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
async function ensureViewHasCategoriesAndModels(view: SpatialViewState, iModel: IModelConnection): Promise<void> {
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

  // Query for available models and add them to the view
  const modelIds = await queryAllPhysicalModelIds(iModel);
  if (modelIds.length > 0) {
    for (const modId of modelIds) {
      if (!view.modelSelector.has(modId)) {
        view.modelSelector.addModels([modId]);
      }
    }
    // ModelState 必须显式加载（addModels 不会触发加载；未加载的 model 不建 tile tree——见 setupViewCategoriesAndModels 同款注释）
    const unloaded = modelIds.filter((id) => !iModel.models.getLoaded(id));
    if (unloaded.length > 0) await iModel.models.load(unloaded);
    // eslint-disable-next-line no-console
    console.log('[useViewport] Added', modelIds.length, 'models to view');
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
 * Query for all PhysicalModel IDs in the iModel
 */
async function queryAllPhysicalModelIds(iModel: IModelConnection): Promise<string[]> {
  try {
    const query = `SELECT ECInstanceId FROM BisCore.PhysicalModel`;
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
 * Setup viewport with all categories and models for editing.
 * Called after viewport is created to ensure editing tools work.
 */
async function setupViewCategoriesAndModels(viewport: ScreenViewport): Promise<void> {
  const view = viewport.view;
  if (!(view instanceof SpatialViewState)) {
    return;
  }

  // Query and add all categories/models (they may have been added to iModel after view was saved)
  const iModel = viewport.iModel;

  // Get all categories and ensure they're in the view
  const categoryIds = await queryAllSpatialCategoryIds(iModel);
  let categoriesChanged = false;
  for (const catId of categoryIds) {
    if (!view.categorySelector.has(catId)) {
      view.categorySelector.addCategories([catId]);
      categoriesChanged = true;
    }
  }

  // Get all models and ensure they're in the view
  const modelIds = await queryAllPhysicalModelIds(iModel);
  const newlyAdded: string[] = [];
  for (const modId of modelIds) {
    if (!view.modelSelector.has(modId)) {
      view.modelSelector.addModels([modId]);
      newlyAdded.push(modId);
    }
  }

  // CRITICAL（BRep 显示 bug 主断点修复，2026-10-09）：
  // 1) ModelState 必须显式加载——viewport 的 SpatialTileTreeReferences.updateModels 只为
  //    首帧迭代时已加载的 model 建 TileTreeReference，未加载的 model 即使进了 modelSelector
  //    也不会请求 tile（症状：服务端后建的物理 model 几何永不显示）。
  // 2) SpatialRefs 的 _allLoaded 缓存——首帧后新加载的 model 不再自动进 refs，须
  //    drop+add 触发 markModelSelectorChanged → refs 重建（Playwright 双探针实证）。
  const unloadedModels = modelIds.filter((id) => !iModel.models.getLoaded(id));
  if (unloadedModels.length > 0) {
    await iModel.models.load(unloadedModels);
    // load 完成（此刻渲染循环可能已跑过首帧）→ drop+add 已加载的 model 触发 refs 重建
    view.modelSelector.dropModels(unloadedModels);
    view.modelSelector.addModels(unloadedModels);
    // eslint-disable-next-line no-console
    console.log('[useViewport] Loaded', unloadedModels.length, 'unloaded models + rebuilt refs');
  }

  if (categoriesChanged || newlyAdded.length > 0) {
    // eslint-disable-next-line no-console
    console.log('[useViewport] View updated with', categoryIds.length, 'categories and', modelIds.length, 'models');
    // Sync the viewport with the updated view state
    viewport.synchWithView();
  }

  // 内容感知初始取景（2026-10-10 重开空屏末段根因）：种子库 projectExtents（±500）远大于
  // 米级特征内容——初始视图/「适应」在 tile 树加载前取景时 computeFitRange 回退
  // projectExtents → 相机落在一公里外，几何小到不可见。模型进 selector 后按模型范围
  // 联合集（后端 ECSQL 查询，不依赖 tile 加载时序）取景；查询失败/空范围维持原行为。
  try {
    const ranges = await iModel.models.queryModelRanges(modelIds);
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
