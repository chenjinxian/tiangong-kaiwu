/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, Input, Text, ToggleSwitch } from '@itwin/itwinui-react';
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
  const { t } = useTranslation('editor');
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
      aria-label={t('modeling.roundEdges.title')}
      className="tool-dialog"
    >
      <div className="tool-dialog-content">
        {/* 3.22 的 Dialog 根无 title 渲染；可见标题用 heading（P5 终审 Minor#1） */}
        <Text variant="headline" as="h3" className="tool-dialog-title">
          {t('modeling.roundEdges.title')}
        </Text>
        <div className="tool-info">
          <span className="tool-icon">🔧</span>
          <p>{t('modeling.roundEdges.applied', { count: selectedCount })}</p>
        </div>

        <div className="tool-parameter">
          <label htmlFor="radius">
            {t('modeling.roundEdges.radius')}
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
            label={t('modeling.roundEdges.propagate')}
            checked={propagateSmooth}
            onChange={() => setPropagateSmooth(!propagateSmooth)}
          />
        </div>
      </div>

      <div className="tool-dialog-actions">
        <Button onClick={onClose} styleType="default">
          {t('modeling.roundEdges.cancel')}
        </Button>
        <Button onClick={handleConfirm} styleType="high-visibility">
          {t('modeling.roundEdges.apply')}
        </Button>
      </div>
    </Dialog>
  );
};

export default RoundEdgesDialog;
