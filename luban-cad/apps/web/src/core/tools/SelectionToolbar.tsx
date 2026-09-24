/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Selection Toolbar Component
 * Provides enhanced selection tools
 */

import React, { useState } from 'react';
import { IModelApp } from '@itwin/core-frontend';
import { Tooltip } from '@itwin/itwinui-react';
import './SelectionToolbar.css';

interface SelectionToolbarProps {
  /** Optional className for styling */
  className?: string;
  /** Current selection count */
  selectionCount?: number;
}

/**
 * Toolbar with selection enhancement tools
 */
export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({
  className = '',
  selectionCount = 0,
}) => {
  const [activeTool, setActiveTool] = useState<string | null>(null);

  const runTool = async (toolId: string) => {
    setActiveTool(toolId);
    try {
      await IModelApp.tools.run(toolId);
    } catch (err) {
      console.error(`Tool ${toolId} failed:`, err);
    }
  };

  return (
    <div className={`selection-toolbar ${className}`}>
      <div className="selection-group">
        <Tooltip content="框选 (Fence Select) - 拖动选择多个元素" placement="right">
          <button
            type="button"
            className={`selection-btn ${activeTool === 'LubanCad.FenceSelect' ? 'active' : ''}`}
            onClick={() => runTool('LubanCad.FenceSelect')}
          >
            <FenceSelectIcon />
          </button>
        </Tooltip>
      </div>

      <div className="selection-divider" />

      <div className="selection-group">
        <Tooltip content="全选 (Ctrl+A)" placement="right">
          <button
            type="button"
            className="selection-btn"
            onClick={() => runTool('LubanCad.SelectAll')}
          >
            <SelectAllIcon />
          </button>
        </Tooltip>

        <Tooltip content="清除选择" placement="right">
          <button
            type="button"
            className="selection-btn"
            onClick={() => runTool('LubanCad.ClearSelection')}
          >
            <ClearSelectionIcon />
          </button>
        </Tooltip>

        <Tooltip content="反选" placement="right">
          <button
            type="button"
            className="selection-btn"
            onClick={() => runTool('LubanCad.InvertSelection')}
          >
            <InvertSelectionIcon />
          </button>
        </Tooltip>
      </div>

      <div className="selection-divider" />

      <div className="selection-group">
        <Tooltip content="按类别选择" placement="right">
          <button
            type="button"
            className="selection-btn"
            onClick={() => runTool('LubanCad.SelectByCategory')}
          >
            <SelectByCategoryIcon />
          </button>
        </Tooltip>
      </div>

      {selectionCount > 0 && (
        <>
          <div className="selection-divider" />
          <div className="selection-count">
            已选择: <strong>{selectionCount}</strong>
          </div>
        </>
      )}
    </div>
  );
};

// Icon Components
const FenceSelectIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="4" y="4" width="16" height="16" rx="1" />
    <circle cx="9" cy="9" r="1.5" fill="currentColor" />
    <circle cx="15" cy="9" r="1.5" fill="currentColor" />
    <circle cx="9" cy="15" r="1.5" fill="currentColor" />
    <circle cx="15" cy="15" r="1.5" fill="currentColor" />
  </svg>
);

const SelectAllIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <circle cx="12" cy="12" r="4" fill="currentColor" />
  </svg>
);

const ClearSelectionIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <line x1="8" y1="8" x2="16" y2="16" />
    <line x1="16" y1="8" x2="8" y2="16" />
  </svg>
);

const InvertSelectionIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M4 12h16" />
    <path d="M8 8l-4 4 4 4" />
    <path d="M16 16l4-4-4-4" />
  </svg>
);

const SelectByCategoryIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="4" y="4" width="16" height="6" rx="1" />
    <rect x="4" y="14" width="16" height="6" rx="1" />
    <line x1="7" y1="7" x2="13" y2="7" />
    <line x1="7" y1="17" x2="13" y2="17" />
  </svg>
);

export default SelectionToolbar;
