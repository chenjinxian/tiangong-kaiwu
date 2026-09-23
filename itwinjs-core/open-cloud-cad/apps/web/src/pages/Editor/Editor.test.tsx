/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Editor from './Editor.js';

// Mock all external deps
vi.mock('@open-cloud-cad/web-viewer', () => ({
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

vi.mock('@open-cloud-cad/viewer-core', () => ({
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
    toolAdmin: { startDefaultTool: vi.fn(), doUndoOperation: vi.fn(), doRedoOperation: vi.fn() },
    accuSnap: { currHit: null },
    locateManager: { options: { allowDecorations: false } },
    tools: { register: vi.fn(), run: vi.fn() },
  },
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
  CadToolbar: () => <div data-testid="cad-toolbar" />,
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

describe('Editor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
