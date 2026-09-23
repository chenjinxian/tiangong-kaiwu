/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Selection Tools Component
 *
 * Provides element selection capabilities:
 * - Element selection tool
 * - Zoom to selected elements
 * - Clear selection
 */

import React, { useCallback, useEffect, useState } from 'react';
import { IModelApp, Viewport } from '@itwin/core-frontend';

export interface SelectionToolsProps {
  className?: string;
  style?: React.CSSProperties;
  viewport?: Viewport;
}

/**
 * Selection Tools Component
 *
 * Buttons for element selection and manipulation.
 */
export const SelectionTools: React.FC<SelectionToolsProps> = ({
  className,
  style,
  viewport: propsViewport,
}) => {
  const [selectionCount, setSelectionCount] = useState(0);
  const [isSelectActive, setIsSelectActive] = useState(false);
  const [viewport, setViewport] = useState<Viewport | undefined>(propsViewport);

  // Get viewport from props or IModelApp
  useEffect(() => {
    if (propsViewport) {
      setViewport(propsViewport);
    } else {
      setViewport(IModelApp.viewManager?.selectedView);
    }
  }, [propsViewport]);

  // Update selection count
  useEffect(() => {
    if (!viewport?.iModel) return;

    const updateCount = () => {
      setSelectionCount(viewport.iModel.selectionSet.size);
    };

    // Initial count
    updateCount();

    // Listen for selection changes
    const removeListener = viewport.iModel.selectionSet.onChanged.addListener(updateCount);

    return () => {
      removeListener();
    };
  }, [viewport]);

  /**
   * Start element selection tool
   */
  const handleSelect = useCallback(() => {
    if (!IModelApp.toolAdmin) return;
    setIsSelectActive(true);
    void IModelApp.tools.run('Select');
  }, []);

  /**
   * Zoom to selected elements
   */
  const handleZoomToSelected = useCallback(async () => {
    if (!viewport) return;

    const elems = viewport.iModel.selectionSet.elements;
    if (elems.size > 0) {
      await viewport.zoomToElements(elems, { animateFrustumChange: true });
    }
  }, [viewport]);

  /**
   * Clear selection
   */
  const handleClearSelection = useCallback(() => {
    if (!viewport?.iModel) return;

    viewport.iModel.selectionSet.emptyAll();
    viewport.renderFrame();
  }, [viewport]);

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
        width: '36px',
        height: '36px',
        border: 'none',
        borderRadius: '4px',
        backgroundColor: isActive ? '#0066cc' : 'rgba(255, 255, 255, 0.9)',
        color: isActive ? '#fff' : '#333',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '18px',
        transition: 'all 0.2s ease',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
        marginBottom: '4px',
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (!isActive && !disabled) {
          e.currentTarget.style.backgroundColor = '#f0f0f0';
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

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '8px',
        backgroundColor: 'rgba(240, 240, 240, 0.95)',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        ...style,
      }}
    >
      {/* Selection Tool */}
      <ToolbarButton
        title="元素选择 (Select)"
        icon="🔍"
        onClick={handleSelect}
        isActive={isSelectActive}
      />

      {/* Divider */}
      <div
        style={{
          height: '1px',
          backgroundColor: '#ccc',
          margin: '8px 0',
        }}
      />

      {/* Zoom to Selected */}
      <ToolbarButton
        title="缩放到选择 (Zoom to Selected)"
        icon="🔎"
        onClick={handleZoomToSelected}
        disabled={selectionCount === 0}
      />

      {/* Clear Selection */}
      <ToolbarButton
        title="清除选择 (Clear Selection)"
        icon="🗑️"
        onClick={handleClearSelection}
        disabled={selectionCount === 0}
      />

      {/* Selection Count */}
      {selectionCount > 0 && (
        <div
          style={{
            marginTop: '8px',
            padding: '6px',
            backgroundColor: 'rgba(0, 102, 204, 0.1)',
            borderRadius: '4px',
            fontSize: '12px',
            textAlign: 'center',
            color: '#0066cc',
          }}
        >
          已选择: {selectionCount} 个元素
        </div>
      )}
    </div>
  );
};

export default SelectionTools;
