/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useEffect, useState, useCallback } from 'react';
import { IModelApp } from '@itwin/core-frontend';
import type { DialogItem, DialogItemValue } from '@itwin/appui-abstract';

/**
 * Tool Settings Panel Component
 * Displays tool settings from iTwin.js native tools
 *
 * Prerequisites: IModelApp must be initialized before rendering this component.
 * Parent component (Editor.tsx) should conditionally render based on isAppInitialized.
 */
export const ToolSettingsPanel: React.FC = () => {
  const [toolSettings, setToolSettings] = useState<DialogItem[]>([]);
  const [toolLabel, setToolLabel] = useState<string>('');
  const [isVisible, setIsVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Tools that should display tool settings panel
  const shouldShowToolSettings = useCallback((toolId: string): boolean => {
    const modelingTools = [
      'RoundEdges', 'ChamferEdges', 'HollowFaces', 'OffsetFaces', 'SweepFaces',
      'ThickenSheet', 'SpinFaces', 'ImprintSolid', 'EmbossSolid', 'LoftSolids',
      'UniteSolids', 'SubtractSolids', 'IntersectSolids',
      'CreateSphere', 'CreateCylinder', 'CreateBox', 'CreateCone', 'CreateTorus',
      'MoveElements', 'RotateElements', 'CopyElements',
    ];
    return modelingTools.some(id => toolId.includes(id));
  }, []);

  const reloadToolSettings = useCallback(() => {
    const tool = IModelApp.toolAdmin.currentTool;
    if (!tool) {
      setIsVisible(false);
      return;
    }

    // Only show settings for modeling tools
    if (!shouldShowToolSettings(tool.toolId)) {
      setIsVisible(false);
      return;
    }

    // Get tool settings from current tool
    const settings = tool.supplyToolSettingsProperties?.();
    if (settings && settings.length > 0) {
      setToolSettings(settings);
      setToolLabel(tool.flyover || tool.toolId);
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [shouldShowToolSettings]);

  useEffect(() => {
    // Register handler to receive tool settings updates from iTwin.js tools
    IModelApp.toolAdmin.reloadToolSettingsHandler = reloadToolSettings;

    // Listen for tool activation changes
    const removeListener = IModelApp.toolAdmin.activeToolChanged.addListener(() => {
      reloadToolSettings();
    });

    // Initial check for current tool settings
    reloadToolSettings();

    return () => {
      IModelApp.toolAdmin.reloadToolSettingsHandler = undefined;
      removeListener();
    };
  }, [reloadToolSettings]);

  const handleValueChange = async (propertyName: string, value: DialogItemValue['value']) => {
    const tool = IModelApp.toolAdmin.currentTool;
    if (!tool?.applyToolSettingPropertyChange) return;

    const syncItem = {
      propertyName,
      value: { value } as DialogItemValue,
    };

    const success = await tool.applyToolSettingPropertyChange(syncItem);
    if (success) {
      // Refresh settings to get updated values
      reloadToolSettings();
    }
  };

  const renderPropertyInput = (setting: DialogItem) => {
    const property = setting.property;
    const value = setting.value?.value;
    const typename = property?.typename;

    switch (typename) {
      case 'double':
      case 'number':
        return (
          <input
            type="number"
            className="tool-setting-input"
            value={typeof value === 'number' ? value : ''}
            step={0.001}
            onChange={(e) => handleValueChange(property.name, parseFloat(e.target.value))}
          />
        );
      case 'int':
      case 'integer':
        return (
          <input
            type="number"
            className="tool-setting-input"
            value={typeof value === 'number' ? value : ''}
            step={1}
            onChange={(e) => handleValueChange(property.name, parseInt(e.target.value, 10))}
          />
        );
      case 'boolean':
        return (
          <input
            type="checkbox"
            className="tool-setting-checkbox"
            checked={!!value}
            onChange={(e) => handleValueChange(property.name, e.target.checked)}
          />
        );
      case 'string':
      default:
        return (
          <input
            type="text"
            className="tool-setting-input"
            value={typeof value === 'string' ? value : String(value ?? '')}
            onChange={(e) => handleValueChange(property.name, e.target.value)}
          />
        );
    }
  };

  if (!isVisible || toolSettings.length === 0) {
    return null;
  }

  return (
    <div className={`tool-settings-panel ${isMinimized ? 'minimized' : ''}`}>
      <div className="tool-settings-header">
        <span>{toolLabel}</span>
        <button
          className="tool-settings-close-btn"
          onClick={() => setIsMinimized(!isMinimized)}
          title={isMinimized ? '展开' : '收起'}
        >
          {isMinimized ? '▲' : '▼'}
        </button>
      </div>
      {!isMinimized && (
        <div className="tool-settings-content">
          {toolSettings.map((setting, index) => (
            <div key={index} className="tool-setting-item">
              <label className="tool-setting-label">
                {setting.property?.displayLabel || setting.property?.name}
              </label>
              {renderPropertyInput(setting)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ToolSettingsPanel;
