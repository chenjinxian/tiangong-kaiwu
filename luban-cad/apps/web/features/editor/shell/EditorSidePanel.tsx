/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import type { FeatureTreeEntry } from '@luban-cad/shared';
import { FeatureTreePanel, type TreeTab } from '../components/FeatureTreePanel.js';
import { SketchPanel } from '../../sketch/components/SketchPanel.js';
import type { UseFeatureSystem } from '../hooks/useFeatureSystem.js';
import type { UseSketchSystem } from '../../sketch/hooks/useSketchSystem.js';

export interface EditorSidePanelProps {
  isEditable: boolean;
  isSketchMode: boolean;
  connection: BriefcaseConnection | null;
  featureSystem: UseFeatureSystem;
  sketchSystem: UseSketchSystem;
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
  onEditFeature?: (entry: FeatureTreeEntry) => void;
  onEditSketch: (sketchId: string) => void;
  activeTab: TreeTab;
  onTabChange: (tab: TreeTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onExitSketchMode: () => void;
  /** 工具设置是否留在左栏（右侧停靠面板占用该面板时传 false，防双实例） */
  showToolSettings?: boolean;
}

/**
 * 左侧面板编排（RW4-P4-T4-1 从 Editor.tsx 688-707 切出）：
 * 编辑态下在「特征树」与「草图面板」之间切换；只读态不渲染。
 * 选择器契约：FeatureTreePanel 自带 `.feature-tree-panel`（features/sketch spec 依赖）。
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const EditorSidePanel: React.FC<EditorSidePanelProps> = ({
  isEditable,
  isSketchMode,
  connection,
  featureSystem,
  sketchSystem,
  onToast,
  onEditFeature,
  onEditSketch,
  activeTab,
  onTabChange,
  isCollapsed,
  onToggleCollapse,
  onExitSketchMode,
  showToolSettings,
}) => {
  if (!isEditable) return null;

  if (isSketchMode) {
    return (
      <SketchPanel
        isActive={isSketchMode}
        onExit={onExitSketchMode}
        sketchSystem={sketchSystem}
        onToast={onToast}
      />
    );
  }

  return (
    <FeatureTreePanel
      connection={connection}
      fs={featureSystem}
      onToast={onToast}
      onEditFeature={onEditFeature}
      onEditSketch={onEditSketch}
      activeTab={activeTab}
      onTabChange={onTabChange}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      showToolSettings={showToolSettings}
    />
  );
};

EditorSidePanel.displayName = 'EditorSidePanel';

export default EditorSidePanel;
