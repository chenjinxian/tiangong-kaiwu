/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, Input, Select, ToggleSwitch } from '@itwin/itwinui-react';
import { ChamferMode } from '@itwin/editor-common';
import { SOLID_MODELING_DEFAULTS } from '../../../shared/lib/constants.js';
import './ToolDialog.css';

export interface ChamferEdgesDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Number of edges currently selected */
  selectedCount: number;
  /** Called when dialog is closed */
  onClose: () => void;
  /** Called when user confirms with parameters */
  onConfirm: (params: {
    mode: ChamferMode;
    length: number;
    distanceLeft: number;
    distanceRight: number;
    angle: number;
    propagateSmooth: boolean;
  }) => void;
}

/**
 * Dialog for configuring chamfer edges parameters
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ChamferEdgesDialog: React.FC<ChamferEdgesDialogProps> = ({
  isOpen,
  selectedCount,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation('editor');
  // Note: ChamferMode values from @itwin/editor-common: Length=1, Distances=2, DistanceAngle=3, AngleDistance=4
  const [mode, setMode] = useState<ChamferMode>(1 as ChamferMode);
  const [length, setLength] = useState<number>(SOLID_MODELING_DEFAULTS.CHAMFER_LENGTH);
  const [distanceLeft, setDistanceLeft] = useState<number>(SOLID_MODELING_DEFAULTS.CHAMFER_DISTANCE);
  const [distanceRight, setDistanceRight] = useState<number>(SOLID_MODELING_DEFAULTS.CHAMFER_DISTANCE);
  const [angle, setAngle] = useState<number>(SOLID_MODELING_DEFAULTS.CHAMFER_ANGLE);
  const [propagateSmooth, setPropagateSmooth] = useState(true);

  const handleConfirm = useCallback(() => {
    onConfirm({
      mode,
      length,
      distanceLeft,
      distanceRight,
      angle: (angle * Math.PI) / 180,
      propagateSmooth,
    });
    onClose();
  }, [mode, length, distanceLeft, distanceRight, angle, propagateSmooth, onConfirm, onClose]);

  const modeOptions = [
    { value: String(ChamferMode.Length), label: t('modeling.chamfer.modeLength') },
    { value: String(ChamferMode.Distances), label: t('modeling.chamfer.modeDistances') },
    { value: String(ChamferMode.DistanceAngle), label: t('modeling.chamfer.modeDistanceAngle') },
    { value: String(ChamferMode.AngleDistance), label: t('modeling.chamfer.modeAngleDistance') },
  ];

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t('modeling.chamfer.title')}
      className="tool-dialog"
    >
      <div className="tool-dialog-content">
        <div className="tool-info">
          <span className="tool-icon">✂️</span>
          <p>{t('modeling.chamfer.applied', { count: selectedCount })}</p>
        </div>

        <div className="tool-parameter">
          <label htmlFor="chamfer-mode">{t('modeling.chamfer.mode')}</label>
          <Select
            id="chamfer-mode"
            options={modeOptions}
            value={mode.toString()}
            onChange={(value) => setMode(parseInt(String(value), 10))}
          />
        </div>

        {/* eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison */}
        {mode === 1 && (
          <div className="tool-parameter">
            <label htmlFor="chamfer-length">
              {t('modeling.chamfer.length')}
              <span className="unit">m</span>
            </label>
            <Input
              id="chamfer-length"
              type="number"
              value={length}
              onChange={(e) => setLength(parseFloat(e.target.value) || 0)}
              step={0.001}
              min={0}
              max={10}
            />
          </div>
        )}

        {/* eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison */}
        {(mode === 2 || mode === 3 || mode === 4) && (
          <>
            {/* eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison */}
            {(mode === 2 || mode === 3) && (
              <div className="tool-parameter">
                <label htmlFor="distance-left">
                  {t('modeling.chamfer.leftDistance')}
                  <span className="unit">m</span>
                </label>
                <Input
                  id="distance-left"
                  type="number"
                  value={distanceLeft}
                  onChange={(e) => setDistanceLeft(parseFloat(e.target.value) || 0)}
                  step={0.001}
                  min={0}
                  max={10}
                />
              </div>
            )}
            {/* eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison */}
            {(mode === 2 || mode === 4) && (
              <div className="tool-parameter">
                <label htmlFor="distance-right">
                  {t('modeling.chamfer.rightDistance')}
                  <span className="unit">m</span>
                </label>
                <Input
                  id="distance-right"
                  type="number"
                  value={distanceRight}
                  onChange={(e) => setDistanceRight(parseFloat(e.target.value) || 0)}
                  step={0.001}
                  min={0}
                  max={10}
                />
              </div>
            )}
          </>
        )}

        {/* eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison */}
        {(mode === 3 || mode === 4) && (
          <div className="tool-parameter">
            <label htmlFor="chamfer-angle">
              {t('modeling.chamfer.angle')}
              <span className="unit">°</span>
            </label>
            <Input
              id="chamfer-angle"
              type="number"
              value={angle}
              onChange={(e) => setAngle(parseFloat(e.target.value) || 0)}
              step={1}
              min={0}
              max={90}
            />
          </div>
        )}

        <div className="tool-parameter">
          <ToggleSwitch
            label={t('modeling.chamfer.propagate')}
            checked={propagateSmooth}
            onChange={() => setPropagateSmooth(!propagateSmooth)}
          />
        </div>
      </div>

      <div className="tool-dialog-actions">
        <Button onClick={onClose} styleType="default">
          {t('modeling.chamfer.cancel')}
        </Button>
        <Button onClick={handleConfirm} styleType="high-visibility">
          {t('modeling.chamfer.apply')}
        </Button>
      </div>
    </Dialog>
  );
};

export default ChamferEdgesDialog;
