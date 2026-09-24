/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Primitive Parameters Dialog
 * Configure parameters for solid primitives
 */

import React, { useState } from 'react';
import {
  Dialog,
  Input,
  Label,
} from '@itwin/itwinui-react';
import { SolidPrimitiveType } from '../hooks/useSolidPrimitives';

interface PrimitiveParamsDialogProps {
  isOpen: boolean;
  type: SolidPrimitiveType | null;
  onClose: () => void;
  onConfirm: (params: any) => void;
}

const typeLabels: Record<SolidPrimitiveType, string> = {
  box: '立方体',
  cylinder: '圆柱体',
  sphere: '球体',
  cone: '圆锥体',
  torus: '圆环体',
};

export const PrimitiveParamsDialog: React.FC<PrimitiveParamsDialogProps> = ({
  isOpen,
  type,
  onClose,
  onConfirm,
}) => {
  const [params, setParams] = useState({
    width: 100,
    height: 100,
    depth: 100,
    radius: 50,
    baseRadius: 50,
    topRadius: 0,
    majorRadius: 100,
    minorRadius: 30,
  });

  if (!type) return null;

  const renderFields = () => {
    switch (type) {
      case 'box':
        return (
          <>
            <Label>宽度 (X)</Label>
            <Input
              type="number"
              value={params.width}
              onChange={(e) => setParams(p => ({ ...p, width: Number(e.target.value) }))}
            />
            <Label>高度 (Y)</Label>
            <Input
              type="number"
              value={params.height}
              onChange={(e) => setParams(p => ({ ...p, height: Number(e.target.value) }))}
            />
            <Label>深度 (Z)</Label>
            <Input
              type="number"
              value={params.depth}
              onChange={(e) => setParams(p => ({ ...p, depth: Number(e.target.value) }))}
            />
          </>
        );
      case 'cylinder':
        return (
          <>
            <Label>半径</Label>
            <Input
              type="number"
              value={params.radius}
              onChange={(e) => setParams(p => ({ ...p, radius: Number(e.target.value) }))}
            />
            <Label>高度</Label>
            <Input
              type="number"
              value={params.height}
              onChange={(e) => setParams(p => ({ ...p, height: Number(e.target.value) }))}
            />
          </>
        );
      case 'sphere':
        return (
          <>
            <Label>半径</Label>
            <Input
              type="number"
              value={params.radius}
              onChange={(e) => setParams(p => ({ ...p, radius: Number(e.target.value) }))}
            />
          </>
        );
      case 'cone':
        return (
          <>
            <Label>底面半径</Label>
            <Input
              type="number"
              value={params.baseRadius}
              onChange={(e) => setParams(p => ({ ...p, baseRadius: Number(e.target.value) }))}
            />
            <Label>顶面半径</Label>
            <Input
              type="number"
              value={params.topRadius}
              onChange={(e) => setParams(p => ({ ...p, topRadius: Number(e.target.value) }))}
            />
            <Label>高度</Label>
            <Input
              type="number"
              value={params.height}
              onChange={(e) => setParams(p => ({ ...p, height: Number(e.target.value) }))}
            />
          </>
        );
      case 'torus':
        return (
          <>
            <Label>主半径</Label>
            <Input
              type="number"
              value={params.majorRadius}
              onChange={(e) => setParams(p => ({ ...p, majorRadius: Number(e.target.value) }))}
            />
            <Label>次半径</Label>
            <Input
              type="number"
              value={params.minorRadius}
              onChange={(e) => setParams(p => ({ ...p, minorRadius: Number(e.target.value) }))}
            />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={`创建 ${typeLabels[type]}`}>
      <div className="primitive-params-form">
        {renderFields()}
      </div>
      <div className="dialog-button-group" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button onClick={onClose}>取消</button>
        <button onClick={() => onConfirm(params)} style={{ fontWeight: 600 }}>
          创建
        </button>
      </div>
    </Dialog>
  );
};
