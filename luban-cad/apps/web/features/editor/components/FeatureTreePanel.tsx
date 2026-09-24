/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * FeatureTreePanel — Left sidebar showing design history (Feature List)
 * Similar to Onshape's Feature list or FreeCAD's Tree view
 */

import React, { useState } from 'react';
import { IconButton, Button, Divider } from '@itwin/itwinui-react';
import {
  SvgChevronLeft,
  SvgChevronRight,
  SvgList,
  SvgItem,
} from '@itwin/itwinui-icons-react';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import { FeaturePanel } from './FeaturePanel.js';
import { AssemblyPanel } from './AssemblyPanel.js';
import { ToolSettingsPanel } from './ToolSettingsPanel.js';
import './FeatureTreePanel.css';

export type TreeTab = 'features' | 'assemblies';

interface FeatureTreePanelProps {
  connection: BriefcaseConnection | null;
  activeTab: TreeTab;
  onTabChange: (tab: TreeTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const FeatureTreePanel: React.FC<FeatureTreePanelProps> = ({
  connection,
  activeTab,
  onTabChange,
  isCollapsed,
  onToggleCollapse,
}) => {
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
          label="展开设计树"
          onClick={onToggleCollapse}
          className="collapse-btn"
        >
          <SvgChevronRight />
        </IconButton>

        <div className="collapsed-tabs">
          <IconButton
            styleType={activeTab === 'features' ? 'cta' : 'borderless'}
            size="small"
            label="特征"
            onClick={() => onTabChange('features')}
          >
            <SvgList />
          </IconButton>
          <IconButton
            styleType={activeTab === 'assemblies' ? 'cta' : 'borderless'}
            size="small"
            label="装配"
            onClick={() => onTabChange('assemblies')}
          >
            <SvgItem />
          </IconButton>
        </div>

        {isHovering && (
          <div className="collapsed-hint">
            {activeTab === 'features' ? '特征历史' : '装配体'}
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
            特征
          </Button>
          <Button
            styleType={activeTab === 'assemblies' ? 'cta' : 'borderless'}
            size="small"
            onClick={() => onTabChange('assemblies')}
          >
            装配
          </Button>
        </div>
        <IconButton
          styleType="borderless"
          size="small"
          label="收起"
          onClick={onToggleCollapse}
        >
          <SvgChevronLeft />
        </IconButton>
      </div>

      <Divider />

      {/* Content */}
      <div className="feature-tree-content">
        {activeTab === 'features' && (
          <FeaturePanel connection={connection} isVisible />
        )}
        {activeTab === 'assemblies' && (
          <AssemblyPanel connection={connection} isVisible />
        )}
      </div>

      <Divider />

      {/* Tool Settings - For iTwin.js native tools */}
      <div className="feature-tree-tool-settings">
        <ToolSettingsPanel />
      </div>
    </div>
  );
};
