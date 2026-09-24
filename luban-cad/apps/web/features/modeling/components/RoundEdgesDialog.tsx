/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useState } from 'react';
import { Button, Dialog, Input, ToggleSwitch } from '@itwin/itwinui-react';
import { SOLID_MODELING_DEFAULTS } from '../../../shared/lib/constants.js';
import './ToolDialog.css';

export interface RoundEdgesDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Number of edges currently selected */
  selectedCount: number;
  /** Called when dialog is closed */
  onClose: () => void;
  /** Called when user confirms with parameters */
  onConfirm: (params: { radius: number; propagateSmooth: boolean }) => void;
}

/**
 * Dialog for configuring round edges (fillet) parameters
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const RoundEdgesDialog: React.FC<RoundEdgesDialogProps> = ({
  isOpen,
  selectedCount,
  onClose,
  onConfirm,
}) => {
  const [radius, setRadius] = useState<number>(SOLID_MODELING_DEFAULTS.BLEND_RADIUS);
  const [propagateSmooth, setPropagateSmooth] = useState(true);

  const handleConfirm = useCallback(() => {
    onConfirm({ radius, propagateSmooth });
    onClose();
  }, [radius, propagateSmooth, onConfirm, onClose]);

  const handleRadiusChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0) {
      setRadius(value);
    }
  }, []);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="圆角边 (Round Edges)"
      className="tool-dialog"
    >
      <div className="tool-dialog-content">
        <div className="tool-info">
          <span className="tool-icon">🔧</span>
          <p>已为 {selectedCount} 条边应用圆角</p>
        </div>

        <div className="tool-parameter">
          <label htmlFor="radius">
            圆角半径 (Radius)
            <span className="unit">m</span>
          </label>
          <Input
            id="radius"
            type="number"
            value={radius}
            onChange={handleRadiusChange}
            step={0.001}
            min={0}
            max={10}
          />
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={radius}
            onChange={handleRadiusChange}
            className="parameter-slider"
          />
        </div>

        <div className="tool-parameter">
          <ToggleSwitch
            label="传播到相切边 (Propagate to smooth edges)"
            checked={propagateSmooth}
            onChange={() => setPropagateSmooth(!propagateSmooth)}
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

export default RoundEdgesDialog;
