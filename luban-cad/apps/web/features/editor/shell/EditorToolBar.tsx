/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ButtonGroup, Divider, IconButton } from '@itwin/itwinui-react';
import {
  SvgCrop,
  SvgCursor,
  SvgFitToView,
  SvgLayers,
  SvgMeasure,
  SvgModel,
  SvgMove,
  SvgRedo,
  SvgRotateRight,
  SvgSave,
  SvgSettings,
  SvgUndo,
  SvgVisibilityHalf,
  SvgZoomIn,
} from '@itwin/itwinui-icons-react';
import { UndoRedoToolbar } from '../../../src/core/undo/UndoRedoToolbar.js';
import type { EditorDockDisplayPanel, EditorDockState } from './EditorDockPanel.js';

export interface EditorToolBarProps {
  isEditable: boolean;
  hasConnection: boolean;
  /** 右侧停靠状态机（RW4-P4-T4-2：6 个浮层 boolean 收敛为单一状态对象） */
  dock: EditorDockState;
  onToggleMeasurement: () => void;
  onToggleDisplayPanel: (panel: EditorDockDisplayPanel) => void;
  onSelectTool: () => void;
  onRotateView: () => void;
  onPanView: () => void;
  onZoomView: () => void;
  onFitView: () => void;
  onViewUndo: () => void;
  onViewRedo: () => void;
}

/**
 * 主工具条（RW4-P4-T4-1 从 Editor.tsx 564-673 切出）。
 * 选择器契约：外层保留 `.toolbar.toolbar-primary`（editor/demo-flow spec 依赖），
 * 按钮文案走 `IconButton label`（同供aria-label 与 tooltip）。
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const EditorToolBar: React.FC<EditorToolBarProps> = ({
  isEditable,
  hasConnection,
  dock,
  onToggleMeasurement,
  onToggleDisplayPanel,
  onSelectTool,
  onRotateView,
  onPanView,
  onZoomView,
  onFitView,
  onViewUndo,
  onViewRedo,
}) => {
  const { t } = useTranslation('editor');

  const isMeasurementActive = dock.isOpen && dock.tab === 'toolSettings' && dock.toolPanel === 'measurement';
  const isDisplayPanelActive = (panel: EditorDockDisplayPanel): boolean =>
    dock.isOpen && dock.tab === 'display' && dock.displayPanel === panel;

  return (
    <div className="toolbar toolbar-primary">
      {/* Selection & Measurement */}
      <ButtonGroup className="toolbar-group">
        <IconButton
          styleType="borderless"
          label={t('toolbar.select')}
          onClick={onSelectTool}
        >
          <SvgCursor />
        </IconButton>
        <IconButton
          styleType={isMeasurementActive ? 'cta' : 'borderless'}
          label={t('toolbar.measure')}
          onClick={onToggleMeasurement}
        >
          <SvgMeasure />
        </IconButton>
      </ButtonGroup>

      <Divider orientation="vertical" className="toolbar-divider" />

      {/* View Navigation Tools */}
      <ButtonGroup className="toolbar-group">
        <IconButton
          styleType="borderless"
          label={t('toolbar.rotate')}
          onClick={onRotateView}
        >
          <SvgRotateRight />
        </IconButton>
        <IconButton
          styleType="borderless"
          label={t('toolbar.pan')}
          onClick={onPanView}
        >
          <SvgMove />
        </IconButton>
        <IconButton
          styleType="borderless"
          label={t('toolbar.zoom')}
          onClick={onZoomView}
        >
          <SvgZoomIn />
        </IconButton>
        <IconButton
          styleType="borderless"
          label={t('toolbar.fit')}
          onClick={onFitView}
        >
          <SvgFitToView />
        </IconButton>
        <IconButton
          styleType="borderless"
          label={t('toolbar.viewUndo')}
          onClick={onViewUndo}
        >
          <SvgUndo />
        </IconButton>
        <IconButton
          styleType="borderless"
          label={t('toolbar.viewRedo')}
          onClick={onViewRedo}
        >
          <SvgRedo />
        </IconButton>
      </ButtonGroup>

      <Divider orientation="vertical" className="toolbar-divider" />

      {/* Display Controls */}
      <ButtonGroup className="toolbar-group">
        <IconButton
          styleType={isDisplayPanelActive('model') ? 'cta' : 'borderless'}
          label={t('toolbar.model')}
          onClick={() => onToggleDisplayPanel('model')}
        >
          <SvgModel />
        </IconButton>
        <IconButton
          styleType={isDisplayPanelActive('category') ? 'cta' : 'borderless'}
          label={t('toolbar.category')}
          onClick={() => onToggleDisplayPanel('category')}
        >
          <SvgLayers />
        </IconButton>
        <IconButton
          styleType={isDisplayPanelActive('section') ? 'cta' : 'borderless'}
          label={t('toolbar.section')}
          onClick={() => onToggleDisplayPanel('section')}
        >
          <SvgCrop />
        </IconButton>
      </ButtonGroup>

      <Divider orientation="vertical" className="toolbar-divider" />

      {/* View Management */}
      <ButtonGroup className="toolbar-group">
        <IconButton
          styleType={isDisplayPanelActive('viewSwitcher') ? 'cta' : 'borderless'}
          label={t('toolbar.viewSwitcher')}
          onClick={() => onToggleDisplayPanel('viewSwitcher')}
        >
          <SvgVisibilityHalf />
        </IconButton>
        <IconButton
          styleType={isDisplayPanelActive('savedViews') ? 'cta' : 'borderless'}
          label={t('toolbar.savedViews')}
          onClick={() => onToggleDisplayPanel('savedViews')}
        >
          <SvgSave />
        </IconButton>
        <IconButton
          styleType={isDisplayPanelActive('viewSettings') ? 'cta' : 'borderless'}
          label={t('toolbar.viewSettings')}
          onClick={() => onToggleDisplayPanel('viewSettings')}
        >
          <SvgSettings />
        </IconButton>
      </ButtonGroup>

      {/* Spacer */}
      <div className="toolbar-spacer" />

      {/* Undo/Redo - Only in editable mode */}
      {isEditable && hasConnection && (
        <ButtonGroup className="toolbar-group">
          <UndoRedoToolbar />
        </ButtonGroup>
      )}
    </div>
  );
};

EditorToolBar.displayName = 'EditorToolBar';

export default EditorToolBar;
