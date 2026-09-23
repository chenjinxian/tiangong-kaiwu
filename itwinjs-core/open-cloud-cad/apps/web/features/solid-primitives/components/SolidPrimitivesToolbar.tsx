/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Solid Primitives Toolbar
 * Provides access to solid creation tools
 */

import React, { useState } from 'react';
import { IconButton, DropdownMenu, Tooltip } from '@itwin/itwinui-react';
import {
  SvgCrop,
  SvgList,
  SvgSettings,
  SvgChevronRight,
  SvgSync,
} from '@itwin/itwinui-icons-react';
import { SolidPrimitiveType } from '../hooks/useSolidPrimitives';
import { PrimitiveParamsDialog } from './PrimitiveParamsDialog';

interface SolidPrimitivesToolbarProps {
  onCreate: (type: SolidPrimitiveType, params?: any) => void;
  isCreating: boolean;
}

const primitives: Array<{ type: SolidPrimitiveType; label: string; icon: React.ReactNode }> = [
  { type: 'box', label: '立方体', icon: <SvgCrop /> },
  { type: 'cylinder', label: '圆柱体', icon: <SvgList /> },
  { type: 'sphere', label: '球体', icon: <SvgSettings /> },
  { type: 'cone', label: '圆锥体', icon: <SvgChevronRight /> },
  { type: 'torus', label: '圆环体', icon: <SvgSync /> },
];

export const SolidPrimitivesToolbar: React.FC<SolidPrimitivesToolbarProps> = ({
  onCreate,
  isCreating,
}) => {
  const [selectedType, setSelectedType] = useState<SolidPrimitiveType | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  const handleSelect = (type: SolidPrimitiveType) => {
    setSelectedType(type);
    setShowDialog(true);
  };

  const handleConfirm = (params: any) => {
    if (selectedType) {
      onCreate(selectedType, params);
    }
    setShowDialog(false);
    setSelectedType(null);
  };

  return (
    <>
      <div className="solid-primitives-toolbar">
        <DropdownMenu
          menuItems={(close: () => void) =>
            primitives.map(p => (
              <div
                key={p.type}
                className="primitive-menu-item"
                onClick={() => {
                  handleSelect(p.type);
                  close();
                }}
              >
                <span className="primitive-icon">{p.icon}</span>
                <span>{p.label}</span>
              </div>
            ))
          }
        >
          <Tooltip content="创建实体">
            <IconButton
              styleType={isCreating ? 'cta' : 'default'}
            >
              <SvgCrop />
            </IconButton>
          </Tooltip>
        </DropdownMenu>
      </div>

      <PrimitiveParamsDialog
        isOpen={showDialog}
        type={selectedType}
        onClose={() => setShowDialog(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
};
