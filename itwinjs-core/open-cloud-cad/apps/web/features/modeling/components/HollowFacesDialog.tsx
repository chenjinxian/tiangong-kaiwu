/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useState } from 'react';
import { Button, Dialog, Input } from '@itwin/itwinui-react';
import { SOLID_MODELING_DEFAULTS } from '../../../shared/lib/constants.js';
import './ToolDialog.css';

export interface HollowFacesDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Number of faces currently selected */
  selectedCount: number;
  /** Called when dialog is closed */
  onClose: () => void;
  /** Called when user confirms with parameters */
  onConfirm: (params: { shellThickness: number; faceThickness: number }) => void;
}

/**
 * Dialog for configuring hollow faces (shell) parameters
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const HollowFacesDialog: React.FC<HollowFacesDialogProps> = ({
  isOpen,
  selectedCount,
  onClose,
  onConfirm,
}) => {
  const [shellThickness, setShellThickness] = useState<number>(SOLID_MODELING_DEFAULTS.HOLLOW_THICKNESS);
  const [faceThickness, setFaceThickness] = useState<number>(0);
  const [useFaceThickness, setUseFaceThickness] = useState(false);

  const handleConfirm = useCallback(() => {
    onConfirm({
      shellThickness,
      faceThickness: useFaceThickness ? faceThickness : 0,
    });
    onClose();
  }, [shellThickness, faceThickness, useFaceThickness, onConfirm, onClose]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="抽壳面 (Hollow Faces)"
      className="tool-dialog"
    >
      <div className="tool-dialog-content">
        <div className="tool-info">
          <span className="tool-icon">🥡</span>
          <p>已为 {selectedCount} 个面应用抽壳</p>
        </div>

        <div className="tool-parameter">
          <label htmlFor="shell-thickness">
            壳体厚度 (Shell Thickness)
            <span className="unit">m</span>
          </label>
          <Input
            id="shell-thickness"
            type="number"
            value={shellThickness}
            onChange={(e) => setShellThickness(parseFloat(e.target.value) || 0)}
            step={0.001}
            min={0.001}
            max={10}
          />
          <input
            type="range"
            min={0.001}
            max={1}
            step={0.001}
            value={shellThickness}
            onChange={(e) => setShellThickness(parseFloat(e.target.value) || 0)}
            className="parameter-slider"
          />
        </div>

        <div className="tool-parameter">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={useFaceThickness}
              onChange={(e) => setUseFaceThickness(e.target.checked)}
            />
            为选定面使用不同厚度 (Use different thickness for selected faces)
          </label>
        </div>

        {useFaceThickness && (
          <div className="tool-parameter">
            <label htmlFor="face-thickness">
              选定面厚度 (Face Thickness)
              <span className="unit">m</span>
            </label>
            <Input
              id="face-thickness"
              type="number"
              value={faceThickness}
              onChange={(e) => setFaceThickness(parseFloat(e.target.value) || 0)}
              step={0.001}
              min={0}
              max={10}
            />
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

export default HollowFacesDialog;
