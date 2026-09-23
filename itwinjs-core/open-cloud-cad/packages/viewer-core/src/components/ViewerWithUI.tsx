/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Viewer With UI - Complete 3D Viewer with Navigation Tools
 *
 * This component wraps BaseViewer and adds:
 * - Navigation toolbar (rotate, pan, zoom, fit view, standard views, undo/redo)
 * - ViewCube for orientation control
 * - Measurement tools
 * - Measurement results panel
 * - Model/Category pickers
 * - Selection tools
 * - View settings panel
 * - View switcher
 * - Saved views panel
 * - Section tools panel
 * - Performance monitor
 */

import React, { useState } from 'react';
import { BaseViewer, type BaseViewerProps } from './BaseViewer.js';
import {
  ViewerToolbar,
  CompactViewCube,
  MeasurementTools,
  MeasurementPanel,
  ModelPicker,
  CategoryPicker,
  SelectionTools,
  ViewSettingsPanel,
  ViewSwitcher,
  SavedViewsPanel,
  SectionToolsPanel,
  type MeasurementResult,
} from './tools/index.js';

export interface ViewerWithUIProps extends BaseViewerProps {
  /** Show navigation toolbar (default: true) */
  showToolbar?: boolean;
  /** Show ViewCube widget (default: true) */
  showViewCube?: boolean;
  /** Show measurement tools (default: true) */
  showMeasurementTools?: boolean;
  /** Show model picker (default: false) */
  showModelPicker?: boolean;
  /** Show category picker (default: false) */
  showCategoryPicker?: boolean;
  /** Show selection tools (default: true) */
  showSelectionTools?: boolean;
  /** Show view settings panel (default: false) */
  showViewSettings?: boolean;
  /** Show view switcher (default: false) */
  showViewSwitcher?: boolean;
  /** Show saved views panel (default: false) */
  showSavedViews?: boolean;
  /** Show section tools panel (default: false) */
  showSectionTools?: boolean;
  /** Show performance monitor (default: false) */
  showPerformanceMonitor?: boolean;
  /** Position of the toolbar */
  toolbarPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Position of the ViewCube */
  viewCubePosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Position of measurement tools */
  measurementPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Position of model picker */
  modelPickerPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Position of category picker */
  categoryPickerPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Position of selection tools */
  selectionToolsPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Position of view settings panel */
  viewSettingsPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Position of view switcher */
  viewSwitcherPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Position of saved views panel */
  savedViewsPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Position of section tools panel */
  sectionToolsPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Callback when a measurement is completed */
  onMeasurement?: (result: MeasurementResult) => void;
}

/**
 * Enhanced viewer with full 3D navigation UI
 *
 * Combines BaseViewer with navigation tools for a complete CAD viewing experience.
 */
export const ViewerWithUI: React.FC<ViewerWithUIProps> = ({
  // BaseViewer props
  iTwinId,
  iModelId,
  accessToken,
  viewState,
  className,
  loadingComponent,
  errorComponent,
  onViewportReady,
  // UI options - visibility
  showToolbar = true,
  showViewCube = true,
  showMeasurementTools = true,
  showModelPicker = false,
  showCategoryPicker = false,
  showSelectionTools = true,
  showViewSettings = false,
  showViewSwitcher = false,
  showSavedViews = false,
  showSectionTools = false,
  showPerformanceMonitor = false,
  // UI options - positions
  toolbarPosition = 'top-left',
  viewCubePosition = 'top-right',
  measurementPosition = 'bottom-right',
  modelPickerPosition = 'top-left',
  categoryPickerPosition = 'top-right',
  selectionToolsPosition = 'bottom-left',
  viewSettingsPosition = 'top-left',
  viewSwitcherPosition = 'top-right',
  savedViewsPosition = 'bottom-left',
  sectionToolsPosition = 'top-right',
  // Callbacks
  onMeasurement,
}) => {
  const [measurements, setMeasurements] = useState<MeasurementResult[]>([]);

  const handleMeasurementEnd = (result: MeasurementResult) => {
    setMeasurements((prev) => [...prev, result]);
    onMeasurement?.(result);
  };

  const handleClearMeasurements = () => {
    setMeasurements([]);
  };

  // Position styles
  const getPositionStyle = (position: string): React.CSSProperties => {
    const [vertical, horizontal] = position.split('-');
    return {
      position: 'absolute',
      [vertical]: '20px',
      [horizontal]: '20px',
      zIndex: 100,
    };
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Base Viewer */}
      <BaseViewer
        iTwinId={iTwinId}
        iModelId={iModelId}
        accessToken={accessToken}
        viewState={viewState}
        className={className}
        loadingComponent={loadingComponent}
        errorComponent={errorComponent}
        onViewportReady={onViewportReady}
      />

      {/* Navigation Toolbar */}
      {showToolbar && (
        <div style={getPositionStyle(toolbarPosition)}>
          <ViewerToolbar />
        </div>
      )}

      {/* ViewCube */}
      {showViewCube && (
        <div style={getPositionStyle(viewCubePosition)}>
          <CompactViewCube />
        </div>
      )}

      {/* Measurement Tools */}
      {showMeasurementTools && (
        <div
          style={{
            ...getPositionStyle(measurementPosition),
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <MeasurementTools onMeasurementEnd={handleMeasurementEnd} />
        </div>
      )}

      {/* Measurement Results Panel */}
      {measurements.length > 0 && (
        <MeasurementPanel
          measurements={measurements}
          onClear={handleClearMeasurements}
        />
      )}

      {/* Model Picker */}
      {showModelPicker && (
        <div
          style={{
            ...getPositionStyle(modelPickerPosition),
            maxHeight: 'calc(100% - 40px)',
          }}
        >
          <ModelPicker />
        </div>
      )}

      {/* Category Picker */}
      {showCategoryPicker && (
        <div
          style={{
            ...getPositionStyle(categoryPickerPosition),
            maxHeight: 'calc(100% - 40px)',
          }}
        >
          <CategoryPicker />
        </div>
      )}

      {/* Selection Tools */}
      {showSelectionTools && (
        <div style={getPositionStyle(selectionToolsPosition)}>
          <SelectionTools />
        </div>
      )}

      {/* View Settings Panel */}
      {showViewSettings && (
        <div
          style={{
            ...getPositionStyle(viewSettingsPosition),
            maxHeight: 'calc(100% - 40px)',
          }}
        >
          <ViewSettingsPanel />
        </div>
      )}

      {/* View Switcher */}
      {showViewSwitcher && (
        <div
          style={{
            ...getPositionStyle(viewSwitcherPosition),
            maxHeight: 'calc(100% - 40px)',
          }}
        >
          <ViewSwitcher />
        </div>
      )}

      {/* Saved Views Panel */}
      {showSavedViews && (
        <div
          style={{
            ...getPositionStyle(savedViewsPosition),
            maxHeight: 'calc(100% - 40px)',
          }}
        >
          <SavedViewsPanel />
        </div>
      )}

      {/* Section Tools Panel */}
      {showSectionTools && (
        <div
          style={{
            ...getPositionStyle(sectionToolsPosition),
            maxHeight: 'calc(100% - 40px)',
          }}
        >
          <SectionToolsPanel />
        </div>
      )}

      {/* Performance Monitor */}
      {showPerformanceMonitor && (
        <PerformanceMonitor />
      )}
    </div>
  );
};

/**
 * Performance Monitor Component
 * Displays FPS and other performance metrics
 */
const PerformanceMonitor: React.FC = () => {
  return (
    <div
      style={{
        position: 'absolute',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        color: '#0f0',
        padding: '8px 16px',
        borderRadius: '4px',
        fontFamily: 'monospace',
        fontSize: '12px',
        pointerEvents: 'none',
      }}
    >
      FPS: -- | Draw Calls: -- | Triangles: --
    </div>
  );
};

export default ViewerWithUI;
