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
import type { MeasurementRecord } from '../../measurement/hooks/useMeasurementManager.js';
import { VersionTimeline } from '../../version-control/components/VersionTimeline.js';
import { NamedVersionPanel } from '../../version-control/components/NamedVersionPanel.js';
import type { NamedVersion } from '../../version-control/hooks/useNamedVersions.js';
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
export type EditorDockHistoryPanel = 'changesets' | 'namedVersions';
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
  historyPanel: EditorDockHistoryPanel;
}

export const DEFAULT_EDITOR_DOCK_STATE: EditorDockState = {
  isOpen: false,
  tab: 'toolSettings',
  toolPanel: 'settings',
  displayPanel: 'viewSettings',
  historyPanel: 'changesets',
};

const DOCK_TAB_ORDER: EditorDockTab[] = ['toolSettings', 'history', 'display'];
const TOOL_PANEL_ORDER: EditorDockToolPanel[] = ['settings', 'measurement'];
const HISTORY_PANEL_ORDER: EditorDockHistoryPanel[] = ['changesets', 'namedVersions'];
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
  onHistoryPanelChange: (panel: EditorDockHistoryPanel) => void;
  onClose: () => void;
  iModelId: string | null;
  changesets: Changeset[];
  currentChangesetId: string | null;
  hasLocalChanges: boolean;
  onPush: () => void;
  onPull: () => void;
  onShowHistory: () => void;
  onShowVersions: () => void;
  onRollback?: (changesetId: string, versionName: string) => Promise<void>;
  onCompareVersions?: (source: NamedVersion, target: NamedVersion) => void;
  /** 测量结果（useMeasurementManager 注入；空数组时面板显示空态） */
  measurements: MeasurementRecord[];
  onDeleteMeasurement: (id: string) => void;
  onClearMeasurements: () => void;
  onExportMeasurements: () => void;
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
  onHistoryPanelChange,
  onClose,
  iModelId,
  changesets,
  currentChangesetId,
  hasLocalChanges,
  onPush,
  onPull,
  onShowHistory,
  onShowVersions,
  onRollback,
  onCompareVersions,
  measurements,
  onDeleteMeasurement,
  onClearMeasurements,
  onExportMeasurements,
}) => {
  const { t, i18n } = useTranslation('editor');
  // viewer-core 无 i18next 依赖：语言经 prop 注入（终审 I2）
  const viewerLanguage = i18n.language.startsWith('en') ? 'en' : 'zh-CN';

  if (!state.isOpen) return null;

  const toolPanelContent = state.toolPanel === 'measurement'
    ? (
        <MeasurementResultsPanel
          measurements={measurements}
          onDelete={onDeleteMeasurement}
          onClear={onClearMeasurements}
          onExport={onExportMeasurements}
        />
      )
    : <ToolSettingsPanel />;

  const displayPanelContent = (() => {
    switch (state.displayPanel) {
      case 'model':
        return <ModelPicker language={viewerLanguage} />;
      case 'category':
        return <CategoryPicker language={viewerLanguage} />;
      case 'viewSwitcher':
        return <ViewSwitcher language={viewerLanguage} />;
      case 'savedViews':
        return <SavedViewsPanel language={viewerLanguage} />;
      case 'section':
        return <SectionToolsPanel language={viewerLanguage} />;
      case 'viewSettings':
      default:
        return <ViewSettingsPanel language={viewerLanguage} />;
    }
  })();

  const historyContent = isEditable
    ? (
        <Tabs
          labels={HISTORY_PANEL_ORDER.map(panel => t(`dock.historyPanels.${panel}`))}
          activeIndex={HISTORY_PANEL_ORDER.indexOf(state.historyPanel)}
          onTabSelected={index => onHistoryPanelChange(HISTORY_PANEL_ORDER[index])}
          type="borderless"
          tabsClassName="editor-dock-subtabs"
          contentClassName="editor-dock-subcontent"
        >
          {state.historyPanel === 'namedVersions'
            ? (
                <NamedVersionPanel
                  iModelId={iModelId}
                  currentChangesetId={currentChangesetId}
                  isVisible
                  onClose={onClose}
                  onRollback={onRollback}
                  onCompareVersions={onCompareVersions}
                />
              )
            : (
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
              )}
        </Tabs>
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
    <aside className="editor-dock" data-testid="editor-dock" aria-label={t(`dock.tabs.${state.tab}`)}>
      <div className="editor-dock-header">
        {/* Onshape 式：面板头显示当前活动页签名（旧占位「PANEL」无信息量） */}
        <Text variant="small" className="editor-dock-title">{t(`dock.tabs.${state.tab}`)}</Text>
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
