/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * PartStudioPage（M3 Task 3 壳；T7 页签管理器接线；M4 Task 2 真连接组合）：
 * /documents/:iTwinId/:iModelId Part Studio 编辑器布局壳（对齐 Onshape os-11 五区）——
 * - 顶栏（PartStudioTopBar）：品牌 + 面包屑（文档/iTwin/iModel）+ 分支徽标 +
 *   分享 + 用户菜单 + 帮助；
 * - 左栏（PartStudioSidebar）：窄图标条 + 双段树（特征/零件）；
 * - 中央画布（PartStudioCanvas）：viewport 挂载点；
 * - 右停靠（PartStudioDock）：工具设置/版本历史/显示设置三页签；
 * - 底部（PartStudioTabs）：页签条（适应视图/「+」开页签管理器[T7，os-33]/
 *   Part Studio 1）+ 状态栏（连接态/编辑模式/单位/视图类型）。
 *
 * 查看器接线（M4-T2 组合链，双层组件定序）：
 * - 外层 PartStudioPage：useBriefcaseConnection({iTwinId, iModelId,
 *   readonly: viewOnly})——viewOnly 取 store 仅查看切片（计划权限门裁决：可编辑 =
 *   !viewOnly；briefcase 默认可写打开）；
 * - 内层 PartStudioSession：connection 作 iModel 下传 useViewport
 *   （BriefcaseConnection extends IModelConnection——ScreenViewport 创建/类目模型
 *   补全/内容感知取景全链在 viewer-next）→ viewport 下传 PartStudioCanvas +
 *   Onshape 底色接线（applyViewportBackground + MutationObserver 监听
 *   documentElement[data-theme]，同旧 Editor.tsx 姿态——不用 useTheme，页面测试
 *   无 ThemeProvider）；
 * - **为何拆两层**：React effect 子先父后——内层 useViewport 的挂载副作用
 *   （acquireViewer）先于外层 useBriefcaseConnection 的打开副作用执行，host 的
 *   IpcApp._ipc 在其同步前缀就位，随后的 downloadBriefcase IPC 由 LocalTransport
 *   缓冲至 WebSocket 开启（vendored core-frontend 语义），消除「连接先于 host」
 *   的启动竞态（单组件顺序下 downloadBriefcase 必然首挂载被拒）；
 * - 工具注册（M4-T3）：phase ready → waitForToolAdmin 轮询（100ms×50）→
 *   ensureEditTools（EditTools.initialize + 注册表 + 快捷键子集）——失败走
 *   IModelApp.notifications 错误面（旧 Editor.tsx:262-309 序移植）；轮询 5s
 *   耗尽同样错误面可见不静默（M4-T8 收 M3-T3 挂单）。注册后
 *   ribbon/命令搜索的 8 个真实 toolId（RoundEdges/DraftFaces/…）tools.run 直投
 *   真启动（useToolActivation 本任务不动）；
 * - 编辑作用域 + 撤销/重做/保存（M4-T4）：三 hook 挂 **Session 内层**
 *   （connection prop 已在此层；外层只持 useBriefcaseConnection 组装）——
 *   useEditingScope（Editor.tsx:322-371 忠实移植：复用/回查/卸载退出）、
 *   useUndoRedo（BriefcaseTxns 标准通道：txns 三查询 + onCommit/onCommitted/
 *   onAfterUndoRedo/onChangesPushed 事件驱动布尔；undo/redo 投内置工具
 *   'Undo'/'Redo'）、useEditorKeyboard（只补 Ctrl+S——undo/redo/Delete/
 *   Escape 键位 viewer-next registerDefaultShortcuts 独占，勿二次绑定）；
 * - editorToolSettings 配置段（Editor.tsx:200-235 移植）：viewport+connection+
 *   scope 就绪后校准默认类目/模型 + 空间视图默认开项目范围装饰件。
 *
 * backendUrl 传同源（MS CORS 钉死 :5300，web-next :5310 走 vite 代理，见
 * vite.config.ts 注记；姿态同 DevViewerRoute），相位上供状态栏。ribbon/命令
 * 搜索（T4）挂顶栏下。
 *
 * 拉伸闭环（M4-T6）：Session 内层挂 useFeatureSystem（编辑作用域就绪后
 * enabled——树/applyOp 单实例，双挂载=双 sessionId 双写租约）+
 * useFeatureDisplaySync（几何出现链收口）；树经 Sidebar props 直通（六态），
 * 对话框提交面经 Canvas applyOp 直通——ribbon「拉伸」→ FeatureDialog(new/
 * extrude) → insertFeature 落库 → onCommitted+refresh → 树新条目 → 显示同步
 * 几何出现。
 *
 * 版本历史/保存推送（M4-T7）：Session 内层持共享 PushChangesetDialog 实例——
 * 顶栏「保存版本」钮（T4 评审 Important-1 裁定：每 op 自动 saveChanges 下旧
 * 「保存」钮 no-op 提交永不回落，改推送入口）与 dock「推送」钮同开此对话框；
 * 确认走 `connection.pushChanges(description)`（本地 Txns 打包 changeset 上
 * hub），成功后失效 `['part-studio','changesets']` 刷新 dock 面板，收点 =
 * onChangesPushed 事件（useUndoRedo 已订）驱动 hasPendingTxns 归 false。
 * dock「保存」钮与 Ctrl+S 键位保留 saveChanges 本地兜底语义（与推送分离）。
 */

import React, { useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  applyViewportBackground,
  ensureEditTools,
  toggleProjectExtents,
  useBriefcaseConnection,
  useViewport,
} from '@luban-cad/viewer-next';
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import { AuthSession } from '@clients/auth/AuthSession.js';
import { env } from '@config/env.js';
import { viewerNotifications } from '@app/providers/ViewerNotifications.js';
import { PartStudioTopBar } from './components/PartStudioTopBar.js';
import { PartStudioSidebar } from './components/PartStudioSidebar.js';
import { PartStudioCanvas } from './components/PartStudioCanvas.js';
import { PartStudioDock } from './components/PartStudioDock.js';
import { PartStudioTabs } from './components/PartStudioTabs.js';
import { PushChangesetDialog } from './dialogs/PushChangesetDialog.js';
import { Ribbon } from './ribbon/Ribbon.js';
import { CommandPalette } from './ribbon/CommandPalette.js';
import { useEditingScope } from './hooks/useEditingScope.js';
import { useEditorKeyboard } from './hooks/useEditorKeyboard.js';
import { useFeatureDisplaySync } from './hooks/useFeatureDisplaySync.js';
import { useFeatureSystem } from './hooks/useFeatureSystem.js';
import { useUndoRedo } from './hooks/useUndoRedo.js';
import { usePartStudioStore } from './stores/use-part-studio-store.js';
import './PartStudioPage.css';

export function PartStudioPage(): React.JSX.Element {
  const { iTwinId, iModelId } = useParams<{ iTwinId: string; iModelId: string }>();
  // 权限门（计划裁决）：可编辑 = !viewOnly（M3-T7 仅查看模式切片）；
  // briefcase 默认可写打开，viewOnly 激活时 readonly 打开（不占写位）。
  const viewOnly = usePartStudioStore((s) => s.viewOnly.isActive);
  // 连接先行（ids 未载前 null 短路）；effect 定序见文件头注「为何拆两层」。
  const briefcase = useBriefcaseConnection(
    iTwinId && iModelId ? { iTwinId, iModelId, readonly: viewOnly } : null,
  );

  return (
    <PartStudioSession
      iTwinId={iTwinId ?? ''}
      iModelId={iModelId ?? ''}
      connection={briefcase.connection}
    />
  );
}

interface PartStudioSessionProps {
  iTwinId: string;
  iModelId: string;
  connection: BriefcaseConnection | null;
}

function PartStudioSession({ iTwinId, iModelId, connection }: PartStudioSessionProps): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // 可编辑 = !viewOnly（权限门同外层连接口径）；viewOnly 时编辑作用域不进入
  //（readonly briefcase 无编辑面），键盘保存亦不挂。
  const viewOnly = usePartStudioStore((s) => s.viewOnly.isActive);
  // 会话由 RequireAuth 门保证在场；token 静态传入（M3 雷②闭环：渲染期取一次，
  // 与 DevViewerRoute 同姿态；动态续接的 token 刷新闭环在 viewer-next 演进）。
  const { viewportRef, phase, viewport } = useViewport({
    backendUrl: window.location.origin,
    hubUrl: env.hubUrl,
    accessToken: AuthSession.getStoredAuth()?.accessToken,
    iModel: connection ?? undefined,
    // notifications 呈现桥（review-8 I-2）：官方注入点换掉 core 缺省哑通道，
    // registrationFailed/超时面/工具错误经 iTwinUI toaster 可见（app 生命期
    // 单例——稳定身份，不构成重 acquire 触发面）。
    notifications: viewerNotifications,
  });

  // 编辑作用域（M4-T4；Editor.tsx:322-371 忠实移植）：进入/复用/失败回查/
  // 卸载退出——hook 内部自治，页面只消费 isReady（editorToolSettings 配置段的
  // 就绪门，特征系统/工具面复用）。
  const { isReady: isEditingScopeReady } = useEditingScope(connection ?? undefined, !viewOnly);

  // 特征系统中枢（M4-T5 移植 + M4-T6 接线）：编辑作用域就绪后 enabled
  //（viewOnly/readonly 连接被 useEditingScope 的 enabled 门拦截——单一裁决点，
  // 勿二次判定）；树/loading/error/applyOp 经 props 直通 Sidebar（六态）与
  // Canvas（对话框提交面）。单挂载铁律：双实例=双 sessionId=双写租约竞争。
  const featureSystem = useFeatureSystem(connection ?? undefined, {
    enabled: isEditingScopeReady,
  });

  // 特征显示同步（M4-T5 移植 + M4-T6 接线）：特征写入后的几何出现链收口——
  // 绕过 GraphicalEditingScope 下 ModelChangeMonitor 的 guid 缓冲（BRep 显示
  // bug 层③修复），与 useFeatureSystem 同层挂载。
  useFeatureDisplaySync(connection ?? undefined);

  // 撤销/重做/保存（M4-T4；BriefcaseTxns 标准通道，禁旧自造 UndoManager）。
  const undoRedo = useUndoRedo(connection);

  // 顶栏三回调 viewOnly 门（T4 评审 Minor-1）：与键盘保存同口径——仅查看态下
  // 三钮点击不触发（连接虽可写打开，编辑面已整体收口）。
  // undo/redo 拒绝就地吞（T4 评审 Minor-6：tools.run 理论可拒，不逃逸为
  // unhandled rejection；保存走 notifications 错误面，另口径）。
  const handleUndo = useCallback(() => {
    if (viewOnly) return;
    void undoRedo.undo().catch(() => undefined);
  }, [viewOnly, undoRedo]);

  const handleRedo = useCallback(() => {
    if (viewOnly) return;
    void undoRedo.redo().catch(() => undefined);
  }, [viewOnly, undoRedo]);

  // 保存错误面（registration-failed 同款 notifications 通道）：保存失败必须
  // 可见，不静默吞（M3-b T4 教训）。本地兜底通道（Ctrl+S 键位与 dock「保存」
  // 钮共用；推送通道见 handleSaveVersion/handlePushConfirm）。
  const handleSave = useCallback(() => {
    if (viewOnly) return;
    void undoRedo.saveChanges().catch((err: unknown) => {
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Error,
          t('partStudio.topBar.edit.saveFailed', {
            message: err instanceof Error ? err.message : String(err),
          }),
        ),
      );
    });
  }, [viewOnly, undoRedo, t]);

  // 保存版本入口（M4-T7；T4 评审 Important-1 承接）：顶栏「保存版本」钮与
  // dock「推送」钮共同开共享推送对话框（连接缺失/viewOnly 门拦截——连接未就绪
  // 时无可推送内容，诚实不响应）。
  const [pushDialogOpen, setPushDialogOpen] = React.useState(false);
  const handleSaveVersion = useCallback(() => {
    if (viewOnly || !connection) return;
    setPushDialogOpen(true);
  }, [viewOnly, connection]);

  // 推送确认（connection.pushChanges 标准通道）：成功后失效 changesets 查询
  // 刷新 dock 面板（服务端态归 react-query）；hasPendingTxns 归 false 由
  // onChangesPushed 事件驱动（useUndoRedo 已订）——推送对话框的失败就地/
  // 成功 toast 归对话框自治，此处只承诺通道与刷新。
  const handlePushConfirm = useCallback(
    async (description: string): Promise<void> => {
      if (!connection) return;
      await connection.pushChanges(description);
      await queryClient.invalidateQueries({ queryKey: ['part-studio', 'changesets', iModelId] });
    },
    [connection, iModelId, queryClient],
  );

  // 键盘（M4-T4）：只补 Ctrl+S——Ctrl+Z/Ctrl+Y/Delete/Escape 由 viewer-next
  // registerDefaultShortcuts 独占（T3 交接裁定：二次绑定 = 工具双跑）。
  useEditorKeyboard(!viewOnly, { save: handleSave });

  // editorToolSettings 配置段（M4-T4；Editor.tsx:200-235 移植）：viewport+
  // connection+scope 三就绪后校准工具默认类目/模型，空间视图默认开项目范围
  // 装饰件（D4 必办挂账的运行时入口）。
  useEffect(() => {
    if (!viewport || !connection || !isEditingScopeReady) return;
    const conn = connection;
    if (!conn.isBriefcaseConnection()) return;

    const settings = conn.editorToolSettings;
    const view = viewport.view;

    // 校准并更新类目（默认取类目选择器首个）。
    if (settings.category === undefined || !view.viewsCategory(settings.category)) {
      settings.category = undefined;
      for (const catId of view.categorySelector.categories) {
        settings.category = catId;
        break;
      }
    }

    // 校准并更新模型（2d 取 baseModel；3d 空间视图取模型选择器首个）。
    if (settings.model === undefined || !view.viewsModel(settings.model)) {
      settings.model = undefined;
      if (view.is2d()) {
        settings.model = view.baseModelId;
      } else if (view.isSpatialView()) {
        for (const modId of view.modelSelector.models) {
          settings.model = modId;
          break;
        }
      }
    }

    // 空间视图默认开启项目范围装饰件。
    if (view.isSpatialView()) {
      toggleProjectExtents(conn, true);
    }
  }, [viewport, connection, isEditingScopeReady]);

  // 工具注册编排（M4-T3；旧 Editor.tsx:262-309 序忠实移植）：host 就绪
  //（phase ready = LocalhostIpcApp.startup 完成）→ waitForToolAdmin 轮询
  //（100ms × 50 封顶）→ ensureEditTools（EditTools.initialize + 注册表 +
  // 快捷键子集，幂等）。失败必须 notifications 可见——旧应用曾把注册失败
  // 静默吞掉，其后注册行与快捷键全部不执行（Editor.tsx:287-301 教训）。
  useEffect(() => {
    if (phase !== 'ready') return;

    let cancelled = false;

    const waitForToolAdmin = async (): Promise<boolean> => {
      for (let i = 0; i < 50; i++) {
        if (cancelled) return false;
        if (IModelApp.initialized && IModelApp.toolAdmin) {
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return false;
    };

    const initTools = async (): Promise<void> => {
      const ready = await waitForToolAdmin();
      if (cancelled) return;
      if (!ready) {
        // M4-T8（M3-T3 挂单）：轮询 5s 耗尽 ToolAdmin 未就绪——工具带/快捷键
        // 全灭且无诊断线索，必须错误面可见（同注册失败不静默口径），且不误投
        // ensureEditTools。
        IModelApp.notifications.outputMessage(
          new NotifyMessageDetails(
            OutputMessagePriority.Error,
            t('partStudio.tools.waitForAdminTimeout'),
          ),
        );
        return;
      }

      try {
        await ensureEditTools();
      } catch (err) {
        if (cancelled) return;
        // 工具注册失败必须可见（同旧应用口径：错误面吞掉 = 工具全灭且无诊断线索）
        IModelApp.notifications.outputMessage(
          new NotifyMessageDetails(
            OutputMessagePriority.Error,
            t('partStudio.tools.registrationFailed', {
              message: err instanceof Error ? err.message : String(err),
            }),
          ),
        );
      }
    };

    void initTools();

    return () => {
      cancelled = true;
    };
  }, [phase, t]);

  // Onshape 式视口底色：亮色浅灰/暗色深灰。数据模型里的 view 背景默认黑，观感
  // 与 Onshape 差距最大的一处。观察 ThemeProvider 写入的 documentElement[data-theme]
  // 并监听属性变化（MutationObserver，同旧 Editor.tsx:243-260 姿态）。
  useEffect(() => {
    if (!viewport) return;
    const apply = (): void => {
      const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      applyViewportBackground(viewport, theme);
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-iui-theme'],
    });
    return () => observer.disconnect();
  }, [viewport]);

  return (
    <div className="part-studio-page" data-testid="part-studio-page">
      <PartStudioTopBar
        iTwinId={iTwinId}
        iModelId={iModelId}
        canUndo={undoRedo.canUndo}
        canRedo={undoRedo.canRedo}
        hasUnsavedChanges={undoRedo.hasUnsavedChanges}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSave={handleSaveVersion}
      />
      {/* 工具 ribbon（os-11 第二行）：27 工具 + 8 下拉 + 命令搜索触发钮。 */}
      <Ribbon />
      <div className="part-studio-body">
        <PartStudioSidebar
          entries={featureSystem.tree}
          loading={featureSystem.loading}
          error={featureSystem.error}
          onRetry={featureSystem.refresh}
          connection={connection ?? undefined}
        />
        <div className="part-studio-main">
          <PartStudioCanvas
            viewportRef={viewportRef}
            viewport={viewport}
            applyOp={featureSystem.applyOp}
            leaseOk={featureSystem.leaseOk}
          />
          <PartStudioDock
            iModelId={iModelId}
            currentChangesetId={connection?.changeset?.id ?? null}
            hasUnsavedChanges={undoRedo.hasUnsavedChanges}
            isSaving={undoRedo.isSaving}
            onSave={handleSave}
            onPush={handleSaveVersion}
          />
        </div>
      </div>
      <PartStudioTabs iTwinId={iTwinId} iModelId={iModelId} connection={phase} />
      {/* 推送对话框（M4-T7）：顶栏「保存版本」钮与 dock「推送」钮的共享实例
          （确认走 connection.pushChanges；失败就地/成功 toast 归对话框自治）。 */}
      {connection && (
        <PushChangesetDialog
          isOpen={pushDialogOpen}
          onClose={() => setPushDialogOpen(false)}
          onConfirm={handlePushConfirm}
        />
      )}
      {/* 命令搜索面板：页面级常驻挂载（alt+/ 热键经 store 驱动开合）。 */}
      <CommandPalette />
    </div>
  );
}
