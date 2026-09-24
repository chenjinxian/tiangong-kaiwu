/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Measurement Toolbar Component
 * Provides access to measurement tools
 */

import React from 'react';
import {
  IconButton,
  DropdownMenu,
  Tooltip,
  Text,
} from '@itwin/itwinui-react';
import {
  SvgMeasure,
  SvgLocation,
  SvgText,
  SvgCheckmark,
  SvgCrop,
  SvgList,
  SvgSettings,
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
  label: string;
  icon: React.ReactNode;
  description: string;
}> = [
  {
    type: 'distance',
    label: '距离测量',
    icon: <SvgCrop />,
    description: '测量两点之间的距离',
  },
  {
    type: 'length',
    label: '长度测量',
    icon: <SvgText />,
    description: '测量曲线或边的长度',
  },
  {
    type: 'area',
    label: '面积测量',
    icon: <SvgList />,
    description: '测量表面的面积',
  },
  {
    type: 'volume',
    label: '体积测量',
    icon: <SvgSettings />,
    description: '测量实体的体积',
  },
  {
    type: 'location',
    label: '位置坐标',
    icon: <SvgLocation />,
    description: '显示点的 XYZ 坐标',
  },
];

export const MeasurementToolbar: React.FC<MeasurementToolbarProps> = ({
  activeMeasurement,
  onStartMeasurement,
  onStopMeasurement,
  isToolActive,
}) => {
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
                <div className="measurement-label">{item.label}</div>
                <div className="measurement-description">{item.description}</div>
              </div>
            </div>
          ))
        }
      >
        <Tooltip content="测量工具">
          <IconButton styleType={isToolActive ? 'cta' : 'default'}>
            {activeItem?.icon || <SvgMeasure />}
          </IconButton>
        </Tooltip>
      </DropdownMenu>

      {isToolActive && (
        <div className="active-measurement-indicator">
          <span className="pulse-dot" />
          <Text variant="body">{activeItem?.label || '测量中...'}</Text>
          <button className="stop-button" onClick={onStopMeasurement}>
            <SvgCheckmark />
            完成
          </button>
        </div>
      )}
    </div>
  );
};
