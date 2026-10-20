/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Measurement Toolbar Component
 * Provides access to measurement tools
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  IconButton,
  Text,
  Tooltip,
} from '@itwin/itwinui-react';
import {
  SvgCheckmark,
  SvgCrop,
  SvgList,
  SvgLocation,
  SvgMeasure,
  SvgSettings,
  SvgText,
} from '@itwin/itwinui-icons-react';
import { MeasurementType } from '../hooks/useMeasurementManager';

interface MeasurementToolbarProps {
  activeMeasurement: MeasurementType | null;
  onStartMeasurement: (type: MeasurementType) => void;
  onStopMeasurement: () => void;
  isToolActive: boolean;
}

const measurementItems: Array<{
  type: MeasurementType;
  labelKey: string;
  icon: React.ReactNode;
  descriptionKey: string;
}> = [
  {
    type: 'distance',
    labelKey: 'measurement.items.distance.label',
    icon: <SvgCrop />,
    descriptionKey: 'measurement.items.distance.description',
  },
  {
    type: 'length',
    labelKey: 'measurement.items.length.label',
    icon: <SvgText />,
    descriptionKey: 'measurement.items.length.description',
  },
  {
    type: 'area',
    labelKey: 'measurement.items.area.label',
    icon: <SvgList />,
    descriptionKey: 'measurement.items.area.description',
  },
  {
    type: 'volume',
    labelKey: 'measurement.items.volume.label',
    icon: <SvgSettings />,
    descriptionKey: 'measurement.items.volume.description',
  },
  {
    type: 'location',
    labelKey: 'measurement.items.location.label',
    icon: <SvgLocation />,
    descriptionKey: 'measurement.items.location.description',
  },
];

export const MeasurementToolbar: React.FC<MeasurementToolbarProps> = ({
  activeMeasurement,
  onStartMeasurement,
  onStopMeasurement,
  isToolActive,
}) => {
  const { t } = useTranslation('editor');
  const activeItem = measurementItems.find((item) => item.type === activeMeasurement);

  return (
    <div className="measurement-toolbar">
      <DropdownMenu
        menuItems={(close: () => void) =>
          measurementItems.map((item) => (
            <div
              key={item.type}
              className="measurement-menu-item"
              onClick={() => {
                onStartMeasurement(item.type);
                close();
              }}
            >
              <span className="measurement-icon">{item.icon}</span>
              <div className="measurement-info">
                <div className="measurement-label">{t(item.labelKey)}</div>
                <div className="measurement-description">{t(item.descriptionKey)}</div>
              </div>
            </div>
          ))
        }
      >
        <Tooltip content={t('measurement.toolsTitle')}>
          <IconButton styleType={isToolActive ? 'cta' : 'default'}>
            {activeItem?.icon || <SvgMeasure />}
          </IconButton>
        </Tooltip>
      </DropdownMenu>

      {isToolActive && (
        <div className="active-measurement-indicator">
          <span className="pulse-dot" />
          <Text variant="body">
            {activeItem ? t(activeItem.labelKey) : t('measurement.measuring')}
          </Text>
          <button className="stop-button" onClick={onStopMeasurement}>
            <SvgCheckmark />
            {t('measurement.done')}
          </button>
        </div>
      )}
    </div>
  );
};
