/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Measurement Results Panel Component
 * Displays measurement history and results
 */

import React from 'react';
import {
  List,
  ListItem,
  IconButton,
  Badge,
} from '@itwin/itwinui-react';
import {
  SvgDelete,
  SvgExport,
  SvgClose,
} from '@itwin/itwinui-icons-react';
import { MeasurementRecord, MeasurementType } from '../hooks/useMeasurementManager';

interface MeasurementResultsPanelProps {
  measurements: MeasurementRecord[];
  onDelete: (id: string) => void;
  onClear: () => void;
  onExport: () => void;
}

const typeLabels: Record<MeasurementType, string> = {
  distance: '距离',
  area: '面积',
  volume: '体积',
  length: '长度',
  location: '坐标',
};

const typeColors: Record<MeasurementType, 'positive' | 'negative' | 'primary' | 'secondary'> = {
  distance: 'primary',
  area: 'positive',
  volume: 'secondary',
  length: 'primary',
  location: 'negative',
};

export const MeasurementResultsPanel: React.FC<MeasurementResultsPanelProps> = ({
  measurements,
  onDelete,
  onClear,
  onExport,
}) => {
  const formatValue = (record: MeasurementRecord): string => {
    if (record.type === 'location') {
      return record.description || 'XYZ 坐标';
    }
    return `${record.value.toFixed(4)} ${record.unit}`;
  };

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className="measurement-results-panel">
      <div className="panel-header">
        <div className="panel-header-content">
          <span style={{ fontWeight: 500 }}>测量结果</span>
          <Badge>{String(measurements.length)}</Badge>
        </div>
        <div className="panel-actions">
          <IconButton
            title="导出"
            onClick={onExport}
            disabled={measurements.length === 0}
          >
            <SvgExport />
          </IconButton>
          <IconButton
            title="清除全部"
            onClick={onClear}
            disabled={measurements.length === 0}
          >
            <SvgClose />
          </IconButton>
        </div>
      </div>

      <div className="panel-body">
        {measurements.length === 0 ? (
          <div className="empty-state">
            <span style={{ color: "var(--iui-color-text-muted)" }}>暂无测量数据</span>
            <span style={{ color: "var(--iui-color-text-muted)", fontSize: 12 }}>
              选择测量工具开始测量
            </span>
          </div>
        ) : (
          <List className="measurement-list">
            {measurements.map((measurement) => (
              <ListItem
                key={measurement.id}
                className="measurement-item"
                actionable
              >
                <div className="measurement-content">
                  <div className="measurement-header">
                    <Badge color={typeColors[measurement.type]}>
                      {typeLabels[measurement.type]}
                    </Badge>
                    <span style={{ fontSize: 12, color: "var(--iui-color-text-muted)" }}>
                      {formatTime(measurement.timestamp)}
                    </span>
                  </div>
                  <span className="measurement-value" style={{ fontSize: 16, fontWeight: 600, fontFamily: "monospace" }}>
                    {formatValue(measurement)}
                  </span>
                  {measurement.description && measurement.type !== 'location' && (
                    <span style={{ fontSize: 12, color: "var(--iui-color-text-muted)" }}>
                      {measurement.description}
                    </span>
                  )}
                </div>
                <IconButton
                  size="small"
                  title="删除"
                  onClick={() => onDelete(measurement.id)}
                >
                  <SvgDelete />
                </IconButton>
              </ListItem>
            ))}
          </List>
        )}
      </div>
    </div>
  );
};
