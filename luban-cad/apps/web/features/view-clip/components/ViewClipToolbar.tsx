/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * View Clip Toolbar Component
 * Provides access to clipping tools
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  IconButton,
  Tooltip,
} from '@itwin/itwinui-react';
import {
  SvgClose,
  SvgCrop,
} from '@itwin/itwinui-icons-react';
import { ClipType } from '../hooks/useViewClip';

interface ViewClipToolbarProps {
  isClipped: boolean;
  onApplyClip: (type: ClipType) => void;
}

const clipTools: Array<{ type: Exclude<ClipType, 'clear'>; labelKey: string; icon: React.ReactNode }> = [
  { type: 'plane', labelKey: 'viewClip.plane', icon: <SvgCrop /> },
  { type: 'shape', labelKey: 'viewClip.shape', icon: <SvgCrop /> },
  { type: 'range', labelKey: 'viewClip.range', icon: <SvgCrop /> },
  { type: 'element', labelKey: 'viewClip.element', icon: <SvgCrop /> },
];

export const ViewClipToolbar: React.FC<ViewClipToolbarProps> = ({
  isClipped,
  onApplyClip,
}) => {
  const { t } = useTranslation('editor');

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
              <span>{t(tool.labelKey)}</span>
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
            <span>{t('viewClip.clear')}</span>
          </div>,
        ]}
      >
        <Tooltip content={t('viewClip.tools')}>
          <IconButton
            styleType={isClipped ? 'cta' : 'default'}
          >
            <SvgCrop />
          </IconButton>
        </Tooltip>
      </DropdownMenu>

      {isClipped && (
        <Tooltip content={t('viewClip.clear')}>
          <IconButton onClick={() => onApplyClip('clear')}>
            <SvgClose />
          </IconButton>
        </Tooltip>
      )}
    </div>
  );
};
