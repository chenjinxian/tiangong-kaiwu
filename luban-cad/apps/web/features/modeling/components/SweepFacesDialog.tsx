/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useState } from 'react';
import { Button, Dialog, Input, ToggleSwitch } from '@itwin/itwinui-react';
import './ToolDialog.css';

export interface SweepFacesDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Number of faces currently selected */
  selectedCount: number;
  /** Called when dialog is closed */
  onClose: () => void;
  /** Called when user confirms with parameters */
  onConfirm: (params: {
    distance: number;
    draftAngle: number;
  }) => void;
}

/**
 * Dialog for configuring sweep faces parameters
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const SweepFacesDialog: React.FC<SweepFacesDialogProps> = ({
  isOpen,
  selectedCount,
  onClose,
  onConfirm,
}) => {
  const [distance, setDistance] = useState<number>(10);
  const [draftAngle, setDraftAngle] = useState<number>(0);
  const [isDraftEnabled, setIsDraftEnabled] = useState(false);

  const handleConfirm = useCallback(() => {
    onConfirm({
      distance,
      draftAngle: isDraftEnabled ? draftAngle : 0,
    });
    onClose();
  }, [distance, draftAngle, isDraftEnabled, onConfirm, onClose]);

  const handleDistanceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0) {
      setDistance(value);
    }
  }, []);

  const handleDraftAngleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) {
      setDraftAngle(Math.max(-45, Math.min(45, value)));
    }
  }, []);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="面拉伸 (Sweep Faces)"
      className="tool-dialog"
    >
      <div className="tool-dialog-content">
        <div className="tool-info">
          <span className="tool-icon">📏</span>
          <p>已为 {selectedCount} 个面配置拉伸</p>
        </div>

        <div className="tool-parameter">
          <label htmlFor="sweep-distance">
            拉伸距离 (Sweep Distance)
            <span className="unit">mm</span>
          </label>
          <Input
            id="sweep-distance"
            type="number"
            value={distance}
            onChange={handleDistanceChange}
            step={1}
            min={0.1}
            max={1000}
          />
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={distance}
            onChange={handleDistanceChange}
            className="parameter-slider"
          />
        </div>

        <div className="tool-parameter">
          <ToggleSwitch
            label="启用拔模角度 (Enable Draft Angle)"
            checked={isDraftEnabled}
            onChange={() => setIsDraftEnabled(!isDraftEnabled)}
          />
        </div>

        {isDraftEnabled && (
          <div className="tool-parameter">
            <label htmlFor="draft-angle">
              拔模角度 (Draft Angle)
              <span className="unit">°</span>
            </label>
            <Input
              id="draft-angle"
              type="number"
              value={draftAngle}
              onChange={handleDraftAngleChange}
              step={0.5}
              min={-45}
              max={45}
            />
            <input
              type="range"
              min={-45}
              max={45}
              step={0.5}
              value={draftAngle}
              onChange={handleDraftAngleChange}
              className="parameter-slider"
            />
            <small style={{ color: 'var(--iui-color-text-muted)', display: 'block', marginTop: '4px' }}>
              正值: 向外扩张, 负值: 向内收缩
            </small>
          </div>
        )}
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

export default SweepFacesDialog;
