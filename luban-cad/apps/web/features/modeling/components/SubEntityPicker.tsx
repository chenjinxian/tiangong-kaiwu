/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { ButtonGroup, IconButton, Text } from '@itwin/itwinui-react';
import { SvgCircle, SvgCrop, SvgLine } from '@itwin/itwinui-icons-react';
import type { SubEntitySelectionMode } from '../SelectSubEntityTool.js';
import './SubEntityPicker.css';

export interface SubEntityPickerProps {
  selectedFaces: string[];
  selectedEdges: string[];
  selectedVertices: string[];
  selectionMode: SubEntitySelectionMode;
  isSelecting?: boolean;
  onModeChange: (mode: SubEntitySelectionMode) => void;
  onClear: () => void;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const SubEntityPicker: React.FC<SubEntityPickerProps> = ({
  selectedFaces,
  selectedEdges,
  selectedVertices,
  selectionMode,
  isSelecting = false,
  onModeChange,
  onClear,
}) => {
  const totalCount = selectedFaces.length + selectedEdges.length + selectedVertices.length;

  const getButtonLabel = (baseLabel: string, count: number): string => {
    return count > 0 ? `${baseLabel} (${count})` : baseLabel;
  };

  const getModeLabel = (mode: SubEntitySelectionMode): string => {
    switch (mode) {
      case 'face':
        return '选择面';
      case 'edge':
        return '选择边';
      case 'vertex':
        return '选择顶点';
      default:
        return '';
    }
  };

  return (
    <div className="sub-entity-picker">
      <Text variant="leading">子实体选择</Text>

      <ButtonGroup>
        <IconButton
          label={getButtonLabel('选择面', selectedFaces.length)}
          isActive={selectionMode === 'face' && isSelecting}
          onClick={() => onModeChange('face')}
        >
          <SvgCrop />
        </IconButton>

        <IconButton
          label={getButtonLabel('选择边', selectedEdges.length)}
          isActive={selectionMode === 'edge' && isSelecting}
          onClick={() => onModeChange('edge')}
        >
          <SvgLine />
        </IconButton>

        <IconButton
          label={getButtonLabel('选择顶点', selectedVertices.length)}
          isActive={selectionMode === 'vertex' && isSelecting}
          onClick={() => onModeChange('vertex')}
        >
          <SvgCircle />
        </IconButton>
      </ButtonGroup>

      {isSelecting && (
        <Text variant="small" className="sub-entity-picker-status">
          {getModeLabel(selectionMode)}模式 - 点击选择，右键完成
        </Text>
      )}

      {totalCount > 0 && (
        <IconButton
          label="清除选择"
          onClick={onClear}
          styleType="default"
        >
          清除 ({totalCount})
        </IconButton>
      )}
    </div>
  );
};

export default SubEntityPicker;
