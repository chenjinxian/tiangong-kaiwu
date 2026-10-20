/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type GraphicalEditingScope, IModelApp, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import { EditTools } from '@itwin/editor-frontend';
import { useNavigate, useParams } from 'react-router-dom';
import { useBriefcaseConnection, useViewport } from '@luban-cad/viewer-core';
import { useTranslation } from 'react-i18next';
import { Button, ProgressRadial, Text } from '@itwin/itwinui-react';
import { useFeatureDisplaySync } from '../../../features/editor/useFeatureDisplaySync.js';
import { VersionTimeline } from '../../../features/version-control/components/VersionTimeline.js';
import { useUser } from '../../../app/contexts/UserContext.js';
import { useITwinQuery } from '../../../features/itwin/hooks/useITwinsQuery.js';
import { ShareITwinDialog } from '../../../features/itwin/components/ShareITwinDialog.js';
import { RenameIModelDialog } from '../../../features/imodel/components/RenameIModelDialog.js';
import { useMeasurementManager } from '../../../features/measurement/hooks/useMeasurementManager.js';
import { downloadMeasurements } from '../../../features/measurement/utils/exportMeasurements.js';
import { useIModel } from '../../../features/imodel/hooks/useIModelsQuery.js';
import { useIModelPermission } from '../../../features/imodel/hooks/useIModelPermission.js';
import './Editor.css';
import './Editor.overlay.css';
import { useEditTools } from '../../../features/editor/hooks/useEditTools.js';
import { CadToolbar } from '../../../features/editor/components/CadToolbar.js';
import { registerAllTools } from '../../../features/editor/registerTools.js';
import { ConflictPanel } from '../../../features/version-control/components/ConflictPanel.js';
import { useAppToast } from '../../../shared/hooks/useAppToast.js';
import { RoundEdgesDialog } from '../../../features/modeling/components/RoundEdgesDialog.js';
import { ChamferEdgesDialog } from '../../../features/modeling/components/ChamferEdgesDialog.js';
import { HollowFacesDialog } from '../../../features/modeling/components/HollowFacesDialog.js';
import { useUndoManager } from '../../../src/core/undo/useUndoManager.js';
import { type GizmoMode, useTransformGizmo } from '../../../src/core/gizmo/useTransformGizmo.js';
import { Point3d } from '@itwin/core-geometry';
import { useAutoSave } from '../../../features/editor/hooks/useAutoSave.js';
import { PushChangesetDialog } from '../../../features/version-control/components/PushChangesetDialog.js';
import { useEditorInitialization } from '../../../features/editor/hooks/useEditorInitialization.js';
import { useEditorKeyboard } from '../../../features/editor/hooks/useEditorKeyboard.js';
import { toggleProjectExtents } from '../../../src/core/decorations/ProjectExtentsDecoration.js';
import { useSketchSystem } from '../../../features/sketch/hooks/useSketchSystem.js';
import {
  applySketchTopView,
  captureSketchView,
  restoreSketchView,
  setGridDisplayed,
  type SketchViewSnapshot,
} from '../../../features/sketch/view/sketchModeView.js';
import { useSolidModelingDialogs } from '../../../features/editor/hooks/useSolidModelingDialogs.js';
import { useVersionControl } from '../../../features/editor/hooks/useVersionControl.js';
import { useFeatureSystem } from '../../../features/editor/hooks/useFeatureSystem.js';
import { ExportDialog } from '../../../features/imodel/components/ExportDialog.js';
import { API_BASE_URL } from '../../../shared/api/baseUrl.js';
import { EditorTopBar } from '../../../features/editor/shell/EditorTopBar.js';
import { EditorToolBar } from '../../../features/editor/shell/EditorToolBar.js';
import { EditorSidePanel } from '../../../features/editor/shell/EditorSidePanel.js';
import { EditorViewport } from '../../../features/editor/shell/EditorViewport.js';
import { EditorStatusBar } from '../../../features/editor/shell/EditorStatusBar.js';
import {
  DEFAULT_EDITOR_DOCK_STATE,
  type EditorDockDisplayPanel,
  EditorDockPanel,
  type EditorDockState,
} from '../../../features/editor/shell/EditorDockPanel.js';
import { AiSidePanelSlot } from '../../../features/editor/shell/AiSidePanelSlot.js';
import { type TreeTab } from '../../../features/editor/components/FeatureTreePanel.js';

/**
 * Editor page component - Main 3D CAD workspace
 *
 * RW4-P4-T4-1：898 行 God Component → 壳化编排。展示层拆分到
 * `features/editor/shell/`（TopBar/ToolBar/SidePanel/Viewport/StatusBar/DockPanel），
 * 本文件只保留：路由/权限/初始化、既有 hooks 契约、工具处理器与页面级状态。
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
const Editor: React.FC = React.memo(() => {
  const { iTwinId, iModelId } = useParams<{ iTwinId: string; iModelId: string }>();
  const navigate = useNavigate();
  const { user } = useUser();
  const { t, i18n } = useTranslation('editor');

  const { data: iTwin } = useITwinQuery(iTwinId ?? null);
  const { data: iModel, isLoading: isIModelLoading, refetch: refetchIModel } =
    useIModel(iModelId ?? null);

  // Permission-based mode determination
  const { mode, isLoading: isPermissionLoading } = useIModelPermission({
    iTwinId: iTwinId ?? null,
    iModelId: iModelId ?? null,
  });

  const isEditable = mode === 'editable';

  // Initialize IModelApp on mount. With VITE_API_URL unset (production build)
  // the editor talks to the modeling-server through the reverse proxy on the
  // current origin, so the RPC/IPC prefix must be an absolute same-origin URL.
  const backendUrl = API_BASE_URL || window.location.origin;
  const { isAppInitialized } = useEditorInitialization(backendUrl);

  const handleBack = useCallback(() => { navigate('/documents'); }, [navigate]);
  const handleNavigateToProject = useCallback(() => {
    if (iTwinId) navigate(`/documents/${iTwinId}`);
  }, [navigate, iTwinId]);

  // Selection tool
  const handleSelectTool = useCallback(async () => {
    await IModelApp.toolAdmin.startDefaultTool();
  }, []);

  // View navigation tools
  const handleRotateView = useCallback(async () => {
    if (!IModelApp.toolAdmin) return;
    await IModelApp.tools.run('View.Rotate');
  }, []);

  const handlePanView = useCallback(async () => {
    if (!IModelApp.toolAdmin) return;
    await IModelApp.tools.run('View.Pan');
  }, []);

  const handleZoomView = useCallback(async () => {
    if (!IModelApp.toolAdmin) return;
    await IModelApp.tools.run('View.Zoom');
  }, []);

  const handleFitView = useCallback(async () => {
    const viewport = IModelApp.viewManager?.selectedView;
    if (!viewport) return;
    // Fit the view to the model's extents
    viewport.view.lookAtViewAlignedVolume(viewport.view.computeFitRange(), viewport.viewRect.aspect);
    viewport.synchWithView({});
  }, []);

  const handleViewUndo = useCallback(async () => {
    if (!IModelApp.toolAdmin) return;
    await IModelApp.tools.run('View.Undo');
  }, []);

  const handleViewRedo = useCallback(async () => {
    if (!IModelApp.toolAdmin) return;
    await IModelApp.tools.run('View.Redo');
  }, []);

  const [opStatus, setOpStatus] = useState('');
  // Track if editing scope is ready (must be declared before useEffect that uses it)
  const [isEditingScopeReady, setIsEditingScopeReady] = useState(false);
  const { showToast } = useAppToast();

  // Unified connection: always use BriefcaseConnection (read-only when not editable)
  // Wait for permission to load before opening briefcase to avoid race condition:
  // permission starts as 'readonly' → briefcase opens readonly:true → permission resolves to editable
  // but useEffect deps don't include readonly → connection stays read-only → save fails
  const briefcase = useBriefcaseConnection(
    iTwinId && iModelId && !isPermissionLoading
      ? { iTwinId, iModelId, readonly: !isEditable }
      : null
  );

  const { saveChanges, pushChanges, pullChanges } = briefcase;

  // 特征显示同步（BRep 显示 bug 层③修复）：MS 服务端写库的 geometryGuid 变化
  // 在常驻 editing scope 下被 core-frontend 缓冲——此处即时失效 tile tree（见 hook 注释）
  useFeatureDisplaySync(briefcase.connection ?? undefined);

  const editViewportRef = useRef<HTMLDivElement>(null);
  const editingScopeRef = useRef<GraphicalEditingScope | null>(null);

  const { viewport: editViewport } = useViewport({
    iModel: briefcase.connection ? briefcase.connection : undefined,
    viewportRef: editViewportRef,
  });

  // Auto-configure editorToolSettings when the edit viewport is ready
  useEffect(() => {
    if (!editViewport || !briefcase.connection || !isEditingScopeReady) return;
    const conn = briefcase.connection;
    if (!conn.isBriefcaseConnection()) return;

    const settings = conn.editorToolSettings;
    const view = editViewport.view;

    // Validate and update category
    if (settings.category === undefined || !view.viewsCategory(settings.category)) {
      settings.category = undefined;
      for (const catId of view.categorySelector.categories) {
        settings.category = catId;
        break;
      }
    }

    // Validate and update model
    if (settings.model === undefined || !view.viewsModel(settings.model)) {
      settings.model = undefined;
      if (view.is2d()) {
        settings.model = (view).baseModelId;
      } else if (view.isSpatialView()) {
        for (const modId of view.modelSelector.models) {
          settings.model = modId;
          break;
        }
      }
    }

    // Enable project extents decoration by default for spatial views
    if (view.isSpatialView()) {
      toggleProjectExtents(conn, true);
    }
  }, [editViewport, briefcase.connection, isEditingScopeReady]);

  // Initialize EditTools and register custom tools once IModelApp is running
  useEffect(() => {
    if (!isAppInitialized) return;

    let cancelled = false;

    const waitForToolAdmin = async (): Promise<boolean> => {
      for (let i = 0; i < 50; i++) {
        if (cancelled) return false;
        if (IModelApp.initialized && IModelApp.toolAdmin) {
          return true;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return false;
    };

    const initTools = async (): Promise<void> => {
      const ready = await waitForToolAdmin();
      if (!ready || cancelled) return;

      try {
        await EditTools.initialize();
        if (cancelled) return;
        registerAllTools();
      } catch (err) {
        // 工具注册失败必须可见（M3-b T4 修复：曾在 SelectAllTool 处静默抛死，
        // 其后注册行与 registerDefaultShortcuts 全部不执行）
        IModelApp.notifications.outputMessage(
          new NotifyMessageDetails(
            OutputMessagePriority.Error,
            i18n.t('page.toolRegistrationFailed', {
              // useTranslation 的 t 绑定 editor ns；此处走全局单例，必须显式传 ns
              //（defaultNS=common 无此键，漏传会显示原始 key——P4 评审 Important#1）
              ns: 'editor',
              message: err instanceof Error ? err.message : String(err),
            })
          )
        );
      }
    };

    void initTools();

    return () => {
      cancelled = true;
    };
  }, [isAppInitialized, i18n]);

  // Component unmount: exit editing scope when leaving the page
  useEffect(() => {
    return () => {
      if (editingScopeRef.current) {
        void editingScopeRef.current.exit().catch(() => undefined);
        editingScopeRef.current = null;
      }
    };
  }, []);

  // Enter GraphicalEditingScope when in editable mode
  useEffect(() => {
    if (!isEditable || !briefcase.connection) {
      return;
    }
    let scope: GraphicalEditingScope | null = null;
    const connection = briefcase.connection;
    if (!connection) {
      return;
    }

    void (async () => {
      try {
        const existingScope = connection.editingScope;

        if (existingScope && !existingScope.isDisposed) {
          scope = existingScope;
          editingScopeRef.current = scope;
        }

        await connection.supportsGraphicalEditing();

        if (!scope) {
          try {
            scope = await connection.enterEditingScope();
          } catch (enterErr) {
            const existingScope = connection.editingScope;
            if (existingScope && !existingScope.isDisposed) {
              scope = existingScope;
            } else {
              throw enterErr;
            }
          }
        }

        setIsEditingScopeReady(true);

      } catch (err) {
        console.error('[Editor] Failed to enter editing scope:', err);
        setIsEditingScopeReady(true);
      }
    })();

    return () => {
      if (scope && !isEditable) {
        void scope.exit().catch(() => undefined);
        editingScopeRef.current = null;
        setIsEditingScopeReady(false);
      }
    };
  }, [isEditable, briefcase.connection, editViewport]);

  const [transformMode, setTransformMode] = useState<GizmoMode>('move');
  // Prevent unused var warning - mode is controlled by CadToolbar now
  void setTransformMode;

  // Onshape-style layout state
  const [leftPanelTab, setLeftPanelTab] = useState<TreeTab>('features');
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [isVersionTimelineExpanded, setIsVersionTimelineExpanded] = useState(false);
  const [isSketchMode, setIsSketchMode] = useState(false);
  /**
   * T6.5 草图模式视口行为：进入前捕获的视角快照/栅格前值（退出恢复用；null = 无选中
   * 视口或未在草图模式）。快照即用即弃——二次进入重新捕获，绝不跨轮次重复恢复。
   */
  const sketchViewSnapshotRef = useRef<SketchViewSnapshot | null>(null);
  const sketchGridWasOnRef = useRef<boolean | null>(null);

  /** T6.5 进入草图模式：俯视对齐（XY 平面）+ 栅格强制开（先捕获快照），再切面板 */
  const enterSketchMode = useCallback(() => {
    if (!isSketchMode) {
      const viewport = IModelApp.viewManager?.selectedView;
      if (viewport) {
        sketchViewSnapshotRef.current = captureSketchView(viewport);
        applySketchTopView(viewport);
        sketchGridWasOnRef.current = setGridDisplayed(viewport, true);
      }
    }
    setIsSketchMode(true);
  }, [isSketchMode]);

  /** T6.5 退出草图模式：视角/栅格还原到进入前值（快照清零，防二次进入串档） */
  const exitSketchMode = useCallback(() => {
    const viewport = IModelApp.viewManager?.selectedView;
    if (viewport) {
      if (sketchViewSnapshotRef.current) {
        restoreSketchView(viewport, sketchViewSnapshotRef.current);
        sketchViewSnapshotRef.current = null;
      }
      if (sketchGridWasOnRef.current !== null) {
        setGridDisplayed(viewport, sketchGridWasOnRef.current);
        sketchGridWasOnRef.current = null;
      }
    }
    setIsSketchMode(false);
  }, []);

  // 右侧停靠状态机（RW4-P4-T4-2）：原 6 个浮层 boolean + measurement 收敛为单一对象。
  // 同一时刻至多一个停靠面板；工具栏按钮再次点击同一面板即收起。
  const [dock, setDock] = useState<EditorDockState>(DEFAULT_EDITOR_DOCK_STATE);

  const openDock = useCallback((patch: Partial<Omit<EditorDockState, 'isOpen'>>) => {
    setDock(prev => ({ ...prev, ...patch, isOpen: true }));
  }, []);

  const toggleDock = useCallback((patch: Partial<Omit<EditorDockState, 'isOpen'>>) => {
    setDock(prev => {
      const isSamePanel = prev.isOpen
        && (patch.tab === undefined || prev.tab === patch.tab)
        && (patch.toolPanel === undefined || prev.toolPanel === patch.toolPanel)
        && (patch.displayPanel === undefined || prev.displayPanel === patch.displayPanel)
        && (patch.historyPanel === undefined || prev.historyPanel === patch.historyPanel);
      return isSamePanel
        ? { ...prev, isOpen: false }
        : { ...prev, ...patch, isOpen: true };
    });
  }, []);

  const closeDock = useCallback(() => {
    setDock(prev => ({ ...prev, isOpen: false }));
  }, []);

  const toggleMeasurementPanel = useCallback(() => {
    // 与 P4 前一致：只读态不提供测量结果停靠（面板尚未接真实测量数据，
    // 打开只会是空面板；接线后随测量工具一并放开——P4 评审 Minor#5）
    if (!isEditable) return;
    toggleDock({ tab: 'toolSettings', toolPanel: 'measurement' });
  }, [isEditable, toggleDock]);

  const toggleDisplayPanel = useCallback((displayPanel: EditorDockDisplayPanel) => {
    toggleDock({ tab: 'display', displayPanel });
  }, [toggleDock]);

  // Export / Share / Rename dialog state
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);

  const { selectionCount, deleteSelected, applyTranslation, applyRotation, applyScale } =
    useEditTools({ connection: isEditable ? briefcase.connection : null });

  // 测量结果（持久化于 localStorage；停靠面板消费真实数据，P5 终审 Minor#4）
  const measurementManager = useMeasurementManager();

  // 3D Transform Gizmo
  const { hoveredAxis: _hoveredAxis, isDragging: _isDragging } = useTransformGizmo({
    viewport: editViewport ?? null,
    center: Point3d.create(0, 0, 0),
    mode: transformMode,
    isVisible: isEditable && selectionCount > 0,
    onMove: (dx, dy, dz) => {
      void applyTranslation(dx, dy, dz).catch(() => undefined);
    },
    onRotate: (axis, angle) => {
      void applyRotation(axis, angle).catch(() => undefined);
    },
    onScale: (sx, sy, sz) => {
      void applyScale(sx, sy, sz).catch(() => undefined);
    },
  });

  // Undo/redo manager with history tracking
  const { canUndo: _canUndo, canRedo: _canRedo, undoLabel: _undoLabel, redoLabel: _redoLabel, undo: _undo, redo: _redo } = useUndoManager({
    connection: isEditable && briefcase.connection ? briefcase.connection : null,
  });

  // Version control: push, pull, conflicts, history, named versions
  const versionControl = useVersionControl(
    iModelId,
    briefcase.connection ?? undefined,
    saveChanges,
    pushChanges,
    pullChanges,
    showToast,
    setOpStatus,
  );

  // Auto-save (only in editable mode)
  useAutoSave({ hasChanges: isEditable && _canUndo, onSave: versionControl.handleSave });

  // Solid modeling dialogs
  const solidModeling = useSolidModelingDialogs(
    iModelId ?? '',
    showToast,
    setOpStatus,
  );

  // 特征系统（M3-a）：Editor 级持有，保证写租约在左侧面板切换/草图模式间稳定；
  // 只读 briefcase 不申请租约（hook 内部按 isReadonly 裁决），树读取不受阻。
  const featureSystem = useFeatureSystem(
    isEditable ? briefcase.connection ?? undefined : undefined,
  );

  // 草图系统（M3-b T4.7）：SketchPanel 数据面——读面（摘要表+活动草图现场解算）+
  // insertSketch/updateSketch 提交管道；只读/未连接不取数（面板亦不渲染）。
  const sketchSystem = useSketchSystem(
    isEditable ? briefcase.connection ?? undefined : undefined,
    featureSystem,
  );

  /**
   * T6.5 特征树「编辑草图」回跳：sketch 驱动特征行（params.sketchId 存在）入口——
   * 进草图模式（俯视/栅格/提示）+ 打开对应草图（activeSketch 读面接管面板）。
   */
  const handleEditSketch = useCallback(
    (sketchId: string) => {
      enterSketchMode();
      void sketchSystem.openSketch(sketchId);
    },
    [enterSketchMode, sketchSystem],
  );

  // 特征编辑入口：参数面板（T6.2）已内建于 FeaturePanel，Editor 无需再占位

  // Keyboard shortcuts
  useEditorKeyboard(isEditable, deleteSelected, setOpStatus);

  // Loading state for permission check and IModelApp initialization
  if (isPermissionLoading || !isAppInitialized) {
    return (
      <div className="workspace-page">
        <div className="loading-state">
          <ProgressRadial size="large" indeterminate />
          <Text>{isPermissionLoading ? t('page.checkingPermission') : t('page.initializing')}</Text>
        </div>
      </div>
    );
  }

  if (!iTwinId || !iModelId) {
    return (
      <div className="workspace-page">
        <div className="error-state">
          <Text>{t('page.invalidUrl')}</Text>
          <Button styleType="high-visibility" onClick={handleBack}>{t('page.backToProjectList')}</Button>
        </div>
      </div>
    );
  }

  // Check if iModel is initialized
  const iModelState = String(iModel?.state ?? '').toLowerCase();
  const isIModelReady = iModelState === 'initialized';
  const isIModelInitializing = iModelState === 'notinitialized' || iModelState === 'initializing';

  if (isIModelInitializing) {
    return (
      <div className="workspace-page">
        <div className="loading-state">
          <ProgressRadial size="large" indeterminate />
          <Text>{t('page.imodelInitializing')}</Text>
          <Text variant="small" style={{ color: 'var(--iui-color-text-muted)', marginTop: 8 }}>
            {t('page.imodelInitHint')}
          </Text>
        </div>
      </div>
    );
  }

  if (!isIModelReady && !isIModelLoading) {
    return (
      <div className="workspace-page">
        <div className="error-state">
          <Text>{t('page.imodelNotReady')}</Text>
          <Text variant="small" style={{ color: 'var(--iui-color-text-muted)' }}>
            {t('page.statusLabel', { status: iModelState || t('page.statusUnknown') })}
          </Text>
          <Button styleType="high-visibility" onClick={handleBack}>{t('page.backToProject')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-page">
      {/* Topbar（Header + HeaderBreadcrumbs） */}
      <EditorTopBar
        iTwinName={iTwin?.displayName}
        iModelName={iModel?.displayName || iModel?.name}
        iModelId={iModelId}
        isIModelLoading={isIModelLoading}
        isEditable={isEditable}
        connection={briefcase.connection}
        connectionLoading={briefcase.isLoading}
        connectionError={briefcase.error}
        user={user}
        onBack={handleBack}
        onNavigateToProject={handleNavigateToProject}
        onExport={() => setIsExportDialogOpen(true)}
        onShare={() => setIsShareDialogOpen(true)}
        onRename={() => setIsRenameDialogOpen(true)}
        onOpenHistory={() => {
          // 药丸直达历史停靠：同步激活 history tab，使 changesets 查询启动
          //（否则 fresh editor 下回滚索引不可解析——终审复检 Important#2）
          versionControl.setActiveSidebarTab('history');
          openDock({ tab: 'history', historyPanel: 'changesets' });
        }}
        changesetLabel={
          // briefcase 连接即带当前 changeset.index（不依赖 changesets 列表加载——
          // 终审 I4：fresh editor 下版本药丸曾不可见）
          briefcase.connection ? `#${briefcase.connection.changeset.index}` : undefined
        }
      />

      {/* Primary Toolbar - Integrated Layout */}
      <EditorToolBar
        isEditable={isEditable}
        hasConnection={!!briefcase.connection}
        dock={dock}
        onToggleMeasurement={toggleMeasurementPanel}
        onToggleDisplayPanel={toggleDisplayPanel}
        onSelectTool={handleSelectTool}
        onRotateView={handleRotateView}
        onPanView={handlePanView}
        onZoomView={handleZoomView}
        onFitView={handleFitView}
        onViewUndo={handleViewUndo}
        onViewRedo={handleViewRedo}
      />

      {/* Secondary Toolbar - Modeling Tools (Onshape/FreeCAD style) */}
      {isEditable && (
        <CadToolbar
          isEditMode={isEditable && !!briefcase.connection}
          isReady={isEditingScopeReady}
          onEnterSketchMode={enterSketchMode}
          isSketchMode={isSketchMode}
        />
      )}

      {/* Main content area: Onshape-style 3-panel layout */}
      <div className="editor-main">
        {/* Left: Feature Tree or Sketch Panel */}
        <EditorSidePanel
          isEditable={isEditable}
          isSketchMode={isSketchMode}
          connection={briefcase.connection}
          featureSystem={featureSystem}
          sketchSystem={sketchSystem}
          onToast={showToast}
          onEditSketch={handleEditSketch}
          activeTab={leftPanelTab}
          onTabChange={setLeftPanelTab}
          isCollapsed={isLeftPanelCollapsed}
          onToggleCollapse={() => setIsLeftPanelCollapsed(v => !v)}
          onExitSketchMode={exitSketchMode}
          // 右栏「工具设置」激活时左栏让位：ToolSettingsPanel 为单例 handler 宿主，
          // 双实例会互相清空 reloadToolSettingsHandler（P4 评审 Important#3）
          showToolSettings={!(dock.isOpen && dock.tab === 'toolSettings')}
        />

        {/* Center: 3D Viewer */}
        <EditorViewport viewportRef={editViewportRef} />

        {/* Right: 停靠面板（工具设置/版本历史/显示设置） */}
        <EditorDockPanel
          state={dock}
          isEditable={isEditable}
          onTabChange={tab => setDock(prev => ({ ...prev, tab, isOpen: true }))}
          onToolPanelChange={toolPanel => setDock(prev => ({ ...prev, toolPanel }))}
          onDisplayPanelChange={displayPanel => setDock(prev => ({ ...prev, displayPanel }))}
          onHistoryPanelChange={historyPanel => setDock(prev => ({ ...prev, historyPanel }))}
          onClose={closeDock}
          iModelId={iModelId ?? null}
          changesets={versionControl.changesets}
          currentChangesetId={briefcase.connection?.changeset.id ?? null}
          hasLocalChanges={versionControl.hasLocalChanges}
          onPush={() => versionControl.setPushDialogOpen(true)}
          onPull={() => void versionControl.handlePull()}
          onShowHistory={() => {
            versionControl.setActiveSidebarTab('history');
            openDock({ tab: 'history' });
          }}
          onShowVersions={() => {
            versionControl.setActiveSidebarTab('versions');
            openDock({ tab: 'history', historyPanel: 'namedVersions' });
          }}
          onRollback={versionControl.handleRollbackToVersion}
          measurements={measurementManager.measurements}
          onDeleteMeasurement={measurementManager.deleteMeasurement}
          onClearMeasurements={measurementManager.clearMeasurements}
          onExportMeasurements={() => downloadMeasurements(measurementManager.measurements)}
        />

        {/* RW3 AI 预留位：RW4 恒 false（零布局影响） */}
        <AiSidePanelSlot isActive={false} />

        {/* Conflict detection panel */}
        <ConflictPanel
          detectionResult={versionControl.detectionResult}
          isVisible={versionControl.showConflictPanel}
          onClose={versionControl.handleCloseConflictPanel}
          onResolve={versionControl.handleResolveConflicts}
        />
      </div>

      {/* Bottom: Version Timeline (Onshape style)。
          右栏历史 tab 打开时隐藏底栏，避免 DOM 双实例（推送/拉取/历史按钮 strict-mode
          与视觉重复——P4 评审 Minor#4）；关闭右栏后底栏原样回归。 */}
      {isEditable && !(dock.isOpen && dock.tab === 'history') && (
        <VersionTimeline
          isExpanded={isVersionTimelineExpanded}
          onToggleExpand={() => setIsVersionTimelineExpanded(v => !v)}
          changesets={versionControl.changesets}
          currentChangesetId={briefcase.connection?.changeset.id ?? null}
          hasLocalChanges={versionControl.hasLocalChanges}
          onPush={() => versionControl.setPushDialogOpen(true)}
          onPull={() => void versionControl.handlePull()}
          onShowHistory={() => {
            versionControl.setActiveSidebarTab('history');
            openDock({ tab: 'history' });
          }}
          onShowVersions={() => {
            versionControl.setActiveSidebarTab('versions');
            openDock({ tab: 'history', historyPanel: 'namedVersions' });
          }}
        />
      )}

      {/* Solid Modeling Dialogs */}
      <RoundEdgesDialog
        isOpen={solidModeling.roundDialogOpen}
        selectedCount={solidModeling.selectedEdges.length}
        onClose={() => {
          solidModeling.setRoundDialogOpen(false);
        }}
        onConfirm={solidModeling.handleRoundConfirm}
      />

      <ChamferEdgesDialog
        isOpen={solidModeling.chamferDialogOpen}
        selectedCount={solidModeling.selectedEdges.length}
        onClose={() => {
          solidModeling.setChamferDialogOpen(false);
        }}
        onConfirm={solidModeling.handleChamferConfirm}
      />

      <HollowFacesDialog
        isOpen={solidModeling.hollowDialogOpen}
        selectedCount={solidModeling.selectedFaces.length}
        onClose={() => {
          solidModeling.setHollowDialogOpen(false);
        }}
        onConfirm={solidModeling.handleHollowConfirm}
      />

      <PushChangesetDialog
        isOpen={versionControl.pushDialogOpen}
        onClose={() => versionControl.setPushDialogOpen(false)}
        onConfirm={(description) => void versionControl.handlePush(description)}
      />

      <ExportDialog
        isOpen={isExportDialogOpen}
        iModelId={iModelId ?? ''}
        iModelName={iModel?.displayName || iModel?.name || iModelId || ''}
        onClose={() => setIsExportDialogOpen(false)}
        onExport={(format, fileName) => {
          showToast(t('export.success', { format, fileName }), 'success');
        }}
      />

      {/* 分享当前项目（复用 P3 ShareITwinDialog） */}
      <ShareITwinDialog
        iTwin={iTwin ?? null}
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
      />

      {/* 重命名当前 iModel（编辑权限） */}
      <RenameIModelDialog
        iModel={iModel ?? null}
        iTwinId={iTwinId ?? ''}
        isOpen={isRenameDialogOpen}
        onClose={() => setIsRenameDialogOpen(false)}
        onRenamed={() => {
          void refetchIModel();
          setIsRenameDialogOpen(false);
        }}
      />

      {/* Status bar */}
      <EditorStatusBar
        isEditable={isEditable}
        isSketchMode={isSketchMode}
        connectionLoading={briefcase.isLoading}
        connectionError={briefcase.error}
        isProcessing={solidModeling.isProcessing}
        opStatus={opStatus}
        selectionCount={selectionCount}
        iTwinName={iTwin?.displayName}
        iModelName={iModel?.displayName || iModel?.name}
        iTwinId={iTwinId}
        iModelId={iModelId}
      />
    </div>
  );
});

// Display name for debugging
Editor.displayName = 'Editor';

export default Editor;
