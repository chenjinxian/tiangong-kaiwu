/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Angle, Matrix3d, Point3d, Vector3d } from '@itwin/core-geometry';
import type { Viewport } from '@itwin/core-frontend';
import Editor from './Editor.js';

// T6.5：可变视口持有人——各用例注入鸭子类型假视口（同 sketchModeView.test.ts 结构面），
// 默认 undefined（无选中视口 → 模式切换不动 viewport 也不炸）
const viewportHolder = vi.hoisted(() => ({ current: undefined as unknown }));

// T6.5：sketch 系统 spy——特征树「编辑草图」回跳断言 openSketch(sketchId)
const sketchMocks = vi.hoisted(() => ({
  openSketch: vi.fn().mockResolvedValue(undefined),
  closeSketch: vi.fn(),
  applyUpdate: vi.fn().mockResolvedValue({ ok: true }),
  createSketch: vi.fn().mockResolvedValue({ ok: true }),
  refresh: vi.fn().mockResolvedValue(undefined),
  applyOp: vi.fn().mockResolvedValue({ ok: true }),
}));

// Mock all external deps
vi.mock('@luban-cad/web-viewer', () => ({
  WebViewer: () => <div data-testid="web-viewer" />,
}));
vi.mock('../../../features/editor/components/ThemeToggle.js', () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));
vi.mock('../../../features/itwin/hooks/useITwinsQuery.js', () => ({
  useITwinQuery: () => ({ data: { displayName: 'My Project' }, isLoading: false }),
}));
vi.mock('../../../features/imodel/hooks/useIModelsQuery.js', () => ({
  useIModel: () => ({
    data: { displayName: 'My iModel', state: 'initialized' },
    isLoading: false,
  }),
}));
vi.mock('../../../app/contexts/UserContext.js', () => ({
  useUser: () => ({ user: { name: 'Test User' }, getAccessToken: () => 'token' }),
}));

const mockSave = vi.fn().mockResolvedValue(undefined);
const mockPush = vi.fn().mockResolvedValue(undefined);
const mockPull = vi.fn().mockResolvedValue(undefined);

vi.mock('@luban-cad/viewer-core', () => ({
  useBriefcaseConnection: () => ({
    connection: null,
    isLoading: false,
    error: null,
    saveChanges: mockSave,
    pushChanges: mockPush,
    pullChanges: mockPull,
  }),
  useViewport: () => ({ viewport: undefined }),
  ViewCube: () => <div data-testid="view-cube" />,
}));

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: {
    toolAdmin: { startDefaultTool: vi.fn(), doUndoOperation: vi.fn(), doRedoOperation: vi.fn(), activeToolChanged: { addListener: vi.fn(() => vi.fn) } },
    accuSnap: { currHit: null },
    locateManager: { options: { allowDecorations: false } },
    tools: { register: vi.fn(), run: vi.fn() },
    viewManager: {
      get selectedView() {
        return viewportHolder.current;
      },
    },
  },
  StandardViewId: { Top: 'StandardViewId.Top' },
  Tool: class {
    public async run() { return Promise.resolve(true); }
    public async exitTool() { return Promise.resolve(); }
  },
  PrimitiveTool: class {
    public async run() { return Promise.resolve(true); }
    public async exitTool() { return Promise.resolve(); }
  },
  SelectionTool: class {
    public async run() { return Promise.resolve(true); }
    public async exitTool() { return Promise.resolve(); }
    protected get wantAccuSnap() { return false; }
    protected get wantDynamics() { return false; }
    protected initLocateElements() {}
    protected async onRestartTool() {}
  },
  AccuDrawHintBuilder: class {
    public setNormal() {}
    public setOrigin() {}
    public sendHints() {}
  },
  BeButtonEvent: class {},
  EventHandled: { Yes: 'Yes', No: 'No' },
  SnapDetail: class {},
}));

vi.mock('../../../features/editor/hooks/useEditTools.js', () => ({
  useEditTools: () => ({
    selectionCount: 0,
    moveMode: false,
    setMoveMode: vi.fn(),
    deleteSelected: vi.fn().mockResolvedValue(undefined),
    applyTranslation: vi.fn().mockResolvedValue(undefined),
    undo: vi.fn().mockResolvedValue(undefined),
    redo: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock extracted hooks from Phase 3 refactoring
vi.mock('../../../features/editor/hooks/useEditorInitialization.js', () => ({
  useEditorInitialization: () => ({ isAppInitialized: true }),
}));
vi.mock('../../../features/editor/hooks/useEditorKeyboard.js', () => ({
  useEditorKeyboard: () => {},
}));
vi.mock('../../../features/editor/hooks/useSolidModelingDialogs.js', () => ({
  useSolidModelingDialogs: () => ({
    roundDialogOpen: false,
    chamferDialogOpen: false,
    hollowDialogOpen: false,
    selectedEdges: [],
    selectedFaces: [],
    selectedElementId: null,
    isProcessing: false,
    setRoundDialogOpen: vi.fn(),
    setChamferDialogOpen: vi.fn(),
    setHollowDialogOpen: vi.fn(),
    handleRoundConfirm: vi.fn(),
    handleChamferConfirm: vi.fn(),
    handleHollowConfirm: vi.fn(),
  }),
}));
vi.mock('../../../features/editor/hooks/useVersionControl.js', () => ({
  useVersionControl: (
    _iModelId: unknown,
    _connection: unknown,
    saveChanges: (desc: string) => Promise<void>,
    pushChanges: (desc: string) => Promise<void>,
    pullChanges: () => Promise<void>,
  ) => ({
    showCompare: false,
    showConflictPanel: false,
    pendingPullChangesetId: null,
    pushDialogOpen: false,
    activeSidebarTab: 'features',
    compareVersions: null,
    changesets: [],
    detectionResult: null,
    setShowCompare: vi.fn(),
    setShowCompareWithReset: vi.fn(),
    setPushDialogOpen: vi.fn(),
    setActiveSidebarTab: vi.fn(),
    handleSave: vi.fn().mockImplementation(() => saveChanges('手动保存')),
    handlePush: vi.fn().mockImplementation((desc: string) => pushChanges(desc)),
    handlePull: vi.fn().mockImplementation(() => pullChanges()),
    handlePullToChangeset: vi.fn(),
    handleResolveConflicts: vi.fn(),
    handleCloseConflictPanel: vi.fn(),
    handleRollbackToVersion: vi.fn(),
    handleCompareVersions: vi.fn(),
  }),
}));
vi.mock('../../../features/editor/hooks/useAutoSave.js', () => ({
  useAutoSave: () => {},
}));
// T6.3：FeaturePanel 内嵌的选边拾取器 hook——桩掉以免 SelectSubEntityTool/editor-frontend 链入套件
vi.mock('../../../features/editor/hooks/useEdgeRefPicker.js', () => ({
  useEdgeRefPicker: () => ({ picking: false, refs: [], start: vi.fn(), stop: vi.fn(), removeAt: vi.fn() }),
}));
vi.mock('../../../features/editor/registerTools.js', () => ({
  registerAllTools: vi.fn(),
}));
vi.mock('../../../shared/components/ui/ToastContainer.js', () => ({
  useToast: () => ({
    showToast: vi.fn(),
    ToastContainer: () => null,
  }),
}));
vi.mock('../../../app/contexts/ThemeContext.js', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn(), setTheme: vi.fn() }),
}));

// Mock remaining components and modules
vi.mock('@itwin/editor-frontend', () => ({
  EditTools: { initialize: vi.fn() },
}));
vi.mock('../../../features/editor/components/EditorBriefcaseStatus.js', () => ({
  EditorBriefcaseStatus: () => <div data-testid="briefcase-status" />,
}));
vi.mock('../../../features/editor/components/EditorSidebar.js', () => ({
  EditorSidebar: () => <div data-testid="editor-sidebar" />,
}));
vi.mock('../../../features/editor/components/CadToolbar.js', () => ({
  // T6.5：工具条「编辑草图」触发 onEnterSketchMode（真 CadToolbar 的同名按钮 e2e 覆盖）
  CadToolbar: (props: { onEnterSketchMode?: () => void }) => (
    <div data-testid="cad-toolbar">
      <button type="button" onClick={props.onEnterSketchMode}>编辑草图</button>
    </div>
  ),
}));
// T6.5：SketchPanel 桩——只保留退出按钮（真面板由 sketch.spec e2e 覆盖）
vi.mock('../../../features/sketch/components/SketchPanel.js', () => ({
  SketchPanel: ({ onExit }: { onExit: () => void }) => (
    <div data-testid="sketch-panel">
      <button type="button" onClick={onExit}>退出草图</button>
    </div>
  ),
}));
// T6.5：特征系统桩——一棵 sketch 驱动 extrude（params.sketchId 存在 → 行内「编辑草图」入口）
vi.mock('../../../features/editor/hooks/useFeatureSystem.js', () => ({
  useFeatureSystem: () => ({
    tree: [
      {
        id: 'f1',
        featureType: 'extrude',
        orderKey: 1,
        suppressed: false,
        status: 0,
        params: { sketchId: 'sk-1', distance: 2 },
      },
    ],
    loading: false,
    leaseOk: true,
    formModel: {
      extrude: { fields: [{ name: 'distance', label: '距离', kind: 'number' }] },
    },
    refresh: sketchMocks.refresh,
    applyOp: sketchMocks.applyOp,
    previewOp: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock('../../../features/sketch/hooks/useSketchSystem.js', () => ({
  useSketchSystem: () => ({
    sketches: [],
    activeSketch: undefined,
    loading: false,
    openSketch: sketchMocks.openSketch,
    closeSketch: sketchMocks.closeSketch,
    applyUpdate: sketchMocks.applyUpdate,
    createSketch: sketchMocks.createSketch,
    refresh: sketchMocks.refresh,
  }),
}));
vi.mock('../../../features/version-control/components/ConflictPanel.js', () => ({
  ConflictPanel: () => <div data-testid="conflict-panel" />,
}));
vi.mock('../../../features/version-control/components/PushChangesetDialog.js', () => ({
  PushChangesetDialog: () => <div data-testid="push-dialog" />,
}));
vi.mock('../../../features/modeling/components/RoundEdgesDialog.js', () => ({
  RoundEdgesDialog: () => <div data-testid="round-dialog" />,
}));
vi.mock('../../../features/modeling/components/ChamferEdgesDialog.js', () => ({
  ChamferEdgesDialog: () => <div data-testid="chamfer-dialog" />,
}));
vi.mock('../../../features/modeling/components/HollowFacesDialog.js', () => ({
  HollowFacesDialog: () => <div data-testid="hollow-dialog" />,
}));
vi.mock('../../core/undo/index.js', () => ({
  UndoRedoToolbar: () => <div data-testid="undo-redo-toolbar" />,
  useUndoManager: () => ({ undo: vi.fn(), redo: vi.fn(), canUndo: false, canRedo: false }),
}));
vi.mock('../../core/tools/index.js', () => ({
  SelectionToolbar: () => <div data-testid="selection-toolbar" />,
}));
vi.mock('../../core/gizmo/useTransformGizmo.js', () => ({
  useTransformGizmo: () => ({ gizmoMode: null, setGizmoMode: vi.fn() }),
}));

// Mock with editable mode - edit tools are visible by default
vi.mock('../../../features/imodel/hooks/useIModelPermission.js', () => ({
  useIModelPermission: () => ({
    permission: null,
    role: 'owner',
    mode: 'editable',
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={['/itwins/itwin1/imodels/imodel1/edit']}>
      <Routes>
        <Route path="/itwins/:iTwinId/imodels/:iModelId/edit" element={<Editor />} />
      </Routes>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// T6.5 鸭子类型视口假件（与 sketchModeView.test.ts 同结构面；真实 Viewport 见真栈 e2e）
// ---------------------------------------------------------------------------
interface FakeLookAtArgs {
  eyePoint: Point3d;
  targetPoint: Point3d;
  upVector: Vector3d;
}

function makeFakeViewport(init: { cameraOn?: boolean; gridOn?: boolean } = {}) {
  const state = {
    rotation: Matrix3d.createIdentity(),
    cameraOn: init.cameraOn ?? false,
    eye: Point3d.create(5, -3, 8),
    center: Point3d.create(1, 1, 0),
    grid: init.gridOn ?? false,
  };
  const calls = {
    setStandardRotation: [] as unknown[],
    setRotation: [] as Matrix3d[],
    lookAt: [] as FakeLookAtArgs[],
    turnCameraOff: 0,
    synchWithView: 0,
    invalidateScene: 0,
  };
  const makeFlags = (grid: boolean) => ({
    grid,
    with: (_prop: string, value: boolean) => makeFlags(value),
  });
  const fake = {
    view: {
      getRotation: () => state.rotation,
      setRotation: (rot: Matrix3d) => {
        calls.setRotation.push(rot);
        state.rotation = rot.clone();
      },
      get isCameraOn() {
        return state.cameraOn;
      },
      is3d: () => true,
      turnCameraOff: () => {
        calls.turnCameraOff += 1;
        state.cameraOn = false;
      },
      getEyePoint: () => state.eye,
      getCenter: () => state.center,
      lookAt: (args: FakeLookAtArgs) => {
        calls.lookAt.push(args);
        state.cameraOn = true;
      },
    },
    get viewFlags() {
      return makeFlags(state.grid);
    },
    set viewFlags(flags: { grid: boolean }) {
      state.grid = flags.grid;
    },
    setStandardRotation: (id: unknown) => {
      calls.setStandardRotation.push(id);
    },
    synchWithView: () => {
      calls.synchWithView += 1;
    },
    invalidateScene: () => {
      calls.invalidateScene += 1;
    },
  };
  return { viewport: fake as unknown as Viewport, state, calls };
}

/** 初始旋转为非单位阵（进入草图前的「斜视角」），退出后据此断言恢复的是原视角 */
function tiltedRotation(): Matrix3d {
  const rot = Matrix3d.createRotationAroundVector(Vector3d.unitX(), Angle.createDegrees(30));
  expect(rot).not.toBeUndefined();
  return rot!;
}

describe('Editor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viewportHolder.current = undefined;
  });

  it('shows viewer and edit tools in editable mode', () => {
    renderEditor();
    // The editor page should render
    expect(screen.getByRole('banner')).toBeDefined(); // header
    // Edit tools should be visible (VersionTimeline with push/pull buttons)
    expect(screen.getByRole('button', { name: /推送/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /拉取/i })).toBeDefined();
  });

  // Note: Manual save button is not rendered - auto-save is used instead (via useAutoSave hook)
  // Save functionality is tested through the useVersionControl mock

  it('opens push dialog on Push click', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /推送/i }));
    // Push button opens the dialog, does not call pushChanges directly
    await waitFor(() => expect(screen.getByTestId('push-dialog')).toBeDefined());
  });

  it('calls pullChanges on Pull click', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /拉取/i }));
    await waitFor(() => expect(mockPull).toHaveBeenCalled());
  });

  it('shows project breadcrumb', () => {
    renderEditor();
    expect(screen.getByRole('button', { name: /项目列表/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /My Project/i })).toBeDefined();
  });

  /**
   * T6.5 草图模式行为（模式面）：进入 → 俯视对齐（setStandardRotation(Top) + 正交化）
   * + 栅格强制开 + 状态栏「草图模式：XY 平面」提示；退出 → 旋转/栅格恢复到进入前值、
   * 提示消失。相机/栅格为视口内部态，e2e 不断言（flaky 面），此处钉死。
   */
  describe('草图模式行为（T6.5）', () => {
    const clickEnterSketch = (): void => {
      fireEvent.click(within(screen.getByTestId('cad-toolbar')).getByRole('button', { name: '编辑草图' }));
    };
    const clickExitSketch = (): void => {
      fireEvent.click(within(screen.getByTestId('sketch-panel')).getByRole('button', { name: '退出草图' }));
    };

    it('进入：俯视 + 栅格开 + 状态栏提示；退出：旋转/栅格还原 + 提示消失', () => {
      const originalRotation = tiltedRotation();
      const fake = makeFakeViewport({ gridOn: false });
      fake.state.rotation = originalRotation.clone();
      viewportHolder.current = fake.viewport;
      renderEditor();

      // 初始：无草图提示、无草图面板
      expect(screen.queryByTestId('sketch-mode-hint')).toBeNull();
      expect(screen.queryByTestId('sketch-panel')).toBeNull();

      clickEnterSketch();

      // 俯视对齐（ViewCube 同机制）+ 正交化 + 栅格开
      expect(fake.calls.setStandardRotation).toEqual(['StandardViewId.Top']);
      expect(fake.calls.turnCameraOff).toBe(1);
      expect(fake.state.grid).toBe(true);
      expect(fake.calls.synchWithView).toBeGreaterThanOrEqual(1);
      // 状态栏提示 + 面板切换
      expect(screen.getByTestId('sketch-mode-hint')).toBeDefined();
      expect(screen.getByTestId('sketch-panel')).toBeDefined();

      clickExitSketch();

      // 旋转恢复到进入前（非单位阵原视角）；栅格还原到进入前（false）
      expect(fake.calls.setRotation).toHaveLength(1);
      expect(fake.calls.setRotation[0].isAlmostEqual(originalRotation)).toBe(true);
      expect(fake.state.grid).toBe(false);
      expect(screen.queryByTestId('sketch-mode-hint')).toBeNull();
      expect(screen.queryByTestId('sketch-panel')).toBeNull();
    });

    it('透视相机：退出经 lookAt 回放 eye/center/up（相机重新打开）', () => {
      const fake = makeFakeViewport({ cameraOn: true, gridOn: true });
      fake.state.rotation = tiltedRotation().clone();
      viewportHolder.current = fake.viewport;
      renderEditor();

      clickEnterSketch();
      expect(fake.state.cameraOn).toBe(false); // 草图态正交化
      // 进入前栅格本就开 → 保持开（不重复 invalidateScene 变更）
      expect(fake.state.grid).toBe(true);

      clickExitSketch();
      expect(fake.calls.lookAt).toHaveLength(1);
      expect(fake.calls.lookAt[0].eyePoint.isAlmostEqual(Point3d.create(5, -3, 8))).toBe(true);
      expect(fake.calls.lookAt[0].targetPoint.isAlmostEqual(Point3d.create(1, 1, 0))).toBe(true);
      expect(fake.state.cameraOn).toBe(true);
      expect(fake.calls.setRotation).toHaveLength(0); // 透视恢复不走 setRotation
    });

    it('二次进入：重新捕获视角快照并再次俯视（不重复恢复）', () => {
      const fake = makeFakeViewport({ gridOn: false });
      viewportHolder.current = fake.viewport;
      renderEditor();

      clickEnterSketch();
      clickExitSketch();
      clickEnterSketch();
      clickExitSketch();

      expect(fake.calls.setStandardRotation).toHaveLength(2);
      expect(fake.calls.setRotation).toHaveLength(2);
    });

    it('无选中视口：模式切换状态照走、不炸（viewport 行为静默跳过）', () => {
      viewportHolder.current = undefined;
      renderEditor();

      clickEnterSketch();
      expect(screen.getByTestId('sketch-mode-hint')).toBeDefined();
      clickExitSketch();
      expect(screen.queryByTestId('sketch-mode-hint')).toBeNull();
    });

    it('特征树 sketch 驱动行「编辑草图」→ 进入草图模式 + openSketch(sketchId)', () => {
      const fake = makeFakeViewport({ gridOn: false });
      viewportHolder.current = fake.viewport;
      renderEditor();

      // sketch 驱动行（useFeatureSystem 桩：params.sketchId='sk-1'）行内入口
      const row = screen.getByText('拉伸 (extrude)').closest('.feature-row') as HTMLElement;
      fireEvent.click(within(row).getByRole('button', { name: '编辑草图' }));

      expect(sketchMocks.openSketch).toHaveBeenCalledWith('sk-1');
      expect(fake.calls.setStandardRotation).toEqual(['StandardViewId.Top']);
      expect(fake.state.grid).toBe(true);
      expect(screen.getByTestId('sketch-mode-hint')).toBeDefined();
      expect(screen.getByTestId('sketch-panel')).toBeDefined();
    });
  });
});
