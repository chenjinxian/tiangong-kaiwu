/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Measurement Results Panel Component
 * Displays measurement history and results
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  IconButton,
  List,
  ListItem,
} from '@itwin/itwinui-react';
import {
  SvgClose,
  SvgDelete,
  SvgExport,
} from '@itwin/itwinui-icons-react';
import { MeasurementRecord, MeasurementType } from '../hooks/useMeasurementManager';

interface MeasurementResultsPanelProps {
  measurements: MeasurementRecord[];
  onDelete: (id: string) => void;
  onClear: () => void;
  onExport: () => void;
}

const typeLabelKeys: Record<MeasurementType, string> = {
  distance: 'measurement.types.distance',
  area: 'measurement.types.area',
  volume: 'measurement.types.volume',
  length: 'measurement.types.length',
  location: 'measurement.types.location',
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
  const { t } = useTranslation('editor');

  const formatValue = (record: MeasurementRecord): string => {
    if (record.type === 'location') {
      return record.description || t('measurement.xyzCoordinates');
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
          <span style={{ fontWeight: 500 }}>{t('measurement.resultsTitle')}</span>
          <Badge>{String(measurements.length)}</Badge>
        </div>
        <div className="panel-actions">
          <IconButton
            title={t('measurement.export')}
            onClick={onExport}
            disabled={measurements.length === 0}
          >
            <SvgExport />
          </IconButton>
          <IconButton
            title={t('measurement.clearAll')}
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
            <span style={{ color: "var(--iui-color-text-muted)" }}>{t('measurement.empty')}</span>
            <span style={{ color: "var(--iui-color-text-muted)", fontSize: 12 }}>
              {t('measurement.emptyHint')}
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
                      {t(typeLabelKeys[measurement.type])}
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
                  title={t('measurement.delete')}
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
