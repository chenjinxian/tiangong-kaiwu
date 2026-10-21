/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * FeatureTreePanel — Left sidebar showing design history (Feature List)
 * Similar to Onshape's Feature list or FreeCAD's Tree view
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Divider, IconButton } from '@itwin/itwinui-react';
import {
  SvgChevronLeft,
  SvgChevronRight,
  SvgItem,
  SvgList,
} from '@itwin/itwinui-icons-react';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import type { FeatureTreeEntry } from '@luban-cad/shared';
import { FeaturePanel } from './FeaturePanel.js';
import { AssemblyPanel } from './AssemblyPanel.js';
import { ToolSettingsPanel } from './ToolSettingsPanel.js';
import type { UseFeatureSystem } from '../hooks/useFeatureSystem.js';
import './FeatureTreePanel.css';

export type TreeTab = 'features' | 'assemblies';

interface FeatureTreePanelProps {
  connection: BriefcaseConnection | null;
  /** 特征系统中枢（Editor 级 useFeatureSystem 注入，保证写租约在面板切换间稳定） */
  fs: UseFeatureSystem;
  /** 编辑点击通知（可选；编辑对话框 T6.2 起内建于 FeaturePanel，父级无需再接管） */
  onEditFeature?: (entry: FeatureTreeEntry) => void;
  /** T6.5 编辑草图回跳（可选；透传 FeaturePanel——sketch 驱动特征行的「编辑草图」入口） */
  onEditSketch?: (sketchId: string) => void;
  onToast?: (message: string, type: 'success' | 'error' | 'info') => void;
  activeTab: TreeTab;
  onTabChange: (tab: TreeTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  /**
   * 是否渲染内嵌工具设置面板（默认 true）。右侧停靠面板激活「工具设置」时由
   * Editor 传 false——ToolSettingsPanel 是单例 handler 宿主（reloadToolSettingsHandler），
   * 双实例会互相清空 handler（P4 评审 Important#3）。
   */
  showToolSettings?: boolean;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const FeatureTreePanel: React.FC<FeatureTreePanelProps> = ({
  connection,
  fs,
  onEditFeature,
  onEditSketch,
  onToast,
  activeTab,
  onTabChange,
  isCollapsed,
  onToggleCollapse,
  showToolSettings = true,
}) => {
  const { t } = useTranslation('editor');
  const [isHovering, setIsHovering] = useState(false);

  if (isCollapsed) {
    return (
      <div
        className="feature-tree-panel feature-tree-panel--collapsed"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <IconButton
          styleType="borderless"
          size="small"
          label={t('featureTree.expand')}
          onClick={onToggleCollapse}
          className="collapse-btn"
        >
          <SvgChevronRight />
        </IconButton>

        <div className="collapsed-tabs">
          <IconButton
            styleType={activeTab === 'features' ? 'cta' : 'borderless'}
            size="small"
            label={t('featureTree.features')}
            onClick={() => onTabChange('features')}
          >
            <SvgList />
          </IconButton>
          <IconButton
            styleType={activeTab === 'assemblies' ? 'cta' : 'borderless'}
            size="small"
            label={t('featureTree.assemblies')}
            onClick={() => onTabChange('assemblies')}
          >
            <SvgItem />
          </IconButton>
        </div>

        {isHovering && (
          <div className="collapsed-hint">
            {activeTab === 'features' ? t('featureTree.featureHistory') : t('featureTree.assemblyBody')}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="feature-tree-panel">
      {/* Header with tabs */}
      <div className="feature-tree-header">
        <div className="feature-tree-tabs">
          <Button
            styleType={activeTab === 'features' ? 'cta' : 'borderless'}
            size="small"
            onClick={() => onTabChange('features')}
          >
            {t('featureTree.features')}
          </Button>
          <Button
            styleType={activeTab === 'assemblies' ? 'cta' : 'borderless'}
            size="small"
            onClick={() => onTabChange('assemblies')}
          >
            {t('featureTree.assemblies')}
          </Button>
        </div>
        <IconButton
          styleType="borderless"
          size="small"
          label={t('featureTree.collapse')}
          onClick={onToggleCollapse}
        >
          <SvgChevronLeft />
        </IconButton>
      </div>

      {/* 分隔线由页签自身的 border-bottom 提供（双线叠在一起会显脏） */}

      {/* Content */}
      <div className="feature-tree-content">
        {activeTab === 'features' && (
          <FeaturePanel fs={fs} connection={connection} onEditFeature={onEditFeature} onEditSketch={onEditSketch} onToast={onToast} isVisible />
        )}
        {activeTab === 'assemblies' && (
          <AssemblyPanel connection={connection} isVisible />
        )}
      </div>

      {showToolSettings && (
        <>
          <Divider />

          {/* Tool Settings - For iTwin.js native tools */}
          <div className="feature-tree-tool-settings">
            <ToolSettingsPanel />
          </div>
        </>
      )}
    </div>
  );
};
