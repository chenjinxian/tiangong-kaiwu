/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useState } from 'react';
import { Button, Dialog, Input, ToggleSwitch } from '@itwin/itwinui-react';
import { SOLID_MODELING_DEFAULTS } from '../../../shared/lib/constants.js';
import './ToolDialog.css';

export interface OffsetFacesDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Number of faces currently selected */
  selectedCount: number;
  /** Called when dialog is closed */
  onClose: () => void;
  /** Called when user confirms with parameters */
  onConfirm: (params: {
    offsetDistance: number;
  }) => void;
}

/**
 * Dialog for configuring offset faces parameters
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const OffsetFacesDialog: React.FC<OffsetFacesDialogProps> = ({
  isOpen,
  selectedCount,
  onClose,
  onConfirm,
}) => {
  const [offsetDistance, setOffsetDistance] = useState<number>(SOLID_MODELING_DEFAULTS.OFFSET_DISTANCE ?? 0.1);
  const [isPositive, setIsPositive] = useState(true);

  const handleConfirm = useCallback(() => {
    onConfirm({
      offsetDistance: isPositive ? offsetDistance : -offsetDistance,
    });
    onClose();
  }, [offsetDistance, isPositive, onConfirm, onClose]);

  const handleDistanceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0) {
      setOffsetDistance(value);
    }
  }, []);

  const directionText = isPositive ? '向外' : '向内';

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="面偏移 (Offset Faces)"
      className="tool-dialog"
    >
      <div className="tool-dialog-content">
        <div className="tool-info">
          <span className="tool-icon">📐</span>
          <p>已为 {selectedCount} 个面配置偏移</p>
        </div>

        <div className="tool-parameter">
          <ToggleSwitch
            label={`偏移方向: ${directionText}`}
            checked={isPositive}
            onChange={() => setIsPositive(!isPositive)}
          />
          <small style={{ color: 'var(--iui-color-text-muted)', display: 'block', marginTop: '4px' }}>
            {isPositive ? '正值: 面向外偏移' : '负值: 面向内偏移'}
          </small>
        </div>

        <div className="tool-parameter">
          <label htmlFor="offset-distance">
            偏移距离 (Offset Distance)
            <span className="unit">m</span>
          </label>
          <Input
            id="offset-distance"
            type="number"
            value={offsetDistance}
            onChange={handleDistanceChange}
            step={0.001}
            min={0}
            max={10}
          />
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={offsetDistance}
            onChange={handleDistanceChange}
            className="parameter-slider"
          />
        </div>
      </div>

      <div className="tool-dialog-actions">
        <Button onClick={onClose} styleType="default">
          取消
        </Button>
        <Button onClick={handleConfirm} styleType="high-visibility">
          应用
        </Button>
      </div>
    </Dialog>
  );
};

export default OffsetFacesDialog;
