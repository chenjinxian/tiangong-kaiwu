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
 *   ribbon/命令搜索的 8 个真实 toolId（RoundEdges/DraftFaces/…）tools.run 直投
 *   真启动（useToolActivation 本任务不动）；
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
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  applyViewportBackground,
  ensureEditTools,
  toggleProjectExtents,
  useBriefcaseConnection,
  useViewport,
} from '@luban-cad/viewer';
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
import { CreateNamedVersionDialog } from './dialogs/CreateNamedVersionDialog.js';
import { Ribbon } from './ribbon/Ribbon.js';
import { CommandPalette } from './ribbon/CommandPalette.js';
import { useCanvasBodySelection } from './hooks/useCanvasBodySelection.js';
import { useEditingScope } from './hooks/useEditingScope.js';
import { useEditorKeyboard } from './hooks/useEditorKeyboard.js';
import { useFeatureDisplaySync } from './hooks/useFeatureDisplaySync.js';
// mapFeatureEntries（M6-a T6）：拉伸对话框草图下拉与特征树同源命名（复用
// useFeatureTree 的条目→行映射纯函数，不复制命名逻辑）。
import { mapFeatureEntries } from './hooks/useFeatureTree.js';
import { useFeatureSystem } from './hooks/useFeatureSystem.js';
import { useNamedVersionActions } from './hooks/useNamedVersionActions.js';
import { usePermissions } from './hooks/usePermissions.js';
import { useSketchSystem, registerSketchSystemAccessor } from './hooks/useSketchSystem.js';
import { useUndoRedo } from './hooks/useUndoRedo.js';
import { usePartStudioStore } from './stores/use-part-studio-store.js';
import { BODY_PRODUCING_FEATURE_TYPES } from './types.js';
import './PartStudioPage.css';

export function PartStudioPage(): React.JSX.Element {
  const { iTwinId, iModelId } = useParams<{ iTwinId: string; iModelId: string }>();
  // 权限门（M5-T3 真实判定收编 M4 中期口径）：可编辑 = !viewOnly ∧ 权限
  // editable（viewOnly=store 仅查看切片；权限=iModel 级我的权限查询）。
  const viewOnly = usePartStudioStore((s) => s.viewOnly.isActive);
  const permissions = usePermissions({ iTwinId: iTwinId ?? null, iModelId: iModelId ?? null });
  // 权限门接线（旧应用竞态教训——必须遵守）：useBriefcaseConnection 首开定
  // 读写（打开 effect deps 不含 readonly），故权限 isLoading 期间传 null
  // options 关连接（零 IPC），落定后再以合流 readonly 开——否则「权限未载
  // 早开只读 → 权限解析 editable 但 effect 不重跑 → 连接恒只读保存失败」。
  // 合流单点：readonly = viewOnly ∨ 权限只读。
  const briefcase = useBriefcaseConnection(
    iTwinId && iModelId && !permissions.isLoading
      ? { iTwinId, iModelId, readonly: viewOnly || permissions.mode === 'readonly' }
      : null,
  );
  // 编辑面单点门（Session 各编辑出口统一消费；加载中 mode 不可信占位
  // readonly → 编辑面先收口，落定 editable 后随查询重渲染放行）。
  const canEdit = !viewOnly && permissions.mode === 'editable';

  return (
    <PartStudioSession
      iTwinId={iTwinId ?? ''}
      iModelId={iModelId ?? ''}
      canEdit={canEdit}
      connection={briefcase.connection}
      connectionLoading={briefcase.isLoading}
      connectionError={briefcase.error}
    />
  );
}

interface PartStudioSessionProps {
  iTwinId: string;
  iModelId: string;
  /** 编辑面总门（M5-T3 单点合流）：!viewOnly ∧ 权限 editable——编辑作用域/
   * undo/redo/保存/推送/键盘出口统一消费，勿在下游二次判定。 */
  canEdit: boolean;
  connection: BriefcaseConnection | null;
  /** briefcase 打开中（M5-T2 isLoading 消费：画布骨架 + 状态栏「正在打开文档…」）。 */
  connectionLoading: boolean;
  /** briefcase 打开失败（M5-T2 error 消费：画布错误面 + 状态栏失败态；成功/进行中恒 null）。 */
  connectionError: Error | null;
}

function PartStudioSession({
  iTwinId,
  iModelId,
  canEdit,
  connection,
  connectionLoading,
  connectionError,
}: PartStudioSessionProps): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // 会话由 RequireAuth 门保证在场；token 静态传入（M3 雷②闭环：渲染期取一次，
  // 与 DevViewerRoute 同姿态；动态续接的 token 刷新闭环在 viewer 演进）。
  const { viewportRef, phase, viewport, error: viewportError } = useViewport({
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
  // 就绪门，特征系统/工具面复用）。canEdit 门（M5-T3）：viewOnly ∨ 权限只读
  // 皆不进入（readonly briefcase 无编辑面）。
  const { isReady: isEditingScopeReady } = useEditingScope(connection ?? undefined, canEdit);

  // 特征系统中枢（M4-T5 移植 + M4-T6 接线）：编辑作用域就绪后 enabled
  //（viewOnly/readonly 连接被 useEditingScope 的 enabled 门拦截——单一裁决点，
  // 勿二次判定）；树/loading/error/applyOp 经 props 直通 Sidebar（六态）与
  // Canvas（对话框提交面）。单挂载铁律：双实例=双 sessionId=双写租约竞争。
  const featureSystem = useFeatureSystem(connection ?? undefined, {
    enabled: isEditingScopeReady,
  });

  // 画布 body 选中桥（B6 M-A5 T1）：connection.selectionSet（画布 pick 权威源）
  // → store.canvas.selection（kind='part'）单点挂载——右键菜单/对话框既有消费面
  // 零改动复用。bodies 仅在读面成功（bodiesLoaded）后下传；undefined=legacy
  // 回退，hook 不接管选择集（不清旧值）。M-A5.2 T1：仅 body 模式启用——
  // face/edge 子实体选择由工具自管、不写 SelectionSet，桥必须退订。
  // 双挂载=双写选择集，勿在下游再挂。
  const selectionMode = usePartStudioStore((s) => s.canvas.selectionMode);
  useCanvasBodySelection(
    connection ?? undefined,
    featureSystem.bodiesLoaded ? featureSystem.bodies : undefined,
    selectionMode === 'body',
  );

  // 草图系统（M6-a T5）：活动草图读面（store.sketch.activeSketchId 驱动）+
  // updateSketch 写面（复用 featureSystem.applyOp——租约/只读门禁/刷新同源）。
  // 模块级 accessor 注册：绘制工具经 IModelApp.tools.run 无参启动（M3-b 已知
  // 坑——无选项注入通道），运行期 getSketchSystem() 取本实例；卸载注销。
  const sketchSystem = useSketchSystem(connection ?? undefined, featureSystem);
  useEffect(() => {
    registerSketchSystemAccessor(sketchSystem);
    return () => registerSketchSystemAccessor(undefined);
  }, [sketchSystem]);

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
      featureSystem.bodies.some((body) => body.active && body.authored !== false) ||
      featureSystem.tree.some((entry) =>
        (BODY_PRODUCING_FEATURE_TYPES as readonly string[]).includes(entry.featureType),
      ),
    [featureSystem.bodies, featureSystem.tree],
  );

  // B6 M-A3.2a：edit 模式 FeatureDialog 的落库 params（结构键 newBody 回显——
  // 复选框禁用不翻转；updateParams 接线时必须原样保留）。树行即真源（同 refresh 通道）。
  const activeDialog = usePartStudioStore((s) => s.dialog);
  const editFeatureParams = React.useMemo(() => {
    if (activeDialog.active !== 'feature' || activeDialog.mode !== 'edit') return undefined;
    return featureSystem.tree.find((entry) => entry.id === activeDialog.featureId)?.params;
  }, [activeDialog, featureSystem.tree]);

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

  // 保存错误面（registration-failed 同款 notifications 通道）：保存失败必须
  // 可见，不静默吞（M3-b T4 教训）。本地兜底通道（Ctrl+S 键位与 dock「保存」
  // 钮共用；推送通道见 handleSaveVersion/handlePushConfirm）。
  const handleSave = useCallback(() => {
    if (!canEdit) return;
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
  }, [canEdit, undoRedo, t]);

  // 保存版本入口（B-model P0 Task 5；M4-T7 语义分线）：顶栏「保存版本」钮开
  // Named Version 对话框（干净态也可命名当前 changeset；连接缺失/canEdit 门
  // 拦截——连接未就绪时无可命名内容，诚实不响应）。
  const [createVersionOpen, setCreateVersionOpen] = React.useState(false);
  const handleSaveVersion = useCallback(() => {
    if (!canEdit || !connection) return;
    setCreateVersionOpen(true);
  }, [canEdit, connection]);

  // dock「推送」入口（M4-T7 保留）：仅推送本地变更（PushChangesetDialog），
  // 与顶栏 Named Version 命名语义分离（T4 评审 I-1 的 dock 侧分工不变）。
  const [pushDialogOpen, setPushDialogOpen] = React.useState(false);
  const handlePush = useCallback(() => {
    if (!canEdit || !connection) return;
    setPushDialogOpen(true);
  }, [canEdit, connection]);

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

  // T7-②（M5-T2）断连兜底：连接消失（页签切换重开连接的中间态/异常退出）而
  // 推送/Named Version 对话框仍开着时，`connection &&` 条件渲染会直卸载推送
  // 对话框（无声消失，无交代）——此处两个对话框一并收合并经 notifications
  // 通道说明（与保存失败/推送成功 toast 同管道，诚实呈现不静默）。守卫保证
  // 只在「开→断」跃迁发声：首挂（对话框未开）与正常关闭（connection 在场）
  // 均不响。
  useEffect(() => {
    if (connection || (!pushDialogOpen && !createVersionOpen)) return;
    setPushDialogOpen(false);
    setCreateVersionOpen(false);
    IModelApp.notifications.outputMessage(
      new NotifyMessageDetails(
        OutputMessagePriority.Warning,
        t('partStudio.pushChangeset.disconnected'),
      ),
    );
  }, [connection, pushDialogOpen, createVersionOpen, t]);

  // 键盘（M4-T4）：只补 Ctrl+S——Ctrl+Z/Ctrl+Y/Delete/Escape 由 viewer
  // registerDefaultShortcuts 独占（T3 交接裁定：二次绑定 = 工具双跑）。
  useEditorKeyboard(canEdit, { save: handleSave });

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
        // B-model P0 Task 5：干净态也可命名当前 changeset（canEdit ∧ 连接就绪）。
        canSaveVersion={canEdit && !!connection}
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
          // B6 M-A3.2a：读面仅在成功读取后下传（初次失败/未就绪 → 树回退 legacy
          // 物理查询；I1：初次失败也下传 bodiesError → 可见错误条 + 重试，不静默）。
          // I3：viewport 显式下传 → consumed 隐藏随晚到/重建视口重跑。
          bodies={featureSystem.bodiesLoaded ? featureSystem.bodies : undefined}
          bodiesLoading={featureSystem.bodiesLoading}
          bodiesError={featureSystem.bodiesError}
          viewport={viewport ?? undefined}
          // B6 M-A5 T2：树变异接线——applyOp 承载真删除/抑制 op；canEdit 总门
          // 同时驱动菜单禁用与 handler 拒收（隐藏/显示为会话态，不受此门限制）。
          applyOp={featureSystem.applyOp}
          canEdit={canEdit}
        />
        <div className="part-studio-main">
          {/* canEdit 直通画布对话框宿主（B2 只读写门禁）：权限只读下写面对话框
              的 ✓ 提交面禁用+诚实提示，不进 useFeatureSystem 租约获取等待环
             （hook 层另有 readonly 前置拒收兜底，两层防御纵深）。 */}
          <PartStudioCanvas
            viewportRef={viewportRef}
            viewport={viewport}
            canEdit={canEdit}
            applyOp={featureSystem.applyOp}
            leaseOk={featureSystem.leaseOk}
            sketches={sketchOptions}
            connection={connection ?? undefined}
            hasBodies={hasBodies}
            bodies={featureSystem.bodiesLoaded ? featureSystem.bodies : undefined}
            bodiesLoading={featureSystem.bodiesLoading}
            bodiesError={featureSystem.bodiesError}
            featureParams={editFeatureParams}
            connectionLoading={connectionLoading}
            connectionError={canvasErrorMessage}
            sketchSystem={sketchSystem}
          />
          <PartStudioDock
            iModelId={iModelId}
            currentChangesetId={connection?.changeset?.id ?? null}
            hasUnsavedChanges={undoRedo.hasUnsavedChanges}
            isSaving={undoRedo.isSaving}
            onSave={handleSave}
            onPush={handlePush}
          />
        </div>
      </div>
      <PartStudioTabs
        iTwinId={iTwinId}
        iModelId={iModelId}
        connection={phase}
        briefcaseLoading={connectionLoading}
        briefcaseError={connectionErrorMessage}
        viewportError={viewportError}
      />
      {/* 推送对话框（M4-T7；B-model P0 Task 5 起仅归 dock「推送」钮）：确认走
          connection.pushChanges；失败就地/成功 toast 归对话框自治。 */}
      {connection && (
        <PushChangesetDialog
          isOpen={pushDialogOpen}
          onClose={() => setPushDialogOpen(false)}
          onConfirm={handlePushConfirm}
        />
      )}
      {/* Named Version 对话框（B-model P0 Task 5）：顶栏「保存版本」钮的提交面
          ——有未保存变更先 pushChanges 再命名，干净态命名最新 changeset。 */}
      <CreateNamedVersionDialog
        isOpen={createVersionOpen}
        onClose={() => setCreateVersionOpen(false)}
        onConfirm={namedVersionActions.createNamedVersion}
      />
      {/* 命令搜索面板：页面级常驻挂载（alt+/ 热键经 store 驱动开合）。 */}
      <CommandPalette />
    </div>
  );
}
