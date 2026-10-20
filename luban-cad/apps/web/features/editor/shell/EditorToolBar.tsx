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

export interface EditorToolBarProps {
  isEditable: boolean;
  hasConnection: boolean;
  showMeasurementPanel: boolean;
  onToggleMeasurement: () => void;
  showModelPicker: boolean;
  onToggleModelPicker: () => void;
  showCategoryPicker: boolean;
  onToggleCategoryPicker: () => void;
  showSectionTools: boolean;
  onToggleSectionTools: () => void;
  showViewSwitcher: boolean;
  onToggleViewSwitcher: () => void;
  showSavedViews: boolean;
  onToggleSavedViews: () => void;
  showViewSettings: boolean;
  onToggleViewSettings: () => void;
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
  showMeasurementPanel,
  onToggleMeasurement,
  showModelPicker,
  onToggleModelPicker,
  showCategoryPicker,
  onToggleCategoryPicker,
  showSectionTools,
  onToggleSectionTools,
  showViewSwitcher,
  onToggleViewSwitcher,
  showSavedViews,
  onToggleSavedViews,
  showViewSettings,
  onToggleViewSettings,
  onSelectTool,
  onRotateView,
  onPanView,
  onZoomView,
  onFitView,
  onViewUndo,
  onViewRedo,
}) => {
  const { t } = useTranslation('editor');

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
          styleType={showMeasurementPanel ? 'cta' : 'borderless'}
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
          styleType={showModelPicker ? 'cta' : 'borderless'}
          label={t('toolbar.model')}
          onClick={onToggleModelPicker}
        >
          <SvgModel />
        </IconButton>
        <IconButton
          styleType={showCategoryPicker ? 'cta' : 'borderless'}
          label={t('toolbar.category')}
          onClick={onToggleCategoryPicker}
        >
          <SvgLayers />
        </IconButton>
        <IconButton
          styleType={showSectionTools ? 'cta' : 'borderless'}
          label={t('toolbar.section')}
          onClick={onToggleSectionTools}
        >
          <SvgCrop />
        </IconButton>
      </ButtonGroup>

      <Divider orientation="vertical" className="toolbar-divider" />

      {/* View Management */}
      <ButtonGroup className="toolbar-group">
        <IconButton
          styleType={showViewSwitcher ? 'cta' : 'borderless'}
          label={t('toolbar.viewSwitcher')}
          onClick={onToggleViewSwitcher}
        >
          <SvgVisibilityHalf />
        </IconButton>
        <IconButton
          styleType={showSavedViews ? 'cta' : 'borderless'}
          label={t('toolbar.savedViews')}
          onClick={onToggleSavedViews}
        >
          <SvgSave />
        </IconButton>
        <IconButton
          styleType={showViewSettings ? 'cta' : 'borderless'}
          label={t('toolbar.viewSettings')}
          onClick={onToggleViewSettings}
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
