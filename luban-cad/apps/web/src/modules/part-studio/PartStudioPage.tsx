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
 *   readonly: viewOnly || permissions.mode === 'readonly'})——briefcase readonly
 *   三源合流单点（M5-T3）：store 仅查看切片 ∨ iModel 权限只读（usePermissions，
 *   官方 SDK 通道 imodels-v2 GET /imodels/:id/permissions）；权限 isLoading
 *   期间传 null options 关连接（旧应用竞态教训：首开定读写——权限未落定早开
 *   只读连接会因打开 effect deps 不含 readonly 而恒只读，保存必败），落定后
 *   再开；编辑面总门 canEdit = !viewOnly ∧ 权限 editable，props 单点下传
 *   Session（各编辑出口统一消费，下游不二次判定）。B2 只读写门禁（2026-10-23
 *   发布窗）：canEdit 再下传 Canvas→FeatureDialog（写动作语义——✓ 禁用+诚实
 *   提示，不进租约环）+ useFeatureSystem.applyOp readonly 前置拒收（hook 层
 *   兜底防新调用点绕过 UI 门）；viewOnly（用户主动切「仅查看模式」）仍归
 *   视图变身/菜单态语义，与写门分线；
 * - 内层 PartStudioSession：connection 作 iModel 下传 useViewport
 *   （BriefcaseConnection extends IModelConnection——ScreenViewport 创建/类目模型
 *   补全/内容感知取景全链在 viewer）→ viewport 下传 PartStudioCanvas +
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
 *   ribbon/命令搜索的 6 个在册真实 toolId（RoundEdges/HollowFaces/MirrorElements/
 *   LinearPattern/CircularPattern/SweepFaces）tools.run 直投真启动；
 *   DraftFaces/CreateHole 已翻 gated（X-01，无后端命令，不再注册死工具）；
 * - 编辑作用域 + 撤销/重做/保存（M4-T4）：三 hook 挂 **Session 内层**
 *   （connection prop 已在此层；外层只持 useBriefcaseConnection 组装）——
 *   useEditingScope（Editor.tsx:322-371 忠实移植：复用/回查/卸载退出）、
 *   useUndoRedo（BriefcaseTxns 标准通道：txns 三查询 + onCommit/onCommitted/
 *   onAfterUndoRedo/onChangesPushed 事件驱动布尔；undo/redo 投内置工具
 *   'Undo'/'Redo'）、useEditorKeyboard（只补 Ctrl+S——undo/redo/Delete/
 *   Escape 键位 viewer registerDefaultShortcuts 独占，勿二次绑定）；
 * - editorToolSettings 配置段（Editor.tsx:200-235 移植）：viewport+connection+
 *   scope 就绪后校准默认类目/模型 + 空间视图默认开项目范围装饰件。
 *
 * backendUrl 传同源（MS CORS 钉死 :5300，dev 恒走 vite 代理，见
 * vite.config.ts 注记；姿态同 DevViewerRoute），相位上供状态栏。ribbon/命令
 * 搜索（T4）挂顶栏下。
 *
 * 拉伸闭环（M4-T6）：Session 内层挂 useFeatureSystem（编辑作用域就绪后
 * enabled——树/applyOp 单实例，双挂载=双 sessionId 双写租约）+
 * useFeatureDisplaySync（几何出现链收口）；树经 Sidebar props 直通（六态），
 * 对话框提交面经 Canvas applyOp 直通——ribbon「拉伸」→ FeatureDialog(new/
 * extrude) → insertFeature 落库 → onCommitted+refresh → 树新条目 → 显示同步
 * 几何出现。M6-a T6 起提交载荷走草图通道（M6-c T3 起面域寻址为 regions 多选
 * 数组：{sketchId, regions, profile:[]}）——树内 sketch 节点经 mapFeatureEntries 映射成下拉选项随
 * sketches 下传 Canvas，connection.key 随行供对话框 getSketch 面域读面
 *（数据源裁决见 FeatureDialog 头注）。
 *
 * 版本历史/保存推送（M4-T7；B-model P0 Task 5 语义分线）：Session 内层持两个
 * 对话框——顶栏「保存版本」钮开 CreateNamedVersionDialog（useNamedVersionActions：
 * 有未保存变更先 `connection.pushChanges(name)` 再以返回 changeset id 创建
 * Named Version；干净态直接命名最新 changeset；hub 仅元数据命名，不生成
 * checkpoint/缩略图），dock「推送」钮仍开 PushChangesetDialog（纯推送：
 * `connection.pushChanges(description)`，成功后失效 `['part-studio','changesets']`
 * 刷新 dock 面板，收点 = onChangesPushed 事件（useUndoRedo 已订）驱动
 * hasPendingTxns 归 false）。dock「保存」钮与 Ctrl+S 键位保留 saveChanges
 * 本地兜底语义（与推送分离）。
 *
 * **B-model P2.4（编辑器 scope 解析 + 真页签 + URL 生产者 + A 只读）**：
 * - B/A 由 iTwin 标记（`isBModelItwin`）派生（旗标关时直连 B 文档仍是 B）；
 *   B 才开注册表，A 零 registry 调用且只读打开（readonly=true）+ 只读横幅；
 * - 共享编辑会话（useEditorSession）：sessionId/iModelKey/租约单点——
 *   useFeatureSystem 与 usePartStudios（create/rename/delete）及默认 scope 的
 *   pre-editor create 共用同一 id（P2.2 审查 Important）；
 * - scope 解析（usePartStudioScope）：?model= 完整→打开；非法/缺省→第一个
 *   完整 scope（replace 导航）；空文档→创建默认 Part Studio 1（共享租约）后
 *   replace；仅半图→恢复/删除面，绝不自动 create；
 * - 门禁：scope 解析前 useFeatureSystem readEnabled=false（零读 RPC）、
 *   useViewport 不收 iModel；页签切换只换 URL（workspaceRefPath），路由不变
 *   → BriefcaseConnection 不重建；
 * - 半图 degraded（physModelId=''）由 P2.4 后端扩展列出；恢复删除走 HITL 并
 *   与注册表使用同一会话。
 *
 * **B-model P2.5（active-scope 视口过滤 + 重取景）**：
 * - B active scope 的 `physModelId` 经 `activePhysModelId` props 下传 Session，
 *   以 `[physModelId]` 传给 `useViewport.activeModelIds`——viewer 只显示该
 *   PhysicalModel（隐藏 scope 几何不可见/不可拾取），切页签（URL-only）时原地
 *   换白名单并重取景，**不重建 BriefcaseConnection/viewport**；A 传 undefined
 *   保持 legacy 全模型行为；damaged/未解析 scope 不把 iModel 交给视口（既有
 *   门禁），绝不回落全模型；
 * - editorToolSettings 模型校准在 B 钉死 active physModelId（工具写目标不得落
 *   到隐藏 scope 的模型）；A 只读不进入编辑作用域，配置段不执行（既有行为）；
 * - **选择集隔离（fix round 1 F1；X-03 单一权威）**：scope/连接切换与视口过滤
 *   落定（`appliedModelKey`）时经 `clearCanvasSelection` 清空 store 画布/树选择
 *   及 `connection.selectionSet` 投影——旧 scope 元素不得经 Delete/Move 等元素集
 *   工具被无确认操作；
 * - **R2/R3（fix round 2）**：过滤失败走 viewer 独立 `filterError` 通道，页面以
 *   非阻断提示条呈现（不清空画布错误面、不把状态栏误报为连接失败）；同一
 *   scope/连接切换 effect 退出活动工具（`toolAdmin.startDefaultTool`），防旧
 *   scope 已装载的 Move/Rotate agenda 跨页签提交。
 *
 * 连接失败 UX（M5-T2）：briefcase 的 isLoading/error 两出口（M4-T2 落地后一直
 * 零消费）接入呈现链——连接三态（下载中/失败/就绪）从此在编辑器页可见：
 * - **呈现层位（T2 定序纪律裁量）**：useBriefcaseConnection 仍钉外层（「为何
 *   拆两层」的 IpcApp 时序不变），isLoading/error 以 props 下传 Session 内层
 *   呈现——画布骨架/错误面挂 PartStudioCanvas（绝对定位覆盖层，零布局跳动），
 *   状态栏合并映射挂 PartStudioTabs（briefcase 失败/打开中优先于 host 相位——
 *   T2-② 缺陷本体即 ready 相位掩盖 briefcase 失败）；
 * - **诚实呈现**：错误面透传 error.message 原文；重试只给真实路径指引
 *   （关闭页签后重新打开文档），不放行不通的重试钮（hook 无重试入口，id 不变
 *   不重开）；viewport 创建失败是同族子类（useViewport 只 setError 不翻相位，
 *   phase 可仍 ready）——画布错误面合流 `briefcase ?? viewportError`（briefcase
 *   优先，与状态栏序一致），状态栏补 viewport error 分支不被 host ready 掩盖
 *   （T2 评审 Important；viewer 侧错误随链生灭——iModel 切换清空不残留）；
 * - **T7-② 断连兜底**：推送对话框开着时连接消失（页签切换重开连接的中间态），
 *   `connection &&` 条件渲染会直卸载对话框——收合并经 IModelApp.notifications
 *   toast 说明（不无声消失；守卫保证只在「开→断」跃迁发声）。
 */

import React, { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button, Dialog, Text } from '@itwin/itwinui-react';
import {
  ensureEditTools,
  fitViewToModelRanges,
  useBriefcaseConnection,
  useViewport,
} from '@luban-cad/viewer';
import type { PartStudioInfo } from '@luban-cad/shared';
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import { AuthSession } from '@clients/auth/AuthSession.js';
import { ItwinsClient } from '@clients/itwins/ItwinsClient.js';
import { ImodelsClient } from '@clients/imodels/ImodelsClient.js';
import { isBModelItwin } from '@clients/itwins/types.js';
import type { DocumentMode } from '@modules/documents';
import { useWorkspaceRef } from '@common/workspace/use-workspace-ref.js';
import { workspaceRefPath } from '@common/workspace/workspace-ref.js';
import { useITwinPermissions } from '@common/permissions/use-itwin-permissions.js';
import { env } from '@config/env.js';
import { viewerNotifications } from '@app/providers/ViewerNotifications.js';
import { useTheme } from '@app/providers/ThemeContext.js';
import { PartStudioTopBar } from './components/PartStudioTopBar.js';
import { PartStudioPanelRail } from './components/PartStudioPanelRail.js';
import { PartStudioSidebar } from './components/PartStudioSidebar.js';
import { PartStudioCanvas } from './components/PartStudioCanvas.js';
import { PartStudioDock } from './components/PartStudioDock.js';
import { PartStudioTabs } from './components/PartStudioTabs.js';
import { CreateNamedVersionDialog } from './dialogs/CreateNamedVersionDialog.js';
import { Ribbon } from './ribbon/Ribbon.js';
import { CommandPalette } from './ribbon/CommandPalette.js';
import {
  applyCanvasSelection,
  clearCanvasSelection,
  partSelectionsFromTree,
} from './internal/selection-authority.js';
import { useOnshapeSelection } from './hooks/useOnshapeSelection.js';
import { useEditingScope } from './hooks/useEditingScope.js';
import { useAutoPush } from './hooks/useAutoPush.js';
import { flushAutoPush, registerAutoPushFlush } from './internal/autosave-bridge.js';
import { useFeatureDisplaySync } from './hooks/useFeatureDisplaySync.js';
// mapFeatureEntries（M6-a T6）：拉伸对话框草图下拉与特征树同源命名（复用
// useFeatureTree 的条目→行映射纯函数，不复制命名逻辑）。
import { mapFeatureEntries } from './hooks/useFeatureTree.js';
import { useEditorSession, type EditorSession } from './hooks/useEditorSession.js';
import { useFeatureSystem } from './hooks/useFeatureSystem.js';
import { useBrepTopology } from './hooks/useBrepTopology.js';
import { useNamedVersionActions } from './hooks/useNamedVersionActions.js';
import { usePartStudios } from './hooks/usePartStudios.js';
import {
  nextPartStudioName,
  usePartStudioScope,
  type PartStudioScopeState,
} from './hooks/usePartStudioScope.js';
import { usePermissions } from './hooks/usePermissions.js';
import { useSketchSystem, registerSketchSystemAccessor } from './hooks/useSketchSystem.js';
import { useSketchCamera } from './hooks/useSketchCamera.js';
import { useDisplaySettings } from './hooks/useDisplaySettings.js';
import { useBodyAppearanceOverrides } from './hooks/useBodyAppearanceOverrides.js';
import { useDatumVisibility } from './hooks/useDatumVisibility.js';
import { useUndoRedo } from './hooks/useUndoRedo.js';
import { usePartStudioStore } from './stores/use-part-studio-store.js';
import { BODY_PRODUCING_FEATURE_TYPES } from './types.js';
import { bodiesForDisplay } from './internal/body-display.js';
import { clearActiveOnshapeHighlight } from './internal/onshape-selection-runtime.js';
import { fitView } from './internal/viewport-actions.js';
import './PartStudioPage.css';

export function PartStudioPage(): React.JSX.Element {
  const workspaceRef = useWorkspaceRef();
  const iTwinId = workspaceRef?.iTwinId;
  const iModelId = workspaceRef?.iModelId;
  const requestedModelId = workspaceRef?.modelId;
  const navigate = useNavigate();
  // 权限门（M5-T3 真实判定收编 M4 中期口径）：可编辑 = !viewOnly ∧ 权限
  // editable（viewOnly=store 仅查看切片；权限=iModel 级我的权限查询）。
  const viewOnly = usePartStudioStore((s) => s.viewOnly.isActive);
  const permissions = usePermissions({ iTwinId: iTwinId ?? null, iModelId: iModelId ?? null });
  // P2.4 F2：分享管理门=iTwin RBAC（服务端 grant/revoke/setSecured 只认它）；
  // 重命名门=iModel 权限（PATCH /imodels/:id 的 IMODELS_MANAGE）。两个门源
  // 不可互换；未落定/查询失败一律 fail-closed。
  const itwinPermissions = useITwinPermissions(iTwinId);

  // B/A 文档上下文（P2.4 第 3 条裁决）：由 iTwin 标记派生（isBModelItwin），
  // **不看 VITE_B_MODEL_ENABLED 旗标**——旗标关闭时直连 B 文档仍按 B 解析。
  // queryKey 与顶栏面包屑同键（React Query 去重，不重复请求）。
  const itwinQuery = useQuery({
    queryKey: ['part-studio', 'breadcrumb', 'itwin', iTwinId ?? ''],
    queryFn: () => new ItwinsClient().get(iTwinId as string),
    enabled: !!iTwinId,
  });
  // Onshape 底栏文档级页签显示文档名（与顶栏同查询键，React Query 去重不重复请求）。
  const imodelQuery = useQuery({
    queryKey: ['part-studio', 'breadcrumb', 'imodel', iModelId ?? ''],
    queryFn: () => new ImodelsClient().get(iModelId as string),
    enabled: !!iModelId,
  });
  const documentName = imodelQuery.data?.displayName ?? imodelQuery.data?.name ?? '';
  const mode: DocumentMode | undefined = itwinQuery.data
    ? (isBModelItwin(itwinQuery.data) ? 'B' : 'A')
    : undefined;
  const modeError = itwinQuery.isError
    ? (itwinQuery.error instanceof Error ? itwinQuery.error.message : String(itwinQuery.error))
    : undefined;

  // 权限门接线（旧应用竞态教训——必须遵守）：useBriefcaseConnection 首开定
  // 读写（打开 effect deps 不含 readonly），故权限 isLoading 期间传 null
  // options 关连接（零 IPC），落定后再以合流 readonly 开——否则「权限未载
  // 早开只读 → 权限解析 editable 但 effect 不重跑 → 连接恒只读保存失败」。
  // 合流单点：readonly = viewOnly ∨ 权限只读 ∨ A 旧文档（A 只读打开，P2.4）。
  // B/A 未定（标记查询在途）同样关连接：首开定读写，不得先按 A/B 误开。
  // P2.4 F9 / fix round 2 R1：marker 未定/失败时**不打开**连接（options null +
  // scope 错误横幅重试）——`useBriefcaseConnection` 首开定读写且 readonly 不入
  // effect 依赖，保守只读打开会在 marker 稍后成功时留下不可升级的只读连接
  // （UI 可编辑但所有写必败）。待 mode 已知后再首开；R1 的兜底见下方
  // readonlyBlocked（权限/连接相位漂移时阻塞写 UI 并提示刷新）。
  const briefcase = useBriefcaseConnection(
    iTwinId && iModelId && !permissions.isLoading && mode !== undefined
      ? {
          iTwinId,
          iModelId,
          readonly: viewOnly || permissions.mode === 'readonly' || mode !== 'B',
        }
      : null,
  );

  // 共享编辑会话（P2.4；P2.2 审查 Important）：sessionId/iModelKey/租约生命周期
  // 单点持有——useFeatureSystem、注册表写方法、默认 scope 创建共用。
  // 可写会话 = B ∧ !viewOnly ∧ 权限 editable ∧ **连接确实可写**（R1）——
  // 首开只读的连接（权限/模式相位漂移）绝不按可写对待：不取租约、不开写 UI、
  // 不自动 create；下方阻塞横幅提示刷新。
  const connectionReadonly = briefcase.connection?.isReadonly === true;
  const writableSession =
    mode === 'B' && !viewOnly && permissions.mode === 'editable' && !connectionReadonly;
  /** R1：上下文应可写但连接以只读打开（首开定读写、readonly 不参与重开）——
   *  唯一出口是整页刷新；期间所有写面收口并显示阻塞提示（不撒谎）。 */
  const readonlyBlocked =
    mode === 'B' &&
    !viewOnly &&
    permissions.mode === 'editable' &&
    !permissions.isLoading &&
    connectionReadonly;
  const session = useEditorSession(briefcase.connection ?? undefined, {
    enabled: writableSession,
  });

  // Part Studio 注册表（B only；A enabled=false → 零 registry 调用）。
  const partStudios = usePartStudios(iTwinId, iModelId, session, { enabled: mode === 'B' });

  const navigateToModel = useCallback(
    (modelId: string | undefined, replace: boolean): void => {
      if (!iTwinId || !iModelId) return;
      navigate(workspaceRefPath({ iTwinId, iModelId, modelId }), { replace });
    },
    [navigate, iTwinId, iModelId],
  );

  // scope 解析状态机（缺省/非法 model、半图恢复、默认 create）。
  const scope = usePartStudioScope({
    mode,
    modeError,
    requestedId: requestedModelId,
    studios: partStudios.studios,
    isLoading: partStudios.isLoading,
    loaded: partStudios.loaded,
    error: partStudios.error,
    canWrite: writableSession,
    create: partStudios.create,
    navigateToModel,
  });

  // 编辑面总门：B（可写会话）∧ scope 已解析为完整 scope（A 恒 false）。
  const scopeReady = scope.plan.kind === 'ready' || scope.plan.kind === 'a';
  const canEdit = writableSession && scope.plan.kind === 'ready';
  // P2.5：B active scope 的物理模型 id——视口只显示它、editorToolSettings 钉它；
  // A（plan 'a'）/未解析/半图 = undefined（A 由 viewer legacy 全模型分支接管，
  // 半图不把 iModel 交给视口——绝不回落全模型）。
  const activePhysModelId =
    scope.plan.kind === 'ready' ? scope.plan.studio.physModelId : undefined;
  // 注册表写门（P2.4 半图恢复 + F4 + R4）：B 可写会话 ∧ 列表已落定且不在加载
  // ∧ resolver 自动 create 不在途/不在 create 态——列表竞态或自动建默认 scope
  // 期间禁止「+」/rename/delete（防两个默认 scope）。
  const canManageStudios =
    writableSession &&
    partStudios.loaded &&
    !partStudios.isLoading &&
    !scope.isCreating &&
    scope.plan.kind !== 'create';
  // 分享门（P2.4 F2）：iTwin RBAC（grant/revoke/setSecured 服务端口径）。
  const canManageShare =
    !itwinPermissions.isLoading &&
    !itwinPermissions.error &&
    itwinPermissions.permissions.includes('imodels_manage');
  // 重命名门（P2.4 F2）：iModel IMODELS_MANAGE（PATCH /imodels/:id 口径）。
  const canManageDocument =
    !permissions.isLoading &&
    !permissions.error &&
    permissions.permissions.includes('imodels_manage');

  return (
    <PartStudioSession
      iTwinId={iTwinId ?? ''}
      iModelId={iModelId ?? ''}
      documentName={documentName || undefined}
      mode={mode}
      canEdit={canEdit}
      canManageStudios={canManageStudios}
      canManageShare={canManageShare}
      canManageDocument={canManageDocument}
      readonlyBlocked={readonlyBlocked}
      connection={briefcase.connection}
      connectionLoading={briefcase.isLoading}
      connectionError={briefcase.error}
      session={session}
      scopeReady={scopeReady}
      scope={scope}
      activePhysModelId={activePhysModelId}
      studios={partStudios.studios}
      studiosLoading={partStudios.isLoading}
      studiosError={partStudios.error}
      activeModelId={requestedModelId}
      onRetryStudios={partStudios.refresh}
      onCreateStudio={() => partStudios.create(nextPartStudioName(partStudios.studios))}
      onRenameStudio={partStudios.rename}
      onDeleteStudio={partStudios.remove}
      onRetryMode={() => void itwinQuery.refetch()}
    />
  );
}

interface PartStudioSessionProps {
  iTwinId: string;
  iModelId: string;
  /** 文档级页签显示名（Onshape 用文档标题；缺省回退「文档」）。 */
  documentName?: string;
  /** B/A 文档上下文（P2.1 F5 承接；undefined=标记查询在途）。 */
  mode: DocumentMode | undefined;
  /** 编辑面总门：B ∧ !viewOnly ∧ 权限 editable ∧ scope 已解析（A 恒 false）。 */
  canEdit: boolean;
  /** 注册表写门（B ∧ !viewOnly ∧ 权限 editable；不要求 scope 完整——半图恢复）。 */
  canManageStudios: boolean;
  /** B 文档分享管理门（iTwin RBAC imodels_manage；F2 拆源）。 */
  canManageShare: boolean;
  /** B 文档重命名门（iModel IMODELS_MANAGE；F2 拆源）。 */
  canManageDocument: boolean;
  /** R1：上下文可写但连接以只读打开（首开定读写）——写面收口 + 刷新提示。 */
  readonlyBlocked: boolean;
  connection: BriefcaseConnection | null;
  /** briefcase 打开中（M5-T2 isLoading 消费：画布骨架 + 状态栏「正在打开文档…」）。 */
  connectionLoading: boolean;
  /** briefcase 打开失败（M5-T2 error 消费：画布错误面 + 状态栏失败态；成功/进行中恒 null）。 */
  connectionError: Error | null;
  /** 共享编辑会话（useEditorSession；feature 系统/注册表写方法共用）。 */
  session: EditorSession;
  /** scope 解析完成且可打开（A 恒真；B 活动 scope 完整）/ 视口与特征读面门。 */
  scopeReady: boolean;
  /** scope 解析状态机（横幅/恢复面/重试）。 */
  scope: PartStudioScopeState;
  /** B active scope 的物理模型 id（P2.5 视口过滤/工具写目标）；A/未解析 = undefined。 */
  activePhysModelId?: string;
  studios: PartStudioInfo[];
  studiosLoading: boolean;
  studiosError?: string;
  activeModelId?: string;
  onRetryStudios: () => Promise<void>;
  onCreateStudio: () => Promise<PartStudioInfo>;
  onRenameStudio: (partStudioId: string, name: string) => Promise<PartStudioInfo>;
  onDeleteStudio: (partStudioId: string) => Promise<void>;
  onRetryMode: () => void;
}

function PartStudioSession({
  iTwinId,
  iModelId,
  documentName,
  mode,
  canEdit,
  canManageStudios,
  canManageShare,
  canManageDocument,
  readonlyBlocked,
  connection,
  connectionLoading,
  connectionError,
  session,
  scopeReady,
  scope,
  activePhysModelId,
  studios,
  studiosLoading,
  studiosError,
  activeModelId,
  onRetryStudios,
  onCreateStudio,
  onRenameStudio,
  onDeleteStudio,
  onRetryMode,
}: PartStudioSessionProps): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // ADR-0017 Stage B：首帧背景主题（ThemeProvider 缺省 context=light，
  // 页面单测无需包 provider）。后续主题切换仍由 useDisplaySettings observer 应用。
  const { theme: appTheme } = useTheme();
  // P2.8：动态 access token provider（裸 JWT；AuthSession 在 <5min 时单飞刷新）。
  // useCallback 稳定身份——useViewport 的 acquire effect 依赖它，换新会重 acquire。
  const getValidAccessToken = React.useCallback(() => AuthSession.getValidAccessToken(), []);
  // 会话由 RequireAuth 门保证在场；token 由动态 provider 接管（P2.8：原渲染期
  // 静态取一次，长会话 15min 后 viewer RPC/tile 恒用过期 token）。
  // P2.4 视口门：B 文档 scope 解析完成前不把 iModel 交给 useViewport（不装载
  // 任何 scope 的图形；解析后随 `?model=` 变化由 P2.5 做 active-scope 过滤）。
  // A 旧文档 scopeReady 恒真（模式落定后），沿用既有全模型视图。
  // P2.5：B active scope 传白名单 `[activePhysModelId]`（viewer 只显示该
  // PhysicalModel，切页签原地换白名单+重取景，不重建 connection/viewport）；
  // A = undefined（legacy 全模型）。memo 稳定数组身份（viewer 以内容签名做
  // 依赖，此处仍避免无谓变更）。
  const activeModelIds = React.useMemo(
    () => (activePhysModelId ? [activePhysModelId] : undefined),
    [activePhysModelId],
  );
  const {
    viewportRef,
    phase,
    viewport,
    error: viewportError,
    appliedModelKey,
    filterError: modelFilterError,
  } = useViewport({
    backendUrl: window.location.origin,
    hubUrl: env.hubUrl,
    getAccessToken: getValidAccessToken,
    iModel: scopeReady ? connection ?? undefined : undefined,
    activeModelIds,
    viewportTheme: appTheme,
    // notifications 呈现桥（review-8 I-2）：官方注入点换掉 core 缺省哑通道，
    // registrationFailed/超时面/工具错误经 iTwinUI toaster 可见（app 生命期
    // 单例——稳定身份，不构成重 acquire 触发面）。
    notifications: viewerNotifications,
  });

  // 编辑作用域（M4-T4；Editor.tsx:322-371 忠实移植）：进入/复用/失败回查/
  // 卸载退出——hook 内部自治，页面只消费 isReady（editorToolSettings 配置段的
  // 就绪门，特征系统/工具面复用）。canEdit 门（M5-T3）：viewOnly ∨ 权限只读
  // 皆不进入（readonly briefcase 无编辑面）。
  const { isReady: isEditingScopeReady } = useEditingScope(connection ?? undefined, canEdit);

  // 特征系统中枢（M4-T5 移植 + M4-T6 接线）：编辑作用域就绪后 enabled
  //（viewOnly/readonly 连接被 useEditingScope 的 enabled 门拦截——单一裁决点，
  // 勿二次判定）；树/loading/error/applyOp 经 props 直通 Sidebar（六态）与
  // Canvas（对话框提交面）。单挂载铁律：双实例=双 sessionId=双写租约竞争。
  // P2.4：session 共享（同一 sessionId/iModelKey/租约）；readEnabled 门保证 B
  // 文档 scope 解析前零读 RPC（尤其不得先读 legacy 树）。
  const featureSystem = useFeatureSystem(connection ?? undefined, session, {
    readEnabled: scopeReady,
    scopeMode: mode,
  });
  // ADR-0017 追补：UI 唯一显示 body 集——滤除后端 init 占位 BodySolid（无源、
  // 无几何），空 Part Studio 与 Onshape 一样显示 0 零件、默认基准面可见。
  const displayBodies = React.useMemo(
    () => bodiesForDisplay(featureSystem.bodies, featureSystem.tree),
    [featureSystem.bodies, featureSystem.tree],
  );

  // 显示/渲染设置（2026-11-02）：共享给 ViewCube 下拉与右停靠面板。
  const displaySettings = useDisplaySettings(viewport);
  // Onshape「外观」：逐 body 颜色覆盖（独立 FeatureOverrideProvider，与选择高亮并存）。
  const [bodyColors, setBodyColors] = React.useState<Record<string, string>>({});
  useBodyAppearanceOverrides(viewport, bodyColors);
  const handleBodyColorChange = React.useCallback((bodyKey: string, color: string): void => {
    setBodyColors((prev) => ({ ...prev, [bodyKey]: color }));
  }, []);

  // 首帧取景校正（2026-11-02）：useViewport 创建链执行时画布可能尚未完成布局，
  // viewRect.aspect 偏小 → 取景过远（模型只占视口一小块）。布局稳定后按最终
  // aspect 再 fit 一次；仅 viewport/scope 变化触发，不抢用户后续缩放。
  useEffect(() => {
    if (!viewport || typeof requestAnimationFrame !== 'function') return;
    let cancelled = false;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!cancelled) void fitViewToModelRanges(viewport, activeModelIds);
    }));
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [viewport, activeModelIds]);

  // 特征写后自动取景（2026-11-02）：仅 body-producing 的 insertFeature 成功后
  // 按 active scope 模型联合范围 fit；删除/抑制/编辑走原通道（不抢相机）。
  const applyOpAndFit = useCallback(async (op: Parameters<typeof featureSystem.applyOp>[0]) => {
    const result = await featureSystem.applyOp(op);
    if (result.ok && op.kind === 'insertFeature' && BODY_PRODUCING_FEATURE_TYPES.includes(op.featureType)) {
      // 默认几何图元不再一次性隐藏：body 读面刷新后由 useDatumVisibility
      // 按真实 body/草图状态实时同步（删除/Undo 也会自动恢复）。
      await fitViewToModelRanges(viewport ?? undefined, activeModelIds);
    }
    return result;
  }, [featureSystem.applyOp, viewport, activeModelIds]);

  // 默认 Onshape 选择工具（2026-11-03）：body/face/edge/vertex 统一拾取；
  // 对话框/草图打开时暂停（清空选择），关闭后恢复。
  // ADR-0017 Stage D：仅草图对话框例外——新建草图期间选择工具保持可用，允许在
  // 视口拾取单个平面模型面作为草图平面（Onshape 语义）。进入草图编辑态
  //（sketch.isActive）或其它任何对话框仍暂停并清空选择。
  const sketchActiveForSelection = usePartStudioStore((s) => s.sketch.isActive);
  const dialogKindForSelection = usePartStudioStore((s) => s.dialog.active);
  const dialogActiveForSelection = dialogKindForSelection !== null && dialogKindForSelection !== 'sketch';
  useOnshapeSelection(
    connection ?? undefined,
    viewport,
    sketchActiveForSelection || dialogActiveForSelection,
  );

  // Onshape 零件列表选择（X-03 单一权威）：tree 中的 part 节点 → store.canvas
  // .selection（kind='part'）+ 同步投影到 connection.selectionSet（标准元素集
  // 工具输入）。不再反向订阅 selectionSet；子实体选择由 Onshape 工具写 store，
  // 投影自动清空 selectionSet。
  const selectedNodeIds = usePartStudioStore((s) => s.tree.selectedNodeIds);
  useEffect(() => {
    if (!connection || !featureSystem.bodiesLoaded)
      return;
    const selection = partSelectionsFromTree(selectedNodeIds, featureSystem.bodies);
    if (selection.length === 0)
      return;
    clearActiveOnshapeHighlight();
    applyCanvasSelection(connection, selection);
  }, [selectedNodeIds, connection, featureSystem.bodies, featureSystem.bodiesLoaded]);

  // 完整 BRep 拓扑叠加（2026-11-03）：全部拓扑边 + 可选顶点；显示设置只改样式，
  // 树/body 刷新才重读（hook 内部 120ms 去抖 + 8s 超时）。
  // 读面会临时启停 SolidModeling 命令，故在无草图/对话框（可能已有活动编辑
  // 工具）时刷新；其余状态沿用上一份拓扑，避免打断工具会话。
  const hiddenIds = usePartStudioStore((s) => s.canvas.hiddenIds);
  const sketchActiveForBrep = usePartStudioStore((s) => s.sketch.isActive);
  const dialogActiveForBrep = usePartStudioStore((s) => s.dialog.active !== null);
  useBrepTopology({
    connection: connection ?? undefined,
    viewport,
    bodies: featureSystem.bodies,
    bodiesLoaded: featureSystem.bodiesLoaded,
    revision: featureSystem.tree,
    hiddenIds,
    display: displaySettings.settings,
    enabled: !sketchActiveForBrep && !dialogActiveForBrep,
  });

  // P2.5 F1：scope/连接切换必须清空元素集选择。`selectionSet` 按连接持有——
  // 切页签（仅换 URL、复用同一 BriefcaseConnection）后旧 scope 的元素仍留在
  // 选择集里；DeleteElementsTool（requireAcceptForSelectionSetOperation=false）/
  // Move 等元素集工具会无确认地操作**隐藏 scope** 的实体。viewer 只把旧模型
  // 移出可见 selector（不可见/不可拾取），但不会替本页清选择集。
  // 两道清：activeModelId/iModel/connection 变化立即清；`appliedModelKey`
  // （viewer 过滤落定签名）变化再清一次——覆盖「切 scope 后、过滤落定前」
  // 的 lag 窗口内用户 pick 到旧 scope 几何的播种路径。
  useEffect(() => {
    // X-03 单一权威：store + 树 + selectionSet 一并清（唯一投影写点）。
    clearCanvasSelection(connection ?? undefined);
    // R3：元素集工具（Move/Rotate 等）在 install 时把 selectionSet 拷贝进 agenda，
    // 清空不撤销已装载的 agenda——scope 变化/过滤落定必须退出活动工具，
    // 防旧 scope 的操作跨页签提交（真栈工具层验证归 P2.6）。
    const toolAdmin = IModelApp.initialized ? IModelApp.toolAdmin : undefined;
    if (toolAdmin?.activeTool) {
      void toolAdmin.startDefaultTool();
    }
  }, [connection, iModelId, activeModelId, appliedModelKey]);

  // 草图系统（M6-a T5）：活动草图读面（store.sketch.activeSketchId 驱动）+
  // updateSketch 写面（复用 featureSystem.applyOp——租约/只读门禁/刷新同源）。
  // 模块级 accessor 注册：绘制工具经 IModelApp.tools.run 无参启动（M3-b 已知
  // 坑——无选项注入通道），运行期 getSketchSystem() 取本实例；卸载注销。
  const sketchSystem = useSketchSystem(connection ?? undefined, featureSystem, {
    // P2.4 F5/F6：只读/scope 未解析/ A 一律零 getSketch；B 才携带 scope。
    readEnabled: canEdit,
    scopeMode: mode,
  });
  useEffect(() => {
    registerSketchSystemAccessor(sketchSystem);
    return () => registerSketchSystemAccessor(undefined);
  }, [sketchSystem]);

  // 默认几何图元实时显隐（2026-11-02）：body 读面/树回退 + 活动草图平面 →
  // 纯规则 → store 有效可见性（树 + DatumPlanesDecoration 单一消费面）。
  // 用户眼睛覆盖写在 visibilityOverrides，scope 切换时清空。
  const datumHasBodies = React.useMemo(
    () => featureSystem.bodiesLoaded
      ? displayBodies.length > 0
      : featureSystem.tree.some((entry) =>
        !entry.suppressed
        && (BODY_PRODUCING_FEATURE_TYPES as readonly string[]).includes(entry.featureType)),
    [featureSystem.bodiesLoaded, displayBodies, featureSystem.tree],
  );
  const sketchActiveForDatum = usePartStudioStore((s) => s.sketch.isActive);
  const sketchPlaneForDatum = usePartStudioStore((s) => s.sketch.activeSketchPlane);
  // Onshape：新建草图选平面期间三基准面必须可见（视口拾取的主要目标）。
  const sketchDialogActiveForDatum = usePartStudioStore((s) => s.dialog.active === 'sketch');
  useDatumVisibility(
    datumHasBodies,
    sketchActiveForDatum,
    sketchPlaneForDatum ?? sketchSystem.activeSketch?.plane ?? null,
    sketchDialogActiveForDatum,
  );
  useEffect(() => {
    usePartStudioStore.getState().clearDatumVisibilityOverrides();
  }, [connection, iModelId, activeModelId]);

  // 草图相机（2026-11-02）：进入草图按真实平面 frame 定向，实体就位后按
  // 草图范围取景（左侧面板 padding），退出恢复。单点挂载（Session）。
  useSketchCamera(viewport, sketchSystem.activeSketch);

  // P2.4 F5：文档/scope 切换或离开编辑器时复位模块级草图 store——旧
  // activeSketchId 不得带进新文档/新 scope（防解析前 legacy getSketch 与
  // 草图模式残留）。store 是模块单例，可在 effect 内直取动作。
  useEffect(() => {
    const exitSketch = (): void => usePartStudioStore.getState().exitSketch();
    exitSketch();
    return exitSketch;
  }, [iModelId, activeModelId]);

  // 拉伸对话框草图选项（M6-a T6 数据源裁决）：useFeatureSystem.tree 过滤
  // sketch 节点 → mapFeatureEntries 同源命名（「草图 N」与树一致、orderKey
  // 有序）→ {id,label} 下传 Canvas→FeatureDialog。树已在 onCommitted/
  // onAfterUndoRedo 双订刷新（建/删草图自动跟随），不另开 listSketches 第二
  // 数据通道（无序无名、需自建刷新订阅读——见 FeatureDialog 头注）。
  const sketchOptions = React.useMemo(() => {
    const typeLabel = (featureType: string): string => {
      const key = `partStudio.tree.featureTypes.${featureType}`;
      const label = t(key);
      return label === key ? featureType : label; // 未知类型回退原始值（useFeatureTree 同口径）
    };
    return mapFeatureEntries(
      featureSystem.tree.filter((entry) => entry.featureType === 'sketch'),
      typeLabel,
    ).map((node) => ({ id: node.id, label: node.name }));
  }, [featureSystem.tree, t]);

  // 库内已有实体（M6-b T6 fillet 通道诚实降级门；B6 M-A3.2a 起优先真读面）：
  // body 读面有 active authored body → true；读面不可用（MS<1.15/故障）回退
  // 树内 body 产出型条目在场判定（原口径）。fillet 需在实体上拾边，无体时
  // 「添加边」禁用+诚实提示（FeatureDialog hasBodies）。
  const hasBodies = React.useMemo(
    () =>
      displayBodies.length > 0 ||
      featureSystem.tree.some((entry) =>
        (BODY_PRODUCING_FEATURE_TYPES as readonly string[]).includes(entry.featureType),
      ),
    [displayBodies, featureSystem.tree],
  );

  // B6 M-A3.2a：edit 模式 FeatureDialog 的落库 params（结构键 newBody 回显——
  // 复选框禁用不翻转；updateParams 接线时必须原样保留）。树行即真源（同 refresh 通道）。
  const activeDialog = usePartStudioStore((s) => s.dialog);
  const editFeatureParams = React.useMemo(() => {
    if (activeDialog.active !== 'feature' || activeDialog.mode !== 'edit') return undefined;
    return featureSystem.tree.find((entry) => entry.id === activeDialog.featureId)?.params;
  }, [activeDialog, featureSystem.tree]);

  // Onshape live（2026-11-12）：新建草图对话框打开时，树立即出现高亮「草图 N」
  // 行（✓ 前即存在；✗ 关闭即消失）。✓ 后进入草图编辑态（真实行接管）即隐藏；
  // 编辑既有草图同样不显示。
  const sketchIsActive = usePartStudioStore((s) => s.sketch.isActive);
  const pendingSketchName = React.useMemo(() => {
    // store.openSketchDialog() 新建态 sketchId=null；编辑既有草图才带 id。
    if (activeDialog.active !== 'sketch' || activeDialog.sketchId != null || sketchIsActive) return undefined;
    const sketchCount = featureSystem.tree.filter((entry) => entry.featureType === 'sketch').length;
    return `${t('partStudio.tree.featureTypes.sketch')} ${sketchCount + 1}`;
  }, [activeDialog, featureSystem.tree, t, sketchIsActive]);

  // 特征显示同步（M4-T5 移植 + M4-T6 接线）：特征写入后的几何出现链收口——
  // 绕过 GraphicalEditingScope 下 ModelChangeMonitor 的 guid 缓冲（BRep 显示
  // bug 层③修复），与 useFeatureSystem 同层挂载。
  useFeatureDisplaySync(connection ?? undefined);

  // 撤销/重做/保存（M4-T4；BriefcaseTxns 标准通道，禁旧自造 UndoManager）。
  const undoRedo = useUndoRedo(connection);

  // 保存版本动作（B-model P0 Task 5）：顶栏「保存版本」对话框的提交通道——
  // 有未保存变更先 pushChanges 再命名；干净态直接命名最新 changeset（hub
  // Named Version 仅元数据，不生成 checkpoint/缩略图，见 hook 注记）。
  const namedVersionActions = useNamedVersionActions(
    iModelId,
    connection ?? undefined,
    undoRedo.hasUnsavedChanges,
  );

  // ADR-0017 Stage F：Onshape 式自动保存——每次提交后防抖静默 pushChanges
  // （合并上传），失败可见并重试；只读/降级 scope 不推送。常规 UI 不再暴露
  // 保存/推送入口；「创建版本…」确认前先 flush（见下方对话框 onConfirm）。
  const autoPush = useAutoPush(connection ?? undefined, undoRedo.hasUnsavedChanges, {
    enabled: canEdit && !readonlyBlocked,
    onPushed: () => {
      void queryClient.invalidateQueries({ queryKey: ['part-studio', 'changesets', iModelId] });
    },
    onError: (message) => {
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Error,
          t('partStudio.autosave.failed', { message }),
        ),
      );
    },
  });

  // e2e/legacy helper 的显式描述推送桥（自动保存描述恒「自动保存」；老 spec 用
  // 自定义 description 断言 hub changeset）。仅在有未推送变更时推，绝不造空 changeset。
  React.useEffect(() => {
    if (!connection) return;
    const conn = connection;
    const dispose = registerAutoPushFlush(async (description) => {
      const pending = await conn.txns.hasPendingTxns().catch(() => false);
      if (!pending) return false;
      await conn.pushChanges(description);
      return true;
    });
    if (import.meta.env.VITE_E2E_HOOKS === 'true') {
      const host = window as unknown as {
        __lubanE2EApp?: { flushAutoPush?: typeof flushAutoPush };
      };
      host.__lubanE2EApp = { ...host.__lubanE2EApp, flushAutoPush };
    }
    return () => {
      dispose();
      const host = window as unknown as { __lubanE2EApp?: { flushAutoPush?: typeof flushAutoPush } };
      if (host.__lubanE2EApp) delete host.__lubanE2EApp.flushAutoPush;
    };
  }, [connection]);

  // 连接相位呈现（M5-T2）：briefcase 下载中/失败两态此前零消费——连接失败时
  // 状态栏走 useViewport ready 相位显示「已连接」、画布永不出图（M4 终审
  // T2-②）。错误消息原地格式化一次（画布错误面透传原文；状态栏只取失败布尔），
  // 两处呈现位共用，防双处口径漂移。
  const connectionErrorMessage = connectionError instanceof Error
    ? connectionError.message
    : connectionError
      ? String(connectionError)
      : null;
  // 画布错误面合流（T2 评审 Important）：viewport 创建失败是同族子类——useViewport
  // 只 setError 不翻相位（phase 可仍 ready，此前残存「已连接+黑屏」），与
  // briefcase 失败同面呈现，briefcase 优先（与状态栏序一致：上游失败因优先）。
  const canvasErrorMessage = connectionErrorMessage ?? viewportError;

  // 顶栏三回调 canEdit 门（T4 评审 Minor-1 的 M5-T3 收编）：与键盘保存同口径
  //——viewOnly ∨ 权限只读下三钮点击不触发（连接虽可写打开，编辑面已整体收口）。
  // undo/redo 拒绝就地吞（T4 评审 Minor-6：tools.run 理论可拒，不逃逸为
  // unhandled rejection；保存走 notifications 错误面，另口径）。
  const handleUndo = useCallback(() => {
    if (!canEdit) return;
    void undoRedo.undo().catch(() => undefined);
  }, [canEdit, undoRedo]);

  const handleRedo = useCallback(() => {
    if (!canEdit) return;
    void undoRedo.redo().catch(() => undefined);
  }, [canEdit, undoRedo]);

  // 保存版本入口（B-model P0 Task 5；M4-T7 语义分线）：顶栏「保存版本」钮开
  // Named Version 对话框（干净态也可命名当前 changeset；连接缺失/canEdit 门
  // 拦截——连接未就绪时无可命名内容，诚实不响应）。
  const [createVersionOpen, setCreateVersionOpen] = React.useState(false);
  const handleSaveVersion = useCallback(() => {
    if (!canEdit || !connection) return;
    setCreateVersionOpen(true);
  }, [canEdit, connection]);

  // 半图恢复删除（P2.4）：恢复横幅/损坏横幅的删除入口走 HITL 确认；删除后
  // usePartStudios 本地列表更新 → 解析器重规划（有完整 scope 切第一个；全空
  // 则创建新默认 scope；墓碑 id 永不重建）。
  const [damagedDeleteTarget, setDamagedDeleteTarget] = React.useState<PartStudioInfo | null>(null);
  const [damagedDeleteError, setDamagedDeleteError] = React.useState<string | null>(null);
  const [isDeletingDamaged, setIsDeletingDamaged] = React.useState(false);
  const handleDeleteDamaged = useCallback(async (): Promise<void> => {
    if (!damagedDeleteTarget) return;
    setIsDeletingDamaged(true);
    setDamagedDeleteError(null);
    try {
      await onDeleteStudio(damagedDeleteTarget.id);
      setDamagedDeleteTarget(null);
    } catch (err) {
      setDamagedDeleteError(
        t('partStudio.tabs.deleteFailed', { message: err instanceof Error ? err.message : String(err) }),
      );
    } finally {
      setIsDeletingDamaged(false);
    }
  }, [damagedDeleteTarget, onDeleteStudio, t]);

  // T7-②（M5-T2）断连兜底：连接消失（页签切换重开连接的中间态/异常退出）而
  // 创建版本对话框仍开着时，`connection &&` 条件渲染会直卸载对话框（无声
  // 消失，无交代）——此处收合并经 notifications 通道说明。守卫保证只在
  // 「开→断」跃迁发声：首挂（对话框未开）与正常关闭（connection 在场）均不响。
  useEffect(() => {
    if (connection || !createVersionOpen) return;
    setCreateVersionOpen(false);
    IModelApp.notifications.outputMessage(
      new NotifyMessageDetails(
        OutputMessagePriority.Warning,
        t('partStudio.pushChangeset.disconnected'),
      ),
    );
  }, [connection, createVersionOpen, t]);

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

    // 校准并更新模型（P2.5）：
    // - B active scope：工具写目标钉死 active physModelId——视口已只选它，工具
    //   不得把写落到隐藏 scope 的物理模型；旧 settings 残留（切页签前值）同校；
    // - A legacy / 未过滤（activePhysModelId 缺省）：2d 取 baseModel；3d 空间
    //   视图取模型选择器首个（既有行为不变）。
    if (view.is2d()) {
      if (settings.model === undefined || !view.viewsModel(settings.model)) {
        settings.model = view.baseModelId;
      }
    } else if (view.isSpatialView()) {
      if (activePhysModelId) {
        settings.model = activePhysModelId;
      } else if (settings.model === undefined || !view.viewsModel(settings.model)) {
        settings.model = undefined;
        for (const modId of view.modelSelector.models) {
          settings.model = modId;
          break;
        }
      }
    }

    // 2026-11-02 Onshape 渲染对齐：不再默认绘制 project-extents 包围盒
    //（远大于模型，观感与 Onshape 严重不符）。装饰件与切换工具保留，
    // 需要调试时可显式启用。
  }, [viewport, connection, isEditingScopeReady, activePhysModelId]);

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
        // M6-a T5：草图绘制 4 工具注册（Sketch.Line/Sketch.Rectangle/
        // Sketch.CenterCircle/Sketch.Arc3Point）——web 侧注册（viewer
        // 不反向依赖 app 模块）；懒引（viewer ensureEditTools 同款口径：
        // 工具类 extends PrimitiveTool 静态引出会把基类存在性强加给 barrel
        // 消费方的 core-frontend mock 面）；幂等，失败同 ensureEditTools 错误面。
        const { registerSketchTools } = await import('./tools/sketch/SketchCreateTool.js');
        registerSketchTools();
        // M6-b T5：草图约束 6 工具（Sketch.Constraint.*）+ 尺寸 2 工具
        //（Sketch.Dimension.*）——同款懒引+幂等（ribbon 标注组真 toolId 直投）。
        const { registerSketchConstraintTools } = await import('./tools/sketch/SketchAddConstraintTool.js');
        const { registerSketchDimensionTools } = await import('./tools/sketch/SketchAddDimensionTool.js');
        registerSketchConstraintTools();
        registerSketchDimensionTools();
        // M6-c T4：偏移工具（Sketch.Offset）——同款懒引+幂等（编辑组真 toolId）。
        const { registerSketchOffsetTools } = await import('./tools/sketch/SketchOffsetTool.js');
        registerSketchOffsetTools();
        // 2026-11-09：草图镜像（Sketch.Mirror）——官方帮助证据两相流程；同款懒引+幂等。
        const { registerSketchMirrorTools } = await import('./tools/sketch/SketchMirrorTool.js');
        registerSketchMirrorTools();
        const { registerSketchPointTools } = await import('./tools/sketch/SketchPointTool.js');
        registerSketchPointTools();
        // 2026-11-12：草图修剪/延伸（Sketch.Trim / Sketch.Extend，同一 Onshape 下拉）。
        const { registerSketchTrimTools } = await import('./tools/sketch/SketchTrimTool.js');
        registerSketchTrimTools();
        const { registerSketchExtendTools } = await import('./tools/sketch/SketchExtendTool.js');
        registerSketchExtendTools();
        const { registerSketchTangentArcTools } = await import('./tools/sketch/SketchTangentArcTool.js');
        registerSketchTangentArcTools();
        // 2026-11-12：草图圆角（Sketch.Fillet）——点击两线共享角点立即生成 R 尺寸。
        const { registerSketchFilletTools } = await import('./tools/sketch/SketchFilletTool.js');
        registerSketchFilletTools();
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

  return (
    <div className="part-studio-page" data-testid="part-studio-page">
      {/* ADR-0017 Stage F：自动保存状态（e2e/诊断就绪信号；不可见）。 */}
      <span
        className="part-studio-visually-hidden"
        data-testid="part-studio-autosave-state"
        data-state={autoPush.state}
        aria-live="polite"
      >
        {autoPush.state}
      </span>
      <PartStudioTopBar
        iTwinId={iTwinId}
        iModelId={iModelId}
        mode={mode}
        canManageShare={canManageShare}
        canManageDocument={canManageDocument}
      />
      {/* scope 横幅（P2.4）：A 只读 / B 解析中 / 错误 / 半图恢复 / 默认创建。 */}
      {mode === 'A' && (
        <div
          role="status"
          className="part-studio-scope-banner"
          data-testid="part-studio-readonly-banner"
        >
          {t('partStudio.aMode.banner')}
        </div>
      )}
      {/* R2：active-scope 物理模型查询失败——非阻断提示条（连接/文档本身正常，
          不得映射为画布「文档打开失败」或状态栏「连接失败」）。 */}
      {mode === 'B' && modelFilterError && (
        <div
          role="alert"
          className="part-studio-scope-banner part-studio-scope-banner--warning"
          data-testid="part-studio-model-filter-error"
        >
          <span>{t('partStudio.scope.modelFilterFailed', { message: modelFilterError })}</span>
        </div>
      )}
      {readonlyBlocked && (
        <div
          role="alert"
          className="part-studio-scope-banner part-studio-scope-banner--error"
          data-testid="part-studio-readonly-reopen"
        >
          <span>{t('partStudio.connection.readonlyOpened')}</span>
          <button
            type="button"
            className="part-studio-scope-banner__action"
            onClick={() => window.location.reload()}
          >
            {t('partStudio.connection.reload')}
          </button>
        </div>
      )}
      {mode !== 'A' && (scope.plan.kind === 'detecting' || scope.plan.kind === 'waiting' || scope.plan.kind === 'redirect') && (
        <div
          role="status"
          className="part-studio-scope-banner"
          data-testid="part-studio-scope-loading"
        >
          {t('partStudio.scope.loading')}
        </div>
      )}
      {mode !== 'A' && scope.plan.kind === 'error' && (
        <div role="alert" className="part-studio-scope-banner part-studio-scope-banner--error" data-testid="part-studio-scope-error">
          <span>
            {mode === undefined
              ? scope.plan.error
              : t('partStudio.scope.loadFailed', { message: scope.plan.error })}
          </span>
          <button
            type="button"
            className="part-studio-scope-banner__action"
            onClick={() => {
              if (mode === undefined) onRetryMode();
              else void onRetryStudios();
            }}
          >
            {t('partStudio.scope.retry')}
          </button>
        </div>
      )}
      {mode === 'B' && scope.plan.kind === 'empty' && (
        <div
          role="status"
          className="part-studio-scope-banner"
          data-testid="part-studio-scope-empty"
        >
          {t('partStudio.scope.noStudios')}
        </div>
      )}
      {mode === 'B' && scope.plan.kind === 'create' && (
        <div
          role={scope.createError ? 'alert' : 'status'}
          className={`part-studio-scope-banner${scope.createError ? ' part-studio-scope-banner--error' : ''}`}
          data-testid="part-studio-scope-create"
        >
          {scope.createError ? (
            <>
              <span>{t('partStudio.scope.createFailed', { message: scope.createError })}</span>
              <button
                type="button"
                className="part-studio-scope-banner__action"
                onClick={scope.retryCreate}
              >
                {t('partStudio.scope.retryCreate')}
              </button>
            </>
          ) : (
            <span>{t('partStudio.scope.loading')}</span>
          )}
        </div>
      )}
      {mode === 'B' && scope.plan.kind === 'recovery' && (
        <div
          role="alert"
          className="part-studio-scope-banner part-studio-scope-banner--warning"
          data-testid="part-studio-scope-recovery"
        >
          <span>{t('partStudio.scope.recoveryHint')}</span>
          <span className="part-studio-scope-banner__list">
            {scope.plan.damaged.map((studio) => (
              <button
                key={studio.id}
                type="button"
                className="part-studio-scope-banner__action"
                data-testid={`part-studio-damaged-delete-${studio.id}`}
                disabled={!canManageStudios}
                onClick={() => {
                  setDamagedDeleteTarget(studio);
                  setDamagedDeleteError(null);
                }}
              >
                {t('partStudio.tabs.delete')}: {studio.name}
              </button>
            ))}
          </span>
        </div>
      )}
      {mode === 'B' && scope.plan.kind === 'damaged' && (
        <div
          role="alert"
          className="part-studio-scope-banner part-studio-scope-banner--warning"
          data-testid="part-studio-scope-damaged"
        >
          <span>{t('partStudio.scope.damagedHint', { name: scope.plan.studio.name })}</span>
          <button
            type="button"
            className="part-studio-scope-banner__action"
            data-testid="part-studio-damaged-delete"
            disabled={!canManageStudios}
            onClick={() => {
              if (scope.plan.kind !== 'damaged') return;
              setDamagedDeleteTarget(scope.plan.studio);
              setDamagedDeleteError(null);
            }}
          >
            {t('partStudio.tabs.delete')}
          </button>
        </div>
      )}
      {/* Onshape 工作区：40px 面板选择条贯穿工具栏/正文/页签全高，右侧依次为
          36px 工具栏、树 + 画布、30px 文档级页签（2026-11-02 live 对齐）。 */}
      <div className="part-studio-workspace" data-testid="part-studio-workspace">
        <PartStudioPanelRail
          onSaveVersion={handleSaveVersion}
          canSaveVersion={canEdit && !!connection}
        />
        <div className="part-studio-workspace__main">
          {/* 工具 ribbon（os-11 第二行）：撤消/重做 + 特征组 + 命令搜索触发钮。 */}
          <Ribbon
            canEdit={canEdit}
            canUndo={undoRedo.canUndo}
            canRedo={undoRedo.canRedo}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />
          <div className="part-studio-body">
            <PartStudioSidebar
              entries={featureSystem.tree}
              pendingSketchName={pendingSketchName}
              loading={featureSystem.loading}
              error={featureSystem.error}
              onRetry={featureSystem.refresh}
              connection={connection ?? undefined}
              partStudioId={activeModelId}
              // B6 M-A3.2a：读面仅在成功读取后下传（初次失败/未就绪 → 树回退 legacy
              // 物理查询；I1：初次失败也下传 bodiesError → 可见错误条 + 重试，不静默）。
              // I3：viewport 显式下传 → consumed 隐藏随晚到/重建视口重跑。
              bodies={featureSystem.bodiesLoaded ? displayBodies : undefined}
              bodiesLoading={featureSystem.bodiesLoading}
              bodiesError={featureSystem.bodiesError}
              viewport={viewport ?? undefined}
              // B6 M-A5 T2：树变异接线——applyOp 承载真删除/抑制 op；canEdit 总门
              // 同时驱动菜单禁用与 handler 拒收（隐藏/显示为会话态，不受此门限制）。
              applyOp={applyOpAndFit}
              canEdit={canEdit}
              renameFeature={featureSystem.renameFeature}
              renameBody={featureSystem.renameBody}
            />
            <div className="part-studio-main">
              {/* canEdit 直通画布对话框宿主（B2 只读写门禁）：权限只读下写面对话框
                  的 ✓ 提交面禁用+诚实提示，不进 useFeatureSystem 租约获取等待环
                 （hook 层另有 readonly 前置拒收兜底，两层防御纵深）。 */}
              <PartStudioCanvas
                viewportRef={viewportRef}
                viewport={viewport}
                canEdit={canEdit}
                applyOp={applyOpAndFit}
                previewOp={featureSystem.previewOp}
                leaseOk={featureSystem.leaseOk}
                sketches={sketchOptions}
                connection={connection ?? undefined}
                partStudioId={activeModelId}
                hasBodies={hasBodies}
                bodies={featureSystem.bodiesLoaded ? displayBodies : undefined}
                bodiesLoading={featureSystem.bodiesLoading}
                bodiesError={featureSystem.bodiesError}
                featureParams={editFeatureParams}
                connectionLoading={connectionLoading}
                connectionError={canvasErrorMessage}
                sketchSystem={sketchSystem}
                displaySettings={displaySettings}
                featureEntries={featureSystem.tree}
              />
              <PartStudioDock
                iModelId={iModelId}
                currentChangesetId={connection?.changeset?.id ?? null}
                bodies={displayBodies}
                sketches={sketchOptions}
                bodyColors={bodyColors}
                onBodyColorChange={handleBodyColorChange}
              />
            </div>
          </div>
          <PartStudioTabs
            iTwinId={iTwinId}
            iModelId={iModelId}
            documentName={documentName}
            mode={mode}
            studios={studios}
            activeModelId={activeModelId}
            studiosLoading={studiosLoading}
            studiosError={studiosError ?? null}
            canEdit={canManageStudios}
            onCreate={onCreateStudio}
            onRename={async (studioId, name) => {
              await onRenameStudio(studioId, name);
            }}
            onDelete={onDeleteStudio}
            onRetryStudios={() => void onRetryStudios()}
            connection={phase}
            briefcaseLoading={connectionLoading}
            briefcaseError={connectionErrorMessage}
            viewportError={viewportError}
            onFitView={fitView}
          />
        </div>
      </div>
      {/* 半图删除 HITL（P2.4 恢复入口）：确认后才调 registry（墓碑写入）。 */}
      <Dialog
        isOpen={damagedDeleteTarget !== null}
        onClose={() => setDamagedDeleteTarget(null)}
        portal
        isDismissible
      >
        <Dialog.Backdrop />
        <Dialog.Main styleType="default" title={t('partStudio.tabs.deleteTitle')}>
          <Dialog.TitleBar titleText={t('partStudio.tabs.deleteTitle')} />
          <Dialog.Content>
            <Text variant="body">
              {t('partStudio.tabs.deleteConfirm', { name: damagedDeleteTarget?.name ?? '' })}
            </Text>
            {damagedDeleteError && <Text color="negative" variant="small">{damagedDeleteError}</Text>}
          </Dialog.Content>
          <Dialog.ButtonBar>
            <Button styleType="default" onClick={() => setDamagedDeleteTarget(null)} disabled={isDeletingDamaged}>
              {t('partStudio.tabs.cancel')}
            </Button>
            <Button
              styleType="high-visibility"
              onClick={() => void handleDeleteDamaged()}
              disabled={isDeletingDamaged}
              loading={isDeletingDamaged}
            >
              {t('partStudio.tabs.deleteSubmit')}
            </Button>
          </Dialog.ButtonBar>
        </Dialog.Main>
      </Dialog>
      {/* Named Version 对话框（B-model P0 Task 5）：顶栏「保存版本」钮的提交面
          ——有未保存变更先 pushChanges 再命名，干净态命名最新 changeset。 */}
      {/* Onshape「创建版本…」：确认前先 flush 自动保存（无 pending 则即时返回），
          再由 useNamedVersionActions 推送+命名当前 changeset。 */}
      <CreateNamedVersionDialog
        isOpen={createVersionOpen}
        onClose={() => setCreateVersionOpen(false)}
        onConfirm={async (draft) => {
          await autoPush.flush();
          await namedVersionActions.createNamedVersion(draft);
        }}
      />
      {/* 命令搜索面板：页面级常驻挂载（alt+/ 热键经 store 驱动开合）。 */}
      <CommandPalette canEdit={canEdit} />
    </div>
  );
}
