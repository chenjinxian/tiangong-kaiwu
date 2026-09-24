/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Viewer Toolbar - 3D Navigation Tools (Compact Version)
 *
 * Provides standard navigation controls in a compact, collapsible layout:
 * - Rotate/Orbit, Pan, Zoom, Fit View
 * - View Undo/Redo
 * - Standard Views (Top, Front, Right, Isometric)
 */

import React, { useCallback, useState } from 'react';
import { IModelApp, StandardViewId } from '@itwin/core-frontend';

export interface ViewerToolbarProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Toolbar button component
 */
const ToolbarButton: React.FC<{
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
}> = ({ title, icon, onClick, isActive, disabled }) => (
  <button
    title={title}
    onClick={onClick}
    disabled={disabled}
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '32px',
      height: '32px',
      border: 'none',
      borderRadius: '4px',
      backgroundColor: isActive ? '#0066cc' : 'rgba(255, 255, 255, 0.9)',
      color: isActive ? '#fff' : '#333',
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize: '14px',
      transition: 'all 0.2s ease',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
    }}
    onMouseEnter={(e) => {
      if (!isActive && !disabled) {
        e.currentTarget.style.backgroundColor = '#e0e0e0';
      }
    }}
    onMouseLeave={(e) => {
      if (!isActive && !disabled) {
        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
      }
    }}
  >
    {icon}
  </button>
);

/**
 * Compact Viewer Toolbar Component
 *
 * Two-row layout for better space utilization:
 * Row 1: Navigation tools (Rotate, Pan, Zoom, Fit)
 * Row 2: Standard views (Iso, Top, Front, Left, Right)
 */
export const ViewerToolbar: React.FC<ViewerToolbarProps> = ({ className, style }) => {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateUndoRedoState = useCallback(() => {
    const viewport = IModelApp.viewManager?.selectedView;
    if (viewport?.view) {
      setCanUndo(true);
      setCanRedo(true);
    }
  }, []);

  const handleRotate = useCallback(() => {
    if (!IModelApp.toolAdmin) return;
    void IModelApp.tools.run('View.Rotate');
  }, []);

  const handlePan = useCallback(() => {
    if (!IModelApp.toolAdmin) return;
    void IModelApp.tools.run('View.Pan');
  }, []);

  const handleZoom = useCallback(() => {
    if (!IModelApp.toolAdmin) return;
    void IModelApp.tools.run('View.Zoom');
  }, []);

  const handleFitView = useCallback(() => {
    if (!IModelApp.toolAdmin) return;
    void IModelApp.tools.run('View.Fit');
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  const handleViewUndo = useCallback(() => {
    if (!IModelApp.toolAdmin) return;
    void IModelApp.tools.run('View.Undo').then(() => {
      updateUndoRedoState();
    });
  }, [updateUndoRedoState]);

  const handleViewRedo = useCallback(() => {
    if (!IModelApp.toolAdmin) return;
    void IModelApp.tools.run('View.Redo').then(() => {
      updateUndoRedoState();
    });
  }, [updateUndoRedoState]);

  const setStandardView = useCallback((viewId: StandardViewId) => {
    const viewport = IModelApp.viewManager?.selectedView;
    if (!viewport) return;

    viewport.setStandardRotation(viewId);
    viewport.synchWithView({});
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '8px',
        backgroundColor: 'rgba(240, 240, 240, 0.95)',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        ...style,
      }}
    >
      {/* Row 1: Navigation Tools */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <ToolbarButton title="旋转 (Rotate)" icon="🔄" onClick={handleRotate} />
        <ToolbarButton title="平移 (Pan)" icon="✋" onClick={handlePan} />
        <ToolbarButton title="缩放 (Zoom)" icon="🔍" onClick={handleZoom} />
        <ToolbarButton title="适应视图 (Fit)" icon="⬛" onClick={handleFitView} />
      </div>

      {/* Row 2: Undo/Redo + Main Views */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <ToolbarButton
          title="撤销 (Undo)"
          icon="↩️"
          onClick={handleViewUndo}
          disabled={!canUndo}
        />
        <ToolbarButton
          title="重做 (Redo)"
          icon="↪️"
          onClick={handleViewRedo}
          disabled={!canRedo}
        />
        <div style={{ width: '1px', height: '20px', backgroundColor: '#ccc', margin: '0 4px' }} />
        <ToolbarButton title="等轴测 (Iso)" icon="📦" onClick={() => setStandardView(StandardViewId.Iso)} />
        <ToolbarButton title="顶视图 (Top)" icon="⬆️" onClick={() => setStandardView(StandardViewId.Top)} />
        <ToolbarButton title="前视图 (Front)" icon="🔲" onClick={() => setStandardView(StandardViewId.Front)} />
        <ToolbarButton title="右视图 (Right)" icon="▶️" onClick={() => setStandardView(StandardViewId.Right)} />
      </div>
    </div>
  );
};

export default ViewerToolbar;
