/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type GraphicalEditingScope, IModelApp, type ViewState2d } from '@itwin/core-frontend';
import { EditTools } from '@itwin/editor-frontend';
import { useNavigate, useParams } from 'react-router-dom';
import { useBriefcaseConnection, useViewport } from '@open-cloud-cad/viewer-core';
import { ThemeToggle } from '../../../features/editor/components/ThemeToggle.js';
import { EditorBriefcaseStatus } from '../../../features/editor/components/EditorBriefcaseStatus.js';
import { FeatureTreePanel, type TreeTab } from '../../../features/editor/components/FeatureTreePanel.js';
import { VersionTimeline } from '../../../features/version-control/components/VersionTimeline.js';
import { MeasurementResultsPanel } from '../../../features/measurement/components/MeasurementResultsPanel.js';
import { useUser } from '../../../app/contexts/UserContext.js';
import { useITwinQuery } from '../../../features/itwin/hooks/useITwinsQuery.js';
import {
  SvgCursor,
  SvgMeasure,
  SvgModel,
  SvgLayers,
  SvgSettings,
  SvgVisibilityHalf,
  SvgSave,
  SvgCrop,
  SvgFitToView,
  SvgMove,
  SvgZoomIn,
  SvgUndo,
  SvgRedo,
  SvgRotateRight,
  SvgExport,
  SvgInfo,
} from '@itwin/itwinui-icons-react';
import { useIModel } from '../../../features/imodel/hooks/useIModelsQuery.js';
import { useIModelPermission } from '../../../features/imodel/hooks/useIModelPermission.js';
import { Button, IconButton, Avatar, Divider, Text, Badge, ProgressRadial, ButtonGroup } from '@itwin/itwinui-react';
import './Editor.css';
import './Editor.overlay.css';
import { useEditTools } from '../../../features/editor/hooks/useEditTools.js';
import { CadToolbar } from '../../../features/editor/components/CadToolbar.js';
import { registerAllTools } from '../../../features/editor/registerTools.js';
import { ConflictPanel } from '../../../features/version-control/components/ConflictPanel.js';
import { useToast } from '../../../shared/components/ui/ToastContainer.js';
import { RoundEdgesDialog } from '../../../features/modeling/components/RoundEdgesDialog.js';
import { ChamferEdgesDialog } from '../../../features/modeling/components/ChamferEdgesDialog.js';
import { HollowFacesDialog } from '../../../features/modeling/components/HollowFacesDialog.js';
import { UndoRedoToolbar, useUndoManager } from '../../core/undo/index.js';
import { useTransformGizmo, type GizmoMode } from '../../core/gizmo/useTransformGizmo.js';
import { Point3d } from '@itwin/core-geometry';
import { useAutoSave } from '../../../features/editor/hooks/useAutoSave.js';
import { PushChangesetDialog } from '../../../features/version-control/components/PushChangesetDialog.js';
import { useEditorInitialization } from '../../../features/editor/hooks/useEditorInitialization.js';
import { useEditorKeyboard } from '../../../features/editor/hooks/useEditorKeyboard.js';
import { toggleProjectExtents } from '../../core/decorations/ProjectExtentsDecoration.js';
import { SketchPanel } from '../../../features/sketch/components/SketchPanel.js';
import { useSolidModelingDialogs } from '../../../features/editor/hooks/useSolidModelingDialogs.js';
import { useVersionControl } from '../../../features/editor/hooks/useVersionControl.js';
import { ExportDialog } from '../../../features/imodel/components/ExportDialog.js';
import {
  ViewCube,
  ModelPicker,
  CategoryPicker,
  ViewSettingsPanel,
  ViewSwitcher,
  SavedViewsPanel,
  SectionToolsPanel,
} from '@open-cloud-cad/viewer-core';

/**
 * Editor page component - Main 3D CAD workspace
 * Optimized with React.memo and useCallback for performance
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
const Editor: React.FC = React.memo(() => {
  const { iTwinId, iModelId } = useParams<{ iTwinId: string; iModelId: string }>();
  const navigate = useNavigate();
  const { user } = useUser();

  const { data: iTwin } = useITwinQuery(iTwinId ?? null);
  const { data: iModel, isLoading: isIModelLoading } = useIModel(iModelId ?? null);

  // Permission-based mode determination
  const { mode, isLoading: isPermissionLoading } = useIModelPermission({
    iTwinId: iTwinId ?? null,
    iModelId: iModelId ?? null,
  });

  const isEditable = mode === 'editable';

  // Initialize IModelApp on mount
  const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:4001';
  const { isAppInitialized } = useEditorInitialization(backendUrl);

  const handleBack = useCallback(() => { navigate('/itwins'); }, [navigate]);
  const handleNavigateToProject = useCallback(() => {
    if (iTwinId) navigate(`/itwins/${iTwinId}`);
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
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { showToast, ToastContainer } = useToast();

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
        settings.model = (view as ViewState2d).baseModelId;
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
      } catch {
        // Tool registration failed silently
      }
    };

    void initTools();

    return () => {
      cancelled = true;
    };
  }, [isAppInitialized]);

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
  const [showMeasurementPanel, setShowMeasurementPanel] = useState(false);
  const [isSketchMode, setIsSketchMode] = useState(false);

  // New viewer tools panel states
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showViewSettings, setShowViewSettings] = useState(false);
  const [showViewSwitcher, setShowViewSwitcher] = useState(false);
  const [showSavedViews, setShowSavedViews] = useState(false);
  const [showSectionTools, setShowSectionTools] = useState(false);

  // Export dialog state
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);

  const { selectionCount, deleteSelected, applyTranslation, applyRotation, applyScale } =
    useEditTools({ connection: isEditable ? briefcase.connection : null });

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

  // Keyboard shortcuts
  useEditorKeyboard(isEditable, deleteSelected, setOpStatus);

  // Loading state for permission check and IModelApp initialization
  if (isPermissionLoading || !isAppInitialized) {
    return (
      <div className="workspace-page">
        <div className="loading-state">
          <ProgressRadial size="large" indeterminate />
          <Text>{isPermissionLoading ? '检查权限中...' : '初始化编辑器...'}</Text>
        </div>
      </div>
    );
  }

  if (!iTwinId || !iModelId) {
    return (
      <div className="workspace-page">
        <div className="error-state">
          <Text>无效的 URL: 缺少 iTwin 或 iModel ID</Text>
          <Button styleType="high-visibility" onClick={handleBack}>返回项目列表</Button>
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
          <Text>iModel 初始化中，请稍候...</Text>
          <Text variant="small" style={{ color: '#666', marginTop: 8 }}>
            这可能需要几分钟时间
          </Text>
        </div>
      </div>
    );
  }

  if (!isIModelReady && !isIModelLoading) {
    return (
      <div className="workspace-page">
        <div className="error-state">
          <Text>iModel 未准备就绪</Text>
          <Text variant="small" style={{ color: '#666' }}>
            状态: {iModelState || '未知'}
          </Text>
          <Button styleType="high-visibility" onClick={handleBack}>返回项目</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-page">
      {/* Topbar */}
      <header className="topbar">
        <div className="logo-mark">CC</div>
        <nav className="breadcrumb">
          <Button styleType="borderless" className="breadcrumb-link" onClick={handleBack}>项目列表</Button>
          {iTwin && (
            <>
              <Text className="breadcrumb-sep">/</Text>
              <Button styleType="borderless" className="breadcrumb-link" onClick={handleNavigateToProject}>
                {iTwin.displayName}
              </Button>
            </>
          )}
          <Text className="breadcrumb-sep">/</Text>
          <Text className="breadcrumb-current">
            {isIModelLoading ? '加载中...' : (iModel?.displayName ?? iModelId?.slice(0, 8))}
          </Text>
        </nav>
        <div className="topbar-actions">
          <EditorBriefcaseStatus
            connection={briefcase.connection}
            isLoading={briefcase.isLoading}
            error={briefcase.error}
            isEditable={isEditable}
          />
          {!isEditable && (
            <IconButton styleType="default" disabled title="需要编辑权限">
              <SvgInfo />
            </IconButton>
          )}
          <IconButton
            styleType="default"
            onClick={() => setIsExportDialogOpen(true)}
            title="导出模型"
          >
            <SvgExport />
          </IconButton>
          <Divider orientation="vertical" />
          <ThemeToggle />
          <Avatar
            title={user?.name || user?.email}
            abbreviation={(user?.name?.slice(0, 2) || user?.email?.slice(0, 2) || 'U').toUpperCase()}
          />
        </div>
      </header>

      {/* Primary Toolbar - Integrated Layout */}
      <div className="toolbar toolbar-primary">
        {/* Selection & Measurement */}
        <ButtonGroup className="toolbar-group">
          <IconButton styleType="borderless" label="选择" onClick={handleSelectTool} title="选择工具 (Space)">
            <SvgCursor />
          </IconButton>
          <IconButton
            styleType={showMeasurementPanel ? 'cta' : 'borderless'}
            label="测量"
            onClick={() => setShowMeasurementPanel(v => !v)}
            title="测量工具"
          >
            <SvgMeasure />
          </IconButton>
        </ButtonGroup>

        <Divider orientation="vertical" className="toolbar-divider" />

        {/* View Navigation Tools */}
        <ButtonGroup className="toolbar-group">
          <IconButton styleType="borderless" label="旋转" onClick={handleRotateView} title="旋转视图">
            <SvgRotateRight />
          </IconButton>
          <IconButton styleType="borderless" label="平移" onClick={handlePanView} title="平移视图">
            <SvgMove />
          </IconButton>
          <IconButton styleType="borderless" label="缩放" onClick={handleZoomView} title="缩放视图">
            <SvgZoomIn />
          </IconButton>
          <IconButton styleType="borderless" label="适应" onClick={handleFitView} title="适应视图">
            <SvgFitToView />
          </IconButton>
          <IconButton styleType="borderless" label="撤销视图" onClick={handleViewUndo} title="撤销视图更改">
            <SvgUndo />
          </IconButton>
          <IconButton styleType="borderless" label="重做视图" onClick={handleViewRedo} title="重做视图更改">
            <SvgRedo />
          </IconButton>
        </ButtonGroup>

        <Divider orientation="vertical" className="toolbar-divider" />

        {/* Display Controls */}
        <ButtonGroup className="toolbar-group">
          <IconButton
            styleType={showModelPicker ? 'cta' : 'borderless'}
            label="模型"
            onClick={() => { setShowModelPicker(v => !v); setShowCategoryPicker(false); }}
            title="模型选择器"
          >
            <SvgModel />
          </IconButton>
          <IconButton
            styleType={showCategoryPicker ? 'cta' : 'borderless'}
            label="类别"
            onClick={() => { setShowCategoryPicker(v => !v); setShowModelPicker(false); }}
            title="类别选择器"
          >
            <SvgLayers />
          </IconButton>
          <IconButton
            styleType={showSectionTools ? 'cta' : 'borderless'}
            label="剖切"
            onClick={() => setShowSectionTools(v => !v)}
            title="剖切工具"
          >
            <SvgCrop />
          </IconButton>
        </ButtonGroup>

        <Divider orientation="vertical" className="toolbar-divider" />

        {/* View Management */}
        <ButtonGroup className="toolbar-group">
          <IconButton
            styleType={showViewSwitcher ? 'cta' : 'borderless'}
            label="切换视图"
            onClick={() => { setShowViewSwitcher(v => !v); setShowSavedViews(false); }}
            title="切换视图定义"
          >
            <SvgVisibilityHalf />
          </IconButton>
          <IconButton
            styleType={showSavedViews ? 'cta' : 'borderless'}
            label="保存视图"
            onClick={() => { setShowSavedViews(v => !v); setShowViewSwitcher(false); }}
            title="保存的视图"
          >
            <SvgSave />
          </IconButton>
          <IconButton
            styleType={showViewSettings ? 'cta' : 'borderless'}
            label="显示设置"
            onClick={() => setShowViewSettings(v => !v)}
            title="视图显示设置"
          >
            <SvgSettings />
          </IconButton>
        </ButtonGroup>

        {/* Spacer */}
        <div className="toolbar-spacer" />

        {/* Undo/Redo - Only in editable mode */}
        {isEditable && briefcase.connection && (
          <ButtonGroup className="toolbar-group">
            <UndoRedoToolbar />
          </ButtonGroup>
        )}
      </div>

      {/* Secondary Toolbar - Modeling Tools (Onshape/FreeCAD style) */}
      {isEditable && (
        <CadToolbar
          isEditMode={isEditable && !!briefcase.connection}
          isReady={isEditingScopeReady}
          onEnterSketchMode={() => setIsSketchMode(true)}
          isSketchMode={isSketchMode}
        />
      )}

      {/* Main content area: Onshape-style 3-panel layout */}
      <div className="editor-main">
        {/* Left: Feature Tree or Sketch Panel */}
        {isEditable && !isSketchMode && (
          <FeatureTreePanel
            connection={briefcase.connection}
            activeTab={leftPanelTab}
            onTabChange={setLeftPanelTab}
            isCollapsed={isLeftPanelCollapsed}
            onToggleCollapse={() => setIsLeftPanelCollapsed(v => !v)}
          />
        )}
        {isEditable && isSketchMode && (
          <SketchPanel
            isActive={isSketchMode}
            onExit={() => setIsSketchMode(false)}
          />
        )}

        {/* Center: 3D Viewer */}
        <div className="viewer-wrap">
          <div ref={editViewportRef} style={{ width: '100%', height: '100%' }} />

          {/* Floating UI Overlay - Organized Layout */}
          <div className="viewer-overlay">
            {/* Top Right: ViewCube */}
            <div className="overlay-top-right">
              <ViewCube />
            </div>

            {/* Left Panel Stack: Model/Category/Settings/ToolSettings */}
            <div className="overlay-left-stack">
              {showModelPicker && (
                <div className="floating-panel">
                  <ModelPicker />
                </div>
              )}
              {showCategoryPicker && (
                <div className="floating-panel">
                  <CategoryPicker />
                </div>
              )}
              {showViewSettings && (
                <div className="floating-panel">
                  <ViewSettingsPanel />
                </div>
              )}
            </div>

            {/* Right Panel Stack: View Switcher/Saved Views/Section Tools */}
            <div className="overlay-right-stack">
              {showViewSwitcher && (
                <div className="floating-panel">
                  <ViewSwitcher />
                </div>
              )}
              {showSavedViews && (
                <div className="floating-panel">
                  <SavedViewsPanel />
                </div>
              )}
              {showSectionTools && (
                <div className="floating-panel">
                  <SectionToolsPanel />
                </div>
              )}
            </div>

            {/* Measurement Panel - Bottom Left */}
            {isEditable && showMeasurementPanel && (
              <div className="overlay-bottom-left">
                <MeasurementResultsPanel measurements={[]} onDelete={() => {}} onClear={() => {}} onExport={() => {}} />
              </div>
            )}
          </div>
        </div>

        {/* Conflict detection panel */}
        <ConflictPanel
          detectionResult={versionControl.detectionResult}
          isVisible={versionControl.showConflictPanel}
          onClose={versionControl.handleCloseConflictPanel}
          onResolve={versionControl.handleResolveConflicts}
        />
      </div>

      {/* Bottom: Version Timeline (Onshape style) */}
      {isEditable && (
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
            setIsVersionTimelineExpanded(true);
          }}
          onShowVersions={() => {
            versionControl.setActiveSidebarTab('versions');
            setIsVersionTimelineExpanded(true);
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
        iModelName={iModel?.displayName ?? iModelId ?? ''}
        onClose={() => setIsExportDialogOpen(false)}
        onExport={(format, fileName) => {
          showToast(`已导出 ${format} 格式: ${fileName}`, 'success');
        }}
      />

      <ToastContainer />

      {/* Status bar */}
      <div className="statusbar">
        <div className="status-left">
          <div className="status-item">
            <span className="status-indicator" />
            <Text variant="small">已连接</Text>
          </div>
          {isEditable && (
            <>
              <Text className="status-sep">|</Text>
              <div className="status-item">
                <span className="status-indicator" style={{ background: briefcase.isLoading || solidModeling.isProcessing ? '#f90' : briefcase.error ? '#c00' : '#0c0' }} />
                <Text variant="small">
                  {briefcase.isLoading ? '加载简报...' : solidModeling.isProcessing ? '处理中...' : briefcase.error ? `编辑错误: ${briefcase.error.message}` : opStatus || '编辑模式'}
                </Text>
              </div>
              {selectionCount > 0 && (
                <>
                  <Text className="status-sep">|</Text>
                  <Badge backgroundColor="positive">{`已选: ${selectionCount} 个元素`}</Badge>
                </>
              )}
            </>
          )}
          {!isEditable && (
            <>
              <Text className="status-sep">|</Text>
              <Badge backgroundColor="informational">只读模式</Badge>
            </>
          )}
          <Text className="status-sep">|</Text>
          <Text variant="small">公制单位</Text>
          <Text className="status-sep">|</Text>
          <Text variant="small">透视视图</Text>
        </div>
        <div className="status-right">
          <Text variant="small">{iTwin?.displayName || iTwinId?.slice(0, 8)}</Text>
          <Text className="status-sep">|</Text>
          <Text variant="small">{iModel?.displayName || iModelId?.slice(0, 8)}</Text>
        </div>
      </div>
    </div>
  );
});

// Display name for debugging
Editor.displayName = 'Editor';

export default Editor;
