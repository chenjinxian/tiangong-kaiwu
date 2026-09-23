/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * View Clip Toolbar Component
 * Provides access to clipping tools
 */

import React from 'react';
import {
  IconButton,
  DropdownMenu,
  Tooltip,
} from '@itwin/itwinui-react';
import {
  SvgCrop,
  SvgClose,
} from '@itwin/itwinui-icons-react';
import { ClipType } from '../hooks/useViewClip';

interface ViewClipToolbarProps {
  isClipped: boolean;
  onApplyClip: (type: ClipType) => void;
}

const clipTools: Array<{ type: Exclude<ClipType, 'clear'>; label: string; icon: React.ReactNode }> = [
  { type: 'plane', label: '平面剖切', icon: <SvgCrop /> },
  { type: 'shape', label: '形状剖切', icon: <SvgCrop /> },
  { type: 'range', label: '范围剖切', icon: <SvgCrop /> },
  { type: 'element', label: '元素剖切', icon: <SvgCrop /> },
];

export const ViewClipToolbar: React.FC<ViewClipToolbarProps> = ({
  isClipped,
  onApplyClip,
}) => {
  return (
    <div className="view-clip-toolbar">
      <DropdownMenu
        menuItems={(close: () => void) => [
          ...clipTools.map((tool) => (
            <div
              key={tool.type}
              className="clip-menu-item"
              onClick={() => {
                onApplyClip(tool.type);
                close();
              }}
            >
              <span className="clip-icon">{tool.icon}</span>
              <span>{tool.label}</span>
            </div>
          )),
          <hr key="clip-separator" />,
          <div
            key="clip-clear"
            className="clip-menu-item"
            onClick={() => {
              onApplyClip('clear');
              close();
            }}
          >
            <span className="clip-icon"><SvgClose /></span>
            <span>清除剖切</span>
          </div>,
        ]}
      >
        <Tooltip content="剖切工具">
          <IconButton
            styleType={isClipped ? 'cta' : 'default'}
          >
            <SvgCrop />
          </IconButton>
        </Tooltip>
      </DropdownMenu>

      {isClipped && (
        <Tooltip content="清除剖切">
          <IconButton onClick={() => onApplyClip('clear')}>
            <SvgClose />
          </IconButton>
        </Tooltip>
      )}
    </div>
  );
};
