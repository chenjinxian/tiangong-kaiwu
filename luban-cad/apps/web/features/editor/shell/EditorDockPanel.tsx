/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Tabs, Text } from '@itwin/itwinui-react';
import { SvgClose } from '@itwin/itwinui-icons-react';
import type { Changeset } from '@itwin/imodels-client-management';
import {
  CategoryPicker,
  ModelPicker,
  SavedViewsPanel,
  SectionToolsPanel,
  ViewSettingsPanel,
  ViewSwitcher,
} from '@luban-cad/viewer-core';
import { ToolSettingsPanel } from '../components/ToolSettingsPanel.js';
import { MeasurementResultsPanel } from '../../measurement/components/MeasurementResultsPanel.js';
import { VersionTimeline } from '../../version-control/components/VersionTimeline.js';
import './EditorDockPanel.css';

/* ── 停靠状态机（RW4-P4-T4-2）────────────────────────────────────────────
 * 原 Editor.tsx 的 6 个 boolean（model/category/viewSettings/viewSwitcher/
 * savedViews/section）+ measurement 收敛为单一状态对象：
 *   isOpen + tab（三类：工具设置/版本历史/显示设置）
 *          + toolPanel（工具设置 | 测量结果）
 *          + displayPanel（模型/类别/显示/切换视图/保存视图/剖切）
 * 保证同一时刻至多一个停靠面板开启，取代 viewer-overlay 右侧/左下绝对定位栈。
 */
export type EditorDockTab = 'toolSettings' | 'history' | 'display';
export type EditorDockToolPanel = 'settings' | 'measurement';
export type EditorDockDisplayPanel =
  | 'model'
  | 'category'
  | 'viewSettings'
  | 'viewSwitcher'
  | 'savedViews'
  | 'section';

export interface EditorDockState {
  isOpen: boolean;
  tab: EditorDockTab;
  toolPanel: EditorDockToolPanel;
  displayPanel: EditorDockDisplayPanel;
}

export const DEFAULT_EDITOR_DOCK_STATE: EditorDockState = {
  isOpen: false,
  tab: 'toolSettings',
  toolPanel: 'settings',
  displayPanel: 'viewSettings',
};

const DOCK_TAB_ORDER: EditorDockTab[] = ['toolSettings', 'history', 'display'];
const TOOL_PANEL_ORDER: EditorDockToolPanel[] = ['settings', 'measurement'];
const DISPLAY_PANEL_ORDER: EditorDockDisplayPanel[] = [
  'model',
  'category',
  'viewSettings',
  'viewSwitcher',
  'savedViews',
  'section',
];

export interface EditorDockPanelProps {
  state: EditorDockState;
  isEditable: boolean;
  onTabChange: (tab: EditorDockTab) => void;
  onToolPanelChange: (panel: EditorDockToolPanel) => void;
  onDisplayPanelChange: (panel: EditorDockDisplayPanel) => void;
  onClose: () => void;
  changesets: Changeset[];
  currentChangesetId: string | null;
  hasLocalChanges: boolean;
  onPush: () => void;
  onPull: () => void;
  onShowHistory: () => void;
  onShowVersions: () => void;
}

/**
 * 右侧停靠面板（RW4-P4-T4-2）——替换 viewer-overlay 浮层栈。
 * 三类停靠 tab：工具设置（工具设置/测量结果）、版本历史（VersionTimeline 复用）、
 * 显示设置（模型/类别/显示/切换视图/保存视图/剖切）。
 * 选择器：`data-testid="editor-dock"`，供 e2e 断言停靠行为。
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const EditorDockPanel: React.FC<EditorDockPanelProps> = ({
  state,
  isEditable,
  onTabChange,
  onToolPanelChange,
  onDisplayPanelChange,
  onClose,
  changesets,
  currentChangesetId,
  hasLocalChanges,
  onPush,
  onPull,
  onShowHistory,
  onShowVersions,
}) => {
  const { t } = useTranslation('editor');

  if (!state.isOpen) return null;

  const toolPanelContent = state.toolPanel === 'measurement'
    ? (
        <MeasurementResultsPanel
          measurements={[]}
          onDelete={() => {}}
          onClear={() => {}}
          onExport={() => {}}
        />
      )
    : <ToolSettingsPanel />;

  const displayPanelContent = (() => {
    switch (state.displayPanel) {
      case 'model':
        return <ModelPicker />;
      case 'category':
        return <CategoryPicker />;
      case 'viewSwitcher':
        return <ViewSwitcher />;
      case 'savedViews':
        return <SavedViewsPanel />;
      case 'section':
        return <SectionToolsPanel />;
      case 'viewSettings':
      default:
        return <ViewSettingsPanel />;
    }
  })();

  const historyContent = isEditable
    ? (
        <VersionTimeline
          isExpanded
          onToggleExpand={onClose}
          changesets={changesets}
          currentChangesetId={currentChangesetId}
          hasLocalChanges={hasLocalChanges}
          onPush={onPush}
          onPull={onPull}
          onShowHistory={onShowHistory}
          onShowVersions={onShowVersions}
        />
      )
    : <Text variant="small" className="editor-dock-empty">{t('dock.historyReadonly')}</Text>;

  const tabContent = (() => {
    switch (state.tab) {
      case 'history':
        return <div className="editor-dock-section">{historyContent}</div>;
      case 'display':
        return (
          <Tabs
            labels={DISPLAY_PANEL_ORDER.map(panel => t(`dock.displayPanels.${panel}`))}
            activeIndex={DISPLAY_PANEL_ORDER.indexOf(state.displayPanel)}
            onTabSelected={index => onDisplayPanelChange(DISPLAY_PANEL_ORDER[index])}
            type="borderless"
            tabsClassName="editor-dock-subtabs"
            contentClassName="editor-dock-subcontent"
          >
            {displayPanelContent}
          </Tabs>
        );
      case 'toolSettings':
      default:
        return (
          <Tabs
            labels={TOOL_PANEL_ORDER.map(panel => t(`dock.toolPanels.${panel}`))}
            activeIndex={TOOL_PANEL_ORDER.indexOf(state.toolPanel)}
            onTabSelected={index => onToolPanelChange(TOOL_PANEL_ORDER[index])}
            type="borderless"
            tabsClassName="editor-dock-subtabs"
            contentClassName="editor-dock-subcontent"
          >
            {toolPanelContent}
          </Tabs>
        );
    }
  })();

  return (
    <aside className="editor-dock" data-testid="editor-dock" aria-label={t('dock.title')}>
      <div className="editor-dock-header">
        <Text variant="small" className="editor-dock-title">{t('dock.title')}</Text>
        <IconButton
          styleType="borderless"
          size="small"
          label={t('dock.close')}
          onClick={onClose}
        >
          <SvgClose />
        </IconButton>
      </div>

      <Tabs
        labels={DOCK_TAB_ORDER.map(tab => t(`dock.tabs.${tab}`))}
        activeIndex={DOCK_TAB_ORDER.indexOf(state.tab)}
        onTabSelected={index => onTabChange(DOCK_TAB_ORDER[index])}
        type="borderless"
        wrapperClassName="editor-dock-tabs"
        tabsClassName="editor-dock-tablist"
        contentClassName="editor-dock-content"
      >
        {tabContent}
      </Tabs>
    </aside>
  );
};

EditorDockPanel.displayName = 'EditorDockPanel';

export default EditorDockPanel;
